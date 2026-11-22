import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it } from 'vitest';
import { ChannelWorkspace } from './ChannelWorkspace';
import { sidebarFixture, workspaceFixture } from '../workspaces/workspace-fixture';
import { MainCallProvider } from '../live/MainCallProvider';
import { CallControllerOwner } from '../live/runtime/callController';

function renderEmptyPage(nextCursor: string | null, channelId?: string, includeLive = false) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  const userId = workspaceFixture.ownerId;
  const expiresAt = '2099-01-01T00:00:00.000Z';
  client.setQueryData(['channels', userId, workspaceFixture.id, expiresAt, 'content'], {
    pages: [
      {
        items: includeLive
          ? sidebarFixture
              .filter(({ channel }) => channel.type === 'LIVE')
              .map(({ channel }) => channel)
          : [],
        nextCursor,
      },
    ],
    pageParams: [null],
  });
  try {
    return renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(
          MemoryRouter,
          {
            initialEntries: [
              channelId
                ? `/workspaces/${workspaceFixture.id}/channels/${channelId}/live`
                : `/workspaces/${workspaceFixture.id}`,
            ],
          },
          createElement(MainCallProvider, {
            owner: new CallControllerOwner(),
            children: createElement(
              Routes,
              null,
              createElement(Route, {
                path: '/workspaces/:workspaceId/channels/:channelId/live',
                element: createElement(ChannelWorkspace, {
                  workspace: { ...workspaceFixture, role: 'MEMBER' },
                  userId,
                  expiresAt,
                  account: null,
                  onAccessLost: () => {},
                }),
              }),
              createElement(Route, {
                path: '/workspaces/:workspaceId',
                element: createElement(ChannelWorkspace, {
                  workspace: { ...workspaceFixture, role: 'MEMBER' },
                  userId,
                  expiresAt,
                  account: null,
                  onAccessLost: () => {},
                }),
              }),
            ),
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
it('selects an authorized LIVE channel from a direct URL after a fresh render', () => {
  const channel = sidebarFixture.find(({ channel }) => channel.type === 'LIVE')!.channel;
  const markup = renderEmptyPage(null, channel.id, true);
  expect(markup).toContain('Vào phòng trực tiếp');
  expect(markup).toContain(channel.name);
  expect(markup).not.toContain('Chọn một kênh để bắt đầu');
});
it('does not expose an entry button for a URL absent from the authorized channel list', () => {
  const markup = renderEmptyPage(null, 'f'.repeat(24));
  expect(markup).toContain('Kênh không còn khả dụng');
  expect(markup).not.toContain('Vào phòng trực tiếp');
});
it('reports no accessible channels only once all pages are exhausted', () => {
  const markup = renderEmptyPage(null);
  expect(markup).toContain('Bạn chưa có kênh nào có thể truy cập.');
  expect(markup).not.toContain('Xem thêm kênh');
});
