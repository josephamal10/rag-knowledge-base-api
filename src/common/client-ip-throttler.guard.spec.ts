import { ClientIpThrottlerGuard } from './client-ip-throttler.guard';

const ip = ClientIpThrottlerGuard.clientIp;

describe('ClientIpThrottlerGuard.clientIp', () => {
  it('uses the socket address when not behind a trusted proxy (headers can be spoofed)', () => {
    const req = { ip: '10.0.0.5', headers: { 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '5.6.7.8' } };
    expect(ip(req, false)).toBe('10.0.0.5');
  });

  it('prefers the edge proxy client IP behind a trusted proxy', () => {
    const req = { ip: '172.16.0.9', headers: { 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '5.6.7.8, 172.16.0.9' } };
    expect(ip(req, true)).toBe('1.2.3.4');
  });

  it('falls back to the original X-Forwarded-For address', () => {
    const req = { ip: '172.16.0.9', headers: { 'x-forwarded-for': '5.6.7.8, 10.1.1.1, 172.16.0.9' } };
    expect(ip(req, true)).toBe('5.6.7.8');
  });

  it('falls back to req.ip, then a constant, when no headers are present', () => {
    expect(ip({ ip: '9.9.9.9', headers: {} }, true)).toBe('9.9.9.9');
    expect(ip({ headers: {} }, true)).toBe('unknown');
  });
});
