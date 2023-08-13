/**
 * Load all external dependencies TODO: Move these to the files that need them instead of passing them as properties ( DIRTY ).
 */
const { Client, GatewayIntentBits } = require('discord.js');
const qs = require("querystring");
const request = require("request");
const bluebird = require("bluebird");
//const redisNode = require("redis");

/**
 * Load all internal dependencies
 */
const Clapp   = require('./modules/clapp-discord');
const ZBotEvents    = require('./modules/z-bot-events');
const ZBotRedis    = require('./modules/z-bot-redis');
const cfg     = require('../config.js');
const defaultConfig  = require('../defaults.js');
const pkg     = require('../package.json');

/**
 * Create bot instance.
 */
let bot = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
    autoReconnect: true
});

/**
 * Make the redis functions async.
 */
// bluebird.promisifyAll(redisNode.RedisClient.prototype);
// bluebird.promisifyAll(redisNode.Multi.prototype);

/**
 * Initiate Clapp module
 * This module is an clean and easy implementation for replying to ! commmands.
 * @type {App}
 */
let clapp = new Clapp.App({
  name: cfg.name,
  desc: pkg.description,
  prefix: cfg.prefix,
  version: pkg.version,
  onReply: (msg, context) => {
    console.log('test');
    context.msg.reply('\n' + msg).then(bot_response => {
      if (context.cfg.deleteAfterReply.enabled) {
        context.msg.delete(10000)
          .then(msg => console.log(`Deleted message from ${msg.author}`))
          .catch(console.log);
        bot_response.delete(10000)
          .then(msg => console.log(`Deleted message from ${msg.author}`))
          .catch(console.log);
      }
    });
  }
});


/**s
 * Initiate the ZBotEvents of the ZBot module
 * This will be your medium between Discord Events and ZBot.
 * @type {ZBotEvents}
 */
const events = new ZBotEvents(cfg.token, {
  bot: bot,
  cfg: cfg,
  clapp: clapp,
  qs: qs,
  request: request,
  redisNode: null,
  defaultConfig: defaultConfig
});