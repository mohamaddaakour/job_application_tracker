import type { NextFunction, Request, Response } from "express";

type AsyncHandleRouter = (
    req: Request,
    res: Response,
    next: NextFunction
) => Promise<unknown>;

export function asyncHandler(fn: AsyncHandleRouter) {
    return (req: Request, res: Response, next: NextFunction): void => {
        fn(req, res, next).catch(next);
    };
}