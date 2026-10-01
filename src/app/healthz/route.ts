// Liveness probe for Docker and the gateway. Never calls the API.
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ status: 'ok' });
}
