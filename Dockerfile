FROM node:18-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends --no-install-suggests \
        git \
    && apt-get remove --purge -y \
    && apt-get clean autoclean \
    && apt-get autoremove -y \
    && rm /var/lib/apt/lists/* -r

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package.json yarn.lock ./

RUN yarn install --production

COPY . .

CMD [ "yarn", "run", "bot" ]