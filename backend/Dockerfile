# syntax=docker/dockerfile:1

# ---- Build stage: compile TypeScript and run the tests ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY test ./test
# Compiles src + test and runs the API tests; a failing test fails the image build.
RUN npm test

# ---- Runtime stage: compiled JS only, no runtime dependencies ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3001
WORKDIR /app

COPY package.json ./
COPY --from=build /app/dist/src ./dist/src

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/health >/dev/null || exit 1

# Node is PID 1 behind `init: true` (compose) and handles SIGTERM itself:
# it closes the live (SSE) connections and exits.
CMD ["node", "dist/src/server.js"]
