# ---------- build ----------
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ---------- runtime ----------
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/views ./src/views
COPY --from=build /app/src/public ./src/public
COPY --from=build /app/package.json ./package.json
RUN mkdir -p data && chown -R node:node /app
USER node
EXPOSE 3000
# Defina ANTHROPIC_API_KEY, SESSION_SECRET e APP_PASSWORD (ex.: docker run --env-file .env ...)
CMD ["node", "dist/server.js"]
