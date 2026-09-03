import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  app.setGlobalPrefix('api/v1');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());
  const buckets = new Map<string, { count: number; resetAt: number }>();
  const limit = Number(process.env.RATE_LIMIT_LIMIT ?? 120);
  const ttl = Number(process.env.RATE_LIMIT_TTL_MS ?? 60_000);
  app.use((request: Request, response: Response, next: NextFunction) => {
    const now = Date.now(); const key = request.ip || request.socket.remoteAddress || 'local';
    const current = buckets.get(key);
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + ttl } : current;
    bucket.count += 1; buckets.set(key, bucket);
    response.setHeader('RateLimit-Limit', limit); response.setHeader('RateLimit-Remaining', Math.max(0, limit - bucket.count));
    response.setHeader('RateLimit-Reset', Math.ceil(bucket.resetAt / 1000));
    if (bucket.count > limit) { response.status(429).json({ statusCode: 429, message: 'طلبات كثيرة؛ أعد المحاولة بعد قليل.', error: 'RATE_LIMITED' }); return; }
    next();
  });
  app.enableCors({ origin: (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(','), credentials: true, methods: ['GET','POST','PATCH','DELETE','OPTIONS'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new ApiExceptionFilter());
  const swagger = new DocumentBuilder()
    .setTitle('واجهة منصة التشريعات اليمنية')
    .setDescription('REST/JSON API محلية. البيانات التجريبية غير رسمية.')
    .setVersion('1.0').build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger), { customSiteTitle: 'توثيق API — منصة التشريعات اليمنية' });
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`API listening on http://localhost:${port}/api/v1`);
}

bootstrap().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
