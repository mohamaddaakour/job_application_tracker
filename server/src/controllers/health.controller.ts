import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getHealthReport } from '../services/health.service.js';

export const getHealth = asyncHandler(async (_req: Request, res: Response) => {
  const report = await getHealthReport();

  // Send an HTTP response with status code 200 OK
  // and a JSON message contain the value of "report" variable
  res.status(200).json(report);
});
