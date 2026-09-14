import type { NextFunction, Request, Response } from 'express';
import { ZodError, ZodObject } from 'zod';

export function validate<T extends ZodObject>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      }) as { body?: unknown; query?: Record<string, unknown>; params?: Record<string, unknown> };
      if (parsed.body) req.body = parsed.body;
      if (parsed.query) req.query = parsed.query as Request['query'];
      if (parsed.params) req.params = parsed.params as Request['params'];
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(err);
      }
      next(err);
    }
  };
}