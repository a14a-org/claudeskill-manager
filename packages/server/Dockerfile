# Build stage
FROM node:20.20.2-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./
COPY packages/core/package.json ./packages/core/
COPY packages/server/package.json ./packages/server/

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy source
COPY packages/core ./packages/core
COPY packages/server ./packages/server
COPY tsconfig.json ./

# Build
RUN yarn workspace @claudeskill/core build
RUN yarn workspace @claudeskill/server build

# Production stage
FROM node:20.20.2-alpine

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./
COPY packages/core/package.json ./packages/core/
COPY packages/server/package.json ./packages/server/

# Install production dependencies only
RUN yarn install --frozen-lockfile --production

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
