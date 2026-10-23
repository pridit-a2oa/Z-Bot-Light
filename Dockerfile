FROM node:26-alpine3.24 AS build

# Install build tools for native module compilation
RUN apk add --no-cache \
  python3 \
  make \
  g++

WORKDIR /usr/src/app

COPY . .

# Install dependencies
RUN npm ci && npm install zlib-sync

# ---- Final image ----
FROM node:26-alpine3.24

WORKDIR /usr/src/app

# Copy node_modules and app from build stage
COPY --from=build /usr/src/app /usr/src/app

CMD ["npm", "run", "bot"]