FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS admin-build
WORKDIR /admin
RUN corepack enable && corepack prepare pnpm@11.2.2 --activate
COPY admin/package.json admin/pnpm-lock.yaml admin/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY admin ./
RUN pnpm build

FROM nginx:1.31.4-alpine@sha256:db35bfc6b2951e7f8a72db5db120288c127ffaeeb4a6d4b95a26fead017d5913
RUN apk add --no-cache --upgrade libcrypto3 libssl3
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=admin-build /admin/dist /usr/share/nginx/html/admin
RUN sed -i 's/listen 80;/listen 8080;/' /etc/nginx/conf.d/default.conf \
  && sed -i '/^user  nginx;/d' /etc/nginx/nginx.conf \
  && chown -R nginx:nginx /var/cache/nginx /run
USER nginx
EXPOSE 8080
# Probe the proxied API, not only the SPA shell. A bad /v1 location must make
# the deployment unhealthy instead of looking like a working frontend.
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD wget -q -O /dev/null http://127.0.0.1:8080/v1/health/live || exit 1
