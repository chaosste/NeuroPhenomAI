# Production image: Vite build + Express (server.js)
# Primary deploy path is Azure App Service via GitHub Actions; this image supports Cloud Run / local Docker.

FROM node:22-bookworm-slim AS build
WORKDIR /app

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
COPY docs/knowledge/core ./docs/knowledge/core

EXPOSE 8080
CMD ["node", "server.js"]
