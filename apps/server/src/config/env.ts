import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().default('http://localhost:5173'),
  API_URL: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().default('postgresql://siesta:siesta@localhost:5432/siesta'),
  SESSION_SECRET: z.string().min(1).default('dev-secret-change-in-production'),
  ENCRYPTION_KEY: z.string().length(64).default('0000000000000000000000000000000000000000000000000000000000000000'),
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  MCP_SERVER_URL: z.string(),
  MCP_CLIENT_ID: z.string(),
  MCP_CLIENT_SECRET: z.string(),
  MCP_AUTH_URL: z.string(),
  MCP_TOKEN_URL: z.string(),
  MCP_GATEWAY_API_KEY: z.string().optional(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  SUPPORT_MCP_URL: z.string().default('https://support-agent-tools.is.solo.io/mcp'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  OPENAI_MODEL: z.string().default('gpt-4o'),
});

export type Env = z.infer<typeof envSchema>;

let env: Env;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  console.error('Invalid environment variables:', error);
  process.exit(1);
}

// Guard against insecure defaults in production
if (env.NODE_ENV === 'production') {
  if (env.SESSION_SECRET === 'dev-secret-change-in-production') {
    console.error('FATAL: SESSION_SECRET must be set in production (do not use the default)');
    process.exit(1);
  }
  if (env.ENCRYPTION_KEY === '0000000000000000000000000000000000000000000000000000000000000000') {
    console.error('FATAL: ENCRYPTION_KEY must be set in production (do not use the default)');
    process.exit(1);
  }
}

export { env };
