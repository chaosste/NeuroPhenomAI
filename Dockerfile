# Multi-stage Dockerfile optimized for Google Cloud Run
FROM node:22-slim AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy application source and build client bundle
COPY . .
RUN npm run build

# Production runner stage
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Install production dependencies and tsx for TypeScript execution
COPY package*.json ./
RUN npm ci --omit=dev && npm install -g tsx

# Copy compiled frontend and backend entrypoint
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts

EXPOSE 8080

# Run the full-stack server
CMD ["tsx", "server.ts"]
