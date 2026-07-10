# Production image: Vite build + Express (server.js)
# Azure App Service uses GitHub Actions zip deploy.
# Cloud Run showcase uses this Dockerfile with VITE_SHOWCASE_MODE=true + GEMINI_API_KEY.

FROM node:22-bookworm-slim AS build
WORKDIR /app

ARG VITE_SHOWCASE_MODE=false
ENV VITE_SHOWCASE_MODE=$VITE_SHOWCASE_MODE

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY server.js ./
COPY server/public ./server/public
COPY docs/knowledge/core ./docs/knowledge/core

EXPOSE 8080
CMD ["node", "server.js"]
