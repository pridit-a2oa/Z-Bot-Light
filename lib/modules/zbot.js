'use strict';

const lodash = require('lodash');
const crypto = require('crypto-js');
const fs = require('fs');
const path = require('path');
const _ = require('underscore');
const Helper = require('./helper.js');
const ZBotBERcon = require('./bercon.js');
const Tail = require('nodejs-tail');
const glob = require('glob-fs')({ gitignore: true });

class ZBot {
  /**
   * Constructor function. Gets called when class is made into a object.
   * @param options
   */
  constructor(options) {
    this._bot = options.bot;
    this._clapp = options.clapp;
    this._cfg = options.cfg;
    this._defaultConfig = options.defaultConfig;
    this._bercons = [];
    this._logChannel = null;
    this._running = false;

    // ZBot specific variables
    this._data = {};

    // Load every command in the commands folder
    fs.readdirSync('./lib/commands/').forEach((file) => {
      this._clapp.addCommand(require('../commands/' + file));
    });

    console.log('ZBot Module ready');
  }

  getMostRecentFileName(dir, file) {
    console.log(dir + file);

    var files = glob.readdirSync(dir + file);

    if (!files.length) {
      return false;
    }

    // use underscore for max()
    return _.max(files, function (f) {
      //var fullpath = path.join(dir, f);

      // ctime = creation time is used
      // replace with mtime for modification time
      return fs.statSync(f).ctime;
    });
  }

  /**
   * Watches files with dir support for extra lines and shows them in discord channel.
   */
  watchFiles() {
    for (const [guildId, guild] of Object.entries(this._data)) {
      if (guild.config.specific.watcher.length < 1) {
        return;
      }

      guild.config.specific.watcher.forEach((watchData) => {
        if (!watchData.active) {
          return false;
        }

        let file = this.getMostRecentFileName(
          watchData.directory,
          watchData.file
        );
        let channel = guild.guild.channels.cache.find(
          (val) => val.name === watchData.channel
        );

        if (!file) {
          return false;
        }

        let tail = this.initTail(channel, file);

        setInterval(() => {
          let checkFile = this.getMostRecentFileName(
            watchData.directory,
            watchData.file
          );

          if (file !== checkFile) {
            file = checkFile;
            tail.close();
            tail = this.initTail(channel, checkFile);
            //print all lines in checkfile ( because we might have missed these ).
            let existingText = fs.readFileSync(checkFile, 'utf8');
            let lines = existingText.split('\n');
            lines.forEach((text) => {
              text = '```py\n@ ' + text + '\n```';
              Helper.printLongMessage(text, channel);
            });
          }
        }, 10000);
      });
    }
  }

  /**
   *
   * @param channel
   * @param file
   * @returns {Tail}
   */
  initTail(channel, file) {
    this.logBot(
      'Posting in ' + channel.name + ' for watching file: ' + file,
      channel
    );
    let tail = new Tail(file);
    tail.on('line', function (data) {
      data = '```py\n@ ' + data + '\n```';
      if (channel) {
        Helper.printLongMessage(data, channel);
      } else {
        if (this._logChannel) {
          Helper.printLongMessage(data, this._logChannel);
        }
      }
    });
    // tail.on("close", function() {
    //   console.log('close');
    //   if(channel) {
    //     Helper.printLongMessage('Watcher closed on file: ' + file, channel);
    //   } else {
    //     if( this._logChannel ) {
    //       Helper.printLongMessage('Watcher closed on file: ' + file, this._logChannel);
    //     }
    //   }
    // });

    tail.watch();

    return tail;
  }

  /**
   * Gets the rcon instances of zbot
   * @returns {Array<BattleNode>}
   */
  get bercons() {
    return this._bercons;
  }

  /**
   * Get all data per guild.
   * @returns {JSON}
   */
  get data() {
    return this._data;
  }

  /**
   *
   * @param {JSON} data
   */
  set data(data) {
    this._data = data;
  }

  /**
   * Returns a list of active guilds used by zbot
   * @returns {Array<Guild>}
   */
  get activeGuilds() {
    return this._activeGuilds;
  }

  /**
   * Gets the Discord bot client
   * @return {Client}
   */
  get bot() {
    return this._bot;
  }

  /**
   * Gets the config
   * @return {Client}
   */
  get cfg() {
    return this._cfg;
  }

  /**
   * Sets the Discord bot client
   * @param {Client} newBot
   */
  set bot(newBot) {
    this._bot = newBot; // validation could be checked here such as only allowing non numerical values
  }

  /**
   * Internal Getter function for the Query
   * @returns {*}
   */
  getQuery() {
    return this._query;
  }

  /**
   * Internal Getter function for the Discord Bot Client
   * @returns {Client|*}
   */
  getBot() {
    return this._bot;
  }

  /**
   * Internal Getter function for the Discord Clapp object
   * @returns {Clapp.App|*}
   */
  getClapp() {
    return this._clapp;
  }

  /**
   * Gets configs from database
   */
  getAllSpecificConfigs() {
    this.initBERcon(null, null);
  }

  /**
   * Puts the database configs for each server into the actual bot.
   * @param {Array<string>} keys
   * @param {Array<string>} specificConfigs
   */
  applyConfigs(keys, specificConfigs) {
    keys.forEach((value, index) => {
      let guildId = value.replace('guild:', '');
      let guildData = this._data[guildId];

      if (guildData) {
        let specificGuildConfig = JSON.parse(specificConfigs[index]);
        if (specificGuildConfig) {
          this._data[guildId].config.specific = specificGuildConfig;

          if (!this._data[guildId].config.specific.bercon) {
            return;
          }

          this._data[guildId].config.specific.bercon.servers.forEach(
            (beRconData) => {
              if (beRconData.hasOwnProperty('showChannels')) {
                beRconData.showChannels = lodash.assign(
                  lodash.clone(this._defaultConfig.showChannels),
                  beRconData.showChannels
                );
              } else {
                beRconData.showChannels = lodash.clone(
                  this._defaultConfig.showChannels
                );
              }
            }
          );
        }
      }
    });
  }

  /**
   * Puts the database config for 1 specific server into the actual bot.
   * @param {string} guildId
   * @param {Array<string>} specificConfig
   * @param {Channel} channel
   */
  applyConfig(guildId, specificConfig, channel) {
    let guildData = this._data[guildId];
    if (guildData) {
      let specificGuildConfig = JSON.parse(specificConfig);
      if (specificGuildConfig) {
        guildData.config.specific = specificGuildConfig;
      }

      guildData.config.specific.bercon.servers.forEach((beRconData) => {
        if (beRconData.hasOwnProperty('showChannels')) {
          beRconData.showChannels = lodash.assign(
            lodash.clone(this._defaultConfig.showChannels),
            beRconData.showChannels
          );
        } else {
          beRconData.showChannels = lodash.clone(
            this._defaultConfig.showChannels
          );
        }
      });

      this._data[guildId] = guildData;

      this.logBot(
        'Configs applied for ' +
          guildData.config.specific.bercon.servers.length +
          ' servers.'
      );
    } else {
      this.logBot(
        "Bot can't find the discord server info related to the guildid."
      );
    }
  }

  /**
   * gets the specific config from the DB.
   * @param {Guild} guild
   * @param {Channel|null} channel
   */
  reloadSpecificConfig(guild, channel) {
    this.logBot(
      'Reloading connection... reboot bot if you changed the config.js'
    );
    this.initBERcon(guild, channel);
  }

  /**
   * Wrapper function that will distribute message commands
   * @param {Message} msg
   */
  checkMessageAction(msg) {
    if (!msg.author.bot || !this._cfg.ignoreOtherBotMessages) {
      this.checkCliMessagesAction(msg);

      let messages = [];
      let sendMessages = true;

      this._bercons[msg.guildId].forEach((bercon, index) => {
        // console.log('Check admin action for: ' +  bercon.id + ' ' + bercon.cfg.name);
        let response = bercon.checkAdminCommand(msg);
        if (typeof response === 'string') {
          messages.push(response);
        }
        if (response === true) {
          sendMessages = false;
        }
      });

      if (messages.length > 0 && sendMessages) {
        Helper.sendTextMessage(msg.channel, messages.join(' '));
      }
    }
  }

  /**
   * Updates the database with the icon score
   * @param {User} user
   * @param {Guild} guild
   * @param {string} icon
   * @param {int} amount
   */
  updateUserIconCount(user, guild, icon, amount) {
    //console.log(user.username, guild.name, icon, amount);
    //return count;
  }

  /**
   * Checks all channel for a specific icon
   * @param {Message} msg
   */
  checkIconMessagesAction(msg) {
    let icon = ':heart:';
    //let regex =  new RegExp('❤', "gu");
    //let regex2 =  new RegExp('\u2764', "gu");
    let regex3 = new RegExp('\u{2764}', 'gu');
    //let regex4 = new RegExp(':heart:', "gu");
    //let regex5 =  new RegExp(':heart:', "g");
    let that = this;

    let content = msg.content.toString();

    let countIcon = (content.match(regex3) || []).length;

    if (countIcon > 0) {
      let mentions = msg.mentions.users;

      if (mentions.length > 0) {
        let reply = '';

        let user = mentions.first();
        /**
         * @type {User} user
         */
        if (user.id !== msg.author.id) {
          reply += `${msg.author.toString()} received ${countIcon} ${icon} -> Total of ${newCount} ${icon}\n`;
        } else {
          reply += "No Self-Love allowed. But it's good you love yourself!\n";
        }
      }
    }
  }

  /**
   * Checks all channels for CLI commands to reply to.
   * @param {Message} msg
   */
  checkCliMessagesAction(msg) {
    if (this.getClapp().isCliSentence(msg.content)) {
      this.getClapp().parseInput(msg.content, {
        msg: msg,
        zbot: this
        // Keep adding properties to the context as you need them
      });
    }
  }

  /**
   * Checks the welcome channel for role messages and gives roles.
   * @param {Message} msg
   */
  checkWelcomeMessagesAction(msg) {}

  /**
   * Ask new member/client for ASL data in welcome channel.
   * @param {GuildMember} member
   */
  welcomeClientAction(member) {
    // let channel = member.guild.channels.find(val => val.name === this.cfg.specific.channels.welcome);
    // Helper.sendTextMessage(channel, `:heart: ${member.toString()}. Welcome to ${member.guild.name}!`);
  }

  /**
   * Ask new member/client for ASL data in welcome channel.
   * @param {GuildMember} member
   */
  leaveClientAction(member) {
    // let channel = member.guild.channels .find(val => val.name === this.cfg.specific.channels.goodbye);
    // let name = (member.nickname ?  member.nickname : member.user.username);
    // Helper.sendTextMessage(channel,`:broken_heart: **${name}** left ${member.guild.name}...`);
  }

  /**
   * Sets the bots it's playing state.
   * @param {string} text
   */
  setBotPlayingState(text) {
    this.getBot().user.setActivity(text, { type: 'WATCHING' });
  }

  /**
   * Post the gif in the channel
   * @param {string} id
   * @param {Message} msg
   * @param {string} tags
   */
  postGiphyGif(id, msg, tags) {
    if (typeof id !== 'undefined') {
      Helper.sendTextMessage(
        msg.channel,
        `http://media.giphy.com/media/${id}/giphy.gif (Tags: ${tags})`
      );
    } else {
      Helper.sendTextMessage(
        msg.channel,
        `Invalid tags, try again with different tags. (Used tags: ${tags})`
      );
    }
  }

  /**
   * Search for a gif
   * @param {*} tags
   * @param {Message} msg
   */
  getGiphyGif(tags, msg) {
    // let query = this._qs.stringify(this._cfg.giphy);
    //
    // if (tags !== null) {
    //   query += "&tag=" + tags.replace(' ', '+');
    // }
    //
    // this._request(this._cfg.giphy.url + "?" + query, function (error, response, body) {
    //
    //   if (error || response.statusCode !== 200) {
    //     console.error("giphy: Got error: " + body);
    //     console.log(error);
    //   }
    //   else {
    //     try{
    //       let responseObj = JSON.parse(body);
    //       this.postGiphyGif(responseObj.data.id, msg, tags);
    //     }
    //     catch(err){
    //       this.postGiphyGif(undefined, msg, tags);
    //     }
    //   }
    // }.bind(this));
  }

  /**
   * Logs an action to the admin channel
   * @param {string} message
   * @param {Channel|null} channel
   */
  logBot(message, channel) {
    console.log(message);
    if (this.cfg.log.enable) {
      if (channel) {
        Helper.printLongMessage(message, channel);
      } else {
        if (this._logChannel) {
          Helper.printLongMessage(message, this._logChannel);
        }
      }
    }
  }

  /**
   * Initiate all guild data in memory to allow multiple server separate support.
   */
  findAllActiveGuilds() {
    /**
     * @param {Guild} element
     */
    this.bot.guilds.cache.forEach((element) => {
      this.logBot(element.id + ' ' + element.name);
      this._data[String(element.id)] = {
        guild: element,
        config: lodash.cloneDeep(this._cfg),
        beRcons: [],
        channels: {
          // Config for zbot channels - (rcon channels are the rcons object since you can have multiple rcons ervers.)
          welcome: 'welcome',
          goodbye: 'welcome'
        }
      };
      this._bercons[String(element.id)] = [];
    });
  }

  /**
   * Add new guild to active guild list.
   * @param {Guild} guild
   */
  addActiveGuild(guild) {
    if (!('key' in this.data)) {
      this.logBot('New Guild: ' + guild.id + ' ' + guild.name);
      this._data[String(guild.id)] = {
        guild: guild,
        config: lodash.cloneDeep(this._cfg), // default config. Will be overwritten with site config later on.
        beRcons: [],
        channels: {
          // Config for zbot channels - (rcon channels are the rcons object since you can have multiple rcons ervers.)
          welcome: 'welcome',
          goodbye: 'welcome'
        }
      };
      this._bercons[String(guild.id)] = [];
    }
  }

  /**
   * Refresh Guild object.
   * @param {Guild} oldGuild
   * @param {Guild} newGuild
   */
  updateGuildData(oldGuild, newGuild) {
    if (oldGuild.id in this.data) {
      this._data[String(oldGuild.id)].guild = newGuild;
    }
  }

  /**
   * Wrapper function when a new guild is added to the bot.
   * @param {Guild} guild
   */
  newGuildAction(guild) {
    this.addActiveGuild(guild);
    this.reloadSpecificConfig(guild, null);
  }

  /**
   * Action called when a guild is updated.
   * @param oldGuild
   * @param newGuild
   */
  updateGuildAction(oldGuild, newGuild) {
    this.updateGuildData(oldGuild, newGuild);
  }

  /**
   * Initiate bot functions that need to wait until bot is logged in to the servers.
   */
  initAfterReady() {
    this.setLogChannel();
    if (!this._running) {
      this.findAllActiveGuilds();
      this.watchFiles();
      this.getAllSpecificConfigs();
      this._running = true;
    }
  }

  /**
   * Binds the zbot channel for loggin.
   */
  setLogChannel() {
    let guilds = this.bot.guilds;
    if (guilds) {
      let logguild = guilds.cache.find(
        (val) => val.name === this.cfg.discordServerName
      );
      if (logguild) {
        this._logChannel = logguild.channels.cache.find(
          (val) => val.name === this.cfg.specific.channels.log
        );
      }
    }
  }

  /**
   * Initiate BE Rcon for multiple servers per guild if enabled.
   * @param {null|Guild} guild
   * @param {null|Channel} channel
   */
  initBERcon(guild, channel) {
    if (guild) {
      console.log(this._data[guild.id].config.specific);

      if (!this._data[String(guild.id)].config.specific.bercon) {
        this.logBot('No bercon info found');
        return;
      }

      // close all active rcons from this guild..
      this.logBot(
        'Rebooting ' + this._data[String(guild.id)].beRcons.length + ' rcons.'
      );

      this._data[String(guild.id)].beRcons.forEach((rcon) => {
        console.log('Closing rcon: ' + rcon.cfg.name);

        if (rcon.bnode) {
          rcon.cmdDisconnect();
          rcon.cmdExit();
          rcon.bnode.emit('disconnected', 'stop');

          if (rcon.bnode.keepalive) {
            clearInterval(rcon.bnode.keepalive);
          }

          rcon.bnode.socket.onclose = function () {};
          rcon.bnode.socket.close();

          rcon.deleteEvents();

          rcon.bnode = null;
          delete rcon.bnode;
          lodash.remove(this.bercons, (n) => {
            let found = n.id === rcon.id;

            if (found) {
              console.log('Found 1');
            }

            return found;
          });

          console.log('Closed ( tried )  rcon: ' + rcon.cfg.name);
        } else {
          this.logBot('No active rcon: ' + rcon.cfg.name);
        }
      });

      this.logBot('Starting new rcons:');

      delete this._data[String(guild.id)].beRcons;

      this._data[String(guild.id)].beRcons = [];

      if (
        this._data[String(guild.id)].config.specific.bercon.enabled &&
        ((this._data[String(guild.id)].config.specific.bercon.enabled == true &&
          typeof this._data[String(guild.id)].config.specific.bercon.enabled ===
            'boolean') ||
          this._data[String(guild.id)].config.specific.bercon.enabled == 'on')
      ) {
        this._data[String(guild.id)].config.specific.bercon.servers.forEach(
          (beRconData) => {
            let guid = Helper.guid();
            let rcon = new ZBotBERcon(
              this._data[String(guild.id)],
              beRconData,
              this._bot,
              this,
              channel,
              guid
            );
            this._data[String(guild.id)].beRcons.push(rcon);
            this._bercons[String(guild.id)].push(rcon);
          }
        );

        this.logBot(
          'Started ' +
            this._data[String(guild.id)].config.specific.bercon.servers.length +
            ' rcons.'
        );
      } else {
        this.logBot('Rcon is disabled in webpanel.');
      }
    } else {
      let guildIds = Object.keys(this._data);

      guildIds.forEach((guildId) => {
        if (
          this._data[guildId].config.specific.bercon &&
          this._data[guildId].config.specific.bercon.enabled &&
          ((this._data[String(guildId)].config.specific.bercon.enabled ==
            true &&
            typeof this._data[String(guildId)].config.specific.bercon
              .enabled === 'boolean') ||
            this._data[String(guildId)].config.specific.bercon.enabled == 'on')
        ) {
          //console.log(guildId, this._data[guildId].config.specific.bercon.servers[0].ip, 'servers');
          this._data[guildId].config.specific.bercon.servers.forEach(
            (beRconData) => {
              // console.log(beRconData.ip);
              let guid = Helper.guid();
              let rcon = new ZBotBERcon(
                this._data[guildId],
                beRconData,
                this._bot,
                this,
                channel,
                guid
              );
              this._data[guildId].beRcons.push(rcon);
              this._bercons[String(guildId)].push(rcon);
            }
          );
        }
      });
    }
  }

  /**
   * Encrypts a string with our secret key.
   * @param {string} text
   * @returns {*|CipherParams}
   */
  encryptString(text) {
    return crypto.AES.encrypt(text, this.cfg.encryptionKey);
  }

  /**
   * Decrypts an encrypted text
   * @param {string} encryptedText
   */
  decryptString(encryptedText) {
    let bytes = crypto.AES.decrypt(
      ciphertext.toString(),
      this.cfg.encryptionKey
    );
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  /**
   * Broadcast a message to all rcon command discord channels.
   * @param {string} text
   */
  broadcastMessage(text) {
    /**
     * @var {ZBotBERcon} bercon
     */
    this._bercons.forEach((berconArray) => {
      berconArray.forEach((bercon) => {
        Helper.sendTextMessage(
          bercon.commandChannel,
          text.replace('!zbot broadcast ', '')
        );
      });
    });
  }

  /**
   * List some rcon stats
   * @param {Channel} channel
   */
  listStats(channel) {
    Helper.sendTextMessage(
      channel,
      `Zbot is serving in ${this.bot.channels.size} channels on ${this.bot.guilds.size} servers, for a total of ${this.bot.users.size} users.`
    );
    Helper.sendTextMessage(
      channel,
      `This includes a total of ${this._bercons.length} RCON instances.`
    );
  }

  /**
   * List all rcon stats
   * @param {Channel} channel
   */
  listExtraStats(channel) {
    let message = 'Guilds:\n\n';

    this._bot.guilds.array().forEach((guild) => {
      message += 'Guild: ' + guild.name + ' (' + guild.id + ')\n';
    });

    message += '\nRCONs:\n\n';

    this._bercons.forEach((berconArray) => {
      berconArray.forEach((bercon) => {
        message +=
          'Guild: ' +
          bercon.guild.name +
          ' -> RCON: ' +
          bercon.cfg.name +
          ' - \n';
      });
    });
    Helper.printLongMessage(message, channel);
  }

  /**
   * List a config from a guild
   * @param {string} guildId
   * @param {channel} channel
   */
  listInfo(guildId, channel) {
    let guildData = this._data[String(guildId)];
    if (guildData.config && guildData.config.specific) {
      Helper.printObject(guildData.config.specific, channel);
    } else {
      Helper.sendTextMessage('No config on object');
    }
  }

  /**
   * Event when an channel has is updated.
   * @param {GuildChannel} oldChannel
   * @param {GuildChannel} newChannel
   */
  checkChannelUpdate(oldChannel, newChannel) {
    if (oldChannel.type !== 'text') {
      return false;
    }

    let guildId = String(oldChannel.guild.id);

    if (!(guildId in this._data)) {
      return false;
    }

    if (!('beRcons' in this._data[guildId])) {
      return false;
    }

    // iterate the bercons and update there channels.
    this._data[guildId].beRcons.forEach((bercon) => {
      bercon.updateChannels(oldChannel, newChannel);
    });
  }
}

module.exports = ZBot;
