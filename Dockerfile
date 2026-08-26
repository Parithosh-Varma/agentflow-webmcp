FROM node:20-slim

WORKDIR /app

COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install

COPY backend/package*.json ./backend/
RUN cd backend && npm install

COPY frontend/ ./frontend/
RUN cd frontend && npm run build

COPY backend/ ./backend/
COPY render.yaml ./

EXPOSE 3001

CMD ["node", "backend/index.js"]
