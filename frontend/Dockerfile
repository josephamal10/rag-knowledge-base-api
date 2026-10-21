# ---- Frontend (React + Vite), served by nginx ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Empty VITE_API_URL = same origin: nginx below proxies API calls to the backend container.
ARG VITE_API_URL=
ARG VITE_ENABLE_INGEST=true
ARG VITE_DEFAULT_COURSE_ID=demo-club
ENV VITE_API_URL=$VITE_API_URL \
    VITE_ENABLE_INGEST=$VITE_ENABLE_INGEST \
    VITE_DEFAULT_COURSE_ID=$VITE_DEFAULT_COURSE_ID
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
