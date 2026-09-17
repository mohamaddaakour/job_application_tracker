import 'dotenv/config';

const SECRET_MIN_LEN = 32;

// It reads environment variables from .env, checks that required values exist,
// gives some values defaults, converts some values to the correct type,
// and exports everything through env.
function required(name: string, fallback?: string): string {
  const value: string | undefined = process.env[name] ?? fallback;

  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

// Check the length of the secret key
// It should be greater or equal 32 characters
function checkSecretLength(secret: string) {
  // Take the value of the secret key from the .env file
  const value: string = required(secret);

  if (value.length < SECRET_MIN_LEN)
    throw new Error(`${secret} must be at least 32 characters`)

  return value;
}

export const env = {
  NODE_ENV: required('NODE_ENV', 'development'),
  PORT: Number(required('PORT', '4000')),
  CLIENT_URL: required('CLIENT_URL', 'http://localhost:5173'),
  DATABASE_URL: required('DATABASE_URL'),
  DATABASE_URL_TEST: process.env.DATABASE_URL_TEST,
  JWT_ACCESS_SECRET: checkSecretLength('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: checkSecretLength('JWT_REFRESH_SECRET'),
  ACCESS_TOKEN_EXPIRES_IN: required('ACCESS_TOKEN_EXPIRES_IN', '15m'),
  REFRESH_TOKEN_EXPIRES_IN: required('REFRESH_TOKEN_EXPIRES_IN', '7d'),
};

if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
  throw new Error("The jwt access secret should different than jwt refresh secret")
}