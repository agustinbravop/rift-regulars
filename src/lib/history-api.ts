export class HistoryApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function requestHistory<T>(body: Record<string, unknown>, request: typeof fetch = fetch): Promise<T> {
  const response = await request('/api/history', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  let value;
  try { value = await response.json(); }
  catch {
    throw new HistoryApiError(response.status === 429
      ? 'Rift Regulars is busy. Please wait a moment and try again.'
      : 'Rift Regulars is temporarily unavailable. Please try again later.', response.status);
  }
  if (!response.ok) throw new HistoryApiError(
    response.status === 404 && body.action === 'account'
      ? 'Player not found. Check the player name and #TAG.'
      : value.error ?? 'Could not fetch history. Try again.',
    response.status
  );
  return value as T;
}
