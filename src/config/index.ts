// Environment configuration
import dotenv from 'dotenv';
import { Config } from '../types';
import { validateEnvironment } from './environment';
import gcpSecrets from './gcp-secrets';

dotenv.config();

// Validate environment first
validateEnvironment(process.env);

async function loadSecrets(): Promise<void> {
  const env = process.env.NODE_ENV;

  if (env === 'staging' || env === 'production') {
    console.log(`Loading secrets from GCP Secret Manager (${env})...`);

    try {
      // Load all secrets
      process.env.LIVEKIT_API_KEY = await gcpSecrets.getSecret('livekit-api-key', 'LIVEKIT_API_KEY');
      process.env.LIVEKIT_API_SECRET = await gcpSecrets.getSecret('livekit-api-secret', 'LIVEKIT_API_SECRET');
      process.env.DEEPGRAM_API_KEY = await gcpSecrets.getSecret('deepgram-api-key', 'DEEPGRAM_API_KEY');
      process.env.JWT_SECRET = await gcpSecrets.getSecret('jwt-secret', 'JWT_SECRET');
      process.env.BACKEND_API_KEY = await gcpSecrets.getSecret('backend-api-key', 'BACKEND_API_KEY');

      console.log('✅ All secrets loaded successfully');
    } catch (error) {
      console.error('Failed to load secrets:', (error as Error).message);
      throw error;
    }
  }
}

const config: Config = {
  livekit: {
    url: process.env.LIVEKIT_URL || '',
    apiKey: process.env.LIVEKIT_API_KEY || '',
    apiSecret: process.env.LIVEKIT_API_SECRET || '',
  },
  deepgram: {
    apiKey: process.env.DEEPGRAM_API_KEY || '',
  },
  server: {
    port: parseInt(process.env.PORT || '8080', 10),
  },
  backend: {
    url: process.env.BACKEND_URL || 'http://localhost:8080',
    analyzeEndpoint: '/api/interviews/analyze',
    apiKey: process.env.BACKEND_API_KEY || '',
  },
  jwt: {
    secret: process.env.JWT_SECRET || '',
    issuer: process.env.JWT_ISSUER || 'interview-backend',
    audience: process.env.JWT_AUDIENCE || 'transcription-service',
  },
};

export { loadSecrets };
export default config;
