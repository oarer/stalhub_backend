FROM oven/bun AS build

WORKDIR /app

COPY package.json package.json
COPY bun.lock bun.lock
COPY prisma ./prisma

RUN bun install
RUN bunx prisma generate

COPY tsconfig.json tsconfig.json

COPY ./src ./src

ENV NODE_ENV=production

RUN bun build \
 --compile \
 --minify-whitespace \
 --minify-syntax \
 --outfile server \
 src/index.ts