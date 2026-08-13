FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_APP_BASE_PATH=/audioplayer
ENV VITE_APP_BASE_PATH=$VITE_APP_BASE_PATH
COPY package.json package-lock.json .npmrc ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY index.html vite.config.mjs ./
COPY public ./public
COPY src ./src
COPY scripts/prepare-sites-build.mjs ./scripts/prepare-sites-build.mjs
COPY worker ./worker
COPY .openai ./.openai
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.frontend.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/client /usr/share/nginx/html
EXPOSE 80
