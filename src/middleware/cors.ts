import cors from 'cors';

function getAllowedOrigins(): string[] {
  const environment = process.env.NODE_ENV;

  // Custom origins from env var
  if (process.env.ALLOWED_ORIGINS) {
    return process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
  }

  const defaultOrigins: Record<string, string[]> = {
    local: [
      'http://localhost:8080',
      'http://localhost:5173',
      'http://localhost:5174',
    ],
    staging: [
      // Add your staging frontend URLs here
    ],
    production: [
      // Add your production frontend URLs here
    ],
  };

  return defaultOrigins[environment || 'local'] || [];
}

export const corsMiddleware = cors({
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = getAllowedOrigins();

    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS: Blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'x-api-key'],
});
