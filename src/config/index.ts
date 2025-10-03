// Environment configuration
import dotenv from 'dotenv';
import { Config } from '../types';

dotenv.config();

const config: Config = {
  livekit: {
    url: process.env.LIVEKIT_URL || '',
    apiKey: process.env.LIVEKIT_API_KEY || '',
    apiSecret: process.env.LIVEKIT_API_SECRET || ''
  },
  deepgram: {
    apiKey: process.env.DEEPGRAM_API_KEY || ''
  },
  server: {
    port: parseInt(process.env.PORT || '3000', 10)
  },
  backend: {
    url: process.env.BACKEND_URL || 'http://localhost:3000',
    analyzeEndpoint: '/api/interviews/analyze'
  }
};

// Validate required configuration
function validateConfig(): void {
  const required = [
    'LIVEKIT_URL',
    'LIVEKIT_API_KEY',
    'LIVEKIT_API_SECRET',
    'DEEPGRAM_API_KEY'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

validateConfig();

export default config;
