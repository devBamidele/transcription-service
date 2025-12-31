import { Router, Request, Response } from 'express';
import axios from 'axios';
import config from '../config';

const router = Router();

// Liveness - just check if the app is alive
router.get('/liveness', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// Startup - simple check for container startup
router.get('/startup', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// Readiness - check external dependencies
router.get('/readiness', async (_req: Request, res: Response) => {
  const checks: Record<string, string> = {
    deepgram: 'unknown',
    backend: 'unknown',
    livekit: 'unknown',
  };

  let allHealthy = true;

  try {
    // Check Deepgram API (simple connectivity test)
    // Note: We can't easily test Deepgram without making a real request
    // so we'll just verify the API key is configured
    if (config.deepgram.apiKey) {
      checks.deepgram = 'configured';
    } else {
      checks.deepgram = 'missing';
      allHealthy = false;
    }

    // Check Backend API connectivity
    try {
      const backendHealthUrl = `${config.backend.url}/api/health`;
      const response = await axios.get(backendHealthUrl, {
        timeout: 3000,
      });

      if (response.status === 200) {
        checks.backend = 'up';
      } else {
        checks.backend = 'down';
        allHealthy = false;
      }
    } catch (error) {
      checks.backend = 'down';
      allHealthy = false;
    }

    // LiveKit check (verify URL is configured)
    if (config.livekit.url) {
      checks.livekit = 'configured';
    } else {
      checks.livekit = 'missing';
      allHealthy = false;
    }

    if (allHealthy) {
      return res.json({
        status: 'ok',
        checks,
        timestamp: new Date().toISOString(),
      });
    } else {
      return res.status(503).json({
        status: 'degraded',
        checks,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    return res.status(503).json({
      status: 'error',
      error: (error as Error).message,
      checks,
      timestamp: new Date().toISOString(),
    });
  }
});

// Main health endpoint - same as liveness for backward compatibility
router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

export default router;
