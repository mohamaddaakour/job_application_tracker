import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";

export interface AccessTokenPayload {
    id: string;
    email: string;
}

export interface RefreshTokenPayload {
    id: string;
}

// The algorithm that will be used to create jwt
const ALGORITHM = "HS256";

// Used to sign (create) access token
export function signAccessToken(payload: AccessTokenPayload): string {
    return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
        algorithm: ALGORITHM,
        expiresIn: env.ACCESS_TOKEN_EXPIRES_IN as NonNullable<SignOptions['expiresIn']>
    });
}

// Used to sign (create) refresh token
export function signRefreshToken(payload: RefreshTokenPayload): string {
    return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
        algorithm: ALGORITHM,
        expiresIn: env.REFRESH_TOKEN_EXPIRES_IN as NonNullable<SignOptions['expiresIn']>
    })
}

// Will check the token if it is correct and not changed it will return
// the payload but if it is changed it will throw an error
export function verifyAccessToken(token: string): AccessTokenPayload {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
        algorithms: [ALGORITHM]
    });

    if (typeof decoded === "string" || typeof decoded.id !== "string" || typeof decoded.email !== "string") {
        throw new jwt.JsonWebTokenError("Invalid access token payload");
    }

    return { id: decoded.id, email: decoded.email };
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: [ALGORITHM] });

    if (typeof decoded === "string" || typeof decoded.id !== "string") {
        throw new jwt.JsonWebTokenError("Invalid refresh token payload");
    }

    return { id: decoded.id };
}

// return true if the token is expired
export function isTokenExpired(err: unknown): boolean {
    if (err instanceof jwt.TokenExpiredError)
        return true;
    return false;
}