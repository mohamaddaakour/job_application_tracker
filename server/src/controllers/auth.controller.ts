import type { Request, Response } from "express";
import { getCurrentUser, loginUser, registerUser } from "../services/auth.service.js";
import { validated } from "../middlewares/validate.middleware.js";
import { requireUser } from "../middlewares/auth.middleware.js";
import { loginSchema, registerSchema } from "../schemas/auth.schema.js";

export async function register(req: Request, res: Response) {
    const { body } = validated(registerSchema, req);
    const result = await registerUser(body);

    res.status(201).json(result);
}

export async function login(req: Request, res: Response) {
    const { body } = validated(loginSchema, req);
    const result = await loginUser(body);

    res.status(200).json(result);
}

export async function me(req: Request, res: Response) {
    const { id } = requireUser(req);

    const user = await getCurrentUser(id);

    res.status(200).json({ user });
}
