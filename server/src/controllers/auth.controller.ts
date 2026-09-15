import type { Request, Response } from "express";
import { registerUser } from "../services/auth.service.js";
import { validated } from "../middlewares/validate.middleware.js";
import { registerSchema } from "../schemas/auth.schema.js";

export async function register(req: Request, res: Response) {
    const { body } = validated(registerSchema, req);
    const user = await registerUser(body);

    res.status(201).json({ user });
}
