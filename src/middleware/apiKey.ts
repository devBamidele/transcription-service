import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

function timingSafeCompare(provided: string, expected: string): boolean {
  try {
    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(provided);

    // Length check (not timing-safe, but necessary)
    if (expectedBuffer.length !== providedBuffer.length) {
      return false;
    }

    // Timing-safe comparison
    return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
  } catch {
    return false;
  }
}

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const providedKey = req.headers['x-api-key'] as string;
  const expectedKey = process.env.BACKEND_API_KEY;

  if (!expectedKey) {
    console.error('BACKEND_API_KEY not configured');
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  if (!providedKey || !timingSafeCompare(providedKey, expectedKey)) {
    console.warn(`Unauthorized API key attempt from IP: ${req.ip}`);
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}
