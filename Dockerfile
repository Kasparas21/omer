FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run check && npm run build \
  && cp -f public/tracker.js dist/tracker.js \
  && mkdir -p dist/vendor \
  && cp -R public/vendor/. dist/vendor/
FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server
COPY drizzle ./drizzle
USER node
CMD ["npm", "start"]
