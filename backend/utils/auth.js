import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('Missing JWT_SECRET in environment variables');
}

const secret = new TextEncoder().encode(JWT_SECRET);
const JWT_TTL = '7d';
const BCRYPT_ROUNDS = 10;

// ─── JWT ──────────────────────────────────────────────────────────────────────

export async function signToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(JWT_TTL)
    .sign(secret);
}

export async function verifyToken(token) {
  const { payload } = await jwtVerify(token, secret);
  return payload;
}

// ─── Password ─────────────────────────────────────────────────────────────────

export async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function checkPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}
