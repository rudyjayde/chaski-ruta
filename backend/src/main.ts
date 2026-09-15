import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  // bodyParser:false + limites propios -- el body-parser por defecto de Nest/Express
  // acepta solo 100kb, y el logo de una asociacion (imagen como data URI en el
  // body de POST/PATCH /organizations) facilmente supera eso y el request falla
  // en silencio (413) si no se sube este limite.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // El backend corre detras del Global HTTPS Load Balancer de Google -- sin
  // esto, Express ve la IP interna del balanceador en cada request, no la
  // real del usuario, y el limite de peticiones por IP (ThrottlerModule,
  // abajo) agruparia a todos los usuarios como si fueran uno solo.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  // Cabeceras de seguridad estandar (13 sept 2026, auditoria de seguridad) --
  // protege contra clickjacking, sniffing de tipo de contenido, etc. csp:false
  // porque este backend nunca sirve HTML/paginas propias, solo JSON a la API --
  // un Content-Security-Policy pensado para paginas no aplica aqui.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(json({ limit: '8mb' }));
  app.use(urlencoded({ extended: true, limit: '8mb' }));
  const config = app.get(ConfigService);

  app.enableCors({
    origin: config.get<string>('FRONTEND_URL'),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
  console.log(`CHASKI RUTA backend escuchando en http://localhost:${port}`);
}
bootstrap();
