import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

interface CacheEntry {
  value: string;
  timestamp: number;
}

class GcpSecretsManager {
  private client: SecretManagerServiceClient | null = null;
  private cache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    const env = process.env.NODE_ENV;
    if (env === 'staging' || env === 'production') {
      this.client = new SecretManagerServiceClient();
      console.log(`GCP Secret Manager initialized for ${env}`);
    } else {
      console.log('Running in local mode - using environment variables');
    }
  }

  async getSecret(secretName: string, fallbackEnvVar?: string): Promise<string> {
    // Local development: use env vars
    if (!this.client) {
      const envValue = process.env[fallbackEnvVar || secretName];
      if (!envValue) {
        throw new Error(`Environment variable ${fallbackEnvVar || secretName} not found`);
      }
      return envValue;
    }

    // Check cache
    const cached = this.cache.get(secretName);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.value;
    }

    try {
      const projectId = process.env.GCP_PROJECT_ID;
      const environment = process.env.NODE_ENV;
      const fullSecretName = `transcription-${secretName}-${environment}`;
      const secretPath = `projects/${projectId}/secrets/${fullSecretName}/versions/latest`;

      console.log(`Fetching secret: ${fullSecretName}`);

      const [version] = await this.client.accessSecretVersion({ name: secretPath });
      const secretValue = version.payload?.data?.toString();

      if (!secretValue) {
        throw new Error(`Secret ${fullSecretName} has no value`);
      }

      // Cache it
      this.cache.set(secretName, {
        value: secretValue,
        timestamp: Date.now(),
      });

      return secretValue;
    } catch (error) {
      console.error(`Failed to fetch secret ${secretName}:`, (error as Error).message);

      // Fallback to env var
      if (fallbackEnvVar && process.env[fallbackEnvVar]) {
        console.warn(`Using fallback environment variable ${fallbackEnvVar}`);
        return process.env[fallbackEnvVar];
      }

      throw error;
    }
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export default new GcpSecretsManager();
