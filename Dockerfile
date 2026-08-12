FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM node:22-alpine AS admin-build
WORKDIR /admin
RUN corepack enable && corepack prepare pnpm@11.2.2 --activate
COPY admin/package.json admin/pnpm-lock.yaml admin/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY admin ./
RUN pnpm build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=admin-build /admin/dist /usr/share/nginx/html/admin
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
