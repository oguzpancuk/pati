# pati — single image: Node backend + built web PWA.
# The web build imports mobile/src (taxonomy, avatars, badges, paging) and
# shared/ through the @mobile/@shared aliases; that's why all three
# directories are copied.

FROM node:20-alpine AS web
WORKDIR /repo
COPY web/package.json web/package-lock.json web/
RUN cd web && npm ci
COPY web/ web/
COPY shared/ shared/
# Whole mobile/src: web imports pure modules from it via @mobile/* (taxonomy,
# avatars, badges, paging, reportReasons…); listing files one by one broke the
# build every time a new shared module appeared.
COPY mobile/src/ mobile/src/
COPY mobile/assets/fonts/ mobile/assets/fonts/
RUN cd web && npm run build

# Admin panel: separate Vite project, uses the shared/ SVG generators.
COPY admin/package.json admin/package-lock.json admin/
RUN cd admin && npm ci
COPY admin/ admin/
RUN cd admin && npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=web /repo/web/dist ./web-dist
COPY --from=web /repo/admin/dist ./admin-dist
ENV WEB_DIST_DIR=/app/web-dist
ENV ADMIN_DIST_DIR=/app/admin-dist
ENV UPLOADS_DIR=/data/uploads
ENV PORT=3000
EXPOSE 3000
CMD ["node", "src/server.js"]
