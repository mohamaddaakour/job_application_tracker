import prisma from '../config/prisma.js';

export interface HealthReport {
  status: 'OK';
  timestamp: string;
  database: 'Connected';
  userCount: number;
}

export async function getHealthReport(): Promise<HealthReport> {
  const userCount = await prisma.user.count();

  return {
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: 'Connected',
    userCount,
  };
}
