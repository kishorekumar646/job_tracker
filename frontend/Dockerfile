## Stage 1 — build the React app
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Build-time env vars (Vite bakes these in at compile time)
ARG VITE_INSPECTORWEB_URL
ENV VITE_INSPECTORWEB_URL=$VITE_INSPECTORWEB_URL

COPY . .
RUN npm run build

## Stage 2 — serve with nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
STOPSIGNAL SIGTERM
CMD ["nginx", "-g", "daemon off;"]
