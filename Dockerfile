# -------- Base Image --------
FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies needed for node-gyp (falls nötig)
RUN apk add --no-cache python3 make g++


# -------- Dependencies Layer (Cache) --------
FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production


# -------- Runtime Layer --------
FROM node:20-alpine AS app
WORKDIR /app

# Für Logging, crypto, etc.
RUN apk add --no-cache tzdata

# Copy node_modules from deps step
COPY --from=deps /app/node_modules ./node_modules

# Copy rest of backend
COPY . .

# Port for Render
EXPOSE 3000

# Health Check (Render-compatible)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
