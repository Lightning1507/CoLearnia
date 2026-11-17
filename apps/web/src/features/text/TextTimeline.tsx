import { useEffect, useRef, useState } from 'react';
import { textMessageSendBodySchema, type TextHistoryMessage } from '@colearnia/contracts';
import { mergeTextMessage, newTextIntent, type OutgoingText } from './text-intent';
import { createTextFixture, type FixtureSendMode, type TextPort } from './text-fixture';
import './text-timeline.css';

export function TextTimeline({
  port,
  senderId,
  displayName,
}: {
  port: TextPort;
  senderId: string;
  displayName: string;
}) {
  const [messages, setMessages] = useState<TextHistoryMessage[]>([]);
  const [outbox, setOutbox] = useState<OutgoingText[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reload, setReload] = useState(0);
  const [draft, setDraft] = useState('');
  const [validation, setValidation] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const lifetime = useRef<AbortController | null>(null);
  const sending = useRef(new Set<string>());

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
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
  }, [port, reload]);

  async function send(intent: OutgoingText) {
    const signal = lifetime.current?.signal;
    const key = intent.payload.clientMessageId;
    if (!signal || signal.aborted || sending.current.has(key)) return;
    sending.current.add(key);
    setOutbox((rows) =>
      rows.map((row) =>
        row.payload.clientMessageId === key ? { ...row, status: 'sending' } : row,
      ),
    );
    try {
      const message = await port.send(intent.payload, signal);
      if (signal.aborted) return;
      setMessages((rows) => mergeTextMessage(rows, message));
      setOutbox((rows) => rows.filter((row) => row.payload.clientMessageId !== key));
    } catch {
      if (signal.aborted) return;
      setOutbox((rows) =>
        rows.map((row) =>
          row.payload.clientMessageId === key ? { ...row, status: 'failed' } : row,
        ),
      );
    } finally {
      sending.current.delete(key);
    }
  }

  function submit() {
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
    setOutbox((rows) => [...rows, intent]);
    setDraft('');
    setValidation('');
    void send(intent);
  }

  return (
    <section className="text-chat" aria-label="Tin nhắn văn bản">
      <div className="text-chat-scroll" aria-busy={state === 'loading'}>
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
            {messages.length === 0 && outbox.length === 0 && (
              <div className="text-chat-state">
                <h2>Bắt đầu cuộc trò chuyện</h2>
                <p>Gửi lời chào hoặc chia sẻ một câu hỏi với nhóm.</p>
              </div>
            )}
            <ol className="text-message-list" aria-label="Lịch sử tin nhắn">
              {messages.map((message) => (
                <li key={message.id} className="text-message">
                  <span className="text-avatar" aria-hidden="true">
                    {message.senderId === senderId ? displayName.slice(0, 1) : 'L'}
                  </span>
                  <div>
                    <div className="text-message-meta">
                      <strong>
                        {message.senderId === senderId ? displayName : 'Linh · Fixture'}
                      </strong>
                      <time dateTime={message.createdAt}>
                        {new Date(message.createdAt).toLocaleTimeString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                    </div>
                    <p>{message.text}</p>
                  </div>
                </li>
              ))}
              {outbox.map((intent) => (
                <li key={intent.payload.clientMessageId} className="text-message">
                  <span className="text-avatar" aria-hidden="true">
                    {displayName.slice(0, 1)}
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
                          <button onClick={() => void send(intent)}>Thử gửi lại</button>
                          <button
                            onClick={() => {
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
        <label htmlFor="text-composer-input">Tin nhắn mới</label>
        <textarea
          ref={input}
          id="text-composer-input"
          rows={3}
          value={draft}
          disabled={state !== 'ready'}
          aria-invalid={!!validation}
          aria-describedby={validation ? 'text-validation' : 'text-composer-help'}
          placeholder="Viết tin nhắn cho nhóm…"
          onChange={(event) => {
            setDraft(event.target.value);
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
        {validation && (
          <p id="text-validation" role="alert">
            {validation}
          </p>
        )}
        <div className="text-composer-footer">
          <small id="text-composer-help">Ctrl / ⌘ + Enter để gửi · Enter xuống dòng</small>
          <button type="submit" disabled={state !== 'ready' || !draft.trim()}>
            Gửi tin nhắn
          </button>
        </div>
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
