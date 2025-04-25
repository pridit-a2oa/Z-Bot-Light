FROM node:23-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends --no-install-suggests \
        git ca-certificates \
    && apt-get remove --purge -y \
    && apt-get clean autoclean \
    && apt-get autoremove -y \
    && rm /var/lib/apt/lists/* -r

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package.json package-lock.json ./

RUN npm ci

COPY . .

CMD [ "npm", "run", "bot" ]