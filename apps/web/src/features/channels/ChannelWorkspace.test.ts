import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it } from 'vitest';
import { ChannelWorkspace } from './ChannelWorkspace';
import { workspaceFixture } from '../workspaces/workspace-fixture';

function renderEmptyPage(nextCursor: string | null) {
  const client = new QueryClient();
  const userId = workspaceFixture.ownerId;
  const expiresAt = '2099-01-01T00:00:00.000Z';
  client.setQueryData(['channels', userId, workspaceFixture.id, expiresAt, 'content'], {
    pages: [{ items: [], nextCursor }],
    pageParams: [null],
  });
  try {
    return renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(
          MemoryRouter,
          null,
          createElement(ChannelWorkspace, {
            workspace: { ...workspaceFixture, role: 'MEMBER' },
            userId,
            expiresAt,
            account: null,
            onAccessLost: () => {},
          }),
        ),
      ),
    );
  } finally {
    client.clear();
  }
}

it('offers continuation for an empty filtered page without claiming there are no accessible channels', () => {
  const markup = renderEmptyPage('opaque.cursor');
  expect(markup).toContain('Chưa có kênh có thể truy cập trong các trang đã tải.');
  expect(markup).toContain('Xem thêm kênh');
  expect(markup).not.toContain('Bạn chưa có kênh nào có thể truy cập.');
});
it('reports no accessible channels only once all pages are exhausted', () => {
  const markup = renderEmptyPage(null);
  expect(markup).toContain('Bạn chưa có kênh nào có thể truy cập.');
  expect(markup).not.toContain('Xem thêm kênh');
});
