import type { NextFunction, Request, Response } from 'express';
import type { ZodObject, output } from 'zod';

// Express 5 defines req.query as a getter with no setter, so the parsed result
// cannot be written back onto the request the way it could in Express 4.
// We stash it on req.validated instead; handlers read it through validated().
export function validate<T extends ZodObject>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Only hand the schema the request sections it actually declares, so a
    // schema never has to describe parts of the request it doesn't care about.
    const input: Record<string, unknown> = {};
    if ('body' in schema.shape) input.body = req.body;
    if ('query' in schema.shape) input.query = req.query;
    if ('params' in schema.shape) input.params = req.params;

    const result = schema.safeParse(input);
    if (!result.success) {
      // The central error handler turns a ZodError into a 400.
      next(result.error);
      return;
    }

    req.validated = result.data;
    next();
  };
}

// Reads back what validate() parsed. The schema argument only recovers the
// type - pass the same schema that was given to validate() on this route.
export function validated<T extends ZodObject>(_schema: T, req: Request): output<T> {
  return req.validated as output<T>;
}
