# ---- Build stage ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --ignore-scripts

COPY packages/ packages/
COPY apps/ apps/
COPY data/ data/

# Build frontend
RUN npm run build

# ---- Production stage ----
FROM node:22-alpine
RUN addgroup -S domino && adduser -S domino -G domino
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/apps/server/dist apps/server/dist
COPY data/ data/
COPY --from=builder /app/apps/web/dist apps/web/dist

# Run as non-root user for security
RUN chown -R domino:domino /app
USER domino

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q -O- http://localhost:8080/api/health || exit 1

CMD ["node", "apps/server/dist/index.js"]

