import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

import { AdminKeyGuard } from './admin-key.guard';

const contextWith = (headers: Record<string, string>) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as unknown as ExecutionContext;

const guardWithKey = (key?: string) => new AdminKeyGuard({ get: () => key } as never);

describe('AdminKeyGuard', () => {
  it('allows everything when ADMIN_API_KEY is not configured (local development)', () => {
    expect(guardWithKey(undefined).canActivate(contextWith({}))).toBe(true);
    expect(guardWithKey('').canActivate(contextWith({}))).toBe(true);
  });

  it('rejects requests without the header', () => {
    expect(() => guardWithKey('secret').canActivate(contextWith({}))).toThrow(UnauthorizedException);
  });

  it('rejects a wrong key', () => {
    expect(() => guardWithKey('secret').canActivate(contextWith({ 'x-admin-key': 'guess' }))).toThrow(
      UnauthorizedException,
    );
  });

  it('accepts the right key', () => {
    expect(guardWithKey('secret').canActivate(contextWith({ 'x-admin-key': 'secret' }))).toBe(true);
  });

  it('compares keys of different lengths safely', () => {
    expect(AdminKeyGuard.safeEqual('a', 'abc')).toBe(false);
    expect(AdminKeyGuard.safeEqual('abc', 'abc')).toBe(true);
  });
});
