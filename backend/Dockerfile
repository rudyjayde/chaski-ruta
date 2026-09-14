# Imagen de produccion del backend CHASKI RUTA (NestJS + Prisma). Build en 2
# etapas: la primera compila TypeScript y genera el cliente de Prisma; la
# segunda solo copia lo compilado + node_modules de produccion, para que la
# imagen final no cargue devDependencies ni el codigo fuente TS.
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# node:20-slim (Debian Bookworm) no trae openssl instalado -- sin esto Prisma
# no puede detectar la version de OpenSSL disponible y asume mal la 1.1.x
# (verificado en vivo 13 sept 2026: el primer deploy a Cloud Run crasheaba con
# "libssl.so.1.1: cannot open shared object file"). binaryTargets en
# schema.prisma ya fija debian-openssl-3.0.x; esto asegura que esa libreria
# realmente exista en la imagen.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate
COPY --from=build /app/dist ./dist

# Cloud Run inyecta PORT en runtime -- main.ts ya lee process.env.PORT (ver
# backend/.env.example), asi que no se fija un valor aqui.
CMD ["node", "dist/src/main.js"]
