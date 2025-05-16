FROM node:23-slim AS build

# Install build tools for native module compilation
RUN apt-get update && apt-get install -y \
  python3 \
  make \
  g++ \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY . .

# Install dependencies
RUN npm ci && npm install zlib-sync

# ---- Final image ----
FROM node:23-slim

WORKDIR /usr/src/app

# Copy node_modules and app from build stage
COPY --from=build /usr/src/app /usr/src/app

CMD ["npm", "run", "bot"]