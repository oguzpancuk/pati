# pati — tek imaj: Node backend + derlenmiş web PWA.
# Web build'i mobile/src (taxonomy, avatars, badges, paging) ve shared/ dizinlerini
# @mobile/@shared alias'larıyla import ediyor; o yüzden üç dizin de kopyalanıyor.

FROM node:20-alpine AS web
WORKDIR /repo
COPY web/package.json web/package-lock.json web/
RUN cd web && npm ci
COPY web/ web/
COPY shared/ shared/
COPY mobile/src/taxonomy.ts mobile/src/avatars.ts mobile/src/badges.ts mobile/src/paging.ts mobile/src/
COPY mobile/assets/fonts/ mobile/assets/fonts/
RUN cd web && npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=web /repo/web/dist ./web-dist
ENV WEB_DIST_DIR=/app/web-dist
ENV UPLOADS_DIR=/data/uploads
ENV PORT=3000
EXPOSE 3000
CMD ["node", "src/server.js"]
