import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError.js";
import { isTokenExpired, verifyAccessToken } from "../utils/jwt.js";

export type AuthUser = NonNullable<Request["user"]>;

const BEARER_PREFIX = "Bearer ";

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
    // Get the authorization part from the header
    // example: Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
    const header = req.headers.authorization;

    // If the header doesn't start with this prefix throw an AppError
    if (!header?.startsWith(BEARER_PREFIX)) {
        next(AppError.unauthorized("Missing authorization header", "NO_TOKEN"));
        return;
    }

    // Get the Access token
    const token = header.slice(BEARER_PREFIX.length, header.length).trim();

    let user: AuthUser;

    try {
        user = verifyAccessToken(token);
    } catch (err) {
        if (isTokenExpired(err)) {
            next(AppError.unauthorized("Access token expired", "TOKEN_EXPIRED"));
        } else {
            next(AppError.unauthorized("Invalid access token", "INVALID_TOKEN"));
        }

        return;
    }

    // We add the user to the request
    req.user = user;

    // Pass the request to the next middleware
    next();
}

// If the request doesn't contain a user will throw an error
export function requireUser(req: Request): AuthUser {
    if (!req.user) {
        throw AppError.unauthorized("Not authenticated", "NO_TOKEN");
    }

    return req.user;
}