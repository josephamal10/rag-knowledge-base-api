// external modules
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

type RequestLike = {
  ip?:      string;
  ips?:     string[];
  headers?: Record<string, string | string[] | undefined>;
};

const firstHeader = (value: string | string[] | undefined): string | undefined =>
  (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim() || undefined;

/**
 * Rate-limit per real visitor. Behind hosting proxies (Render → Cloudflare → load balancer) `req.ip`
 * is often a proxy hop that changes between requests, so the limit never triggers. When TRUST_PROXY
 * is on, prefer the client IP set by the edge proxy, then the original X-Forwarded-For address.
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    return ClientIpThrottlerGuard.clientIp(req as RequestLike, process.env.TRUST_PROXY === 'true');
  }

  static clientIp(req: RequestLike, trustProxy: boolean): string {
    if (trustProxy) {
      const headers = req.headers ?? {};
      const fromEdge = firstHeader(headers['cf-connecting-ip']) ?? firstHeader(headers['true-client-ip']);
      if (fromEdge) return fromEdge;

      const forwardedFor = firstHeader(headers['x-forwarded-for']);
      if (forwardedFor) return forwardedFor;
    }
    return req.ip ?? 'unknown';
  }
}
