import { ZodError } from 'zod';

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function zodMessage(error: ZodError): string {
  return error.issues[0]?.message || 'Invalid input.';
}
