import bcrypt from "bcrypt";

const SALT_ROUND: number = 10;

// Hash a plain text string
export async function hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, SALT_ROUND);
}

// Compare a plain text password with the hashed password in the database
// to check if they are the same
export async function comparePassword(plain: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plain, hashedPassword);
}