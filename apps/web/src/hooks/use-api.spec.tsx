import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useApi } from './use-api';

function Probe() {
  const { data, error, loading } = useApi<{ value: string }>('/probe');
  if (loading) return <p>loading</p>;
  if (error) return <p>error: {error.message}</p>;
  return <p>{data?.value}</p>;
}

describe('useApi', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('ignores the request cancelled by React StrictMode', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      calls += 1;
      if (calls === 1) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        });
      }
      return Promise.resolve(new Response(JSON.stringify({ value: 'loaded' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    }));

    render(<StrictMode><Probe /></StrictMode>);

    expect(await screen.findByText('loaded')).toBeInTheDocument();
    expect(screen.queryByText(/error:/)).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
