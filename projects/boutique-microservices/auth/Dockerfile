FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Install dependencies first so this layer is cached until package*.json change.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# Run as the unprivileged user that ships with the node image.
USER node
ENV PORT=3002
EXPOSE 3002

CMD ["node", "src/index.js"]
