import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { AuthBoundary } from './AuthBoundary';
import { AuthApiError } from './auth-api';
import { authApi, sessionKey, sessionOptions } from './session';

function render(client: QueryClient) {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(MemoryRouter, { initialEntries: ['/register'] }, createElement(AuthBoundary)),
    ),
  );
}

describe('auth boundary session refetch failures', () => {
  it('keeps the registration form available across anonymous → refetch error → anonymous', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, retryOnMount: false } },
    });
    const me = vi.spyOn(authApi, 'me').mockResolvedValue(null);
    try {
      await client.fetchQuery(sessionOptions);
      expect(render(client)).toContain('name="displayName"');
      me.mockRejectedValueOnce(new AuthApiError('DEPENDENCY_UNAVAILABLE', 'Fixture unavailable'));
      await expect(client.fetchQuery(sessionOptions)).rejects.toThrow('Fixture unavailable');
      expect(client.getQueryState(sessionKey)).toMatchObject({ data: null, status: 'error' });
      const failed = render(client);
      expect(failed).toContain('name="displayName"');
      expect(failed).toContain('name="confirmPassword"');
      expect(failed).toContain('Thử kiểm tra phiên lại');
      await client.fetchQuery(sessionOptions);
      const recovered = render(client);
      expect(recovered).toContain('name="displayName"');
      expect(recovered).not.toContain('Thử kiểm tra phiên lại');
    } finally {
      me.mockRestore();
      client.clear();
    }
  });
  it('shows the full retry state when the first session check has no result', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, retryOnMount: false } },
    });
    const me = vi.spyOn(authApi, 'me').mockRejectedValueOnce(new Error('Fixture offline'));
    try {
      await expect(client.fetchQuery(sessionOptions)).rejects.toThrow('Fixture offline');
      const failed = render(client);
      expect(failed).toContain('Chưa kiểm tra được phiên đăng nhập');
      expect(failed).not.toContain('name="displayName"');
    } finally {
      me.mockRestore();
      client.clear();
    }
  });
});
