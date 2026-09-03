import { useEffect, useState } from 'react';
import { apiGet } from '../api';

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!path) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true); setError(null);
    apiGet<T>(path, controller.signal).then((value) => {
      if (!controller.signal.aborted) {
        setData(value);
        setError(null);
      }
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted && (reason as Error).name !== 'AbortError') setError(reason as Error);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [path, nonce]);
  return { data, error, loading, retry: () => setNonce((value) => value + 1) };
}
