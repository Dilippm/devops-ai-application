# Stage 1: build the static site
FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js ./
COPY src ./src
RUN npm run build

# Stage 2: serve it with nginx (non-root image, ~10x smaller than stage 1)
FROM nginxinc/nginx-unprivileged:1.27-alpine

ENV GATEWAY_URL=http://gateway:3001
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 3000
