import { Prisma } from "@prisma/client";
import { AppError } from "../utils/AppError.js";
import type { RegisterInput } from "../schemas/auth.schema.js";
import { hash } from "../utils/hash.js";
import prisma from "../config/prisma.js";

// This defines exactly which User fields are allowed to be returned.
// It's like a DTO
export const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

// This creates a TypeScript type representing the exact shape
// returned by Prisma when using that select.
export type PublicUser =
  Prisma.UserGetPayload<{
    select: typeof publicUserSelect
  }>;

export async function registerUser(input: RegisterInput): Promise<PublicUser> {
  // Hash the password
  const passwordHash = await hash(input.password);

  try {
    return await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
      },
      select: publicUserSelect,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw AppError.conflict('An account with this email already exists', 'EMAIL_TAKEN');
    }
    throw err;
  }
}