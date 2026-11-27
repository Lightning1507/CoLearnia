import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  textMessageMaxCodePoints,
  textMessageSendBodySchema,
  type TextHistoryMessage,
} from '@colearnia/contracts';
import { mergeTextMessage, newTextIntent, type OutgoingText } from './text-intent';
import { createTextFixture, type FixtureSendMode, type TextPort } from './text-fixture';
import { useStore } from 'zustand';
import { createTextMemory, emptyConversation } from './text-memory';
import { workspaceInitials } from '../workspaces/workspace-appearance';
import './text-timeline.css';

const messageTime = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function TextTimeline({
  port,
  senderId,
  displayName,
  projection,
  visible = true,
  connected = true,
  channelName,
  memory,
  scope = 'fixture',
  onLoadOlder,
}: {
  port: TextPort;
  senderId: string;
  displayName: string;
  projection?: TextHistoryMessage[];
  visible?: boolean;
  connected?: boolean;
  channelName?: string | undefined;
  memory?: ReturnType<typeof createTextMemory>;
  scope?: string;
  onLoadOlder?: () => void;
}) {
  const [fallbackMemory] = useState(createTextMemory);
  const conversation = memory ?? fallbackMemory;
  const { draft, outbox } = useStore(
    conversation.store,
    (records) => records.get(scope) ?? emptyConversation,
  );
  const [messages, setMessages] = useState<TextHistoryMessage[]>([]);
  const [historyState, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const state = projection ? 'ready' : historyState;
  const displayed = projection ?? messages;
  const [reload, setReload] = useState(0);
  const [validation, setValidation] = useState('');
  const [draftNotice, setDraftNotice] = useState('');
  const draftLength = [...draft].length;
  const composerId = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const history = useRef<HTMLDivElement>(null);
  const followingLatest = useRef(true);
  const prepend = useRef<{ first: string; row: HTMLElement; offset: number } | undefined>(
    undefined,
  );
  const lifetime = useRef<AbortController | null>(null);
  const sending = useRef(new Set<string>());

  useLayoutEffect(() => {
    const panel = history.current;
    if (!visible || !panel?.clientHeight) return;
    const anchor = prepend.current;
    if (anchor && displayed[0]?.id !== anchor.first) {
      prepend.current = undefined;
      if (panel.contains(anchor.row)) {
        const offset =
          anchor.row.getBoundingClientRect().top -
          panel.getBoundingClientRect().top +
          panel.scrollTop;
        panel.scrollTop += offset - anchor.offset;
      }
    } else if (followingLatest.current) panel.scrollTop = panel.scrollHeight;
  }, [displayed, draft, outbox, visible]);

  // Resolve an outbox row when the committed event wins the race with its ACK.
  useEffect(() => {
    if (!projection) return;
    const committed = new Set(
      projection.filter((row) => row.senderId === senderId).map((row) => row.clientMessageId),
    );
    conversation.update(scope, (current) => {
      const pending = current.outbox.filter((row) => !committed.has(row.payload.clientMessageId));
      return pending.length === current.outbox.length ? current : { ...current, outbox: pending };
    });
  }, [conversation, projection, scope, senderId]);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (projection) return;
    const controller = new AbortController();
    port.history(controller.signal).then(
      (rows) => {
        if (!controller.signal.aborted) {
          setMessages(rows);
          setState('ready');
        }
      },
      () => {
        if (!controller.signal.aborted) setState('error');
      },
    );
    return () => {
      controller.abort();
    };
  }, [port, reload, projection]);

  async function send(intent: OutgoingText) {
    const signal = lifetime.current?.signal;
    const key = intent.payload.clientMessageId;
    if (!signal || signal.aborted || sending.current.has(key)) return;
    sending.current.add(key);
    function updateIntent(next: 'sending' | 'failed' | 'confirmed') {
      conversation.update(scope, (current) => {
        if (!current.outbox.some((row) => row.payload.clientMessageId === key)) return current;
        const outbox = current.outbox.flatMap((row) =>
          row.payload.clientMessageId !== key
            ? [row]
            : next === 'confirmed'
              ? []
              : [{ ...row, status: next }],
        );
        return { ...current, outbox };
      });
    }
    updateIntent('sending');
    const interrupted = () => updateIntent('failed');
    signal.addEventListener('abort', interrupted, { once: true });
    try {
      const message = await port.send(intent.payload, signal);
      if (signal.aborted) return;
      if (!projection) setMessages((rows) => mergeTextMessage(rows, message));
      updateIntent('confirmed');
    } catch {
      if (signal.aborted) return;
      updateIntent('failed');
    } finally {
      signal.removeEventListener('abort', interrupted);
      sending.current.delete(key);
    }
  }
  function setDraft(value: string) {
    conversation.update(scope, (current) => ({ ...current, draft: value }));
  }

  function submit() {
    if (!connected || state !== 'ready') return;
    const valid = textMessageSendBodySchema.safeParse({
      text: draft,
      clientMessageId: '00000000-0000-4000-8000-000000000001',
    });
    if (!valid.success) {
      setValidation('Nhập nội dung từ 1 đến 4.000 ký tự, gồm ít nhất một ký tự có nghĩa.');
      input.current?.focus();
      return;
    }
    const intent = newTextIntent(draft);
    conversation.update(scope, (current) => ({ draft: '', outbox: [...current.outbox, intent] }));
    setDraftNotice('');
    setValidation('');
    void send(intent);
  }

  return (
    <section className="text-chat" aria-label="Tin nhắn văn bản">
      <div
        className="text-chat-scroll"
        ref={history}
        aria-label="Vùng cuộn tin nhắn"
        role="region"
        tabIndex={0}
        aria-busy={state === 'loading'}
        onScroll={({ currentTarget }) => {
          if (currentTarget.clientHeight)
            followingLatest.current =
              currentTarget.scrollHeight - currentTarget.clientHeight - currentTarget.scrollTop <
              32;
        }}
      >
        {state === 'loading' && (
          <p role="status" className="text-chat-state">
            Đang tải tin nhắn…
          </p>
        )}
        {state === 'error' && (
          <div className="text-chat-state" role="alert">
            <p>Chưa tải được tin nhắn.</p>
            <button
              onClick={() => {
                setState('loading');
                setReload((value) => value + 1);
              }}
            >
              Thử tải lại
            </button>
          </div>
        )}
        {state === 'ready' && (
          <>
            {onLoadOlder && (
              <div className="text-history-control">
                <button
                  type="button"
                  onClick={() => {
                    const panel = history.current;
                    const first = displayed[0];
                    const row = panel?.querySelector<HTMLElement>('.text-message[id]');
                    followingLatest.current = false;
                    if (panel && first && row) {
                      // Capture the row's content offset, independent of where the reader scrolls.
                      prepend.current = {
                        first: first.id,
                        row,
                        offset:
                          row.getBoundingClientRect().top -
                          panel.getBoundingClientRect().top +
                          panel.scrollTop,
                      };
                    }
                    onLoadOlder();
                  }}
                >
                  Xem tin nhắn cũ
                </button>
              </div>
            )}
            {displayed.length === 0 && outbox.length === 0 && (
              <div className="text-chat-state">
                <h2>Bắt đầu cuộc trò chuyện</h2>
                <p>Gửi lời chào hoặc chia sẻ một câu hỏi với nhóm.</p>
              </div>
            )}
            <ol className="text-message-list" aria-label="Lịch sử tin nhắn">
              {displayed.map((message) => {
                const authorName =
                  message.senderDisplayName ??
                  (message.senderId === senderId
                    ? displayName
                    : projection
                      ? `Thành viên ${message.senderId.slice(-6)}`
                      : 'Linh · Fixture');
                return (
                  <li
                    key={message.id}
                    className="text-message"
                    id={visible ? `workspace-message-${message.id}` : undefined}
                    tabIndex={-1}
                  >
                    <span className="text-avatar" aria-hidden="true">
                      {workspaceInitials(authorName)}
                    </span>
                    <div>
                      <div className="text-message-meta">
                        <strong>{authorName}</strong>
                        <time dateTime={message.createdAt}>
                          {messageTime.format(new Date(message.createdAt))}
                        </time>
                      </div>
                      <p>{message.text}</p>
                    </div>
                  </li>
                );
              })}
              {outbox.map((intent) => (
                <li key={intent.payload.clientMessageId} className="text-message">
                  <span className="text-avatar" aria-hidden="true">
                    {workspaceInitials(displayName)}
                  </span>
                  <div>
                    <strong>{displayName}</strong>
                    <p>{intent.payload.text}</p>
                    <div className="text-send-state" role="status">
                      {intent.status === 'sending' ? (
                        'Đang gửi…'
                      ) : (
                        <>
                          <span>Chưa nhận được xác nhận gửi.</span>
                          <button disabled={!connected} onClick={() => void send(intent)}>
                            Thử gửi lại
                          </button>
                          <button
                            onClick={() => {
                              if (draft.length > 0) {
                                setDraftNotice(
                                  'Bạn đang có bản nháp. Hãy gửi hoặc xóa nháp trước khi soạn từ tin lỗi.',
                                );
                                input.current?.focus();
                                return;
                              }
                              setDraftNotice('');
                              setDraft(intent.payload.text);
                              setValidation('');
                              input.current?.focus();
                            }}
                          >
                            Soạn tin mới từ nội dung này
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
      <form
        className="text-composer"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="text-composer-row">
          <label className="sr-only" htmlFor={composerId}>
            Tin nhắn mới
          </label>
          <textarea
            ref={input}
            id={composerId}
            rows={1}
            value={draft}
            disabled={state !== 'ready' || !connected}
            aria-invalid={!!validation}
            aria-describedby={validation ? `${composerId}-validation` : `${composerId}-help`}
            placeholder={channelName ? `Nhắn vào #${channelName}…` : 'Viết tin nhắn cho nhóm…'}
            onChange={(event) => {
              const characters = [...event.target.value];
              setDraft(characters.slice(0, textMessageMaxCodePoints).join(''));
              setDraftNotice('');
              setValidation('');
            }}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                (event.ctrlKey || event.metaKey) &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <button
            type="submit"
            aria-label="Gửi tin nhắn"
            disabled={state !== 'ready' || !connected || !draft.trim()}
          >
            Gửi tin
          </button>
        </div>
        <div className="text-composer-help" id={`${composerId}-help`}>
          <small>
            Enter xuống dòng <span>· Ctrl / ⌘ + Enter gửi tin</span>
          </small>
          {draftLength > 0 && (
            <small>
              {draftLength.toLocaleString('vi-VN')} /{' '}
              {textMessageMaxCodePoints.toLocaleString('vi-VN')}
            </small>
          )}
        </div>
        {draftNotice && (
          <p className="text-draft-notice" role="status">
            {draftNotice}
          </p>
        )}
        {validation && (
          <p id={`${composerId}-validation`} className="text-composer-validation" role="alert">
            {validation}
          </p>
        )}
      </form>
    </section>
  );
}

export function TextFixturePanel({
  channelId,
  senderId,
  displayName,
}: {
  channelId: string;
  senderId: string;
  displayName: string;
}) {
  const [fixture] = useState(() => createTextFixture(channelId, senderId));
  const [view, setView] = useState<'messages' | 'empty' | 'error'>('messages');
  const [port, setPort] = useState(() => fixture.port('messages'));
  return (
    <div className="text-fixture-panel">
      <div className="text-fixture-controls">
        <span>Dữ liệu fixture · SCRUM-46</span>
        <label>
          Lịch sử{' '}
          <select
            value={view}
            onChange={(event) => {
              const next = event.target.value as typeof view;
              setView(next);
              setPort(fixture.port(next));
            }}
          >
            <option value="messages">Có tin nhắn</option>
            <option value="empty">Trống</option>
            <option value="error">Lỗi tải</option>
          </select>
        </label>
        <label>
          Lượt gửi mới{' '}
          <select onChange={(event) => fixture.setMode(event.target.value as FixtureSendMode)}>
            <option value="success">Thành công</option>
            <option value="failure">Lỗi lần đầu</option>
            <option value="lost-ack">Mất xác nhận</option>
          </select>
        </label>
      </div>
      <TextTimeline key={view} port={port} senderId={senderId} displayName={displayName} />
    </div>
  );
}
