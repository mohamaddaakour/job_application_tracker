import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { AppError } from "../utils/AppError.js";
import type { LoginInput, RegisterInput } from "../schemas/auth.schema.js";
import { comparePassword, hash } from "../utils/hash.js";
import { signAccessToken } from "../utils/jwt.js";
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

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
}

// A real bcrypt hash of a random value nobody knows. Login compares against it when
// the email does not exist, so "unknown email" takes as long as "wrong password".
const dummyPasswordHash = hash(randomBytes(32).toString("hex"));

// Return the user and create a token for it
function createSession(user: PublicUser): AuthResult {
  return {
    user,
    accessToken: signAccessToken({ id: user.id, email: user.email }),
  };
}

export async function registerUser(input: RegisterInput): Promise<AuthResult> {
  // Hash the password
  const passwordHash = await hash(input.password);

  try {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
      },
      select: publicUserSelect,
    });
  
    return createSession(user);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw AppError.conflict('An account with this email already exists', 'EMAIL_TAKEN');
    }
    throw err;
  }
}

export async function loginUser(input: LoginInput): Promise<AuthResult> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { ...publicUserSelect, passwordHash: true },
  });

  // bcrypt always runs, even for an unknown email (see dummyPasswordHash).
  const passwordMatches = await comparePassword(
    input.password,
    user?.passwordHash ?? (await dummyPasswordHash),
  );

  if (!user || !passwordMatches) {
    // One response for both cases, so login never reveals which emails have accounts.
    throw AppError.unauthorized("Invalid email or password", "INVALID_CREDENTIALS");
  }

  const { passwordHash: _passwordHash, ...publicUser } = user;

  return createSession(publicUser);
}

export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: publicUserSelect,
  });

  // A token can outlive its account; the database has the final say.
  if (!user) {
    throw AppError.unauthorized("User no longer exists", "USER_NOT_FOUND");
  }

  return user;
}
