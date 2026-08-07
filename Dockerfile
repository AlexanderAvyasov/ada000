FROM node:24-slim AS builder
WORKDIR /app

# install deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=optional --no-audit --no-fund

# copy sources and build
COPY . .
RUN npm run build

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# copy only what we need for runtime
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 8080
CMD ["node", "./dist/index.js"]
