import { verifyToken } from '../utils/auth.js';

export async function authMiddleware(request, reply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Missing Authorization header' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyToken(token);
    request.user = {
      userId: payload.userId,
      email:  payload.email,
      name:   payload.name
    };
  } catch {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
  }
}

export async function optionalAuthMiddleware(request, reply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    request.user = null;
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyToken(token);
    request.user = {
      userId: payload.userId,
      email:  payload.email,
      name:   payload.name
    };
  } catch {
    request.user = null;
  }
}
