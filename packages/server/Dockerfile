FROM node:24.18.1-alpine AS base

ENV BUN_INSTALL=/usr/local/bun
ENV PATH="${BUN_INSTALL}/bin:${PATH}"

RUN apk add --no-cache bash curl unzip \
  && curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.14" \
  && ln -sf "${BUN_INSTALL}/bin/bun" /usr/local/bin/bun

# Build stage
FROM base AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./
COPY packages/cli/package.json ./packages/cli/
COPY packages/core/package.json ./packages/core/
COPY packages/server/package.json ./packages/server/

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source
COPY packages/core ./packages/core
COPY packages/server ./packages/server
COPY tsconfig.json ./

# Build
RUN bun --filter @claudeskill/core build
RUN bun --filter @claudeskill/server build

# Production stage
FROM base

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./
COPY packages/cli/package.json ./packages/cli/
COPY packages/core/package.json ./packages/core/
COPY packages/server/package.json ./packages/server/

# Install production dependencies only
RUN bun install --frozen-lockfile --production

# Copy built files
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/server/dist ./packages/server/dist

# Environment
ENV NODE_ENV=production
ENV PORT=3001
ENV ENABLE_TEAM_SHARING=true

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "packages/server/dist/index.js"]
