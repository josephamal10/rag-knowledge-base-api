// external modules
import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiSecurity, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { Request } from 'express';

// utils/helpers
import { timingSafeEqual } from 'crypto';

export const ADMIN_KEY_HEADER = 'x-admin-key';
export const ADMIN_KEY_SECURITY = 'admin-key';                                   // Swagger security scheme name

/** Marks a route as admin-only (enforced only when ADMIN_API_KEY is set) and documents it in Swagger. */
export const AdminOnly = () =>
  applyDecorators(
    UseGuards(AdminKeyGuard),
    ApiSecurity(ADMIN_KEY_SECURITY),
    ApiUnauthorizedResponse({ description: 'Missing or wrong x-admin-key (only when ADMIN_API_KEY is set)' }),
  );

/**
 * Protects endpoints that change the knowledge base (ingest, edit, delete, reindex).
 * If ADMIN_API_KEY is not set (local development) everything is allowed; when it is set
 * (public deployment) callers must send it in the `x-admin-key` header.
 */
@Injectable()
export class AdminKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.configService.get<string>('ADMIN_API_KEY');
    if (!expected) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers[ADMIN_KEY_HEADER];
    if (typeof provided === 'string' && AdminKeyGuard.safeEqual(provided, expected)) {
      return true;
    }

    throw new UnauthorizedException({
      message: 'This action needs an admin key. The public demo is read-only — asking questions is open to everyone.',
    });
  }

  /** Constant-time comparison so the key can't be guessed from response timing. */
  static safeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
