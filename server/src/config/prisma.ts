import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from './env.js';

// Create a PostgreSQL adapter and tell it how to connect to my database.
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

// PrismaClient is the main object you use in your application to communicate with your database.
export const prisma = new PrismaClient({ adapter });

export default prisma;
