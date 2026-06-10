# Stage 1: Build the React application
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Wire the build to point to the live production backend Cloud Run service
ENV VITE_BACKEND_URL=https://viral-content-copilot-201279421188.us-central1.run.app

RUN npm run build

# Stage 2: Serve static files using Nginx
FROM nginx:stable-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
