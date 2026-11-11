# syntax=docker/dockerfile:1

# ---- Build stage: compile the Vite app to static files ----
FROM node:22-alpine AS build
WORKDIR /app

# Install dependencies first so this layer is cached between source changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Runtime stage: serve dist/ with nginx ----
FROM nginx:stable-alpine AS runtime

# Rendered to /etc/nginx/conf.d/default.conf by the image's entrypoint.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
    SEATSENSE_BACKEND_URL=http://backend:3001
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# busybox wget ships with nginx:alpine; 127.0.0.1 avoids IPv6 localhost issues.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
