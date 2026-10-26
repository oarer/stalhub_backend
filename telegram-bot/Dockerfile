FROM oven/bun:latest
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install
COPY tsconfig.json ./
COPY src ./src
CMD ["bun", "run", "src/index.ts"]
