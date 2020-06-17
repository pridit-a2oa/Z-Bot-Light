FROM node:8.11.4-slim

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
COPY package*.json ./

RUN npm install --only=production

COPY . .

CMD [ "npm", "run", "bot" ]