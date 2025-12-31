import Joi from 'joi';

export type Environment = 'local' | 'staging' | 'production';

export function getEnvironment(): Environment {
  const env = process.env.NODE_ENV as string;
  if (['production', 'staging', 'local'].includes(env)) {
    return env as Environment;
  }
  return 'local';
}

export function getValidationSchema() {
  const baseSchema = {
    NODE_ENV: Joi.string().valid('local', 'staging', 'production').default('local'),
    PORT: Joi.number().default(8080),
  };

  // Local - most things optional for easier development
  const localSchema = Joi.object({
    ...baseSchema,
    LIVEKIT_URL: Joi.string().uri({ scheme: ['ws', 'wss'] }).optional(),
    LIVEKIT_API_KEY: Joi.string().optional(),
    LIVEKIT_API_SECRET: Joi.string().optional(),
    DEEPGRAM_API_KEY: Joi.string().optional(),
    JWT_SECRET: Joi.string().min(32).optional(),
    BACKEND_URL: Joi.string().uri().optional(),
    BACKEND_API_KEY: Joi.string().optional(),
  }).unknown(true);

  // Staging - all required
  const stagingSchema = Joi.object({
    ...baseSchema,
    GCP_PROJECT_ID: Joi.string().required(),
    LIVEKIT_URL: Joi.string().uri({ scheme: ['ws', 'wss'] }).required(),
    LIVEKIT_API_KEY: Joi.string().required(),
    LIVEKIT_API_SECRET: Joi.string().min(32).required(),
    DEEPGRAM_API_KEY: Joi.string().min(32).required(),
    JWT_SECRET: Joi.string().min(32).required(),
    BACKEND_URL: Joi.string().uri().required(),
    BACKEND_API_KEY: Joi.string().min(32).required(),
  }).unknown(true);

  // Production - same as staging
  const productionSchema = stagingSchema;

  const environment = getEnvironment();
  switch (environment) {
    case 'production':
      return productionSchema;
    case 'staging':
      return stagingSchema;
    case 'local':
    default:
      return localSchema;
  }
}

export function validateEnvironment(config: Record<string, any>): Record<string, any> {
  const schema = getValidationSchema();
  const result = schema.validate(config, {
    abortEarly: false,
    allowUnknown: true,
  });

  if (result.error) {
    const errors = result.error.details.map((d: Joi.ValidationErrorItem) => d.message).join(', ');
    throw new Error(`Environment validation failed: ${errors}`);
  }

  console.log(`✅ Environment validation passed for ${getEnvironment()}`);
  return result.value;
}
