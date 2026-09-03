const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';

export class ApiError extends Error { constructor(message: string, readonly status: number) { super(message); } }

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try { response = await fetch(`${API_BASE}${path}`, { signal, headers: { Accept: 'application/json' } }); }
  catch (reason) {
    // React StrictMode aborts the first effect request in development. Keep that
    // cancellation distinguishable from a real network failure.
    if (signal?.aborted || (reason instanceof Error && reason.name === 'AbortError')) throw reason;
    throw new ApiError('تعذر الاتصال بالخدمة. تحقق من الشبكة أو أعد المحاولة.', 0);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as {message?: string|string[]} | null;
    const message = Array.isArray(body?.message) ? body.message.join('، ') : body?.message;
    throw new ApiError(message ?? 'تعذر تحميل البيانات.', response.status);
  }
  return response.json() as Promise<T>;
}
