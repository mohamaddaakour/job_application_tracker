import 'dotenv/config';

// It reads environment variables from .env, checks that required values exist,
// gives some values defaults, converts some values to the correct type,
// and exports everything through env.
function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  NODE_ENV: required('NODE_ENV', 'development'),
  PORT: Number(required('PORT', '4000')),
  CLIENT_URL: required('CLIENT_URL', 'http://localhost:5173'),
  DATABASE_URL: required('DATABASE_URL'),
  DATABASE_URL_TEST: process.env.DATABASE_URL_TEST,
  JWT_ACCESS_SECRET: required('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: required('JWT_REFRESH_SECRET'),
  ACCESS_TOKEN_EXPIRES_IN: required('ACCESS_TOKEN_EXPIRES_IN', '15m'),
  REFRESH_TOKEN_EXPIRES_IN: required('REFRESH_TOKEN_EXPIRES_IN', '7d'),
};