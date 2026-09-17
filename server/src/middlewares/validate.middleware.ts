import type { NextFunction, Request, Response } from 'express';
import type { ZodObject, output } from 'zod';

// T must be a zod object
export function validate<T extends ZodObject>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const input: Record<string, unknown> = {};
  
    if ('body' in schema.shape) input.body = req.body;
    if ('query' in schema.shape) input.query = req.query;
    if ('params' in schema.shape) input.params = req.params;

    const result = schema.safeParse(input);
    
    if (!result.success) {
      next(result.error);
      return;
    }

    req.validated = result.data;
    next();
  };
}

export function validated<T extends ZodObject>(_schema: T, req: Request): output<T> {
  return req.validated as output<T>;
}
