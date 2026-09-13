const API_BASE = import.meta.env.VITE_API_BASE ?? "/api/v1";
let csrfToken = "";

export function setCsrfToken(value: string) {
  csrfToken = value;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly conflict?: {
      current: Record<string, unknown>;
      revision: number | Record<string, number>;
    },
  ) {
    super(message);
  }
}

export async function apiGet<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      signal,
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  } catch (reason) {
    // React StrictMode aborts the first effect request in development. Keep that
    // cancellation distinguishable from a real network failure.
    if (
      signal?.aborted ||
      (reason instanceof Error && reason.name === "AbortError")
    )
      throw reason;
    throw new ApiError(
      "تعذر الاتصال بالخدمة. تحقق من الشبكة أو أعد المحاولة.",
      0,
    );
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
      conflict?: {
        current: Record<string, unknown>;
        revision: number | Record<string, number>;
      };
    } | null;
    const message = Array.isArray(body?.message)
      ? body.message.join("، ")
      : body?.message;
    throw new ApiError(message ?? "تعذر تحميل البيانات.", response.status);
  }
  return response.json() as Promise<T>;
}

async function sendApiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const method = options.method ?? "POST";
  const form = options.body instanceof FormData;
  const requestBody: BodyInit | undefined =
    options.body === undefined
      ? undefined
      : form
        ? (options.body as FormData)
        : JSON.stringify(options.body);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      signal: options.signal,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(form ? {} : { "Content-Type": "application/json" }),
        ...(!["GET", "HEAD", "OPTIONS"].includes(method) && csrfToken
          ? { "x-csrf-token": csrfToken }
          : {}),
      },
      body: requestBody,
    });
  } catch (reason) {
    if (
      options.signal?.aborted ||
      (reason instanceof Error && reason.name === "AbortError")
    )
      throw reason;
    throw new ApiError(
      "تعذر الاتصال بالخدمة. تحقق من الشبكة أو أعد المحاولة.",
      0,
    );
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
      conflict?: {
        current: Record<string, unknown>;
        revision: number | Record<string, number>;
      };
    } | null;
    const message = Array.isArray(body?.message)
      ? body.message.join("، ")
      : typeof body?.message === "object"
        ? JSON.stringify(body.message)
        : body?.message;
    throw new ApiError(
      message ?? "تعذر تنفيذ الطلب.",
      response.status,
      body?.conflict,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

// Coalesce identical in-flight mutations, including repeat clicks before React rerenders.
// Entries live only until completion; request contents are never logged or persisted.
const pendingMutations = new Map<string, Promise<unknown>>();
export function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  if (options.body instanceof FormData || options.signal)
    return sendApiRequest<T>(path, options);
  const key = `${options.method ?? "POST"}:${path}:${JSON.stringify(options.body)}`;
  const existing = pendingMutations.get(key);
  if (existing) return existing as Promise<T>;
  const pending = sendApiRequest<T>(path, options).finally(() =>
    pendingMutations.delete(key),
  );
  pendingMutations.set(key, pending);
  return pending;
}
