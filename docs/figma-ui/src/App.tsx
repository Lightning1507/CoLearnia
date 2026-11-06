import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Access,
  Attachment,
  Channel,
  ChannelKind,
  initialChannels,
  initialDmMessages,
  initialMessages,
  Member,
  members,
  Message,
  Role,
  currentUserId,
} from './mockData';

type IconName =
  | 'hash'
  | 'chevron-down'
  | 'chevron-right'
  | 'plus'
  | 'lock'
  | 'phone'
  | 'message'
  | 'info'
  | 'users'
  | 'close'
  | 'paperclip'
  | 'image'
  | 'send'
  | 'file'
  | 'more'
  | 'reply'
  | 'settings'
  | 'check'
  | 'retry'
  | 'mic'
  | 'video'
  | 'headphones'
  | 'screen'
  | 'volume'
  | 'pen'
  | 'cursor'
  | 'undo'
  | 'trash'
  | 'arrow-left'
  | 'wifi';

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    hash: (
      <>
        <path d="M5 9h14M4 15h14M10 3 8 21M16 3l-2 18" />
      </>
    ),
    'chevron-down': <path d="m7 10 5 5 5-5" />,
    'chevron-right': <path d="m9 18 6-6-6-6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    lock: (
      <>
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    phone: (
      <>
        <path d="M15 7a5 5 0 0 1 5 5M15 3a9 9 0 0 1 9 9" />
        <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7A2 2 0 0 1 22 16.9Z" />
      </>
    ),
    message: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
      </>
    ),
    close: <path d="m18 6-12 12M6 6l12 12" />,
    paperclip: (
      <path d="m21.4 11.6-8.5 8.5a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 1 1-2.8-2.8l8.5-8.5" />
    ),
    image: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5L5 21" />
      </>
    ),
    send: (
      <>
        <path d="m22 2-7 20-4-9-9-4Z" />
        <path d="M22 2 11 13" />
      </>
    ),
    file: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6M8 13h8M8 17h6" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1" fill="currentColor" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
        <circle cx="19" cy="12" r="1" fill="currentColor" />
      </>
    ),
    reply: <path d="m9 17-5-5 5-5M4 12h10a6 6 0 0 1 6 6v1" />,
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    retry: <path d="M20 6v5h-5M4 18v-5h5M18.5 9a7 7 0 0 0-12-2M5.5 15a7 7 0 0 0 12 2" />,
    mic: (
      <>
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10a7 7 0 0 0 14 0M12 17v5" />
      </>
    ),
    video: (
      <>
        <rect x="3" y="6" width="13" height="12" rx="2" />
        <path d="m16 10 5-3v10l-5-3" />
      </>
    ),
    headphones: (
      <>
        <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
        <path d="M18 19c0 1.7-1.3 3-3 3h-3M4 14h3v6H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 1-2ZM20 14h-3v6h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-1-2Z" />
      </>
    ),
    screen: (
      <>
        <rect x="2.5" y="4" width="19" height="14" rx="2" />
        <path d="M8 22h8M12 18v4M12 14V8M9 11l3-3 3 3" />
      </>
    ),
    volume: (
      <>
        <path d="M11 5 6 9H2v6h4l5 4Z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" />
      </>
    ),
    pen: (
      <>
        <path d="m12 20 9-9-4-4-9 9-1 5Z" />
        <path d="m14 9 4 4M7 21H3" />
      </>
    ),
    cursor: <path d="m4 3 7.5 18 2.5-7 7-2.5Z" />,
    undo: (
      <>
        <path d="M9 7 4 12l5 5" />
        <path d="M4 12h10a6 6 0 0 1 6 6" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v5M14 11v5" />
      </>
    ),
    'arrow-left': <path d="m15 18-6-6 6-6" />,
    wifi: (
      <>
        <path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" />
        <circle cx="12" cy="20" r="1" fill="currentColor" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function Button({
  children,
  variant = 'secondary',
  icon,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
}) {
  return (
    <button className={`btn btn-${variant} ${className}`} {...props}>
      {icon && <Icon name={icon} size={17} />}
      {children}
    </button>
  );
}

function IconButton({
  label,
  icon,
  active,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: IconName;
  active?: boolean;
}) {
  return (
    <button
      className={`icon-btn ${active ? 'icon-btn-active' : ''}`}
      title={label}
      aria-label={label}
      {...props}
    >
      <Icon name={icon} />
    </button>
  );
}

function Avatar({
  member,
  size = 'md',
  imageUrl,
}: {
  member: Member;
  size?: 'sm' | 'md' | 'lg';
  imageUrl?: string | null;
}) {
  return (
    <div className={`avatar avatar-${size} ${member.color}`} aria-hidden="true">
      {imageUrl ? <img src={imageUrl} alt="" /> : member.initials}
    </div>
  );
}

function getMember(id: string) {
  return members.find((member) => member.id === id) ?? members[0];
}

const roleLabels: Record<Role, string> = {
  MEMBER: 'Thành viên',
  ADMIN: 'Quản trị viên',
  OWNER: 'Chủ Workspace',
};

function DemoTools({ children }: { children: ReactNode }) {
  return (
    <details
      style={{
        position: 'relative',
        marginLeft: 'auto',
        flexShrink: 0,
        zIndex: 70,
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          padding: '7px 12px',
          border: '1px solid #c7d9d2',
          borderRadius: 8,
          background: '#f5faf8',
          color: '#244c3e',
          fontWeight: 600,
        }}
      >
        Tình huống demo
      </summary>
      <div
        className="scenario-tools"
        style={{
          position: 'absolute',
          right: 0,
          top: 'calc(100% + 8px)',
          width: 'min(720px, 88vw)',
          maxHeight: '60vh',
          overflow: 'auto',
          padding: 16,
          background: '#fff',
          color: '#244c3e',
          border: '1px solid #c7d9d2',
          borderRadius: 12,
          boxShadow: '0 12px 28px #183b2926',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 12,
        }}
      >
        {children}
      </div>
    </details>
  );
}

function SidebarSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="sidebar-section">
      <div className="sidebar-section-title">
        <span>
          <Icon name="chevron-down" size={14} />
          {title}
        </span>
        {action}
      </div>
      <div className="sidebar-items">{children}</div>
    </section>
  );
}

function SidebarItem({
  active,
  icon,
  label,
  detail,
  onClick,
}: {
  active: boolean;
  icon?: IconName;
  label: string;
  detail?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className={`sidebar-item ${active ? 'sidebar-item-active' : ''}`} onClick={onClick}>
      <span className="sidebar-item-main">
        {icon && <Icon name={icon} size={17} />}
        <span className="truncate">{label}</span>
      </span>
      {detail}
    </button>
  );
}

function AttachmentView({ attachment }: { attachment: Attachment }) {
  const [expanded, setExpanded] = useState(false);
  if (attachment.type === 'image') {
    const imageContent = attachment.previewUrl ? (
      <img src={attachment.previewUrl} alt={`Ảnh đính kèm ${attachment.name}`} />
    ) : (
      <div className="diagram-canvas" role="img" aria-label="Sơ đồ luồng hệ thống minh họa">
        <div className="flow-node flow-start">Đăng nhập</div>
        <div className="flow-line" />
        <div className="flow-node">Xác thực</div>
        <div className="flow-line" />
        <div className="flow-node flow-end">Tổng quan</div>
      </div>
    );
    return (
      <>
        <div className="diagram-attachment">
          <button
            className="image-preview-button"
            onClick={() => setExpanded(true)}
            aria-label={`Mở ảnh ${attachment.name}`}
          >
            {imageContent}
          </button>
          <div className="attachment-caption">
            <Icon name="image" size={16} />
            <span>{attachment.name}</span>
            <span className="muted">{attachment.size}</span>
          </div>
        </div>
        {expanded && (
          <div
            className="image-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={`Xem ảnh ${attachment.name}`}
            onMouseDown={(event) => event.target === event.currentTarget && setExpanded(false)}
          >
            <IconButton label="Đóng ảnh" icon="close" onClick={() => setExpanded(false)} />
            <div className="lightbox-content">{imageContent}</div>
            <p>{attachment.name}</p>
          </div>
        )}
      </>
    );
  }
  return (
    <>
      <button
        className="file-attachment"
        onClick={() => setExpanded(true)}
        aria-label={`Xem tệp ${attachment.name}`}
      >
        <span className="file-icon">
          <Icon name="file" size={20} />
        </span>
        <span>
          <strong>{attachment.name}</strong>
          <small>Tệp đính kèm · {attachment.size}</small>
        </span>
      </button>
      {expanded && (
        <Dialog
          title={attachment.name}
          description="Thông tin tệp đính kèm"
          onClose={() => setExpanded(false)}
          footer={
            <>
              <Button onClick={() => setExpanded(false)}>Đóng</Button>
              {attachment.previewUrl && (
                <a
                  className="btn btn-primary"
                  href={attachment.previewUrl}
                  download={attachment.name}
                >
                  Tải tệp
                </a>
              )}
            </>
          }
        >
          <p>{attachment.size}</p>
          <p>
            {attachment.previewUrl
              ? 'Tệp bạn vừa chọn chỉ nằm trong phiên mô phỏng này.'
              : 'Đây là thẻ tệp mẫu. Chưa có tệp thật để tải; bạn có thể thử bằng một tệp kiểm tra tự chọn.'}
          </p>
        </Dialog>
      )}
    </>
  );
}

function MessageRow({
  message,
  onOpenThread,
  onRetry,
  compact = false,
}: {
  message: Message;
  onOpenThread?: () => void;
  onRetry?: () => void;
  compact?: boolean;
}) {
  const author = getMember(message.authorId);
  return (
    <article className={`message-row ${message.status === 'error' ? 'message-error' : ''}`}>
      <Avatar member={author} size={compact ? 'sm' : 'md'} />
      <div className="message-body">
        <div className="message-meta">
          <strong>{author.name}</strong>
          <time>{message.time}</time>
          {message.status === 'sending' && <span className="sending-dot">Đang gửi…</span>}
        </div>
        {message.text && <p>{message.text}</p>}
        {message.attachment && <AttachmentView attachment={message.attachment} />}
        {message.replies && message.replies.length > 0 && onOpenThread && (
          <button className="thread-link" onClick={onOpenThread}>
            <span className="reply-avatars">
              {message.replies.slice(0, 2).map((reply) => (
                <Avatar key={reply.id} member={getMember(reply.authorId)} size="sm" />
              ))}
            </span>
            <strong>{message.replies.length} trả lời</strong>
            <span>Trả lời gần nhất {message.replies.at(-1)?.time}</span>
            <Icon name="chevron-right" size={15} />
          </button>
        )}
        {message.status === 'error' && (
          <div className="error-state">
            <span>Không thể gửi tin nhắn.</span>
            <button onClick={onRetry}>
              <Icon name="retry" size={14} /> Thử lại
            </button>
          </div>
        )}
      </div>
      <div className="message-actions">
        {onOpenThread && (
          <IconButton label="Trả lời trong luồng" icon="reply" onClick={onOpenThread} />
        )}
        <IconButton label="Thao tác khác" icon="more" />
      </div>
    </article>
  );
}

function Composer({
  label,
  onSend,
}: {
  label: string;
  onSend: (text: string, attachment?: Attachment) => void;
}) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<Attachment | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
    const isImage = selected.type.startsWith('image/');
    setFile({
      id: `local-${Date.now()}`,
      name: selected.name,
      type: isImage ? 'image' : 'file',
      size: `${Math.max(1, Math.round(selected.size / 1024))} KB`,
      previewUrl: URL.createObjectURL(selected),
    });
  };
  const removeFile = () => {
    if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
    setFile(null);
    if (fileInput.current) fileInput.current.value = '';
  };
  const resizeTextarea = () => {
    if (!textarea.current) return;
    textarea.current.style.height = 'auto';
    textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 144)}px`;
  };
  useEffect(resizeTextarea, [text]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim() && !file) return;
    onSend(text.trim(), file ?? undefined);
    setText('');
    setFile(null);
    if (fileInput.current) fileInput.current.value = '';
  };
  return (
    <form className="composer" onSubmit={submit}>
      {file && (
        <div className="composer-preview">
          {file.previewUrl ? (
            <img src={file.previewUrl} alt="" />
          ) : (
            <span className="preview-icon">
              <Icon name={file.type === 'image' ? 'image' : 'file'} />
            </span>
          )}
          <span>
            <strong>{file.name}</strong>
            <small>
              {file.type === 'image' ? 'Ảnh xem trước' : 'Tệp đính kèm'} · {file.size}
            </small>
          </span>
          <IconButton label="Bỏ tệp" icon="close" type="button" onClick={removeFile} />
        </div>
      )}
      <textarea
        ref={textarea}
        aria-label={label}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={label}
        rows={1}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <div className="composer-toolbar">
        <div>
          <input
            ref={fileInput}
            className="sr-only"
            type="file"
            accept="image/*,.pdf,.doc,.docx"
            onChange={chooseFile}
          />
          <IconButton
            type="button"
            label="Đính kèm tệp hoặc ảnh"
            icon="paperclip"
            onClick={() => fileInput.current?.click()}
          />
          <span className="composer-hint">Enter để gửi · Shift + Enter để xuống dòng</span>
        </div>
        <button className="send-btn" aria-label="Gửi tin nhắn" disabled={!text.trim() && !file}>
          <Icon name="send" size={17} />
        </button>
      </div>
    </form>
  );
}

function EmptyConversation({ isDm, name }: { isDm: boolean; name: string }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon name={isDm ? 'message' : 'hash'} size={24} />
      </div>
      <h2>{isDm ? `Bắt đầu trò chuyện với ${name}` : `Chào mừng đến #${name}`}</h2>
      <p>
        {isDm
          ? 'Gửi một tin nhắn để bắt đầu cuộc trò chuyện riêng.'
          : 'Đây là khởi đầu của kênh này. Hãy chia sẻ cập nhật hoặc đặt câu hỏi đầu tiên.'}
      </p>
    </div>
  );
}

function Dialog({
  title,
  description,
  onClose,
  children,
  footer,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <header>
          <div>
            <h2 id="dialog-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <IconButton label="Đóng" icon="close" onClick={onClose} />
        </header>
        <div className="dialog-content">{children}</div>
        <footer>{footer}</footer>
      </div>
    </div>
  );
}

function CreateChannelDialog({
  onClose,
  onCreate,
  availableMembers,
}: {
  onClose: () => void;
  onCreate: (channel: Channel) => void;
  availableMembers: Member[];
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ChannelKind>('TEXT');
  const [access, setAccess] = useState<Access>('WORKSPACE');
  const [selected, setSelected] = useState<string[]>([currentUserId]);
  const submit = () => {
    if (!name.trim()) return;
    onCreate({
      id: `channel-${Date.now()}`,
      name: name.trim(),
      kind,
      access,
      memberIds: access === 'PRIVATE' ? selected : undefined,
      description: kind === 'LIVE' ? 'Phòng trao đổi trực tiếp' : 'Kênh mới của Workspace',
    });
  };
  return (
    <Dialog
      title="Tạo kênh mới"
      description="Thiết lập không gian trao đổi cho nhóm."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim()}>
            Tạo kênh
          </Button>
        </>
      }
    >
      <label className="field">
        <span>Tên kênh</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ví dụ: nghiên-cứu"
          autoFocus
        />
      </label>
      <fieldset className="field">
        <legend>Loại kênh</legend>
        <div className="choice-grid">
          <button
            className={kind === 'TEXT' ? 'choice active' : 'choice'}
            onClick={() => setKind('TEXT')}
          >
            <Icon name="hash" />
            <span>
              <strong>TEXT</strong>
              <small>Trao đổi bằng tin nhắn và tệp</small>
            </span>
            {kind === 'TEXT' && <Icon name="check" />}
          </button>
          <button
            className={kind === 'LIVE' ? 'choice active' : 'choice'}
            onClick={() => setKind('LIVE')}
          >
            <Icon name="phone" />
            <span>
              <strong>LIVE</strong>
              <small>Không gian gọi trực tiếp</small>
            </span>
            {kind === 'LIVE' && <Icon name="check" />}
          </button>
        </div>
      </fieldset>
      <fieldset className="field">
        <legend>Quyền truy cập</legend>
        <div className="segmented">
          <button
            className={access === 'WORKSPACE' ? 'active' : ''}
            onClick={() => setAccess('WORKSPACE')}
          >
            Toàn Workspace
          </button>
          <button
            className={access === 'PRIVATE' ? 'active' : ''}
            onClick={() => setAccess('PRIVATE')}
          >
            <Icon name="lock" size={14} /> PRIVATE
          </button>
        </div>
      </fieldset>
      {access === 'PRIVATE' && (
        <div className="field">
          <span>Thành viên có quyền truy cập</span>
          <div className="member-picker">
            {availableMembers.map((member) => (
              <label key={member.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(member.id)}
                  onChange={() =>
                    setSelected((list) =>
                      list.includes(member.id)
                        ? list.filter((id) => id !== member.id)
                        : [...list, member.id],
                    )
                  }
                />
                <Avatar member={member} size="sm" />
                <span>
                  {member.name}
                  {member.id === currentUserId && <small>Bạn</small>}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </Dialog>
  );
}

function ManagePrivateDialog({
  channels,
  onClose,
  onUpdate,
  availableMembers,
}: {
  channels: Channel[];
  onClose: () => void;
  onUpdate: (id: string, memberIds: string[]) => void;
  availableMembers: Member[];
}) {
  const privateChannels = channels.filter((channel) => channel.access === 'PRIVATE');
  const [activeId, setActiveId] = useState(privateChannels[0]?.id);
  const channel = privateChannels.find((item) => item.id === activeId);
  return (
    <Dialog
      title="Quản lý kênh PRIVATE"
      description="Quản lý quyền thành viên, không hiển thị nội dung trò chuyện."
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Xong
        </Button>
      }
    >
      <div className="privacy-note">
        <Icon name="lock" />
        <span>
          <strong>Quyền quản lý không cấp quyền đọc.</strong>Nội dung kênh vẫn chỉ hiển thị với
          thành viên được thêm.
        </span>
      </div>
      <div className="manage-layout">
        <div className="private-list">
          {privateChannels.map((item) => (
            <button
              key={item.id}
              className={item.id === activeId ? 'active' : ''}
              onClick={() => setActiveId(item.id)}
            >
              <Icon name="lock" size={15} />
              {item.name}
              <span>{item.memberIds?.length ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="manage-members">
          <h3>Thành viên · {channel?.memberIds?.length ?? 0}</h3>
          {!channel && <p>Chưa có kênh riêng để quản lý. Tạo kênh PRIVATE trước.</p>}
          {availableMembers.map((member) => {
            const included = channel?.memberIds?.includes(member.id) ?? false;
            return (
              <div key={member.id}>
                <Avatar member={member} size="sm" />
                <span>
                  <strong>{member.name}</strong>
                  <small>{member.title}</small>
                </span>
                <Button
                  disabled={!channel}
                  variant={included ? 'secondary' : 'primary'}
                  onClick={() =>
                    channel &&
                    onUpdate(
                      channel.id,
                      included
                        ? (channel.memberIds ?? []).filter((id) => id !== member.id)
                        : [...(channel.memberIds ?? []), member.id],
                    )
                  }
                >
                  {included ? 'Gỡ' : 'Thêm'}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}

function LiveRoom({
  channel,
  onJoin,
  onRecordings,
  participants,
}: {
  channel: Channel;
  onJoin: () => void;
  onRecordings: () => void;
  participants: Member[];
}) {
  const attendees = participants.filter((p) => p.id !== currentUserId).slice(0, 4);
  return (
    <main className="live-content">
      <div className="live-room-card">
        <div className="live-symbol">
          <Icon name="headphones" size={30} />
        </div>
        <span className="eyebrow">PHÒNG LIVE</span>
        <h1>{channel.name}</h1>
        <p>Tham gia bài giảng, trao đổi trực tiếp và làm việc cùng các nhóm trong phiên học.</p>
        <div className="attendees">
          <div className="avatar-stack">
            {attendees.map((member) => (
              <Avatar key={member.id} member={member} size="md" />
            ))}
          </div>
          <span>
            <strong>{attendees.length} người đang tham gia</strong>
            {attendees.map((member) => member.name.split(' ').at(-1)).join(', ')}
          </span>
        </div>
        <Button variant="primary" icon="phone" className="join-button" onClick={onJoin}>
          Vào phòng
        </Button>
        <Button icon="video" onClick={onRecordings}>
          Bản ghi của kênh
        </Button>
        <div className="device-hint">
          <span>
            <Icon name="mic" size={15} /> Mic sẽ được kiểm tra trước khi vào
          </span>
          <span>
            <Icon name="video" size={15} /> Camera tắt mặc định
          </span>
        </div>
      </div>
    </main>
  );
}

type RecordingStatus = 'STARTING' | 'RECORDING' | 'STOPPING' | 'PROCESSING' | 'READY' | 'FAILED';
type RecordingEntry = {
  id: string;
  workspaceId: string;
  channelId: string;
  sessionId: string;
  title: string;
  status: RecordingStatus;
  elapsed: number;
  createdLabel: string;
  error?: string;
};
const recordingLabels: Record<RecordingStatus, string> = {
  STARTING: 'Đang khởi động ghi hình',
  RECORDING: 'Đang ghi Phòng chung',
  STOPPING: 'Đang dừng ghi',
  PROCESSING: 'Đang xử lý video',
  READY: 'Video đã sẵn sàng',
  FAILED: 'Chưa có video sẵn sàng',
};
function recordingTime(seconds: number) {
  const t = Math.max(0, Math.floor(seconds));
  return `${Math.floor(t / 3600)
    .toString()
    .padStart(2, '0')}:${Math.floor((t % 3600) / 60)
    .toString()
    .padStart(2, '0')}:${(t % 60).toString().padStart(2, '0')}`;
}
function RecordingLibrary({
  records,
  channelName,
  onClose,
  onDemoRevoke,
}: {
  records: RecordingEntry[];
  channelName: string;
  onClose: () => void;
  onDemoRevoke: () => void;
}) {
  const [selected, setSelected] = useState<RecordingEntry | null>(null);
  const [session, setSession] = useState('all');
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  useEffect(() => {
    if (!playing || !selected) return;
    const timer = window.setInterval(
      () => setPosition((p) => Math.min(selected.elapsed, p + 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [playing, selected]);
  useEffect(() => {
    if (selected && position >= selected.elapsed) setPlaying(false);
  }, [position, selected]);
  const ready = records.filter((r) => r.status === 'READY');
  const sessions = Array.from(new Set(ready.map((r) => r.sessionId)));
  const rows = ready.filter((r) => session === 'all' || r.sessionId === session);
  return (
    <Dialog
      title={selected ? selected.title : `Bản ghi · ${channelName}`}
      description="Chỉ thành viên còn quyền kênh xem được bản ghi. Video sẵn sàng được giữ không có hạn tự xóa."
      onClose={onClose}
      footer={
        <>
          {selected && (
            <Button
              onClick={() => {
                setSelected(null);
                setPlaying(false);
                setPosition(0);
              }}
            >
              Về danh sách bản ghi
            </Button>
          )}
          <Button onClick={onClose}>Đóng</Button>
        </>
      }
    >
      <div className="prototype-bar">
        <span>Tình huống demo · chỉ phục vụ kiểm quyền</span>
        <Button variant="ghost" onClick={onDemoRevoke}>
          Mô phỏng mất quyền kênh
        </Button>
      </div>
      <div className="privacy-note">
        <Icon name="info" />
        <span>
          Trình phát minh họa tương tác; không có video hoặc âm thanh thật. Chỉ nội dung Phòng
          chung, không có nhóm riêng.
        </span>
      </div>
      {selected ? (
        <>
          <div
            style={{
              background: '#182522',
              color: 'white',
              padding: 28,
              borderRadius: 12,
              textAlign: 'center',
            }}
          >
            <small>PHÒNG CHUNG · BẢN GHI MINH HỌA</small>
            <h3>Nội dung buổi học</h3>
            <p>Màn hình chia sẻ và các camera của Phòng chung</p>
            <strong>
              {recordingTime(position)} / {recordingTime(selected.elapsed)}
            </strong>
          </div>
          <div className="field">
            <input
              aria-label="Vị trí phát video"
              type="range"
              min="0"
              max={Math.max(1, selected.elapsed)}
              value={position}
              onChange={(e) => setPosition(Number(e.target.value))}
            />
          </div>
          <Button
            variant="primary"
            onClick={() => {
              if (position >= selected.elapsed) setPosition(0);
              setPlaying((p) => !p);
            }}
          >
            {playing ? 'Tạm dừng video' : 'Phát video'}
          </Button>
        </>
      ) : (
        <>
          <label className="field">
            <span>Lọc theo phiên học</span>
            <select value={session} onChange={(e) => setSession(e.target.value)}>
              <option value="all">Tất cả phiên trong kênh</option>
              {sessions.map((sid, i) => (
                <option key={sid} value={sid}>
                  Phiên học {i + 1}
                </option>
              ))}
            </select>
          </label>
          {rows.length ? (
            <div className="manage-members">
              {rows.map((r) => (
                <div key={r.id}>
                  <Icon name="video" />
                  <span>
                    <strong>{r.title}</strong>
                    <small>
                      {r.createdLabel} · {recordingTime(r.elapsed)}
                    </small>
                  </span>
                  <Button
                    onClick={() => {
                      setSelected(r);
                      setPosition(0);
                      setPlaying(false);
                    }}
                  >
                    Xem video
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h3>Chưa có video sẵn sàng</h3>
              <p>Bản ghi chỉ xuất hiện ở đây sau khi xử lý xong.</p>
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}

type MeetingRole = 'MEMBER' | 'HOST';
type ShareState = 'none' | 'other' | 'self';
type ConnectionState = 'live' | 'reconnecting' | 'ended';

function DeviceCheck({
  onBack,
  onJoin,
  channelName,
  initialDevices = { mic: true, camera: false },
}: {
  channelName: string;
  initialDevices?: { mic: boolean; camera: boolean };
  onBack: () => void;
  onJoin: (role: MeetingRole, devices: { mic: boolean; camera: boolean }) => void;
}) {
  const [mic, setMic] = useState(initialDevices.mic);
  const [camera, setCamera] = useState(initialDevices.camera);
  const [permission, setPermission] = useState<'allowed' | 'denied'>('allowed');
  const [role, setRole] = useState<MeetingRole>('MEMBER');
  useEffect(() => {
    if (permission === 'denied') {
      setMic(false);
      setCamera(false);
    }
  }, [permission]);
  return (
    <div className="meeting-screen">
      <div className="meeting-demo-bar">
        <span>
          <span className="prototype-dot" />
          Tình huống demo · thiết bị mô phỏng
        </span>
        <div>
          <label>
            Vai trò phiên
            <select value={role} onChange={(event) => setRole(event.target.value as MeetingRole)}>
              <option value="MEMBER">Thành viên</option>
              <option value="HOST">Host</option>
            </select>
          </label>
          <label>
            Quyền thiết bị
            <select
              value={permission}
              onChange={(event) => setPermission(event.target.value as 'allowed' | 'denied')}
            >
              <option value="allowed">Đã cấp quyền</option>
              <option value="denied">Không cấp quyền</option>
            </select>
          </label>
        </div>
      </div>
      <header className="prejoin-header">
        <Button variant="ghost" icon="arrow-left" onClick={onBack}>
          Quay lại Phòng học
        </Button>
        <strong>CoLearnia</strong>
      </header>
      <main className="prejoin-main">
        <section className={`device-preview ${!camera ? 'camera-off' : ''}`}>
          {camera ? (
            <div className="preview-person">
              <Avatar member={getMember(currentUserId)} size="lg" />
              <span>Preview camera mô phỏng</span>
            </div>
          ) : (
            <div className="camera-placeholder">
              <Avatar member={getMember(currentUserId)} size="lg" />
              <strong>Camera đang tắt</strong>
            </div>
          )}
          <div className="preview-controls">
            <button
              className={mic ? '' : 'off'}
              onClick={() => permission === 'allowed' && setMic(!mic)}
              aria-label={mic ? 'Tắt mic' : 'Bật mic'}
              title={mic ? 'Tắt mic' : 'Bật mic'}
            >
              <Icon name="mic" />
            </button>
            <button
              className={camera ? '' : 'off'}
              onClick={() => permission === 'allowed' && setCamera(!camera)}
              aria-label={camera ? 'Tắt camera' : 'Bật camera'}
              title={camera ? 'Tắt camera' : 'Bật camera'}
            >
              <Icon name="video" />
            </button>
          </div>
        </section>
        <section className="device-settings">
          <span className="eyebrow">{channelName}</span>
          <h1>Sẵn sàng tham gia?</h1>
          <p>
            Kiểm tra thiết bị trước khi vào phòng. Prototype này không truy cập camera hoặc micro
            thật.
          </p>
          {permission === 'denied' && (
            <div className="device-warning">
              <Icon name="info" />
              <span>
                <strong>Không có quyền truy cập thiết bị</strong>Bạn vẫn có thể vào để xem và nghe
                nội dung mô phỏng.
              </span>
            </div>
          )}
          <label>
            Micro
            <select disabled={permission === 'denied'}>
              <option>Micro tích hợp — Mặc định</option>
              <option>Tai nghe USB</option>
            </select>
          </label>
          <label>
            Camera
            <select disabled={permission === 'denied'}>
              <option>Camera tích hợp — Mặc định</option>
              <option>Camera ngoài</option>
            </select>
          </label>
          <div className="prejoin-state">
            <span>
              <Icon name="mic" size={15} />
              {mic ? 'Mic đang bật' : 'Mic đang tắt'}
            </span>
            <span>
              <Icon name="video" size={15} />
              {camera ? 'Camera đang bật' : 'Camera đang tắt'}
            </span>
          </div>
          <Button
            variant="primary"
            className="join-meeting-btn"
            onClick={() => onJoin(role, { mic, camera })}
          >
            Tham gia cuộc họp
          </Button>
        </section>
      </main>
    </div>
  );
}

type MeetingChatMessage = {
  id: string;
  authorId: string;
  target: 'everyone' | 'host' | string;
  text: string;
  roomId?: string;
  privateHostId?: string;
  imageName?: string;
  imageUrl?: string;
};
type DrawingStroke = {
  id: string;
  x: number;
  y: number;
  color: string;
  ownerId: string;
  ephemeral: boolean;
};
type GroupKind = 'discussion' | 'activity';
type MeetingGroup = {
  id: string;
  name: string;
  kind: GroupKind;
  memberIds: string[];
  active: boolean;
};
type DiscussionRequest = {
  id: string;
  groupId?: string;
  name: string;
  purpose: string;
  memberIds: string[];
  status: 'pending' | 'approved' | 'rejected';
};
type GroupBoard = {
  frozen: boolean;
  frozenBy: string | null;
  strokes: DrawingStroke[];
  page: number;
};
type ActivityShare = { state: ShareState; ownerId?: string };
type ActivityStartScenario = 'success' | 'partial-failure';
type ActivityStartState = {
  runId: string;
  phase: 'starting' | 'cleaning' | 'failed';
  openedGroupIds: string[];
  transferredMemberIds: string[];
  detail: string;
};

function MeetingRoom({
  participants: members,
  active,
  initialRole,
  initialDevices,
  onWorkspace,
  onLeave,
  onEnd,
  onHostStatusChange,
  onDemoRevokeAccess,
  channelName,
  recording,
  recordingBusy,
  onRecordStart,
  onRecordStop,
  onRecordError,
  onRecordNearLimit,
}: {
  participants: Member[];
  recording?: RecordingEntry;
  recordingBusy: boolean;
  onRecordStart: () => void;
  onRecordStop: () => void;
  onRecordError: () => void;
  onRecordNearLimit: () => void;
  onDemoRevokeAccess: () => void;
  channelName: string;
  active: boolean;
  initialRole: MeetingRole;
  initialDevices: { mic: boolean; camera: boolean };
  onWorkspace: () => void;
  onLeave: () => void;
  onEnd: () => void;
  onHostStatusChange: (isHost: boolean) => void;
}) {
  const fallbackHostId = members.find((m) => m.id !== currentUserId)?.id ?? currentUserId;
  const getMember = (id: string): Member =>
    members.find((m) => m.id === id) ?? {
      id,
      name: 'Người không còn trong phòng',
      initials: '?',
      color: 'bg-teal-600',
      title: '',
    };
  const [role, setRole] = useState<MeetingRole>(initialRole);
  const [share, setShare] = useState<ShareState>(
    members.some((m) => m.id !== currentUserId) ? 'other' : 'none',
  );
  const [connection, setConnection] = useState<ConnectionState>('live');
  const [panel, setPanel] = useState<'chat' | 'people' | 'groups' | null>(null);
  const [mic, setMic] = useState(initialDevices.mic);
  const [camera, setCamera] = useState(initialDevices.camera);
  const [tool, setTool] = useState<'cursor' | 'pen'>('cursor');
  const [color, setColor] = useState('#d5655b');
  const [ephemeralInk, setEphemeralInk] = useState(false);
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [shareDialog, setShareDialog] = useState(false);
  const [leaveDialog, setLeaveDialog] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [hostId, setHostId] = useState(initialRole === 'HOST' ? currentUserId : fallbackHostId);
  const [chatTarget, setChatTarget] = useState('everyone');
  const [privateReplyId, setPrivateReplyId] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState('');
  const [chatImage, setChatImage] = useState<{
    name: string;
    url: string;
  } | null>(null);
  const chatImageInput = useRef<HTMLInputElement>(null);
  const [meetingVolume, setMeetingVolume] = useState(78);
  const [shareVolume, setShareVolume] = useState(65);
  const [meetingMuted, setMeetingMuted] = useState(false);
  const [discussionMuted, setDiscussionMuted] = useState(false);
  const [guidanceAnnouncement, setGuidanceAnnouncement] = useState<{
    hostId: string;
    remaining: number;
  } | null>(null);
  const [audioViewerId, setAudioViewerId] = useState(currentUserId);
  const [messages, setMessages] = useState<MeetingChatMessage[]>(
    [
      {
        id: 'mc1',
        authorId: 'lan',
        target: 'everyone',
        text: 'Mọi người nhìn rõ phần sơ đồ chưa?',
      },
      {
        id: 'mc2',
        authorId: 'khoa',
        target: 'host',
        privateHostId: 'lan',
        text: 'Host ơi, bạn cho mình hỏi riêng về phần phân công nhé.',
      },
    ].filter((m) => members.some((person) => person.id === m.authorId)) as MeetingChatMessage[],
  );
  const [roomId, setRoomId] = useState('main');
  const [discussionRequest, setDiscussionRequest] = useState<DiscussionRequest | null>(null);
  const [discussionForm, setDiscussionForm] = useState({
    name: 'Ôn luồng xử lý',
    purpose: 'Cùng giải thích lại sơ đồ request và response.',
    memberIds: members.filter((m) => m.id === currentUserId || m.id === 'khoa').map((m) => m.id),
  });
  const [groups, setGroups] = useState<MeetingGroup[]>([]);
  const [discussionPresence, setDiscussionPresence] = useState<Record<string, string[]>>({});
  const [discussionEverJoined, setDiscussionEverJoined] = useState<Record<string, boolean>>({});
  const [groupBoards, setGroupBoards] = useState<Record<string, GroupBoard>>({});
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityConfirm, setActivityConfirm] = useState(false);
  const [activityStartScenario, setActivityStartScenario] =
    useState<ActivityStartScenario>('success');
  const [activityStartState, setActivityStartState] = useState<ActivityStartState | null>(null);
  const [activityDemoNotice, setActivityDemoNotice] = useState('');
  const [lastFailedActivityRunId, setLastFailedActivityRunId] = useState<string | null>(null);
  const activityRunRef = useRef<string | null>(null);
  const failedActivityGroupsRef = useRef<MeetingGroup[]>([]);
  const [endDiscussionTarget, setEndDiscussionTarget] = useState<string | 'all' | null>(null);
  const [activityRunning, setActivityRunning] = useState(false);
  const [activityDuration, setActivityDuration] = useState(15);
  const [activityRemaining, setActivityRemaining] = useState(0);
  const [activityGroupCount, setActivityGroupCount] = useState(2);
  const [activityDivisionMode, setActivityDivisionMode] = useState<'manual' | 'random'>('manual');
  const [activityGroupNames, setActivityGroupNames] = useState([
    'Nhóm A — Phân tích',
    'Nhóm B — Giải pháp',
  ]);
  const [activitySelectedIds, setActivitySelectedIds] = useState(
    members.filter((m) => m.id !== currentUserId).map((m) => m.id),
  );
  const [activityAssignments, setActivityAssignments] = useState<Record<string, string>>({
    lan: 'activity-1',
    khoa: 'activity-1',
    vy: 'activity-2',
    nam: 'activity-2',
  });
  const [activityShares, setActivityShares] = useState<Record<string, ActivityShare>>({});
  const [mainSourcePage, setMainSourcePage] = useState(2);
  const [activitySourcePages, setActivitySourcePages] = useState<Record<string, number>>({});
  const [supportGroupId, setSupportGroupId] = useState<string | null>(null);
  const [mainNotice, setMainNotice] = useState<string | null>(null);
  const [originalHostId, setOriginalHostId] = useState(
    initialRole === 'HOST' ? currentUserId : fallbackHostId,
  );
  const [temporaryHostId, setTemporaryHostId] = useState<string | null>(null);
  const [disconnectedIds, setDisconnectedIds] = useState<string[]>([]);
  const [demoActivityGroupId, setDemoActivityGroupId] = useState<string | null>(null);
  const currentGroup = groups.find((group) => group.id === roomId);
  const activeDiscussion = groups.find((group) => group.kind === 'discussion');
  const inGroup = !!currentGroup;
  const isDiscussion = currentGroup?.kind === 'discussion';
  const isActivity = currentGroup?.kind === 'activity';
  const activityTransitionBusy =
    activityStartState?.phase === 'starting' || activityStartState?.phase === 'cleaning';
  const currentBoard = currentGroup
    ? (groupBoards[currentGroup.id] ?? {
        frozen: false,
        frozenBy: null,
        strokes: [],
        page: 1,
      })
    : null;
  const currentActivityShare =
    isActivity && currentGroup
      ? (activityShares[currentGroup.id] ?? { state: 'none' as ShareState })
      : null;
  const groupShare = isDiscussion ? share : (currentActivityShare?.state ?? share);
  const liveSourcePage = isDiscussion
    ? mainSourcePage
    : isActivity && currentGroup
      ? (activitySourcePages[currentGroup.id] ?? 2)
      : mainSourcePage;
  const roomMemberIds = currentGroup
    ? currentGroup.kind === 'discussion'
      ? (discussionPresence[currentGroup.id] ?? [])
      : supportGroupId === currentGroup.id || demoActivityGroupId === currentGroup.id
        ? Array.from(new Set([...currentGroup.memberIds, currentUserId]))
        : currentGroup.memberIds
    : members.map((member) => member.id);
  const roomMembers = members.filter((member) => roomMemberIds.includes(member.id));
  const micScope = inGroup
    ? `Mic của bạn chỉ phát trong ${currentGroup.name}`
    : 'Mic của bạn phát trong Phòng chung';
  const hasHostControls =
    members.some((m) => m.id === currentUserId) &&
    hostId === currentUserId &&
    !disconnectedIds.includes(currentUserId);
  const hasValidHost = !!hostId && !disconnectedIds.includes(hostId);
  const audioViewerRoomId =
    audioViewerId === currentUserId
      ? roomId
      : audioViewerId === hostId
        ? 'main'
        : (groups.find((group) =>
            group.kind === 'discussion'
              ? (discussionPresence[group.id] ?? []).includes(audioViewerId)
              : group.memberIds.includes(audioViewerId),
          )?.id ?? 'main');
  const audioViewerGroup = groups.find((group) => group.id === audioViewerRoomId);
  const audioViewerIsDiscussion = audioViewerGroup?.kind === 'discussion';
  const audioViewerIsActivity = audioViewerGroup?.kind === 'activity';
  const guidanceVisibleToViewer = !!guidanceAnnouncement && !audioViewerIsActivity;
  const discussionBusIsReduced =
    guidanceVisibleToViewer &&
    audioViewerIsDiscussion &&
    audioViewerId !== guidanceAnnouncement?.hostId;
  const illustrativeDiscussionGain = 40;
  const composerScopeKey =
    chatTarget === 'everyone'
      ? `everyone:${roomId}`
      : chatTarget === 'host'
        ? `host:${roomId}:${hostId || 'none'}`
        : `member:${roomId}:${chatTarget.replace('member:', '')}`;
  const composerScopeKeyRef = useRef(composerScopeKey);
  useEffect(() => {
    setRole(initialRole);
    setHostId(initialRole === 'HOST' ? currentUserId : fallbackHostId);
    setOriginalHostId(initialRole === 'HOST' ? currentUserId : fallbackHostId);
  }, [initialRole]);
  useEffect(() => {
    setMic(initialDevices.mic);
    setCamera(initialDevices.camera);
  }, [initialDevices]);
  useEffect(() => {
    if (active) onHostStatusChange(hasHostControls);
  }, [active, hasHostControls, onHostStatusChange]);
  useEffect(() => {
    setChatDraft('');
    setChatImage(null);
    setPrivateReplyId(null);
    setChatTarget(hasHostControls ? 'everyone' : 'host');
    if (hasHostControls) return;
    const lostExternalActivitySupport =
      currentGroup?.kind === 'activity' &&
      supportGroupId === currentGroup.id &&
      !currentGroup.memberIds.includes(currentUserId);
    if (lostExternalActivitySupport) {
      const previousGroupId = currentGroup.id;
      setActivityShares((all) =>
        all[previousGroupId]?.ownerId === currentUserId
          ? { ...all, [previousGroupId]: { state: 'none' } }
          : all,
      );
      setRoomId('main');
      setSupportGroupId(null);
      setPanel(null);
      setMic(false);
      setTool('cursor');
      setMainNotice('Lượt hỗ trợ đã kết thúc. Bạn đã về Phòng chung với mic tắt.');
    }
    setActivityOpen(false);
    setActivityConfirm(false);
    setEndDiscussionTarget(null);
    setLeaveDialog(false);
    setConfirmEnd(false);
    if (!inGroup) setClearConfirm(false);
  }, [hasHostControls, inGroup, currentGroup, supportGroupId]);
  useEffect(() => {
    if (composerScopeKeyRef.current === composerScopeKey) return;
    composerScopeKeyRef.current = composerScopeKey;
    setChatDraft('');
    setChatImage(null);
  }, [composerScopeKey]);
  useEffect(() => {
    if (!activityRunning) return;
    const timer = window.setInterval(
      () => setActivityRemaining((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [activityRunning]);
  useEffect(() => {
    if (!activityRunning || activityRemaining > 0) return;
    activityRunRef.current = null;
    setActivityRunning(false);
    setDemoActivityGroupId(null);
    setGroups((list) => list.filter((group) => group.kind !== 'activity'));
    setActivityShares({});
    setGroupBoards((boards) =>
      Object.fromEntries(Object.entries(boards).filter(([id]) => !id.startsWith('activity-'))),
    );
    if (roomId.startsWith('activity-') || supportGroupId?.startsWith('activity-')) {
      setRoomId('main');
      setSupportGroupId(null);
      setMic(false);
      setMainNotice('Hoạt động đã hết giờ. Bạn đã về Phòng chung; mic đang tắt.');
      setChatDraft('');
      setChatImage(null);
      setChatTarget('everyone');
      setPrivateReplyId(null);
    }
  }, [activityRemaining, activityRunning, roomId, supportGroupId]);
  useEffect(() => {
    if (!guidanceAnnouncement) return;
    const timer = window.setInterval(
      () =>
        setGuidanceAnnouncement((current) =>
          !current || current.remaining <= 1
            ? null
            : { ...current, remaining: current.remaining - 1 },
        ),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [!!guidanceAnnouncement]);
  useEffect(() => {
    if (
      guidanceAnnouncement &&
      (guidanceAnnouncement.hostId !== hostId ||
        disconnectedIds.includes(guidanceAnnouncement.hostId) ||
        (guidanceAnnouncement.hostId === currentUserId && connection !== 'live'))
    )
      setGuidanceAnnouncement(null);
  }, [connection, currentUserId, disconnectedIds, guidanceAnnouncement, hostId]);
  const [chatViewerId, setChatViewerId] = useState(currentUserId);
  const chatViewerIsHost = chatViewerId === hostId && hasValidHost;
  const chatViewerRoomId =
    chatViewerId === currentUserId
      ? roomId
      : chatViewerId === hostId
        ? 'main'
        : (groups.find((g) =>
            g.kind === 'discussion'
              ? (discussionPresence[g.id] ?? []).includes(chatViewerId)
              : g.memberIds.includes(chatViewerId),
          )?.id ?? 'main');
  const chatViewerGroup = groups.find((g) => g.id === chatViewerRoomId);
  const failedActivityChatLocked = activityTransitionBusy && chatViewerGroup?.kind === 'activity';
  useEffect(() => {
    setChatDraft('');
    setChatImage(null);
    setPrivateReplyId(null);
    setChatTarget(chatViewerIsHost ? 'everyone' : 'host');
  }, [chatViewerId, chatViewerIsHost]);
  const privateConversationIds = Array.from(
    new Set(
      messages.flatMap((message) => {
        if (!chatViewerIsHost || message.privateHostId !== chatViewerId) return [];
        if (message.target === 'host' && message.authorId !== chatViewerId)
          return [message.authorId];
        if (
          message.authorId === chatViewerId &&
          message.target !== 'everyone' &&
          message.target !== 'host'
        )
          return [message.target];
        return [];
      }),
    ),
  );
  const historicalPrivateConversationIds = Array.from(
    new Set(
      messages.flatMap((message) =>
        !chatViewerIsHost &&
        message.privateHostId === chatViewerId &&
        message.target === 'host' &&
        message.authorId !== chatViewerId
          ? [message.authorId]
          : [],
      ),
    ),
  );
  const senderHistoricalHostIds = Array.from(
    new Set(
      messages.flatMap((message) => {
        if (
          !message.privateHostId ||
          message.privateHostId === hostId ||
          message.privateHostId === chatViewerId
        )
          return [];
        return (message.authorId === chatViewerId && message.target === 'host') ||
          (message.authorId === message.privateHostId && message.target === chatViewerId)
          ? [message.privateHostId]
          : [];
      }),
    ),
  );
  const chatTargetIsReadOnlyHistory =
    chatTarget.startsWith('history:') || chatTarget.startsWith('sender-history:');
  const visibleMessages = messages.filter((message) => {
    if (chatTarget === 'everyone')
      return message.target === 'everyone' && (message.roomId ?? 'main') === chatViewerRoomId;
    if (chatTarget === 'host') {
      if (chatViewerIsHost || !hasValidHost || message.privateHostId !== hostId) return false;
      return (
        (message.authorId === chatViewerId && message.target === 'host') ||
        (message.authorId === hostId && message.target === chatViewerId)
      );
    }
    if (chatTarget.startsWith('history:')) {
      const privateMemberId = chatTarget.replace('history:', '');
      return (
        message.privateHostId === chatViewerId &&
        ((message.authorId === privateMemberId && message.target === 'host') ||
          (message.authorId === chatViewerId && message.target === privateMemberId))
      );
    }
    if (chatTarget.startsWith('sender-history:')) {
      const originalHostId = chatTarget.replace('sender-history:', '');
      return (
        message.privateHostId === originalHostId &&
        ((message.authorId === chatViewerId && message.target === 'host') ||
          (message.authorId === originalHostId && message.target === chatViewerId))
      );
    }
    const privateMemberId = chatTarget.replace('member:', '');
    if (!chatViewerIsHost || message.privateHostId !== chatViewerId) return false;
    return (
      (message.authorId === privateMemberId && message.target === 'host') ||
      (message.authorId === chatViewerId && message.target === privateMemberId)
    );
  });
  const sendChat = () => {
    if (!chatDraft.trim() && !chatImage) return;
    if (chatTargetIsReadOnlyHistory) return;
    if (failedActivityChatLocked) return;
    const target =
      chatTarget === 'everyone'
        ? 'everyone'
        : chatTarget === 'host'
          ? 'host'
          : chatTarget.replace('member:', '');
    if (target === 'host' && (chatViewerIsHost || !hasValidHost)) return;
    if (
      target !== 'everyone' &&
      target !== 'host' &&
      (!chatViewerIsHost || target !== privateReplyId)
    )
      return;
    setMessages((list) => [
      ...list,
      {
        id: `mc-${Date.now()}`,
        authorId: chatViewerId,
        target,
        roomId: chatViewerRoomId,
        privateHostId: target === 'everyone' ? undefined : hostId,
        text: chatDraft.trim(),
        imageName: chatImage?.name,
        imageUrl: chatImage?.url,
      },
    ]);
    setChatDraft('');
    setChatImage(null);
  };
  const setShareScenario = (next: ShareState) => {
    setShare(next);
    setStrokes([]);
    setTool('cursor');
  };
  const stopShare = () => {
    setShare('none');
    setStrokes([]);
    setTool('cursor');
  };
  const addStroke = (x: number, y: number) => {
    if (!hasHostControls || inGroup) return;
    const stroke: DrawingStroke = {
      id: `stroke-${Date.now()}-${Math.random()}`,
      x,
      y,
      color,
      ownerId: currentUserId,
      ephemeral: ephemeralInk,
    };
    setStrokes((list) => [...list, stroke]);
    if (ephemeralInk)
      window.setTimeout(
        () => setStrokes((list) => list.filter((item) => item.id !== stroke.id)),
        6000,
      );
  };
  const undoOwnStroke = () => {
    setStrokes((list) => {
      const ownIndex = list.findLastIndex((stroke) => stroke.ownerId === currentUserId);
      return ownIndex < 0 ? list : list.filter((_, index) => index !== ownIndex);
    });
  };
  const updateGroupBoard = (groupId: string, update: (board: GroupBoard) => GroupBoard) => {
    setGroupBoards((boards) => ({
      ...boards,
      [groupId]: update(
        boards[groupId] ?? {
          frozen: false,
          frozenBy: null,
          strokes: [],
          page: 1,
        },
      ),
    }));
  };
  const resetComposerForScope = (target = 'everyone') => {
    setChatDraft('');
    setChatImage(null);
    setChatTarget(target);
    setPrivateReplyId(null);
  };
  const stopOwnedActivitySource = (groupId: string) => {
    setActivityShares((all) =>
      all[groupId]?.ownerId === currentUserId ? { ...all, [groupId]: { state: 'none' } } : all,
    );
  };
  const addGroupStroke = (x: number, y: number) => {
    if (!currentGroup || !currentBoard?.frozen || activityTransitionBusy) return;
    const stroke: DrawingStroke = {
      id: `group-stroke-${Date.now()}-${Math.random()}`,
      x,
      y,
      color,
      ownerId: currentUserId,
      ephemeral: false,
    };
    updateGroupBoard(currentGroup.id, (board) => ({
      ...board,
      strokes: [...board.strokes, stroke],
    }));
  };
  const undoGroupStroke = () => {
    if (!currentGroup) return;
    updateGroupBoard(currentGroup.id, (board) => {
      const ownIndex = board.strokes.findLastIndex((stroke) => stroke.ownerId === currentUserId);
      return ownIndex < 0
        ? board
        : {
            ...board,
            strokes: board.strokes.filter((_, index) => index !== ownIndex),
          };
    });
  };
  const enterGroup = (groupId: string, asSupport = false) => {
    const group = groups.find((item) => item.id === groupId);
    if (!group?.active) return;
    if (activityTransitionBusy) return;
    if (group.kind === 'activity' && !activityRunning) return;
    if (group.kind === 'discussion') {
      if (!group.memberIds.includes(currentUserId) || hasHostControls) return;
      setDiscussionPresence((presence) => ({
        ...presence,
        [groupId]: Array.from(new Set([...(presence[groupId] ?? []), currentUserId])),
      }));
      setDiscussionEverJoined((joined) => ({ ...joined, [groupId]: true }));
    }
    if (currentGroup?.kind === 'activity' && currentGroup.id !== groupId)
      stopOwnedActivitySource(currentGroup.id);
    setRoomId(groupId);
    setSupportGroupId(asSupport ? groupId : null);
    setPanel(null);
    resetComposerForScope();
    setMainNotice(null);
  };
  const returnToMain = (fromEndedGroup = false) => {
    if (currentGroup?.kind === 'activity') stopOwnedActivitySource(currentGroup.id);
    if (currentGroup?.kind === 'discussion' && !hasHostControls) {
      const remaining = (discussionPresence[currentGroup.id] ?? []).filter(
        (id) => id !== currentUserId,
      );
      if (remaining.length === 0 && discussionEverJoined[currentGroup.id]) {
        setGroups((list) => list.filter((group) => group.id !== currentGroup.id));
        setDiscussionRequest(null);
        setDiscussionPresence((presence) => {
          const next = { ...presence };
          delete next[currentGroup.id];
          return next;
        });
        setGroupBoards((boards) => {
          const next = { ...boards };
          delete next[currentGroup.id];
          return next;
        });
      } else
        setDiscussionPresence((presence) => ({
          ...presence,
          [currentGroup.id]: remaining,
        }));
    }
    setRoomId('main');
    setSupportGroupId(null);
    setPanel(null);
    if (fromEndedGroup || !hasHostControls) {
      setMic(false);
      setMainNotice('Bạn đã về Phòng chung. Bật mic khi muốn phát biểu.');
    } else setMainNotice(null);
    resetComposerForScope();
  };
  const createDiscussion = () => {
    if (
      activityRunning ||
      activityTransitionBusy ||
      !discussionForm.name.trim() ||
      !discussionForm.purpose.trim() ||
      discussionForm.memberIds.some((id) => !members.some((m) => m.id === id))
    )
      return;
    const groupId = `discussion-${Date.now()}`;
    const request: DiscussionRequest = {
      id: `request-${Date.now()}`,
      groupId,
      ...discussionForm,
      status: 'approved',
    };
    const group: MeetingGroup = {
      id: groupId,
      name: request.name,
      kind: 'discussion',
      memberIds: request.memberIds,
      active: true,
    };
    setDiscussionRequest(request);
    setGroups((list) => [...list.filter((item) => item.kind !== 'discussion'), group]);
    setDiscussionPresence((presence) => ({ ...presence, [group.id]: [] }));
    setDiscussionEverJoined((joined) => ({ ...joined, [group.id]: false }));
    setGroupBoards((boards) => ({
      ...boards,
      [group.id]: { frozen: false, frozenBy: null, strokes: [], page: 1 },
    }));
  };
  const toggleDiscussionPresence = (memberId: string) => {
    if (!activeDiscussion || !activeDiscussion.memberIds.includes(memberId)) return;
    const current = discussionPresence[activeDiscussion.id] ?? [];
    const next = current.includes(memberId)
      ? current.filter((id) => id !== memberId)
      : [...current, memberId];
    if (next.length === 0 && discussionEverJoined[activeDiscussion.id]) {
      setGroups((list) => list.filter((group) => group.id !== activeDiscussion.id));
      setDiscussionRequest(null);
      setDiscussionPresence((presence) => {
        const updated = { ...presence };
        delete updated[activeDiscussion.id];
        return updated;
      });
      setGroupBoards((boards) => {
        const updated = { ...boards };
        delete updated[activeDiscussion.id];
        return updated;
      });
      if (roomId === activeDiscussion.id) returnToMain(true);
    } else
      setDiscussionPresence((presence) => ({
        ...presence,
        [activeDiscussion.id]: next,
      }));
    if (!current.includes(memberId))
      setDiscussionEverJoined((joined) => ({
        ...joined,
        [activeDiscussion.id]: true,
      }));
  };
  const simulateCurrentMemberDisconnect = () => {
    if (!disconnectedIds.includes(currentUserId)) {
      setDisconnectedIds((ids) => [...ids, currentUserId]);
      if (currentGroup?.kind === 'discussion') returnToMain(true);
      else if (currentGroup?.kind === 'activity') {
        stopOwnedActivitySource(currentGroup.id);
        setRoomId('main');
        setSupportGroupId(null);
        setMic(false);
        resetComposerForScope();
        setMainNotice('Mất kết nối được phát hiện. Bạn đã trở về Phòng chung với mic tắt.');
      }
    } else {
      setDisconnectedIds((ids) => ids.filter((id) => id !== currentUserId));
      setRoomId('main');
      setMainNotice('Đã kết nối lại tại Phòng chung. Bạn có thể chủ động vào lại nhóm còn mở.');
    }
  };
  const simulateHostDisconnect = () => {
    const lostHost = temporaryHostId ?? originalHostId;
    const lostExternalHelp =
      lostHost === currentUserId &&
      !!supportGroupId &&
      currentGroup?.kind === 'activity' &&
      !currentGroup.memberIds.includes(currentUserId);
    const nextDisconnected = Array.from(new Set([...disconnectedIds, lostHost]));
    setDisconnectedIds(nextDisconnected);
    const eligible = members
      .map((member) => member.id)
      .filter((id) => id !== originalHostId && !nextDisconnected.includes(id));
    const nextHost = eligible.length ? eligible[Math.floor(Math.random() * eligible.length)] : null;
    if (nextHost) {
      setTemporaryHostId(nextHost);
      setHostId(nextHost);
    } else {
      setTemporaryHostId(null);
      setHostId('');
    }
    if (lostHost === currentUserId) {
      setRole('MEMBER');
      setTool('cursor');
      returnToMain(lostExternalHelp);
    }
  };
  const restoreOriginalHost = () => {
    setDisconnectedIds((ids) => ids.filter((id) => id !== originalHostId));
    setHostId(originalHostId);
    setTemporaryHostId(null);
    if (originalHostId === currentUserId) setRole('HOST');
  };
  const endDiscussionGroups = (target: string | 'all') => {
    if (!hasHostControls) return;
    setGroups((list) =>
      list.filter(
        (group) => group.kind !== 'discussion' || (target !== 'all' && group.id !== target),
      ),
    );
    if (target === 'all' || discussionRequest?.groupId === target) setDiscussionRequest(null);
    setDiscussionPresence((presence) =>
      Object.fromEntries(
        Object.entries(presence).filter(([id]) => target !== 'all' && id !== target),
      ),
    );
    setDiscussionEverJoined((joined) =>
      Object.fromEntries(
        Object.entries(joined).filter(([id]) => target !== 'all' && id !== target),
      ),
    );
    if (currentGroup?.kind === 'discussion' && (target === 'all' || currentGroup.id === target))
      returnToMain(true);
  };
  const activityDraftValid = Array.from(
    { length: activityGroupCount },
    (_, i) => `activity-${i + 1}`,
  ).every((groupId) =>
    activitySelectedIds.some(
      (id) =>
        id !== hostId &&
        !disconnectedIds.includes(id) &&
        members.some((m) => m.id === id) &&
        activityAssignments[id] === groupId,
    ),
  );
  const activityRosterValid =
    Number.isInteger(activityDuration) &&
    activityDuration >= 1 &&
    activityDuration <= 120 &&
    activitySelectedIds.every(
      (id) =>
        id !== hostId &&
        !disconnectedIds.includes(id) &&
        members.some((member) => member.id === id) &&
        Array.from({ length: activityGroupCount }, (_, index) => `activity-${index + 1}`).includes(
          activityAssignments[id],
        ),
    );
  const buildActivityGroups = (runId: string): MeetingGroup[] =>
    Array.from({ length: activityGroupCount }, (_, index) => {
      const draftGroupId = `activity-${index + 1}`;
      return {
        id: `${runId}-group-${index + 1}`,
        name: activityGroupNames[index] || `Nhóm ${index + 1}`,
        kind: 'activity',
        memberIds: activitySelectedIds.filter(
          (memberId) =>
            activityAssignments[memberId] === draftGroupId &&
            memberId !== hostId &&
            !disconnectedIds.includes(memberId) &&
            members.some((member) => member.id === memberId),
        ),
        active: true,
      };
    });
  const completeActivityStart = (runId: string, activityGroups: MeetingGroup[]) => {
    if (activityRunRef.current !== runId) return false;
    setGroups(activityGroups);
    setActivityShares(
      Object.fromEntries(activityGroups.map((group) => [group.id, { state: 'none' }])),
    );
    setActivitySourcePages(Object.fromEntries(activityGroups.map((group) => [group.id, 2])));
    setGroupBoards(
      Object.fromEntries(
        activityGroups.map((group) => [
          group.id,
          { frozen: false, frozenBy: null, strokes: [], page: 1 },
        ]),
      ),
    );
    setActivityRemaining(activityDuration * 60);
    setActivityRunning(true);
    setActivityStartState(null);
    setActivityDemoNotice('');
    return true;
  };
  const cleanupFailedActivityStart = (runId: string, activityGroups: MeetingGroup[]) => {
    if (activityRunRef.current !== runId) return;
    const failedGroupIds = activityGroups.map((group) => group.id);
    const viewerWasInFailedGroup = failedGroupIds.includes(roomId);
    setGroups((list) => list.filter((group) => !failedGroupIds.includes(group.id)));
    setActivityShares((all) =>
      Object.fromEntries(Object.entries(all).filter(([id]) => !failedGroupIds.includes(id))),
    );
    setActivitySourcePages((pages) =>
      Object.fromEntries(Object.entries(pages).filter(([id]) => !failedGroupIds.includes(id))),
    );
    setGroupBoards((boards) =>
      Object.fromEntries(Object.entries(boards).filter(([id]) => !failedGroupIds.includes(id))),
    );
    setMessages((list) =>
      list.filter((message) => !message.roomId || !failedGroupIds.includes(message.roomId)),
    );
    setActivityRemaining(0);
    setActivityRunning(false);
    setSupportGroupId(null);
    setDemoActivityGroupId(null);
    setShareDialog(false);
    setTool('cursor');
    if (viewerWasInFailedGroup) {
      setRoomId('main');
      setMic(false);
      resetComposerForScope();
    }
    setActivityStartState((current) =>
      current?.runId === runId
        ? {
            ...current,
            phase: 'failed',
            openedGroupIds: [],
            detail:
              'Đã hủy xong lượt dở. Nhóm, countdown, help, share, chat và board vừa mở đã được thu hồi.',
          }
        : current,
    );
    setMainNotice(
      'Hoạt động chưa bắt đầu được. Phần đã mở đã được thu hồi; mọi người còn quyền đã về Phòng chung.',
    );
    setLastFailedActivityRunId(runId);
    activityRunRef.current = null;
  };
  const startActivity = () => {
    if (
      !hasHostControls ||
      inGroup ||
      activityRunning ||
      activityTransitionBusy ||
      activityRunRef.current ||
      !activityDraftValid ||
      !activityRosterValid
    )
      return;
    const runId = `activity-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const activityGroups = buildActivityGroups(runId);
    if (activityGroups.some((group) => group.memberIds.length === 0)) return;
    activityRunRef.current = runId;
    setActivityDemoNotice('');
    failedActivityGroupsRef.current = [];
    setGroups([]);
    setDiscussionRequest(null);
    setDiscussionPresence({});
    setDiscussionEverJoined({});
    setGroupBoards({});
    setActivityShares({});
    setActivitySourcePages({});
    setActivityRemaining(0);
    setActivityRunning(false);
    setActivityOpen(false);
    setActivityConfirm(false);
    setActivityStartState({
      runId,
      phase: 'starting',
      openedGroupIds: [],
      transferredMemberIds: [],
      detail: 'Đang kiểm lại host, roster, phân công và thời lượng trước khi chuyển người.',
    });
    window.setTimeout(() => {
      if (activityRunRef.current !== runId) return;
      if (activityStartScenario === 'success') {
        completeActivityStart(runId, activityGroups);
        return;
      }
      const partialGroups = [{ ...activityGroups[0], active: false }];
      const transferredMemberIds = partialGroups.flatMap((group) => group.memberIds);
      failedActivityGroupsRef.current = partialGroups;
      setGroups(partialGroups);
      setActivityShares({
        [partialGroups[0].id]: {
          state: 'other',
          ownerId: transferredMemberIds[0],
        },
      });
      setActivitySourcePages({ [partialGroups[0].id]: 2 });
      setGroupBoards({
        [partialGroups[0].id]: {
          frozen: true,
          frozenBy: transferredMemberIds[0] ?? null,
          strokes: [
            {
              id: `${runId}-partial-stroke`,
              x: 42,
              y: 38,
              color: '#d5655b',
              ownerId: transferredMemberIds[0] ?? 'unknown',
              ephemeral: false,
            },
          ],
          page: 1,
        },
      });
      setMessages((list) => [
        ...list,
        {
          id: `${runId}-partial-chat`,
          authorId: transferredMemberIds[0] ?? currentUserId,
          target: 'everyone',
          roomId: partialGroups[0].id,
          text: 'Context tạm của lượt khởi tạo dở — phải được cleanup.',
        },
      ]);
      setActivityStartState({
        runId,
        phase: 'starting',
        openedGroupIds: partialGroups.map((group) => group.id),
        transferredMemberIds,
        detail: `Mới mở ${partialGroups.length}/${activityGroups.length} nhóm và chuyển một phần người; chưa được báo thành công.`,
      });
      window.setTimeout(() => {
        if (activityRunRef.current !== runId) return;
        setActivityStartState((current) =>
          current?.runId === runId
            ? {
                ...current,
                phase: 'cleaning',
                detail:
                  'Đang hủy… Thu quyền vào nhóm, help, share, chat, board và countdown của lượt dở.',
              }
            : current,
        );
        window.setTimeout(() => cleanupFailedActivityStart(runId, partialGroups), 1200);
      }, 900);
    }, 700);
  };
  const randomizeActivityAssignments = () => {
    if (!hasHostControls || activityRunning || activityTransitionBusy) return;
    const selected = activitySelectedIds
      .filter(
        (id) => id !== hostId && !disconnectedIds.includes(id) && members.some((m) => m.id === id),
      )
      .sort(() => Math.random() - 0.5);
    setActivityAssignments(
      Object.fromEntries(
        selected.map((id, index) => [id, `activity-${(index % activityGroupCount) + 1}`]),
      ),
    );
    setActivityDivisionMode('random');
  };
  const leave = () => {
    if (hasHostControls) setLeaveDialog(true);
    else {
      if (currentGroup?.kind === 'activity') stopOwnedActivitySource(currentGroup.id);
      if (currentGroup?.kind === 'discussion') {
        const remaining = (discussionPresence[currentGroup.id] ?? []).filter(
          (id) => id !== currentUserId,
        );
        if (remaining.length === 0 && discussionEverJoined[currentGroup.id]) {
          setGroups((list) => list.filter((group) => group.id !== currentGroup.id));
          setDiscussionRequest(null);
          setDiscussionPresence((presence) => {
            const next = { ...presence };
            delete next[currentGroup.id];
            return next;
          });
          setGroupBoards((boards) => {
            const next = { ...boards };
            delete next[currentGroup.id];
            return next;
          });
        } else
          setDiscussionPresence((presence) => ({
            ...presence,
            [currentGroup.id]: remaining,
          }));
      }
      onLeave();
    }
  };
  const visibleShare = inGroup ? groupShare : share;
  const hasVisibleSource = visibleShare !== 'none' || !!currentBoard?.frozen;
  const cameraMembers = roomMembers.filter(
    (member) => member.id !== (visibleShare === 'other' ? fallbackHostId : ''),
  );
  if (!active) return null;
  return (
    <div className="meeting-screen">
      <div className="meeting-demo-bar">
        <span>
          <span className="prototype-dot" />
          Tình huống demo · cuộc họp mô phỏng
        </span>
        <DemoTools>
          <label>
            Góc nhìn chat (demo)
            <select value={chatViewerId} onChange={(e) => setChatViewerId(e.target.value)}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Góc nhìn người nghe (demo)
            <select
              value={audioViewerId}
              onChange={(event) => setAudioViewerId(event.target.value)}
            >
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tình huống demo · Bắt đầu ACTIVITY
            <select
              value={activityStartScenario}
              disabled={activityTransitionBusy || activityRunning}
              onChange={(event) =>
                setActivityStartScenario(event.target.value as ActivityStartScenario)
              }
            >
              <option value="success">Bắt đầu thành công</option>
              <option value="partial-failure">Lỗi sau khi mở/chuyển một phần</option>
            </select>
          </label>
          {lastFailedActivityRunId && (
            <Button
              variant="ghost"
              onClick={() => {
                completeActivityStart(lastFailedActivityRunId, failedActivityGroupsRef.current);
                setActivityDemoNotice(
                  'Callback trễ/lặp của lượt đã hủy bị bỏ qua theo runId; không có nhóm nào được mở lại.',
                );
              }}
            >
              Mô phỏng callback trễ lượt cũ
            </Button>
          )}
          {recording && (
            <>
              <Button variant="ghost" onClick={onRecordError}>
                Mô phỏng lỗi ghi/lưu
              </Button>
              <Button
                variant="ghost"
                disabled={recording.status !== 'RECORDING'}
                onClick={onRecordNearLimit}
              >
                Mô phỏng còn 5 giây tới hạn 3 giờ
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={onDemoRevokeAccess}>
            Mô phỏng mất quyền kênh
          </Button>
          <label>
            Vai trò
            <select
              value={role}
              onChange={(event) => {
                const next = event.target.value as MeetingRole;
                setRole(next);
                setHostId(next === 'HOST' ? currentUserId : fallbackHostId);
                setOriginalHostId(next === 'HOST' ? currentUserId : fallbackHostId);
                setTemporaryHostId(null);
                setDemoActivityGroupId(
                  next === 'MEMBER' && activityRunning
                    ? (groups.find((group) => group.kind === 'activity')?.id ?? null)
                    : null,
                );
                resetComposerForScope(next === 'HOST' ? 'everyone' : 'host');
                setTool('cursor');
                returnToMain();
              }}
            >
              <option value="MEMBER">Thành viên</option>
              <option value="HOST">Host</option>
            </select>
          </label>
          <label>
            Nguồn phòng chung
            <select
              value={share}
              onChange={(event) => setShareScenario(event.target.value as ShareState)}
            >
              <option value="none">Nguồn trống</option>
              <option value="other">Người khác đang share</option>
              <option value="self">Mình đang share</option>
            </select>
          </label>
          <label>
            Kết nối
            <select
              value={connection}
              onChange={(event) => setConnection(event.target.value as ConnectionState)}
            >
              <option value="live">Ổn định</option>
              <option value="reconnecting">Đang kết nối lại</option>
              <option value="ended">Phiên đã kết thúc</option>
            </select>
          </label>
          {disconnectedIds.includes(originalHostId) ? (
            <Button variant="ghost" onClick={restoreOriginalHost}>
              Mô phỏng host gốc quay lại
            </Button>
          ) : (
            <Button variant="ghost" onClick={simulateHostDisconnect}>
              Mô phỏng host mất kết nối
            </Button>
          )}
          {temporaryHostId && (
            <Button variant="ghost" onClick={simulateHostDisconnect}>
              Mô phỏng host tạm mất kết nối
            </Button>
          )}
          {role === 'MEMBER' &&
            currentUserId !== originalHostId &&
            (inGroup || disconnectedIds.includes(currentUserId)) && (
              <Button variant="ghost" onClick={simulateCurrentMemberDisconnect}>
                {disconnectedIds.includes(currentUserId)
                  ? 'Mô phỏng kết nối lại'
                  : 'Mô phỏng mất kết nối'}
              </Button>
            )}
          {isActivity && currentGroup && members.some((m) => m.id === 'khoa') && (
            <Button
              variant="ghost"
              onClick={() =>
                setActivityShares((all) => ({
                  ...all,
                  [currentGroup.id]:
                    currentActivityShare?.state === 'other'
                      ? { state: 'none' }
                      : { state: 'other', ownerId: 'khoa' },
                }))
              }
            >
              Mô phỏng nguồn của Khoa
            </Button>
          )}
          {currentBoard?.frozen && inGroup && (
            <Button
              variant="ghost"
              onClick={() =>
                isActivity && currentGroup
                  ? setActivitySourcePages((pages) => ({
                      ...pages,
                      [currentGroup.id]: (pages[currentGroup.id] ?? 2) + 1,
                    }))
                  : setMainSourcePage((page) => page + 1)
              }
            >
              Mô phỏng nguồn sang trang
            </Button>
          )}
          {activeDiscussion?.memberIds.includes('khoa') && (
            <Button variant="ghost" onClick={() => toggleDiscussionPresence('khoa')}>
              Mô phỏng Khoa{' '}
              {(discussionPresence[activeDiscussion.id] ?? []).includes('khoa')
                ? 'rời nhóm'
                : 'vào nhóm'}
            </Button>
          )}
          {activityRunning && (
            <Button variant="ghost" onClick={() => setActivityRemaining(0)}>
              Mô phỏng hết giờ
            </Button>
          )}
        </DemoTools>
      </div>
      {recording && (
        <div
          role="status"
          style={{
            padding: '8px 18px',
            background: recording.status === 'FAILED' ? '#fff0ed' : '#e8f2ef',
            color: '#203c34',
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <strong>{recordingLabels[recording.status]}</strong>
          <span>{recordingTime(recording.elapsed)}</span>
          <span>
            {recording.error ??
              (inGroup
                ? 'Bản ghi vẫn ở Phòng chung. Không ghi hình, tiếng hoặc chat của nhóm này.'
                : 'Chỉ ghi màn hình, camera và âm thanh Phòng chung.')}
          </span>
          {recording.status === 'RECORDING' && recording.elapsed >= 10795 && (
            <span>
              Sắp đủ 3 giờ. Video sẽ tự dừng; cuộc gọi vẫn tiếp tục. Mốc cảnh báo đang được minh
              họa.
            </span>
          )}
        </div>
      )}
      <header className="meeting-header">
        <Button variant="ghost" icon="arrow-left" onClick={onWorkspace}>
          Workspace
        </Button>
        <div>
          <strong>{currentGroup?.name ?? channelName}</strong>
          <span>
            {currentGroup
              ? currentGroup.kind === 'discussion'
                ? 'Nhóm trao đổi'
                : 'Nhóm hoạt động'
              : 'Phòng chung'}{' '}
            ·{' '}
            {hostId
              ? `${temporaryHostId === hostId ? 'Host tạm' : 'Host'}: ${getMember(hostId).name}`
              : 'Chưa có host hợp lệ'}{' '}
            · {hasHostControls ? 'Bạn đang có quyền host' : 'Bạn là thành viên'}
          </span>
        </div>
        <div className="meeting-position">
          <span>
            <Icon name="mic" size={15} /> {micScope}
          </span>
        </div>
      </header>
      {supportGroupId && currentGroup && (
        <div className="support-banner">
          Host đang hỗ trợ {currentGroup.name} · Mic host chỉ phát tới nhóm này · Phải chủ động “Về
          phòng chung” trước khi bật Ưu tiên hướng dẫn
        </div>
      )}
      {guidanceVisibleToViewer && guidanceAnnouncement && (
        <div className="guidance-banner" role="status">
          <Icon name="volume" size={16} />
          <strong>{getMember(guidanceAnnouncement.hostId).name} đang ưu tiên hướng dẫn</strong>
          <span>Phạm vi: Phòng chung + nhóm trao đổi</span>
          <b>00:{guidanceAnnouncement.remaining.toString().padStart(2, '0')}</b>
          {guidanceAnnouncement.hostId === currentUserId && !mic && (
            <span className="guidance-mic-warning">
              Mic host đang tắt — tự bật mic khi muốn nói
            </span>
          )}
          <small>Chỉ báo mô phỏng, không phải bằng chứng cách ly âm thanh</small>
        </div>
      )}
      {activityStartState && (
        <div className={`activity-start-banner ${activityStartState.phase}`} role="status">
          <Icon name={activityStartState.phase === 'failed' ? 'info' : 'retry'} size={16} />
          <span>
            <strong>
              {activityStartState.phase === 'starting'
                ? 'Đang bắt đầu hoạt động…'
                : activityStartState.phase === 'cleaning'
                  ? 'Đang hủy lượt khởi tạo dở…'
                  : 'Hoạt động chưa bắt đầu được'}
            </strong>
            {activityStartState.detail}
          </span>
          {activityStartState.transferredMemberIds.length > 0 && (
            <small>
              {activityStartState.phase === 'starting'
                ? 'Đã chuyển một phần: '
                : activityStartState.phase === 'cleaning'
                  ? 'Đang đưa về MAIN: '
                  : 'Đã về MAIN: '}
              {activityStartState.transferredMemberIds.map((id) => getMember(id).name).join(', ')}
              {activityStartState.phase === 'starting'
                ? '. Lượt chưa hoàn tất.'
                : activityStartState.phase === 'cleaning'
                  ? '. Mic sẽ được pause; camera giữ trạng thái.'
                  : '. Mic đã pause; camera giữ trạng thái.'}
            </small>
          )}
        </div>
      )}
      {activityDemoNotice && (
        <div className="activity-demo-notice" role="status">
          Tình huống demo · {activityDemoNotice}
        </div>
      )}
      {!inGroup && mainNotice && (
        <div className="main-return-notice">
          {mainNotice}
          <button onClick={() => setMainNotice(null)} aria-label="Đóng thông báo">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      {inGroup && (
        <div className="group-context-bar">
          <span>
            {isDiscussion
              ? 'Đang theo dõi bài giảng phòng chung'
              : 'Đang làm việc độc lập với Phòng chung'}
          </span>
          {activityRunning && isActivity && (
            <strong>
              {Math.floor(activityRemaining / 60)
                .toString()
                .padStart(2, '0')}
              :{(activityRemaining % 60).toString().padStart(2, '0')}
            </strong>
          )}
          <span>{micScope}</span>
        </div>
      )}
      {connection === 'reconnecting' && (
        <div className="connection-banner">
          <Icon name="wifi" />
          Mất kết nối · Đang thử kết nối lại… Mic và camera vẫn giữ trạng thái tắt/bật hiện tại.
        </div>
      )}
      {connection === 'ended' ? (
        <main className="ended-state">
          <div>
            <Icon name="phone" size={28} />
          </div>
          <h1>Phiên học đã kết thúc</h1>
          <p>Cuộc họp mô phỏng không còn hoạt động. Bạn có thể quay lại kênh Phòng học.</p>
          <Button variant="primary" onClick={onEnd}>
            Quay lại Workspace
          </Button>
        </main>
      ) : (
        <div className="meeting-body">
          <main className="meeting-stage">
            <div className={`media-layout ${!hasVisibleSource ? 'camera-layout' : 'share-layout'}`}>
              {!hasVisibleSource ? (
                inGroup ? (
                  <>
                    <div className="group-empty-source">
                      <Icon name="screen" size={28} />
                      <strong>Chưa có nguồn chia sẻ</strong>
                      <p>
                        {isDiscussion
                          ? 'Bài giảng phòng chung hiện chưa có nguồn hình.'
                          : 'Một thành viên trong nhóm có thể bắt đầu chia sẻ.'}
                      </p>
                    </div>
                    <aside className="camera-rail">
                      {roomMembers.slice(0, 4).map((member) => (
                        <div className="rail-tile" key={member.id}>
                          <div>
                            <Avatar member={member} size="md" />
                          </div>
                          <span>
                            {member.id === currentUserId ? 'Bạn' : member.name}
                            {member.id === hostId
                              ? temporaryHostId === hostId
                                ? ' · Host tạm'
                                : ' · Host'
                              : ''}
                          </span>
                        </div>
                      ))}
                    </aside>
                  </>
                ) : (
                  <div className="camera-grid">
                    {roomMembers.map((member, index) => (
                      <div className={`camera-tile tile-${index}`} key={member.id}>
                        <div className="camera-surface">
                          <Avatar member={member} size="lg" />
                        </div>
                        <span>
                          {member.id === currentUserId ? 'Bạn' : member.name}
                          {member.id === hostId
                            ? temporaryHostId === hostId
                              ? ' · Host tạm'
                              : ' · Host'
                            : ''}
                        </span>
                        {index === 3 && <small>Camera tắt</small>}
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <>
                  <section
                    className={`shared-content ${
                      (inGroup ? currentBoard?.frozen : hasHostControls) && tool === 'pen'
                        ? 'drawing-active'
                        : ''
                    }`}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest('.board-toolbar')) return;
                      if (tool !== 'pen') return;
                      const rect = event.currentTarget.getBoundingClientRect();
                      const x = ((event.clientX - rect.left) / rect.width) * 100;
                      const y = ((event.clientY - rect.top) / rect.height) * 100;
                      if (inGroup && currentBoard?.frozen) addGroupStroke(x, y);
                      else if (!inGroup && hasHostControls) addStroke(x, y);
                    }}
                  >
                    <div className="share-status">
                      <span className={currentBoard?.frozen ? 'freeze-dot' : 'live-dot'} />
                      {currentBoard?.frozen
                        ? 'Nhóm đang xem ảnh đã dừng · Âm thanh vẫn tiếp tục'
                        : visibleShare === 'other'
                          ? `${
                              isActivity ? getMember('khoa').name : getMember(fallbackHostId).name
                            } đang chia sẻ · Trực tiếp`
                          : 'Bạn đang chia sẻ · Trực tiếp'}
                    </div>
                    {currentBoard?.frozen && liveSourcePage !== currentBoard.page && (
                      <div className="live-page-note">
                        Nguồn trực tiếp đã sang trang {liveSourcePage}
                      </div>
                    )}
                    <div className="lecture-slide">
                      <span>{isActivity ? currentGroup?.name : 'CÔNG NGHỆ WEB · NHÓM 5'}</span>
                      <h2>
                        Trang {currentBoard?.frozen ? currentBoard.page : liveSourcePage} ·{' '}
                        {currentBoard?.frozen
                          ? 'Ảnh nhóm đang phân tích'
                          : 'Nội dung đang trực tiếp'}
                      </h2>
                      <div className="slide-flow">
                        <b>Trình duyệt</b>
                        <i />
                        <b>Máy chủ</b>
                        <i />
                        <b>Cơ sở dữ liệu</b>
                      </div>
                      <p>Request → Router → Controller → Response</p>
                    </div>
                    <div className="drawing-layer">
                      {(inGroup ? (currentBoard?.strokes ?? []) : strokes).map((stroke) => (
                        <span
                          key={stroke.id}
                          className={stroke.ephemeral ? 'ephemeral-stroke' : ''}
                          style={{
                            left: `${stroke.x}%`,
                            top: `${stroke.y}%`,
                            backgroundColor: stroke.color,
                          }}
                        />
                      ))}
                    </div>
                    {!inGroup && hasHostControls && (
                      <div className="board-toolbar">
                        <IconButton
                          label="Con trỏ"
                          icon="cursor"
                          active={tool === 'cursor'}
                          onClick={() => setTool('cursor')}
                        />
                        <IconButton
                          label="Bút vẽ trực tiếp"
                          icon="pen"
                          active={tool === 'pen'}
                          onClick={() => setTool('pen')}
                        />
                        <label title="Màu bút">
                          <span className="sr-only">Màu bút</span>
                          <input
                            type="color"
                            value={color}
                            onChange={(event) => setColor(event.target.value)}
                          />
                        </label>
                        <button
                          className={ephemeralInk ? 'ink-mode active' : 'ink-mode'}
                          onClick={() => setEphemeralInk(!ephemeralInk)}
                          title="Nét tự biến mất sau 6 giây trong bản demo"
                        >
                          <span />
                          Tự ẩn
                        </button>
                        <IconButton
                          label="Hoàn tác nét gần nhất của tôi"
                          icon="undo"
                          disabled={!strokes.some((stroke) => stroke.ownerId === currentUserId)}
                          onClick={undoOwnStroke}
                        />
                        <IconButton
                          label="Xóa toàn bộ nét"
                          icon="trash"
                          disabled={!strokes.length}
                          onClick={() => setClearConfirm(true)}
                        />
                      </div>
                    )}
                    {inGroup && currentBoard?.frozen && (
                      <div className="board-toolbar">
                        <IconButton
                          label="Con trỏ"
                          icon="cursor"
                          active={tool === 'cursor'}
                          onClick={() => setTool('cursor')}
                        />
                        <IconButton
                          label="Bút vẽ trong nhóm"
                          icon="pen"
                          active={tool === 'pen'}
                          onClick={() => setTool('pen')}
                        />
                        <label title="Màu bút">
                          <span className="sr-only">Màu bút</span>
                          <input
                            type="color"
                            value={color}
                            onChange={(event) => setColor(event.target.value)}
                          />
                        </label>
                        <IconButton
                          label="Hoàn tác nét gần nhất của tôi"
                          icon="undo"
                          disabled={
                            !currentBoard.strokes.some((stroke) => stroke.ownerId === currentUserId)
                          }
                          onClick={undoGroupStroke}
                        />
                        {currentBoard.frozenBy === currentUserId && (
                          <IconButton
                            label="Xóa toàn bộ nét của nhóm"
                            icon="trash"
                            disabled={!currentBoard.strokes.length}
                            onClick={() => setClearConfirm(true)}
                          />
                        )}
                      </div>
                    )}
                  </section>
                  <aside className="camera-rail">
                    {cameraMembers.slice(0, 4).map((member, index) => (
                      <div className="rail-tile" key={member.id}>
                        <div>
                          <Avatar member={member} size="md" />
                        </div>
                        <span>
                          {member.id === currentUserId ? 'Bạn' : member.name}
                          {member.id === hostId
                            ? temporaryHostId === hostId
                              ? ' · Host tạm'
                              : ' · Host'
                            : ''}
                        </span>
                        {index === 2 && <small>Camera tắt</small>}
                      </div>
                    ))}
                  </aside>
                </>
              )}
            </div>
            {inGroup && !currentBoard?.frozen && visibleShare !== 'none' && (
              <div className="share-actions">
                <Button
                  variant="secondary"
                  onClick={() =>
                    currentGroup &&
                    updateGroupBoard(currentGroup.id, (board) => ({
                      ...board,
                      frozen: true,
                      frozenBy: currentUserId,
                      page: liveSourcePage,
                      strokes: [],
                    }))
                  }
                >
                  Tạm dừng hình của nhóm
                </Button>
                {isActivity && visibleShare === 'self' && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      currentGroup &&
                      setActivityShares((all) => ({
                        ...all,
                        [currentGroup.id]: { state: 'none' },
                      }))
                    }
                  >
                    Dừng chia sẻ
                  </Button>
                )}
              </div>
            )}
            {inGroup && currentBoard?.frozen && (
              <div className="share-actions">
                <Button
                  variant="primary"
                  onClick={() =>
                    currentGroup &&
                    updateGroupBoard(currentGroup.id, (board) => ({
                      ...board,
                      frozen: false,
                      frozenBy: null,
                      strokes: [],
                    }))
                  }
                >
                  Cho nhóm trở lại trực tiếp
                </Button>
                {isActivity && visibleShare === 'self' && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      currentGroup &&
                      setActivityShares((all) => ({
                        ...all,
                        [currentGroup.id]: { state: 'none' },
                      }))
                    }
                  >
                    Dừng nguồn chia sẻ
                  </Button>
                )}
              </div>
            )}
            {!inGroup && share === 'self' && (
              <div className="share-actions">
                <Button variant="secondary" onClick={stopShare}>
                  Dừng chia sẻ
                </Button>
              </div>
            )}
            <div className="local-volume">
              <label>
                <Icon name="volume" size={15} />
                {audioViewerIsDiscussion ? 'Tiếng giảng' : 'Âm lượng cuộc họp'}
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={meetingVolume}
                  onChange={(event) => setMeetingVolume(Number(event.target.value))}
                />
                <span>{meetingVolume}%</span>
                <button
                  type="button"
                  className={meetingMuted ? 'volume-muted' : ''}
                  onClick={() => setMeetingMuted((value) => !value)}
                  aria-label={meetingMuted ? 'Bật tiếng giảng' : 'Tắt tiếng giảng'}
                >
                  {meetingMuted ? 'Đang tắt tiếng' : 'Tắt tiếng'}
                </button>
              </label>
              {audioViewerIsDiscussion && (
                <label>
                  <Icon name="users" size={15} />
                  Trao đổi nhóm
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={shareVolume}
                    onChange={(event) => setShareVolume(Number(event.target.value))}
                  />
                  <span>{shareVolume}%</span>
                  <button
                    type="button"
                    className={discussionMuted ? 'volume-muted' : ''}
                    onClick={() => setDiscussionMuted((value) => !value)}
                    aria-label={
                      discussionMuted ? 'Bật tiếng trao đổi nhóm' : 'Tắt tiếng trao đổi nhóm'
                    }
                  >
                    {discussionMuted ? 'Đang tắt tiếng' : 'Tắt tiếng'}
                  </button>
                </label>
              )}
              <small>
                {discussionBusIsReduced
                  ? discussionMuted
                    ? `Trao đổi vẫn tắt tiếng theo lựa chọn · gain minh họa ${illustrativeDiscussionGain}% không đổi slider`
                    : `Trao đổi đang giảm tạm thời · gain minh họa ${illustrativeDiscussionGain}% · slider vẫn ${shareVolume}%`
                  : 'Chỉ ảnh hưởng âm thanh bạn đang nghe; preference được giữ nguyên'}
              </small>
            </div>
            <nav className="meeting-controls" aria-label="Điều khiển cuộc họp">
              <div className="control-main">
                <button
                  className={!mic ? 'control-off' : ''}
                  onClick={() => setMic(!mic)}
                  title={mic ? 'Tắt mic' : 'Bật mic'}
                  aria-label={mic ? 'Tắt mic' : 'Bật mic'}
                >
                  <Icon name="mic" />
                  <span>{mic ? 'Mic bật' : 'Mic tắt'}</span>
                </button>
                <button
                  className={!camera ? 'control-off' : ''}
                  onClick={() => setCamera(!camera)}
                  title={camera ? 'Tắt camera' : 'Bật camera'}
                  aria-label={camera ? 'Tắt camera' : 'Bật camera'}
                >
                  <Icon name="video" />
                  <span>{camera ? 'Camera bật' : 'Camera tắt'}</span>
                </button>
                {!isDiscussion && (
                  <button
                    disabled={inGroup ? visibleShare === 'other' : share === 'other'}
                    className={visibleShare === 'self' ? 'control-active' : ''}
                    onClick={() => {
                      if (visibleShare === 'self') {
                        if (isActivity && currentGroup)
                          setActivityShares((all) => ({
                            ...all,
                            [currentGroup.id]: { state: 'none' },
                          }));
                        else stopShare();
                      } else setShareDialog(true);
                    }}
                    title={
                      visibleShare === 'other'
                        ? 'Một thành viên đang chia sẻ — chờ nguồn dừng'
                        : 'Chia sẻ màn hình'
                    }
                  >
                    <Icon name="screen" />
                    <span>{visibleShare === 'self' ? 'Dừng share' : 'Chia sẻ'}</span>
                  </button>
                )}
                {inGroup && (
                  <button
                    className="return-main-control"
                    onClick={() => returnToMain()}
                    title="Chỉ bạn trở về Phòng chung"
                  >
                    <Icon name="arrow-left" />
                    <span>Về phòng chung</span>
                  </button>
                )}
              </div>
              <div className="control-side">
                {hasHostControls && !inGroup && (
                  <Button
                    className={guidanceAnnouncement ? 'guidance-control-active' : ''}
                    title={
                      guidanceAnnouncement
                        ? 'Dừng ưu tiên hướng dẫn chung'
                        : 'Ưu tiên tối đa 30 giây trong Phòng chung và nhóm trao đổi'
                    }
                    onClick={() => {
                      if (!hasHostControls || inGroup) return;
                      setGuidanceAnnouncement((current) =>
                        current ? null : { hostId, remaining: 30 },
                      );
                    }}
                  >
                    {guidanceAnnouncement ? 'Dừng ưu tiên' : 'Ưu tiên hướng dẫn'}
                  </Button>
                )}
                {hasHostControls &&
                  !inGroup &&
                  (recording &&
                  (recording.status === 'STARTING' || recording.status === 'RECORDING') ? (
                    <Button
                      onClick={() => {
                        if (hasHostControls && !inGroup) onRecordStop();
                      }}
                    >
                      {recording.status === 'STARTING' ? 'Hủy khởi động ghi' : 'Dừng ghi hình'}
                    </Button>
                  ) : (
                    <Button
                      disabled={recordingBusy}
                      title={
                        recordingBusy
                          ? 'Đang dừng hoặc xử lý một bản ghi. Chờ hoàn tất trước khi ghi tiếp.'
                          : 'Ghi nội dung Phòng chung'
                      }
                      onClick={() => {
                        if (hasHostControls && !inGroup && !recordingBusy) onRecordStart();
                      }}
                    >
                      Ghi hình Phòng chung
                    </Button>
                  ))}
                <button
                  className={panel === 'groups' ? 'control-active' : ''}
                  onClick={() => setPanel(panel === 'groups' ? null : 'groups')}
                  title="Nhóm"
                >
                  <Icon name="users" />
                  <span>Nhóm</span>
                </button>
                <button
                  className={panel === 'people' ? 'control-active' : ''}
                  onClick={() => setPanel(panel === 'people' ? null : 'people')}
                  title="Người tham gia"
                >
                  <Icon name="users" />
                  <span>{roomMembers.length}</span>
                </button>
                <button
                  className={panel === 'chat' ? 'control-active' : ''}
                  onClick={() => setPanel(panel === 'chat' ? null : 'chat')}
                  title="Chat cuộc họp"
                >
                  <Icon name="message" />
                </button>
                <button className="leave-control" onClick={leave} title="Rời cuộc họp">
                  <Icon name="phone" />
                  <span>Rời</span>
                </button>
              </div>
            </nav>
          </main>
          {panel && (
            <aside className="meeting-panel">
              <header>
                <div>
                  <h2>
                    {panel === 'chat'
                      ? 'Chat cuộc họp'
                      : panel === 'people'
                        ? 'Người tham gia'
                        : 'Nhóm'}
                  </h2>
                  <span>
                    {panel === 'chat'
                      ? `Chat: ${getMember(chatViewerId).name} · ${chatViewerGroup?.name ?? 'Phòng chung'}`
                      : panel === 'people'
                        ? `${roomMembers.length} người trong phòng hiện tại`
                        : hasHostControls
                          ? 'Quản lý nhóm trong cuộc họp'
                          : 'Yêu cầu và nhóm của bạn'}
                  </span>
                </div>
                <IconButton label="Đóng panel" icon="close" onClick={() => setPanel(null)} />
              </header>
              {panel === 'chat' ? (
                <>
                  <div className="meeting-chat-list">
                    {visibleMessages.map((message) => (
                      <div className="meeting-chat-message" key={message.id}>
                        <Avatar member={getMember(message.authorId)} size="sm" />
                        <div className="meeting-chat-content">
                          <div className="meeting-chat-meta">
                            <strong>{getMember(message.authorId).name}</strong>
                            <span>
                              {message.target === 'everyone'
                                ? chatViewerGroup
                                  ? 'Mọi người trong nhóm'
                                  : 'Mọi người trong Phòng chung'
                                : message.authorId === chatViewerId
                                  ? message.target === 'host'
                                    ? `Gửi riêng cho ${getMember(message.privateHostId ?? '').name}`
                                    : `Gửi riêng cho ${getMember(message.target).name}`
                                  : message.target === 'host'
                                    ? `Gửi riêng cho ${getMember(message.privateHostId ?? '').name}`
                                    : `${getMember(message.privateHostId ?? '').name} trả lời riêng cho bạn`}
                            </span>
                          </div>
                          {message.text && <p>{message.text}</p>}
                          {message.imageUrl && (
                            <img src={message.imageUrl} alt={`Ảnh ${message.imageName}`} />
                          )}
                          {chatViewerIsHost &&
                            message.target === 'host' &&
                            message.privateHostId === chatViewerId && (
                              <button
                                onClick={() => {
                                  if (!chatViewerIsHost) return;
                                  setPrivateReplyId(message.authorId);
                                  setChatTarget(`member:${message.authorId}`);
                                  setChatDraft('');
                                  setChatImage(null);
                                }}
                              >
                                Trả lời riêng {getMember(message.authorId).name}
                              </button>
                            )}
                          {hasHostControls &&
                            chatViewerId === currentUserId &&
                            message.target === 'host' &&
                            message.privateHostId === hostId &&
                            message.roomId &&
                            groups.some(
                              (group) => group.id === message.roomId && group.kind === 'activity',
                            ) && (
                              <button
                                onClick={() =>
                                  chatViewerIsHost && enterGroup(message.roomId!, true)
                                }
                              >
                                Vào hỗ trợ{' '}
                                {groups.find((group) => group.id === message.roomId)?.name}
                              </button>
                            )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="meeting-chat-composer">
                    <label>
                      Gửi đến
                      <select
                        value={chatTarget}
                        onChange={(event) => {
                          const target = event.target.value;
                          setChatTarget(target);
                          setPrivateReplyId(
                            target.startsWith('member:') ? target.replace('member:', '') : null,
                          );
                          setChatDraft('');
                          setChatImage(null);
                        }}
                      >
                        <option value="everyone">
                          {chatViewerGroup ? 'Mọi người trong nhóm' : 'Mọi người trong Phòng chung'}
                        </option>
                        {!chatViewerIsHost && (
                          <option value="host">
                            {hasValidHost
                              ? `Host ${getMember(hostId).name} — riêng tư`
                              : 'Chưa có host hợp lệ — riêng tư'}
                          </option>
                        )}
                        {chatViewerIsHost &&
                          privateConversationIds.map((memberId) => (
                            <option key={memberId} value={`member:${memberId}`}>
                              {getMember(memberId).name} — trả lời riêng
                            </option>
                          ))}
                        {!chatViewerIsHost &&
                          historicalPrivateConversationIds.map((memberId) => (
                            <option key={`history-${memberId}`} value={`history:${memberId}`}>
                              {getMember(memberId).name} — lịch sử khi bạn là host
                            </option>
                          ))}
                        {senderHistoricalHostIds.map((oldHostId) => (
                          <option
                            key={`sender-history-${oldHostId}`}
                            value={`sender-history:${oldHostId}`}
                          >
                            Host {getMember(oldHostId).name} — lịch sử cặp cũ
                          </option>
                        ))}
                      </select>
                    </label>
                    <p>
                      {chatTargetIsReadOnlyHistory
                        ? 'Lịch sử chỉ đọc của cặp riêng cũ. Quyền host và quyền trả lời không được giữ lại.'
                        : chatTarget === 'host'
                          ? hasValidHost
                            ? `Tin riêng chỉ gửi tới host hiện hành: ${getMember(hostId).name}.`
                            : 'Chưa có host hợp lệ. Bạn không thể gửi tin riêng.'
                          : 'Kiểm tra lại người nhận trước khi gửi. Bản nháp được xóa khi đổi đích.'}
                    </p>
                    {chatImage && (
                      <div className="meeting-image-preview">
                        <img src={chatImage.url} alt="" />
                        <span>{chatImage.name}</span>
                        <IconButton
                          label="Bỏ ảnh"
                          icon="close"
                          onClick={() => setChatImage(null)}
                        />
                      </div>
                    )}
                    <div>
                      <textarea
                        rows={2}
                        value={chatDraft}
                        onChange={(event) => setChatDraft(event.target.value)}
                        disabled={chatTargetIsReadOnlyHistory || failedActivityChatLocked}
                        placeholder={`Nhắn tới ${
                          chatTarget === 'everyone' ? 'mọi người' : 'cuộc trò chuyện riêng'
                        }…`}
                      />
                      <input
                        ref={chatImageInput}
                        className="sr-only"
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file)
                            setChatImage({
                              name: file.name,
                              url: URL.createObjectURL(file),
                            });
                        }}
                      />
                      <IconButton
                        label="Thêm ảnh"
                        icon="image"
                        disabled={chatTargetIsReadOnlyHistory || failedActivityChatLocked}
                        onClick={() => chatImageInput.current?.click()}
                      />
                      <button
                        onClick={sendChat}
                        disabled={
                          (!chatDraft.trim() && !chatImage) ||
                          (chatTarget === 'host' && !hasValidHost) ||
                          chatTargetIsReadOnlyHistory ||
                          failedActivityChatLocked
                        }
                        aria-label="Gửi tin nhắn"
                      >
                        <Icon name="send" size={16} />
                      </button>
                    </div>
                    <small>Chỉ hỗ trợ text và ảnh trong prototype</small>
                  </div>
                </>
              ) : panel === 'people' ? (
                <div className="participant-list">
                  {roomMembers.map((member) => (
                    <div key={member.id}>
                      <Avatar member={member} size="sm" />
                      <span>
                        <strong>
                          {member.name}
                          {member.id === currentUserId && ' (Bạn)'}
                        </strong>
                        <small>
                          {member.id === hostId
                            ? temporaryHostId === hostId
                              ? 'Host tạm'
                              : 'Host'
                            : (currentGroup?.name ?? 'Phòng chung')}
                        </small>
                      </span>
                      <span className="participant-media">
                        <Icon name="mic" size={14} />
                        <Icon name="video" size={14} />
                      </span>
                      {hasHostControls && !inGroup && member.id !== currentUserId && (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            if (!hasHostControls) return;
                            setHostId(member.id);
                            setOriginalHostId(member.id);
                            setTemporaryHostId(null);
                            setRole('MEMBER');
                            setChatTarget('host');
                            setPrivateReplyId(null);
                            setChatDraft('');
                            setChatImage(null);
                            setTool('cursor');
                          }}
                        >
                          Gán host
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="groups-panel-content">
                  {!hasHostControls ? (
                    <>
                      {(activityRunning || activityTransitionBusy) && (
                        <div className="group-lock-note">
                          <Icon name="info" />
                          <span>
                            <strong>
                              {activityTransitionBusy
                                ? 'Đang xử lý lượt hoạt động'
                                : 'Đang trong lượt hoạt động nhóm'}
                            </strong>
                            Không thể tạo hoặc vào nhóm trao đổi mới cho đến khi xử lý hoàn tất.
                          </span>
                        </div>
                      )}
                      {!activityRunning && !activityTransitionBusy && !discussionRequest && (
                        <div className="group-request-form">
                          <h3>Tạo nhóm trao đổi</h3>
                          <label>
                            Tên nhóm <span>{discussionForm.name.length}/80</span>
                            <input
                              maxLength={80}
                              value={discussionForm.name}
                              onChange={(event) =>
                                setDiscussionForm((form) => ({
                                  ...form,
                                  name: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label>
                            Mục đích <span>{discussionForm.purpose.length}/500</span>
                            <textarea
                              maxLength={500}
                              rows={4}
                              value={discussionForm.purpose}
                              onChange={(event) =>
                                setDiscussionForm((form) => ({
                                  ...form,
                                  purpose: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <fieldset>
                            <legend>Người được vào nhóm</legend>
                            {members.map((member) => (
                              <label key={member.id}>
                                <input
                                  type="checkbox"
                                  disabled={member.id === currentUserId}
                                  checked={discussionForm.memberIds.includes(member.id)}
                                  onChange={() =>
                                    setDiscussionForm((form) => ({
                                      ...form,
                                      memberIds: form.memberIds.includes(member.id)
                                        ? form.memberIds.filter((id) => id !== member.id)
                                        : [...form.memberIds, member.id],
                                    }))
                                  }
                                />
                                <Avatar member={member} size="sm" />
                                {member.name}
                                {member.id === currentUserId && ' (Bạn)'}
                              </label>
                            ))}
                          </fieldset>
                          <Button
                            variant="primary"
                            disabled={!discussionForm.name.trim() || !discussionForm.purpose.trim()}
                            onClick={createDiscussion}
                          >
                            Tạo nhóm ngay
                          </Button>
                        </div>
                      )}
                      {discussionRequest?.status === 'approved' && activeDiscussion && (
                        <div className="approved-group">
                          <span>
                            {(discussionPresence[activeDiscussion.id] ?? []).length === 0
                              ? 'Chưa có người vào nhóm'
                              : 'Nhóm trao đổi đang mở'}
                          </span>
                          <h3>{discussionRequest.name}</h3>
                          <p>{discussionRequest.purpose}</p>
                          <div className="group-counts">
                            <strong>
                              {(discussionPresence[activeDiscussion.id] ?? []).length} người đang
                              trong nhóm
                            </strong>
                            <span>{discussionRequest.memberIds.length} người được vào nhóm</span>
                          </div>
                          {discussionRequest.memberIds.includes(currentUserId) &&
                            roomId !== activeDiscussion.id && (
                              <Button
                                variant="primary"
                                onClick={() => enterGroup(activeDiscussion.id)}
                              >
                                Vào nhóm
                              </Button>
                            )}
                        </div>
                      )}
                      {activityRunning &&
                        groups
                          .filter(
                            (group) =>
                              group.kind === 'activity' &&
                              (group.memberIds.includes(currentUserId) ||
                                group.id === demoActivityGroupId),
                          )
                          .map((group) => (
                            <div className="approved-group" key={group.id}>
                              <span>Nhóm hoạt động của bạn</span>
                              <h3>{group.name}</h3>
                              <p>Còn {Math.ceil(activityRemaining / 60)} phút</p>
                              <Button variant="primary" onClick={() => enterGroup(group.id)}>
                                Vào nhóm
                              </Button>
                            </div>
                          ))}
                    </>
                  ) : (
                    <>
                      {groups
                        .filter((group) => group.kind === 'discussion')
                        .map((group) => (
                          <div className="host-group-row" key={group.id}>
                            <div>
                              <span>
                                {(discussionPresence[group.id] ?? []).length === 0
                                  ? 'Chưa có người vào nhóm'
                                  : 'Nhóm trao đổi đang mở'}
                              </span>
                              <strong>{group.name}</strong>
                              <small>
                                {(discussionPresence[group.id] ?? []).length} người trong nhóm ·{' '}
                                {group.memberIds.length} người được vào nhóm
                              </small>
                            </div>
                            <div className="host-group-actions">
                              <Button
                                variant="ghost"
                                onClick={() => hasHostControls && setEndDiscussionTarget(group.id)}
                              >
                                Kết thúc
                              </Button>
                            </div>
                          </div>
                        ))}
                      {groups.filter((group) => group.kind === 'discussion').length > 1 && (
                        <Button
                          variant="danger"
                          onClick={() => hasHostControls && setEndDiscussionTarget('all')}
                        >
                          Kết thúc tất cả nhóm trao đổi
                        </Button>
                      )}
                      {!activityRunning && !activityTransitionBusy && (
                        <Button
                          variant="primary"
                          icon="plus"
                          onClick={() => {
                            if (!hasHostControls) return;
                            setActivityOpen(true);
                          }}
                        >
                          {activityStartState?.phase === 'failed'
                            ? 'Xem lại cấu hình và thử lại'
                            : 'Tổ chức hoạt động nhóm'}
                        </Button>
                      )}
                      {activityTransitionBusy && (
                        <div className="activity-summary pending">
                          <strong>
                            {activityStartState?.phase === 'cleaning'
                              ? 'Đang hủy và dọn lượt dở'
                              : 'Đang bắt đầu — chưa hoàn tất'}
                          </strong>
                          <span>Đã khóa thao tác nhóm</span>
                        </div>
                      )}
                      {activityRunning && (
                        <>
                          <div className="activity-summary">
                            <strong>Hoạt động đang diễn ra</strong>
                            <span>
                              {Math.floor(activityRemaining / 60)
                                .toString()
                                .padStart(2, '0')}
                              :{(activityRemaining % 60).toString().padStart(2, '0')}
                            </span>
                          </div>
                          {groups
                            .filter((group) => group.kind === 'activity')
                            .map((group) => (
                              <div className="host-group-row" key={group.id}>
                                <div>
                                  <span>Nhóm hoạt động</span>
                                  <strong>{group.name}</strong>
                                  <small>{group.memberIds.length} thành viên</small>
                                </div>
                                <Button
                                  onClick={() => hasHostControls && enterGroup(group.id, true)}
                                >
                                  Vào hỗ trợ
                                </Button>
                              </div>
                            ))}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </aside>
          )}
        </div>
      )}
      {shareDialog && (
        <Dialog
          title="Chọn màn hình để chia sẻ"
          description="Chỉ mô phỏng lựa chọn, không mở trình chọn màn hình của trình duyệt."
          onClose={() => setShareDialog(false)}
          footer={
            <>
              <Button onClick={() => setShareDialog(false)}>Hủy</Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (isActivity && currentGroup)
                    setActivityShares((all) => ({
                      ...all,
                      [currentGroup.id]: {
                        state: 'self',
                        ownerId: currentUserId,
                      },
                    }));
                  else setShareScenario('self');
                  setShareDialog(false);
                }}
              >
                Bắt đầu chia sẻ
              </Button>
            </>
          }
        >
          <button className="screen-choice">
            <span>
              <Icon name="screen" size={24} />
            </span>
            <strong>Toàn bộ màn hình</strong>
            <small>Màn hình 1 · Xem trước mô phỏng</small>
            <Icon name="check" />
          </button>
        </Dialog>
      )}
      {clearConfirm && (inGroup || hasHostControls) && (
        <Dialog
          title="Xóa toàn bộ nét vẽ?"
          description={`Thao tác này xóa các nét vẽ hiện tại với mọi người trong ${currentGroup?.name ?? 'Phòng chung'}.`}
          onClose={() => setClearConfirm(false)}
          footer={
            <>
              <Button onClick={() => setClearConfirm(false)}>Hủy</Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (currentGroup)
                    updateGroupBoard(currentGroup.id, (board) => ({
                      ...board,
                      strokes: [],
                    }));
                  else if (hasHostControls) setStrokes([]);
                  setClearConfirm(false);
                }}
              >
                Xóa toàn bộ
              </Button>
            </>
          }
        >
          <div className="privacy-note">
            <Icon name="info" />
            <span>
              <strong>Không thể khôi phục sau khi xóa toàn bộ nét.</strong>Nội dung share và âm
              thanh vẫn tiếp tục.
            </span>
          </div>
        </Dialog>
      )}
      {endDiscussionTarget && hasHostControls && (
        <Dialog
          title={
            endDiscussionTarget === 'all'
              ? 'Kết thúc tất cả nhóm trao đổi?'
              : 'Kết thúc nhóm trao đổi?'
          }
          description="Thành viên trong nhóm bị tác động sẽ được đưa về Phòng chung với mic tạm tắt."
          onClose={() => setEndDiscussionTarget(null)}
          footer={
            <>
              <Button onClick={() => setEndDiscussionTarget(null)}>Hủy</Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (!hasHostControls) return;
                  endDiscussionGroups(endDiscussionTarget);
                  setEndDiscussionTarget(null);
                }}
              >
                Xác nhận kết thúc
              </Button>
            </>
          }
        >
          <div className="privacy-note">
            <Icon name="users" />
            <span>
              <strong>
                {groups
                  .filter(
                    (group) =>
                      group.kind === 'discussion' &&
                      (endDiscussionTarget === 'all' || group.id === endDiscussionTarget),
                  )
                  .map((group) => group.name)
                  .join(', ')}
              </strong>
              Board và chat riêng không được mang về Phòng chung.
            </span>
          </div>
        </Dialog>
      )}
      {activityOpen && hasHostControls && (
        <Dialog
          title="Tổ chức hoạt động nhóm"
          description="Chuẩn bị các nhóm và thời lượng chung. Thành viên chỉ được chuyển khi bắt đầu."
          onClose={() => setActivityOpen(false)}
          footer={
            <>
              <Button onClick={() => setActivityOpen(false)}>Hủy</Button>
              <Button
                variant="primary"
                disabled={!activityDraftValid || !activityRosterValid || activityTransitionBusy}
                onClick={() => {
                  if (
                    !hasHostControls ||
                    !activityDraftValid ||
                    !activityRosterValid ||
                    activityTransitionBusy
                  )
                    return;
                  if (groups.some((group) => group.kind === 'discussion')) {
                    setActivityOpen(false);
                    setActivityConfirm(true);
                  } else startActivity();
                }}
              >
                Bắt đầu hoạt động
              </Button>
            </>
          }
        >
          <div className="activity-setup">
            {!activityDraftValid && (
              <p role="status" className="privacy-note">
                Mỗi nhóm cần ít nhất một thành viên hợp lệ. Hãy bổ sung người, đổi phân nhóm hoặc
                giảm số nhóm.
              </p>
            )}
            <p className="activity-demo-timing">
              Tình huống demo giữ các trạng thái chuyển tiếp đủ lâu để review; thời gian chờ này
              không phải timeout hoặc SLA sản phẩm.
            </p>
            <div className="activity-basics">
              <label>
                Thời lượng chung (phút)
                <input
                  type="number"
                  min={1}
                  max={120}
                  step={1}
                  value={activityDuration}
                  onChange={(event) =>
                    setActivityDuration(
                      Math.min(120, Math.max(1, Math.round(Number(event.target.value) || 1))),
                    )
                  }
                />
              </label>
              <label>
                Số nhóm
                <select
                  value={activityGroupCount}
                  onChange={(event) => {
                    const count = Number(event.target.value);
                    setActivityGroupCount(count);
                    setActivityGroupNames((names) =>
                      Array.from(
                        { length: count },
                        (_, index) => names[index] ?? `Nhóm ${index + 1}`,
                      ),
                    );
                    setActivityAssignments((all) =>
                      Object.fromEntries(
                        activitySelectedIds.map((id, index) => [
                          id,
                          Number(all[id]?.split('-').at(-1)) <= count
                            ? all[id]
                            : `activity-${(index % count) + 1}`,
                        ]),
                      ),
                    );
                  }}
                >
                  <option value={2}>2 nhóm</option>
                  <option value={3}>3 nhóm</option>
                  <option value={4}>4 nhóm</option>
                </select>
              </label>
            </div>
            <div className="division-mode">
              <button
                className={activityDivisionMode === 'manual' ? 'active' : ''}
                onClick={() => setActivityDivisionMode('manual')}
              >
                Thủ công
              </button>
              <button
                className={activityDivisionMode === 'random' ? 'active' : ''}
                onClick={randomizeActivityAssignments}
              >
                Chia ngẫu nhiên
              </button>
              <Button variant="ghost" icon="retry" onClick={randomizeActivityAssignments}>
                Chia lại
              </Button>
            </div>
            <fieldset className="activity-participants">
              <legend>Chọn người tham gia hoạt động</legend>
              {members
                .filter((member) => member.id !== hostId)
                .map((member) => (
                  <label key={member.id}>
                    <input
                      type="checkbox"
                      checked={activitySelectedIds.includes(member.id)}
                      onChange={() => {
                        const selected = activitySelectedIds.includes(member.id)
                          ? activitySelectedIds.filter((id) => id !== member.id)
                          : [...activitySelectedIds, member.id];
                        setActivitySelectedIds(selected);
                        setActivityAssignments((all) => ({
                          ...all,
                          [member.id]: all[member.id] ?? 'activity-1',
                        }));
                      }}
                    />
                    <Avatar member={member} size="sm" />
                    {member.name}
                  </label>
                ))}
            </fieldset>
            <div className="activity-preview">
              {Array.from({ length: activityGroupCount }, (_, index) => {
                const groupId = `activity-${index + 1}`;
                const assigned = activitySelectedIds.filter(
                  (id) => activityAssignments[id] === groupId && id !== hostId,
                );
                return (
                  <div key={groupId}>
                    <label>
                      Tên nhóm
                      <input
                        maxLength={80}
                        value={activityGroupNames[index] ?? ''}
                        onChange={(event) =>
                          setActivityGroupNames((names) =>
                            names.map((name, nameIndex) =>
                              nameIndex === index ? event.target.value : name,
                            ),
                          )
                        }
                      />
                    </label>
                    <strong>{assigned.length} thành viên</strong>
                    {assigned.map((id) => (
                      <span key={id}>
                        <Avatar member={getMember(id)} size="sm" />
                        {getMember(id).name}
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
            <div className="assignment-list">
              <span>Điều chỉnh phân nhóm</span>
              {activitySelectedIds
                .filter((id) => id !== hostId)
                .map((id) => (
                  <label key={id}>
                    <Avatar member={getMember(id)} size="sm" />
                    <strong>{getMember(id).name}</strong>
                    <select
                      value={activityAssignments[id] ?? 'activity-1'}
                      onChange={(event) => {
                        setActivityAssignments((all) => ({
                          ...all,
                          [id]: event.target.value,
                        }));
                        setActivityDivisionMode('manual');
                      }}
                    >
                      {Array.from({ length: activityGroupCount }, (_, index) => (
                        <option key={index} value={`activity-${index + 1}`}>
                          {activityGroupNames[index] || `Nhóm ${index + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
            </div>
            <p className="host-exclusion-note">
              Host hiện hành ở Phòng chung và không nằm trong danh sách phân nhóm.
            </p>
          </div>
        </Dialog>
      )}
      {activityConfirm && hasHostControls && (
        <Dialog
          title="Kết thúc nhóm trao đổi trước?"
          description="Bắt đầu hoạt động sẽ kết thúc tất cả nhóm trao đổi đang có."
          onClose={() => setActivityConfirm(false)}
          footer={
            <>
              <Button onClick={() => setActivityConfirm(false)}>Quay lại</Button>
              <Button
                variant="primary"
                disabled={activityTransitionBusy}
                onClick={() => hasHostControls && !activityTransitionBusy && startActivity()}
              >
                Kết thúc nhóm và bắt đầu
              </Button>
            </>
          }
        >
          <div className="privacy-note">
            <Icon name="info" />
            <span>
              <strong>Thành viên nhóm trao đổi sẽ được chuyển sang lượt hoạt động.</strong>
              Board và chat trao đổi cũ không được mang sang nhóm hoạt động.
            </span>
          </div>
        </Dialog>
      )}
      {leaveDialog && hasHostControls && (
        <Dialog
          title="Bạn đang là host"
          description="Chọn cách rời phòng. Hệ thống không tự chọn host kế tiếp."
          onClose={() => {
            setLeaveDialog(false);
            setConfirmEnd(false);
          }}
          footer={<Button onClick={() => setLeaveDialog(false)}>Ở lại phòng</Button>}
        >
          {confirmEnd ? (
            <div className="end-confirm">
              <strong>Kết thúc phiên cho tất cả mọi người?</strong>
              <p>Mọi thành viên sẽ rời Phòng chung và không thể tiếp tục cuộc họp này.</p>
              <Button variant="danger" onClick={() => hasHostControls && onEnd()}>
                Xác nhận kết thúc
              </Button>
            </div>
          ) : (
            <>
              <button
                className="leave-option"
                onClick={() => {
                  if (!hasHostControls) return;
                  setLeaveDialog(false);
                  setPanel('people');
                }}
              >
                <Icon name="users" />
                <span>
                  <strong>Chuyển host rồi rời</strong>
                  <small>Mở danh sách người tham gia để gán host trực tiếp.</small>
                </span>
                <Icon name="chevron-right" />
              </button>
              <button
                className="leave-option danger"
                onClick={() => hasHostControls && setConfirmEnd(true)}
              >
                <Icon name="phone" />
                <span>
                  <strong>Kết thúc cho mọi người</strong>
                  <small>Dừng phiên học đối với toàn bộ thành viên.</small>
                </span>
                <Icon name="chevron-right" />
              </button>
            </>
          )}
        </Dialog>
      )}
    </div>
  );
}

type SessionView = 'auth' | 'invite' | 'workspaces' | 'workspace';
type AuthMode = 'login' | 'register';
type WorkspaceListMode = 'available' | 'empty';
type InviteLinkScenario = 'active' | 'disabled' | 'rotated' | 'missing';
type InviteMembershipScenario = 'not-member' | 'member' | 'removed';
type WorkspaceRecord = {
  ownerId?: string;
  adminIds?: string[];
  inviteEnabled?: boolean;
  inviteGeneration?: number;
  deleted?: boolean;
  id: string;
  name: string;
  role: Role;
  memberIds: string[];
  channels: Channel[];
  messages: Record<string, Message[]>;
  dmMessages: Record<string, Message[]>;
  sample: boolean;
};
type CallSwitchTarget = {
  workspaceId: string;
  channelId: string;
  workspaceName: string;
  channelName: string;
};

function ChannelSettingsDialog({
  channel,
  canManage,
  onClose,
  onRename,
  onDelete,
}: {
  channel: Channel;
  canManage: boolean;
  onClose: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(channel.name);
  const [confirm, setConfirm] = useState(false);
  if (confirm)
    return (
      <Dialog
        title="Xóa kênh?"
        description={`Xóa ${channel.name} sẽ chặn truy cập lịch sử, tệp và kết thúc cuộc họp của kênh này. Các kênh khác vẫn được giữ.`}
        onClose={() => setConfirm(false)}
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>Hủy</Button>
            <Button variant="danger" onClick={onDelete}>
              Xóa kênh
            </Button>
          </>
        }
      >
        <p>Không tự tạo lại kênh sau khi xóa, kể cả general.</p>
      </Dialog>
    );
  return (
    <Dialog
      title="Thông tin kênh"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Đóng</Button>
          {canManage && (
            <Button variant="primary" disabled={!name.trim()} onClick={() => onRename(name.trim())}>
              Lưu tên kênh
            </Button>
          )}
        </>
      }
    >
      <label className="field">
        <span>Tên kênh</span>
        <input readOnly={!canManage} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <p>
        Loại: {channel.kind === 'TEXT' ? 'Kênh trò chuyện' : 'Phòng trực tiếp'} · Quyền truy cập:{' '}
        {channel.access === 'PRIVATE' ? 'Chỉ người được thêm' : 'Thành viên Workspace'}
      </p>
      <p>Loại và quyền truy cập không đổi sau khi tạo.</p>
      {canManage && (
        <Button variant="danger" onClick={() => setConfirm(true)}>
          Xóa kênh
        </Button>
      )}
    </Dialog>
  );
}

function WorkspaceSettingsDialog({
  workspace,
  onClose,
  onRename,
  onDelete,
}: {
  workspace: WorkspaceRecord;
  onClose: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(workspace.name);
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState('');
  if (confirm)
    return (
      <Dialog
        title="Xóa Workspace?"
        description="Thành viên sẽ mất quyền vào kênh, tệp và cuộc họp của Workspace này. Các Workspace khác không bị ảnh hưởng."
        onClose={() => setConfirm(false)}
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>Hủy</Button>
            <Button variant="danger" disabled={typed !== workspace.name} onClick={onDelete}>
              Xóa Workspace
            </Button>
          </>
        }
      >
        <label className="field">
          <span>Nhập tên Workspace để xác nhận: {workspace.name}</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} />
        </label>
      </Dialog>
    );
  return (
    <Dialog
      title="Cài đặt Workspace"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button variant="primary" disabled={!name.trim()} onClick={() => onRename(name.trim())}>
            Lưu tên Workspace
          </Button>
        </>
      }
    >
      <label className="field">
        <span>Tên Workspace</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      {workspace.role === 'OWNER' && (
        <div className="privacy-note">
          <Icon name="trash" />
          <span>
            <strong>Xóa Workspace</strong>Chỉ chủ Workspace có quyền xóa. Không có chuyển chủ trong
            bản hiện tại.
            <Button variant="danger" onClick={() => setConfirm(true)}>
              Xóa Workspace
            </Button>
          </span>
        </div>
      )}
    </Dialog>
  );
}

function WorkspacePeopleDialog({
  workspace,
  accountName,
  onClose,
  onUpdate,
  onInviteChange,
}: {
  workspace: WorkspaceRecord;
  accountName: string;
  onClose: () => void;
  onUpdate: (update: (w: WorkspaceRecord) => WorkspaceRecord) => void;
  onInviteChange: (enabled: boolean, generation: number) => void;
}) {
  const [tab, setTab] = useState<'members' | 'invite'>('members');
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const manage = workspace.role !== 'MEMBER';
  const owner = workspace.ownerId ?? (workspace.role === 'OWNER' ? currentUserId : 'lan');
  const roleOf = (id: string): Role =>
    id === currentUserId
      ? workspace.role
      : id === owner
        ? 'OWNER'
        : workspace.adminIds?.includes(id)
          ? 'ADMIN'
          : 'MEMBER';
  const enabled = workspace.inviteEnabled ?? true;
  const generation = workspace.inviteGeneration ?? 1;
  const link = `https://colearnia.example/invite/${workspace.id}/${generation}`;
  const removeMember = () => {
    if (
      !removeId ||
      !manage ||
      roleOf(removeId) === 'OWNER' ||
      (workspace.role === 'ADMIN' && roleOf(removeId) !== 'MEMBER')
    )
      return;
    onUpdate((w) => ({
      ...w,
      memberIds: w.memberIds.filter((id) => id !== removeId),
      adminIds: w.adminIds?.filter((id) => id !== removeId),
      channels: w.channels.map((c) =>
        c.access === 'PRIVATE'
          ? { ...c, memberIds: c.memberIds?.filter((id) => id !== removeId) }
          : c,
      ),
    }));
    setNotice('Đã loại thành viên và thu quyền các kênh riêng trong Workspace này.');
    setRemoveId(null);
  };
  if (removeId)
    return (
      <Dialog
        title="Loại thành viên?"
        description={`${getMember(removeId).name} sẽ mất quyền vào Workspace, kênh, tệp và cuộc họp liên quan. Nếu tham gia lại, quyền kênh riêng phải được cấp lại.`}
        onClose={() => setRemoveId(null)}
        footer={
          <>
            <Button onClick={() => setRemoveId(null)}>Hủy</Button>
            <Button variant="danger" onClick={removeMember}>
              Loại thành viên
            </Button>
          </>
        }
      >
        <p>Các Workspace khác của người này không bị ảnh hưởng.</p>
      </Dialog>
    );
  return (
    <Dialog
      title={`Thành viên và lời mời · ${workspace.name}`}
      onClose={onClose}
      footer={<Button onClick={onClose}>Xong</Button>}
    >
      <div className="segmented">
        <button
          className={tab === 'members' ? 'active' : ''}
          onClick={() => {
            setTab('members');
            setNotice('');
          }}
        >
          Thành viên
        </button>
        {manage && (
          <button
            className={tab === 'invite' ? 'active' : ''}
            onClick={() => {
              setTab('invite');
              setNotice('');
            }}
          >
            Link mời
          </button>
        )}
      </div>
      {notice && <p role="status">{notice}</p>}
      {tab === 'members' ? (
        <div className="manage-members">
          {workspace.memberIds.map((id) => {
            const person = getMember(id);
            const memberRole = roleOf(id);
            const removable =
              manage &&
              id !== currentUserId &&
              memberRole !== 'OWNER' &&
              (workspace.role === 'OWNER' || memberRole === 'MEMBER');
            return (
              <div key={id}>
                <Avatar member={person} size="sm" />
                <span>
                  <strong>{id === currentUserId ? accountName + ' (Bạn)' : person.name}</strong>
                  <small>{roleLabels[memberRole]}</small>
                </span>
                {workspace.role === 'OWNER' && id !== currentUserId && memberRole !== 'OWNER' && (
                  <Button
                    onClick={() =>
                      onUpdate((w) => ({
                        ...w,
                        adminIds:
                          memberRole === 'ADMIN'
                            ? (w.adminIds ?? []).filter((x) => x !== id)
                            : [...(w.adminIds ?? []), id],
                      }))
                    }
                  >
                    {memberRole === 'ADMIN' ? 'Gỡ Admin' : 'Cấp Admin'}
                  </Button>
                )}
                {removable && (
                  <Button variant="danger" onClick={() => setRemoveId(id)}>
                    Loại
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="field">
          <p>
            Mỗi Workspace có một link đang dùng. Link không hết hạn và không giới hạn lượt tham gia.
            Người nhận vẫn phải đăng nhập rồi xác nhận tham gia.
          </p>
          <label>
            <span>Link hiện tại</span>
            <input readOnly value={enabled ? link : 'Link mời đã tắt'} />
          </label>
          <div className="dialog-actions">
            <Button
              disabled={!enabled}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setNotice('Đã sao chép link mời minh họa. Link này không kết nối hệ thống thật.');
                } catch {
                  setNotice('Chưa sao chép được. Bạn có thể chọn và sao chép link trong ô trên.');
                }
              }}
            >
              Sao chép link
            </Button>
            <Button
              onClick={() => {
                onInviteChange(false, generation);
                setNotice('Đã tắt link. Thành viên hiện tại vẫn được giữ nguyên.');
              }}
              disabled={!enabled}
            >
              Tắt link
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                onInviteChange(true, generation + 1);
                setNotice(
                  'Đã tạo link mới. Link cũ không còn dùng được; thành viên hiện tại không bị loại.',
                );
              }}
            >
              Tạo lại link
            </Button>
          </div>
          <p>Đây là link minh họa của bản mẫu; không gửi lời mời thật.</p>
        </div>
      )}
    </Dialog>
  );
}

function AccessDemoBar({
  authenticated,
  workspaceListMode,
  loginShouldFail,
  inviteLinkScenario,
  inviteMembershipScenario,
  onSessionView,
  onWorkspaceListMode,
  onLoginShouldFail,
  onInviteLinkScenario,
  onInviteMembershipScenario,
  onOpenInvite,
}: {
  authenticated: boolean;
  workspaceListMode: WorkspaceListMode;
  loginShouldFail: boolean;
  inviteLinkScenario: InviteLinkScenario;
  inviteMembershipScenario: InviteMembershipScenario;
  onSessionView: (view: 'auth' | 'workspaces') => void;
  onWorkspaceListMode: (mode: WorkspaceListMode) => void;
  onLoginShouldFail: (shouldFail: boolean) => void;
  onInviteLinkScenario: (scenario: InviteLinkScenario) => void;
  onInviteMembershipScenario: (scenario: InviteMembershipScenario) => void;
  onOpenInvite: () => void;
}) {
  return (
    <div className="prototype-bar access-demo-bar">
      <div>
        <span className="prototype-dot" />
        Bản mẫu tài khoản · Không nhập thông tin thật
      </div>
      <DemoTools>
        <span>
          <Icon name="settings" size={14} />
          Tình huống demo <small>tách khỏi control sản phẩm</small>
        </span>
        <label>
          <span>Phiên</span>
          <select
            value={authenticated ? 'signed' : 'guest'}
            onChange={(event) =>
              onSessionView(event.target.value === 'guest' ? 'auth' : 'workspaces')
            }
          >
            <option value="guest">Chưa đăng nhập</option>
            <option value="signed">Đã đăng nhập</option>
          </select>
        </label>
        <label>
          <span>Workspace</span>
          <select
            value={workspaceListMode}
            onChange={(event) => onWorkspaceListMode(event.target.value as WorkspaceListMode)}
          >
            <option value="available">Có Workspace</option>
            <option value="empty">Danh sách rỗng</option>
          </select>
        </label>
        <label>
          <span>Đăng nhập</span>
          <select
            value={loginShouldFail ? 'error' : 'success'}
            onChange={(event) => onLoginShouldFail(event.target.value === 'error')}
          >
            <option value="success">Thành công</option>
            <option value="error">Trả lỗi</option>
          </select>
        </label>
        <label>
          <span>Link mời</span>
          <select
            value={inviteLinkScenario}
            onChange={(event) => onInviteLinkScenario(event.target.value as InviteLinkScenario)}
          >
            <option value="active">Đang hiệu lực</option>
            <option value="disabled">Đã tắt</option>
            <option value="rotated">Đã tạo lại</option>
            <option value="missing">Workspace không còn</option>
          </select>
        </label>
        <label>
          <span>Membership</span>
          <select
            value={inviteMembershipScenario}
            onChange={(event) =>
              onInviteMembershipScenario(event.target.value as InviteMembershipScenario)
            }
          >
            <option value="not-member">Chưa tham gia</option>
            <option value="member">Đã là member</option>
            <option value="removed">Đã bị loại</option>
          </select>
        </label>
        <Button variant="primary" onClick={onOpenInvite}>
          Mở lời mời demo
        </Button>
      </DemoTools>
    </div>
  );
}

function AuthScreen({
  loginShouldFail,
  initialMode = 'login',
  notice,
  onSuccess,
}: {
  loginShouldFail: boolean;
  initialMode?: AuthMode;
  notice?: string;
  onSuccess: (registeredName?: string) => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('minh.anh@demo.local');
  const [password, setPassword] = useState('demo-password');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);
  const switchMode = (next: AuthMode) => {
    setMode(next);
    setErrors({});
    setServerError('');
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (mode === 'register' && !displayName.trim()) nextErrors.displayName = 'Nhập tên hiển thị.';
    if (!email.trim()) nextErrors.email = 'Nhập email.';
    else if (!email.includes('@')) nextErrors.email = 'Email chưa đúng định dạng.';
    if (!password) nextErrors.password = 'Nhập mật khẩu.';
    setErrors(nextErrors);
    setServerError('');
    if (Object.keys(nextErrors).length) return;
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      if (loginShouldFail) {
        setServerError('Không thể đăng nhập. Kiểm tra thông tin và thử lại.');
        return;
      }
      onSuccess(mode === 'register' ? displayName.trim() : undefined);
    }, 450);
  };
  return (
    <main className="access-screen">
      <section className="access-brand">
        <span className="workspace-mark">C5</span>
        <div>
          <strong>CoLearnia</strong>
          <small>Không gian học tập và cộng tác cho nhóm</small>
        </div>
      </section>
      <section className="auth-card">
        <div className="auth-heading">
          <span className="eyebrow">TÀI KHOẢN</span>
          <h1>{mode === 'login' ? 'Đăng nhập vào CoLearnia' : 'Tạo tài khoản CoLearnia'}</h1>
          <p>
            {mode === 'login'
              ? 'Tiếp tục tới danh sách Workspace của bạn.'
              : 'Đăng ký xong, bạn sẽ được đăng nhập tự động.'}
          </p>
        </div>
        {notice && (
          <div className="auth-success" role="status">
            <Icon name="check" size={17} />
            <span>
              <strong>Đã cập nhật mật khẩu</strong>
              {notice}
            </span>
          </div>
        )}
        <div className="auth-tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>
            Đăng nhập
          </button>
          <button
            className={mode === 'register' ? 'active' : ''}
            onClick={() => switchMode('register')}
          >
            Đăng ký
          </button>
        </div>
        <form className="auth-form" onSubmit={submit} noValidate>
          {mode === 'register' && (
            <label>
              <span>Tên hiển thị</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Ví dụ: Minh Anh"
                aria-invalid={!!errors.displayName}
              />
              {errors.displayName && <small>{errors.displayName}</small>}
            </label>
          )}
          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="ban@example.com"
              aria-invalid={!!errors.email}
            />
            {errors.email && <small>{errors.email}</small>}
          </label>
          <label>
            <span>Mật khẩu</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Nhập mật khẩu"
              aria-invalid={!!errors.password}
            />
            {errors.password && <small>{errors.password}</small>}
          </label>
          {serverError && (
            <div className="auth-error" role="alert">
              <Icon name="info" size={17} />
              <span>
                <strong>Đăng nhập chưa thành công</strong>
                {serverError}
              </span>
            </div>
          )}
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : 'Đăng ký và tiếp tục'}
          </Button>
        </form>
      </section>
    </main>
  );
}

function CreateWorkspaceDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState('');
  return (
    <Dialog
      title="Tạo Workspace"
      description="Đặt tên cho không gian làm việc mới của bạn."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button
            variant="primary"
            disabled={!name.trim()}
            onClick={() => name.trim() && onCreate(name.trim())}
          >
            Tạo và mở Workspace
          </Button>
        </>
      }
    >
      <label className="field">
        <span>Tên Workspace</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ví dụ: Lớp Công nghệ Web"
          autoFocus
        />
      </label>
      <div className="privacy-note">
        <Icon name="info" />
        <span>
          <strong>Bạn có thể thiết lập chi tiết sau.</strong>Chưa có thành viên hoặc lời mời nào
          được thêm ở bước này.
        </span>
      </div>
    </Dialog>
  );
}

function ProfileDialog({
  currentName,
  email,
  avatarUrl,
  uploadShouldFail,
  onClose,
  onSave,
}: {
  currentName: string;
  email: string;
  avatarUrl: string | null;
  uploadShouldFail: boolean;
  onClose: () => void;
  onSave: (name: string, avatarUrl: string | null) => void;
}) {
  const [name, setName] = useState(currentName);
  const [previewUrl, setPreviewUrl] = useState<string | null>(avatarUrl);
  const [newImageSelected, setNewImageSelected] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const previewMember: Member = {
    ...getMember(currentUserId),
    name,
    initials:
      name
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'MA',
  };
  const chooseImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    setNewImageSelected(true);
    setError('');
  };
  const save = () => {
    if (!name.trim()) {
      setError('Tên hiển thị không được để trống.');
      return;
    }
    if (newImageSelected && uploadShouldFail) {
      setError('Không thể tải ảnh đại diện. Ảnh hiện tại vẫn được giữ nguyên.');
      return;
    }
    onSave(name.trim(), previewUrl);
  };
  return (
    <Dialog
      title="Hồ sơ của bạn"
      description="Chỉ bạn có thể thay đổi tên và ảnh đại diện của tài khoản này."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button variant="primary" onClick={save}>
            Lưu thay đổi
          </Button>
        </>
      }
    >
      <div className="profile-avatar-editor">
        <Avatar member={previewMember} size="lg" imageUrl={previewUrl} />
        <div>
          <strong>Ảnh đại diện</strong>
          <span>
            {previewUrl ? 'Ảnh đang được dùng làm avatar.' : 'Đang dùng chữ cái từ tên hiển thị.'}
          </span>
          <div>
            <input
              ref={fileInput}
              className="sr-only"
              type="file"
              accept="image/*"
              onChange={chooseImage}
            />
            <Button variant="secondary" onClick={() => fileInput.current?.click()}>
              Chọn ảnh
            </Button>
            {previewUrl && (
              <Button
                variant="ghost"
                onClick={() => {
                  setPreviewUrl(null);
                  setNewImageSelected(false);
                  setError('');
                }}
              >
                Xóa ảnh
              </Button>
            )}
          </div>
        </div>
      </div>
      <label className="field">
        <span>Tên hiển thị</span>
        <input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError('');
          }}
        />
      </label>
      <label className="field">
        <span>Email</span>
        <input value={email} readOnly aria-readonly="true" />
      </label>
      {error && (
        <div className="auth-error" role="alert">
          <Icon name="info" size={17} />
          <span>
            <strong>Chưa thể lưu hồ sơ</strong>
            {error}
          </span>
        </div>
      )}
      <div className="privacy-note">
        <Icon name="info" />
        <span>
          <strong>
            Ảnh đại diện là ảnh công khai. Người có đường dẫn ảnh có thể xem mà không cần đăng nhập.
          </strong>
          Ảnh gửi trong chat hoặc hiển thị trong video vẫn thuộc phạm vi riêng tư của nội dung đó.
        </span>
      </div>
    </Dialog>
  );
}

function PasswordDialog({
  currentPasswordShouldFail,
  activeCall,
  isCallHost,
  onClose,
  onSuccess,
}: {
  currentPasswordShouldFail: boolean;
  activeCall: boolean;
  isCallHost: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [confirmHostCall, setConfirmHostCall] = useState(false);
  const submit = () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Nhập đầy đủ mật khẩu hiện tại, mật khẩu mới và xác nhận.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu mới và phần xác nhận chưa khớp.');
      return;
    }
    if (currentPasswordShouldFail) {
      setError('Mật khẩu hiện tại không đúng. Phiên đăng nhập vẫn được giữ nguyên.');
      return;
    }
    if (activeCall && isCallHost) {
      setConfirmHostCall(true);
      return;
    }
    onSuccess();
  };
  if (confirmHostCall)
    return (
      <Dialog
        title="Đổi mật khẩu và kết thúc cuộc gọi?"
        description="Bạn vẫn là host. Đổi mật khẩu sẽ kết thúc cuộc gọi cho mọi người và đăng xuất tất cả phiên."
        onClose={() => setConfirmHostCall(false)}
        footer={
          <>
            <Button onClick={() => setConfirmHostCall(false)}>Hủy</Button>
            <Button variant="danger" onClick={onSuccess}>
              Kết thúc cuộc gọi và đổi mật khẩu
            </Button>
          </>
        }
      >
        <div className="privacy-note">
          <Icon name="phone" />
          <span>
            <strong>Hệ thống không tự chọn host mới.</strong>Hủy sẽ giữ nguyên mật khẩu, phiên đăng
            nhập và cuộc gọi hiện tại.
          </span>
        </div>
      </Dialog>
    );
  return (
    <Dialog
      title="Đổi mật khẩu"
      description="Sau khi đổi thành công, tất cả phiên đăng nhập sẽ bị thu hồi."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button variant="primary" onClick={submit}>
            Đổi mật khẩu
          </Button>
        </>
      }
    >
      <div className="password-fields">
        <label className="field">
          <span>Mật khẩu hiện tại</span>
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => {
              setCurrentPassword(event.target.value);
              setError('');
            }}
            autoFocus
          />
        </label>
        <label className="field">
          <span>Mật khẩu mới</span>
          <input
            type="password"
            value={newPassword}
            onChange={(event) => {
              setNewPassword(event.target.value);
              setError('');
            }}
          />
        </label>
        <label className="field">
          <span>Xác nhận mật khẩu mới</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              setError('');
            }}
          />
        </label>
      </div>
      {error && (
        <div className="auth-error" role="alert">
          <Icon name="info" size={17} />
          <span>
            <strong>Chưa thể đổi mật khẩu</strong>
            {error}
          </span>
        </div>
      )}
      <div className="privacy-note">
        <Icon name="info" />
        <span>
          <strong>Bạn sẽ cần đăng nhập lại trên mọi phiên.</strong>Mật khẩu hiện tại vẫn được giữ
          nguyên nếu thao tác không thành công.
        </span>
      </div>
    </Dialog>
  );
}

function InviteScreen({
  workspace,
  authenticated,
  accountDisplayName,
  alreadyMember,
  error,
  onAuthenticate,
  onConfirm,
  onCancel,
}: {
  workspace: WorkspaceRecord;
  authenticated: boolean;
  accountDisplayName: string;
  alreadyMember: boolean;
  error: string;
  onAuthenticate: (mode: AuthMode) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <main className="invite-screen">
      <section className="invite-card">
        <div className="invite-symbol">
          <Icon name="users" size={24} />
        </div>
        <span className="eyebrow">LỜI MỜI WORKSPACE</span>
        <h1>{workspace.name}</h1>
        <p>Bạn được mời tham gia Workspace này để trao đổi trong các kênh chung.</p>
        <div className="invite-details">
          <div>
            <span>Workspace</span>
            <strong>{workspace.name}</strong>
          </div>
          <div>
            <span>Người nhận</span>
            <strong>{authenticated ? accountDisplayName : 'Tài khoản sau khi đăng nhập'}</strong>
          </div>
          <div>
            <span>Quyền khi tham gia</span>
            <strong>Thành viên</strong>
          </div>
        </div>
        {error && (
          <div className="auth-error invite-error" role="alert">
            <Icon name="info" size={17} />
            <span>
              <strong>Không thể dùng lời mời</strong>
              {error}
            </span>
          </div>
        )}
        {!authenticated ? (
          <div className="invite-actions stacked">
            <Button variant="primary" onClick={() => onAuthenticate('login')}>
              Đăng nhập để tiếp tục
            </Button>
            <Button onClick={() => onAuthenticate('register')}>Đăng ký tài khoản</Button>
          </div>
        ) : (
          <div className="invite-actions">
            <Button onClick={onCancel}>Hủy</Button>
            <Button variant="primary" onClick={onConfirm}>
              {alreadyMember ? 'Mở Workspace' : 'Tham gia Workspace'}
            </Button>
          </div>
        )}
        {error && authenticated && (
          <button className="invite-list-link" onClick={onCancel}>
            Về danh sách Workspace
          </button>
        )}
        <small className="invite-note">
          Tham gia chỉ cấp quyền vào các kênh chung. Kênh riêng không được tự động khôi phục.
        </small>
      </section>
    </main>
  );
}

function WorkspaceListScreen({
  workspaceListMode,
  workspaces,
  accountDisplayName,
  accountAvatarUrl,
  activeCall,
  callWorkspaceId,
  onOpenWorkspace,
  onCreateWorkspace,
  onReturnToCall,
  onLogout,
}: {
  workspaceListMode: WorkspaceListMode;
  workspaces: WorkspaceRecord[];
  accountDisplayName: string;
  accountAvatarUrl: string | null;
  activeCall: boolean;
  callWorkspaceId: string | null;
  onOpenWorkspace: (workspaceId: string) => void;
  onCreateWorkspace: () => void;
  onReturnToCall: () => void;
  onLogout: () => void;
}) {
  return (
    <main className="workspace-list-screen">
      <header className="workspace-list-header">
        <div>
          <span className="workspace-mark">C5</span>
          <strong>CoLearnia</strong>
        </div>
        <div>
          <Avatar
            member={{
              ...getMember(currentUserId),
              name: accountDisplayName,
              initials:
                accountDisplayName
                  .split(/\s+/)
                  .filter(Boolean)
                  .map((part) => part[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase() || 'MA',
            }}
            size="sm"
            imageUrl={accountAvatarUrl}
          />
          <span>{accountDisplayName}</span>
          <Button variant="ghost" onClick={onLogout}>
            Đăng xuất
          </Button>
        </div>
      </header>
      {activeCall && (
        <div className="workspace-call-note">
          <span>
            <span className="call-pulse" />
            <strong>Cuộc gọi Phòng học chung vẫn đang diễn ra</strong>
          </span>
          <Button variant="primary" icon="phone" onClick={onReturnToCall}>
            Trở lại cuộc họp
          </Button>
        </div>
      )}
      <section className="workspace-list-content">
        <div className="workspace-list-title">
          <span>
            <span className="eyebrow">WORKSPACE CỦA BẠN</span>
            <h1>Chọn nơi bạn muốn tiếp tục</h1>
            <p>Chỉ hiển thị các Workspace mà tài khoản hiện tại còn tham gia.</p>
          </span>
          <Button variant="primary" icon="plus" onClick={onCreateWorkspace} disabled={activeCall}>
            Tạo Workspace
          </Button>
        </div>
        {activeCall && (
          <p className="workspace-switch-blocked">
            Để giữ đúng phạm vi cuộc gọi hiện tại, hãy trở lại hoặc rời cuộc gọi trước khi tạo hay
            mở Workspace khác.
          </p>
        )}
        {workspaceListMode === 'available' ? (
          <div className="workspace-card-grid">
            {workspaces.map((workspace) => {
              const blockedByCall = activeCall && workspace.id !== callWorkspaceId;
              return (
                <button
                  key={workspace.id}
                  className="workspace-card"
                  disabled={blockedByCall}
                  title={
                    blockedByCall ? 'Rời cuộc gọi hiện tại trước khi mở Workspace này' : undefined
                  }
                  onClick={() => onOpenWorkspace(workspace.id)}
                >
                  <span className="workspace-mark">
                    {workspace.sample ? 'C5' : workspace.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span>
                    <strong>{workspace.name}</strong>
                    <small>
                      {workspace.memberIds.length} thành viên · {roleLabels[workspace.role]}
                    </small>
                    <em>
                      {blockedByCall
                        ? 'Đang có cuộc gọi ở Workspace khác'
                        : workspace.messages.general?.length
                          ? 'Hoạt động gần đây trong #general'
                          : '#general chưa có tin nhắn'}
                    </em>
                  </span>
                  <Icon name="chevron-right" />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="workspace-list-empty">
            <span className="empty-icon">
              <Icon name="users" size={24} />
            </span>
            <h2>Bạn chưa có Workspace nào</h2>
            <p>
              Tạo Workspace mới để bắt đầu. Nếu bạn đang chờ lời mời, bạn có thể quay lại đường dẫn
              lời mời mà không cần tự tham gia hoặc tạo Workspace.
            </p>
            <Button variant="primary" icon="plus" onClick={onCreateWorkspace} disabled={activeCall}>
              Tạo Workspace đầu tiên
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}

export default function App() {
  const [sessionView, setSessionView] = useState<SessionView>('workspace');
  const [authenticated, setAuthenticated] = useState(true);
  const [authInitialMode, setAuthInitialMode] = useState<AuthMode>('login');
  const [workspaceListMode, setWorkspaceListMode] = useState<WorkspaceListMode>('available');
  const [loginShouldFail, setLoginShouldFail] = useState(false);
  const [inviteLinkScenario, setInviteLinkScenario] = useState<InviteLinkScenario>('active');
  const [inviteMembershipScenario, setInviteMembershipScenario] =
    useState<InviteMembershipScenario>('not-member');
  const [inviteLinkGeneration, setInviteLinkGeneration] = useState(1);
  const [pendingInviteGeneration, setPendingInviteGeneration] = useState<number | null>(null);
  const [inviteError, setInviteError] = useState('');
  const [accountDisplayName, setAccountDisplayName] = useState(getMember(currentUserId).name);
  const [accountAvatarUrl, setAccountAvatarUrl] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [profileUploadShouldFail, setProfileUploadShouldFail] = useState(false);
  const [currentPasswordShouldFail, setCurrentPasswordShouldFail] = useState(false);
  const [authNotice, setAuthNotice] = useState('');
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([
    {
      id: 'workspace-sample',
      name: 'Công nghệ Web',
      role: 'MEMBER',
      memberIds: members.map((member) => member.id),
      channels: initialChannels,
      messages: initialMessages,
      dmMessages: initialDmMessages,
      sample: true,
    },
    {
      id: 'workspace-invite',
      name: 'Thiết kế Sản phẩm',
      role: 'MEMBER',
      memberIds: ['lan', 'khoa', 'vy'],
      channels: [
        {
          id: 'general',
          name: 'general',
          kind: 'TEXT',
          access: 'WORKSPACE',
          description: 'Trao đổi chung của nhóm Thiết kế Sản phẩm',
        },
        {
          id: 'planning-private',
          name: 'Điều phối nội bộ',
          kind: 'TEXT',
          access: 'PRIVATE',
          memberIds: ['lan', 'vy'],
          description: 'Kênh riêng của nhóm điều phối',
        },
      ],
      messages: {
        general: [
          {
            id: 'invite-general-1',
            authorId: 'lan',
            time: 'Hôm nay, 08:30',
            text: 'Chào mừng mọi người đến với Workspace Thiết kế Sản phẩm.',
          },
        ],
        'planning-private': [
          {
            id: 'invite-private-1',
            authorId: 'vy',
            time: 'Hôm qua',
            text: 'Nội dung điều phối chỉ dành cho thành viên của kênh riêng.',
          },
        ],
      },
      dmMessages: {},
      sample: false,
    },
  ]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState('workspace-sample');
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [viewerIsCallHost, setViewerIsCallHost] = useState(false);
  const [screen, setScreen] = useState<'workspace' | 'device' | 'meeting'>('workspace');
  const [activeCall, setActiveCall] = useState(false);
  const [callWorkspaceId, setCallWorkspaceId] = useState<string | null>(null);
  const [callSwitchTarget, setCallSwitchTarget] = useState<CallSwitchTarget | null>(null);
  const [callSwitchError, setCallSwitchError] = useState('');
  const [deviceInitialDevices, setDeviceInitialDevices] = useState({
    mic: true,
    camera: false,
  });
  const [meetingRole, setMeetingRole] = useState<MeetingRole>('MEMBER');
  const [meetingDevices, setMeetingDevices] = useState({
    mic: false,
    camera: false,
  });
  const [selectedId, setSelectedId] = useState('general');
  const [conversationType, setConversationType] = useState<'channel' | 'dm'>('channel');
  const [threadMessageId, setThreadMessageId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [workspaceSettingsOpen, setWorkspaceSettingsOpen] = useState(false);
  const [channelSettingsOpen, setChannelSettingsOpen] = useState(false);
  const [callChannelId, setCallChannelId] = useState<string | null>(null);
  const [recordingLibraryOpen, setRecordingLibraryOpen] = useState(false);
  const [callSessionId, setCallSessionId] = useState('');
  const [channelSessions, setChannelSessions] = useState<Record<string, string>>({});
  const [recordings, setRecordings] = useState<RecordingEntry[]>([
    {
      id: 'recording-example',
      workspaceId: 'workspace-sample',
      channelId: 'live-room',
      sessionId: 'session-example',
      title: 'Buổi học mẫu · Phòng chung',
      status: 'READY',
      elapsed: 180,
      createdLabel: 'Buổi học mẫu trước đó',
    },
  ]);
  const currentRecording = recordings
    .filter(
      (r) =>
        r.sessionId === callSessionId &&
        r.workspaceId === callWorkspaceId &&
        r.channelId === callChannelId,
    )
    .at(-1);
  const recordingBusy = recordings.some((r) =>
    ['STARTING', 'RECORDING', 'STOPPING', 'PROCESSING'].includes(r.status),
  );
  function stopRecording(id: string) {
    setRecordings((list) =>
      list.map((r) =>
        r.id === id
          ? r.status === 'STARTING'
            ? {
                ...r,
                status: 'FAILED',
                error: 'Đã hủy khởi động. Chưa có video được ghi.',
              }
            : r.status === 'RECORDING'
              ? { ...r, status: 'STOPPING' }
              : r
          : r,
      ),
    );
    window.setTimeout(
      () =>
        setRecordings((list) =>
          list.map((r) =>
            r.id === id && r.status === 'STOPPING' ? { ...r, status: 'PROCESSING' } : r,
          ),
        ),
      700,
    );
    window.setTimeout(
      () =>
        setRecordings((list) =>
          list.map((r) =>
            r.id === id && r.status === 'PROCESSING'
              ? { ...r, status: 'READY', elapsed: Math.max(1, r.elapsed) }
              : r,
          ),
        ),
      2400,
    );
  }
  const startRecording = () => {
    if (!viewerIsCallHost || !activeCall || !callChannelId || recordingBusy) return;
    const id = crypto.randomUUID();
    setRecordings((list) => [
      ...list,
      {
        id,
        workspaceId: currentWorkspaceId,
        channelId: callChannelId,
        sessionId: callSessionId,
        title: `Bản ghi ${list.filter((r) => r.channelId === callChannelId && r.workspaceId === currentWorkspaceId).length + 1} · ${channels.find((c) => c.id === callChannelId)?.name ?? 'Phòng chung'}`,
        status: 'STARTING',
        elapsed: 0,
        createdLabel: 'Vừa ghi trong phiên này',
      },
    ]);
    window.setTimeout(
      () =>
        setRecordings((list) =>
          list.map((r) =>
            r.id === id && r.status === 'STARTING' ? { ...r, status: 'RECORDING' } : r,
          ),
        ),
      1200,
    );
  };
  useEffect(() => {
    const tick = window.setInterval(
      () =>
        setRecordings((list) =>
          list.map((r) =>
            r.status === 'RECORDING' ? { ...r, elapsed: Math.min(10800, r.elapsed + 1) } : r,
          ),
        ),
      1000,
    );
    return () => window.clearInterval(tick);
  }, []);
  useEffect(() => {
    recordings
      .filter((r) => r.status === 'RECORDING' && r.elapsed >= 10800)
      .forEach((r) => stopRecording(r.id));
  }, [recordings]);
  const endSessionRecording = () => {
    recordings
      .filter(
        (r) =>
          r.sessionId === callSessionId &&
          r.workspaceId === callWorkspaceId &&
          ['STARTING', 'RECORDING'].includes(r.status),
      )
      .forEach((r) => stopRecording(r.id));
    if (callChannelId)
      setChannelSessions((all) => {
        const next = { ...all };
        delete next[`${callWorkspaceId}/${callChannelId}`];
        return next;
      });
  };
  const [chatSendShouldFail, setChatSendShouldFail] = useState(false);
  const [accessNotice, setAccessNotice] = useState('');

  const currentWorkspace =
    workspaces.find((workspace) => workspace.id === currentWorkspaceId) ?? workspaces[0];
  const inviteWorkspace = workspaces.find((workspace) => workspace.id === 'workspace-invite')!;
  const memberWorkspaces = workspaces.filter(
    (workspace) => !workspace.deleted && workspace.memberIds.includes(currentUserId),
  );
  const alreadyInviteMember = inviteWorkspace.memberIds.includes(currentUserId);
  const workspaceName = currentWorkspace.name;
  const role = currentWorkspace.role;
  const channels = currentWorkspace.channels;
  const messages = currentWorkspace.messages;
  const dmMessages = currentWorkspace.dmMessages;
  const currentWorkspaceMembers = members.filter((member) =>
    currentWorkspace.memberIds.includes(member.id),
  );
  const accountMember: Member = {
    ...getMember(currentUserId),
    name: accountDisplayName,
    initials:
      accountDisplayName
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'MA',
  };
  const updateCurrentWorkspace = (update: (workspace: WorkspaceRecord) => WorkspaceRecord) => {
    setWorkspaces((list) =>
      list.map((workspace) =>
        workspace.id === currentWorkspaceId ? update(workspace) : workspace,
      ),
    );
  };
  const setRole = (next: Role) =>
    updateCurrentWorkspace((workspace) => ({
      ...workspace,
      role: next,
      ownerId:
        next === 'OWNER'
          ? currentUserId
          : workspace.ownerId === currentUserId
            ? 'lan'
            : workspace.ownerId,
    }));
  const setChannels = (update: Channel[] | ((list: Channel[]) => Channel[])) =>
    updateCurrentWorkspace((workspace) => ({
      ...workspace,
      channels: typeof update === 'function' ? update(workspace.channels) : update,
    }));
  const setMessages = (
    update:
      Record<string, Message[]> | ((all: Record<string, Message[]>) => Record<string, Message[]>),
  ) =>
    updateCurrentWorkspace((workspace) => ({
      ...workspace,
      messages: typeof update === 'function' ? update(workspace.messages) : update,
    }));
  const setDmMessages = (
    update:
      Record<string, Message[]> | ((all: Record<string, Message[]>) => Record<string, Message[]>),
  ) =>
    updateCurrentWorkspace((workspace) => ({
      ...workspace,
      dmMessages: typeof update === 'function' ? update(workspace.dmMessages) : update,
    }));
  const canManage = role === 'OWNER' || role === 'ADMIN';
  const selectedChannel = channels.find((channel) => channel.id === selectedId);
  const selectedDm = members.find((member) => member.id === selectedId);
  const visibleChannels = channels.filter(
    (channel) => channel.access === 'WORKSPACE' || channel.memberIds?.includes(currentUserId),
  );
  const currentMessages =
    conversationType === 'channel' ? (messages[selectedId] ?? []) : (dmMessages[selectedId] ?? []);
  const threadMessage = useMemo(
    () => currentMessages.find((message) => message.id === threadMessageId),
    [currentMessages, threadMessageId],
  );

  const hasWorkspaceAccess =
    !currentWorkspace.deleted && currentWorkspace.memberIds.includes(currentUserId);
  const hasConversationAccess =
    hasWorkspaceAccess &&
    (conversationType === 'dm'
      ? currentWorkspace.memberIds.includes(selectedId)
      : visibleChannels.some((c) => c.id === selectedId));
  useEffect(() => {
    const membership =
      !currentWorkspace.deleted && currentWorkspace.memberIds.includes(currentUserId);
    const callChannel = currentWorkspace.channels.find((c) => c.id === callChannelId);
    const callAllowed =
      membership &&
      callChannel &&
      (callChannel.access === 'WORKSPACE' || callChannel.memberIds?.includes(currentUserId));
    if (!membership) {
      if (currentWorkspace.deleted && activeCall) endSessionRecording();
      if (callWorkspaceId === currentWorkspaceId) {
        setActiveCall(false);
        setCallWorkspaceId(null);
        setCallChannelId(null);
        setViewerIsCallHost(false);
      }
      setScreen('workspace');
      setSessionView((v) => (v === 'workspace' ? 'workspaces' : v));
      setThreadMessageId(null);
      setPeopleOpen(false);
      setManageOpen(false);
      setChannelSettingsOpen(false);
      setWorkspaceSettingsOpen(false);
      setRecordingLibraryOpen(false);
      setAccessNotice(
        currentWorkspace.deleted
          ? `Workspace ${currentWorkspace.name} đã được xóa. Các Workspace khác vẫn sử dụng được.`
          : `Bạn không còn quyền vào Workspace ${currentWorkspace.name}. Các Workspace khác vẫn sử dụng được.`,
      );
    } else {
      if (activeCall && callWorkspaceId === currentWorkspaceId && !callAllowed) {
        if (!callChannel) endSessionRecording();
        setActiveCall(false);
        setCallWorkspaceId(null);
        setCallChannelId(null);
        setViewerIsCallHost(false);
        setScreen('workspace');
        setAccessNotice(
          'Bạn không còn quyền vào phòng này. Cuộc gọi và nội dung riêng đã được đóng.',
        );
      }
      if (!hasConversationAccess) {
        setSelectedId(
          visibleChannels.find((c) => c.kind === 'TEXT')?.id ?? visibleChannels[0]?.id ?? '',
        );
        setConversationType('channel');
        setThreadMessageId(null);
        setChannelSettingsOpen(false);
        setRecordingLibraryOpen(false);
        setAccessNotice('Nội dung vừa mở không còn khả dụng. Đã chuyển về nơi bạn còn quyền.');
      }
    }
    if (!canManage) {
      setManageOpen(false);
      setCreateOpen(false);
      setWorkspaceSettingsOpen(false);
    }
  }, [
    currentWorkspace,
    activeCall,
    callWorkspaceId,
    callChannelId,
    currentWorkspaceId,
    hasConversationAccess,
    canManage,
  ]);
  const revokeDemoAccess = () => {
    const target = callChannelId ?? selectedId;
    updateCurrentWorkspace((w) => ({
      ...w,
      channels: w.channels.map((c) =>
        c.id === target
          ? {
              ...c,
              access: 'PRIVATE',
              memberIds: (c.memberIds ?? w.memberIds).filter((id) => id !== currentUserId),
            }
          : c,
      ),
    }));
  };
  const selectConversation = (type: 'channel' | 'dm', id: string) => {
    if (
      !hasWorkspaceAccess ||
      (type === 'channel'
        ? !visibleChannels.some((c) => c.id === id)
        : !currentWorkspace.memberIds.includes(id))
    )
      return;
    setConversationType(type);
    setSelectedId(id);
    setThreadMessageId(null);
  };
  const settleMessage = (
    workspaceId: string,
    type: 'channel' | 'dm',
    conversationId: string,
    messageId: string,
    fail: boolean,
  ) => {
    window.setTimeout(
      () =>
        setWorkspaces((list) =>
          list.map((w) => {
            if (w.id !== workspaceId || !w.memberIds.includes(currentUserId) || w.deleted) return w;
            const allowed =
              type === 'dm'
                ? w.memberIds.includes(conversationId)
                : w.channels.some(
                    (c) =>
                      c.id === conversationId &&
                      (c.access === 'WORKSPACE' || c.memberIds?.includes(currentUserId)),
                  );
            if (!allowed) return w;
            const field = type === 'channel' ? 'messages' : 'dmMessages';
            return {
              ...w,
              [field]: {
                ...w[field],
                [conversationId]: (w[field][conversationId] ?? []).map((m) =>
                  m.id === messageId && m.status === 'sending'
                    ? {
                        ...m,
                        status: fail ? ('error' as const) : ('sent' as const),
                      }
                    : m,
                ),
              },
            };
          }),
        ),
      600,
    );
  };
  const sendMessage = (text: string, attachment?: Attachment) => {
    if (!hasConversationAccess) return;
    const next: Message = {
      id: `message-${crypto.randomUUID()}`,
      authorId: currentUserId,
      time: 'Vừa xong',
      text,
      attachment,
      status: 'sending',
    };
    if (conversationType === 'channel')
      setMessages((all) => ({
        ...all,
        [selectedId]: [...(all[selectedId] ?? []), next],
      }));
    else
      setDmMessages((all) => ({
        ...all,
        [selectedId]: [...(all[selectedId] ?? []), next],
      }));
    settleMessage(currentWorkspaceId, conversationType, selectedId, next.id, chatSendShouldFail);
  };
  const sendReply = (text: string, attachment?: Attachment) => {
    if (!hasConversationAccess || !threadMessageId || selectedChannel?.kind !== 'TEXT') return;
    setMessages((all) => ({
      ...all,
      [selectedId]: (all[selectedId] ?? []).map((message) =>
        message.id === threadMessageId
          ? {
              ...message,
              replies: [
                ...(message.replies ?? []),
                {
                  id: `reply-${crypto.randomUUID()}`,
                  authorId: currentUserId,
                  time: 'Vừa xong',
                  text,
                  attachment,
                },
              ],
            }
          : message,
      ),
    }));
  };
  const retry = (messageId: string) => {
    if (!hasConversationAccess) return;
    const update = (list: Message[]) =>
      list.map((message) =>
        message.id === messageId && message.status === 'error'
          ? { ...message, status: 'sending' as const }
          : message,
      );
    if (conversationType === 'channel')
      setMessages((all) => ({
        ...all,
        [selectedId]: update(all[selectedId] ?? []),
      }));
    else
      setDmMessages((all) => ({
        ...all,
        [selectedId]: update(all[selectedId] ?? []),
      }));
    settleMessage(currentWorkspaceId, conversationType, selectedId, messageId, chatSendShouldFail);
  };
  const createChannel = (channel: Channel) => {
    if (!canManage || !hasWorkspaceAccess) return;
    setChannels((list) => [...list, channel]);
    setMessages((all) => ({ ...all, [channel.id]: [] }));
    setCreateOpen(false);
    if (channel.access === 'WORKSPACE' || channel.memberIds?.includes(currentUserId)) {
      setConversationType('channel');
      setSelectedId(channel.id);
      setThreadMessageId(null);
    }
  };

  const isLive = conversationType === 'channel' && selectedChannel?.kind === 'LIVE';
  const title = conversationType === 'dm' ? selectedDm?.name : selectedChannel?.name;
  const activeCallWorkspace = workspaces.find((workspace) => workspace.id === callWorkspaceId);
  const activeCallChannel = activeCallWorkspace?.channels.find(
    (channel) => channel.id === callChannelId,
  );
  const closeMeeting = (endSession = false) => {
    if (endSession) endSessionRecording();
    setActiveCall(false);
    setCallWorkspaceId(null);
    setCallSessionId('');
    setViewerIsCallHost(false);
    setScreen('workspace');
    if (callChannelId) selectConversation('channel', callChannelId);
    setCallChannelId(null);
  };
  const requestJoinLive = (channel: Channel) => {
    if (!activeCall) {
      setDeviceInitialDevices({ mic: true, camera: false });
      setScreen('device');
      return;
    }
    if (callWorkspaceId === currentWorkspaceId && callChannelId === channel.id) {
      setScreen('meeting');
      return;
    }
    const callWorkspace = workspaces.find((workspace) => workspace.id === callWorkspaceId);
    const callChannel = callWorkspace?.channels.find((item) => item.id === callChannelId);
    setCallSwitchError('');
    setCallSwitchTarget({
      workspaceId: currentWorkspaceId,
      channelId: channel.id,
      workspaceName: currentWorkspace.name,
      channelName: channel.name,
    });
    if (!callWorkspace || !callChannel)
      setCallSwitchError(
        'Không còn xác định được cuộc gọi hiện tại. Hãy quay lại cuộc gọi hoặc rời phiên trước khi thử lại.',
      );
  };
  const confirmCallSwitch = () => {
    if (!callSwitchTarget) return;
    const targetWorkspace = workspaces.find(
      (workspace) => workspace.id === callSwitchTarget.workspaceId,
    );
    const targetChannel = targetWorkspace?.channels.find(
      (channel) => channel.id === callSwitchTarget.channelId,
    );
    const canOpenTarget =
      !!targetWorkspace &&
      !targetWorkspace.deleted &&
      targetWorkspace.memberIds.includes(currentUserId) &&
      !!targetChannel &&
      targetChannel.kind === 'LIVE' &&
      (targetChannel.access === 'WORKSPACE' || targetChannel.memberIds?.includes(currentUserId));
    if (!canOpenTarget) {
      setCallSwitchError(
        'Phòng đích không còn tồn tại hoặc bạn không còn quyền truy cập. Cuộc gọi hiện tại vẫn được giữ nguyên.',
      );
      return;
    }
    if (activeCall && viewerIsCallHost) endSessionRecording();
    setActiveCall(false);
    setCallWorkspaceId(null);
    setCallChannelId(null);
    setCallSessionId('');
    setViewerIsCallHost(false);
    setCurrentWorkspaceId(callSwitchTarget.workspaceId);
    setConversationType('channel');
    setSelectedId(callSwitchTarget.channelId);
    setThreadMessageId(null);
    setDeviceInitialDevices({ mic: false, camera: false });
    setCallSwitchTarget(null);
    setCallSwitchError('');
    setScreen('device');
  };
  const openWorkspace = (workspaceId: string) => {
    if (activeCall && callWorkspaceId && workspaceId !== callWorkspaceId) return;
    setCurrentWorkspaceId(workspaceId);
    setSessionView('workspace');
    setScreen('workspace');
    setWorkspaceMenuOpen(false);
    setAccountMenuOpen(false);
    setPeopleOpen(false);
    setRecordingLibraryOpen(false);
    setChannelSettingsOpen(false);
    setManageOpen(false);
    setThreadMessageId(null);
    setConversationType('channel');
    setSelectedId('general');
  };
  const finishLogout = () => {
    if (activeCall && viewerIsCallHost) endSessionRecording();
    setActiveCall(false);
    setCallWorkspaceId(null);
    setViewerIsCallHost(false);
    setScreen('workspace');
    setAuthenticated(false);
    setAuthInitialMode('login');
    setSessionView('auth');
    setPendingInviteGeneration(null);
    setInviteError('');
    setAuthNotice('');
    setWorkspaceMenuOpen(false);
    setAccountMenuOpen(false);
    setLogoutConfirm(false);
  };
  const saveProfile = (name: string, avatarUrl: string | null) => {
    setAccountDisplayName(name);
    setAccountAvatarUrl(avatarUrl);
    setProfileOpen(false);
  };
  const finishPasswordChange = () => {
    finishLogout();
    setPasswordOpen(false);
    setAuthNotice(
      'Mật khẩu đã được đổi và tất cả phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại.',
    );
  };
  const requestLogout = () => {
    setWorkspaceMenuOpen(false);
    setAccountMenuOpen(false);
    if (activeCall && viewerIsCallHost) setLogoutConfirm(true);
    else finishLogout();
  };
  const changeDemoSession = (view: 'auth' | 'workspaces') => {
    setAuthenticated(view === 'workspaces');
    setSessionView(view);
    setScreen('workspace');
    setActiveCall(false);
    setCallWorkspaceId(null);
    setViewerIsCallHost(false);
    setLogoutConfirm(false);
  };
  const changeInviteLinkScenario = (scenario: InviteLinkScenario) => {
    if (scenario === 'rotated' && inviteLinkScenario !== 'rotated')
      setInviteLinkGeneration((generation) => generation + 1);
    setInviteLinkScenario(scenario);
    setInviteError('');
  };
  const changeInviteMembershipScenario = (scenario: InviteMembershipScenario) => {
    setInviteMembershipScenario(scenario);
    setInviteError('');
    setWorkspaces((list) =>
      list.map((workspace) => {
        if (workspace.id !== 'workspace-invite') return workspace;
        const memberIds =
          scenario === 'member'
            ? Array.from(new Set([...workspace.memberIds, currentUserId]))
            : workspace.memberIds.filter((id) => id !== currentUserId);
        const channels =
          scenario === 'member'
            ? workspace.channels
            : workspace.channels.map((channel) =>
                channel.access === 'PRIVATE'
                  ? {
                      ...channel,
                      memberIds: channel.memberIds?.filter((id) => id !== currentUserId),
                    }
                  : channel,
              );
        return { ...workspace, role: 'MEMBER', memberIds, channels };
      }),
    );
  };
  const openDemoInvite = () => {
    const tokenGeneration =
      inviteLinkScenario === 'rotated'
        ? Math.max(0, inviteLinkGeneration - 1)
        : inviteLinkGeneration;
    setPendingInviteGeneration(tokenGeneration);
    setInviteError('');
    setSessionView('invite');
    setWorkspaceMenuOpen(false);
    setAccountMenuOpen(false);
  };
  const beginInviteAuthentication = (mode: AuthMode) => {
    setAuthInitialMode(mode);
    setSessionView('auth');
  };
  const cancelInvite = () => {
    setPendingInviteGeneration(null);
    setInviteError('');
    setSessionView(authenticated ? 'workspaces' : 'auth');
  };
  const confirmInvite = () => {
    if (!authenticated) return;
    if (activeCall && callWorkspaceId !== inviteWorkspace.id) {
      setInviteError(
        'Bạn đang có cuộc gọi trong Workspace khác. Hãy trở lại hoặc rời cuộc gọi trước khi tiếp tục.',
      );
      return;
    }
    if (inviteLinkScenario === 'missing') {
      setInviteError(
        'Workspace của lời mời không còn tồn tại. Bạn có thể quay về danh sách Workspace.',
      );
      return;
    }
    if (inviteLinkScenario === 'disabled') {
      setInviteError(
        'Link mời này đã bị tắt. Hãy liên hệ quản trị viên Workspace để nhận link mới.',
      );
      return;
    }
    if (inviteLinkScenario === 'rotated' || pendingInviteGeneration !== inviteLinkGeneration) {
      setInviteError(
        'Link mời này đã được thay thế và không còn hiệu lực. Hãy dùng link mới nhất.',
      );
      return;
    }
    if (!alreadyInviteMember) {
      setWorkspaces((list) =>
        list.map((workspace) =>
          workspace.id === inviteWorkspace.id
            ? {
                ...workspace,
                role: 'MEMBER',
                memberIds: Array.from(new Set([...workspace.memberIds, currentUserId])),
              }
            : workspace,
        ),
      );
      setInviteMembershipScenario('member');
    }
    setCurrentWorkspaceId(inviteWorkspace.id);
    setPendingInviteGeneration(null);
    setInviteError('');
    setSessionView('workspace');
    setScreen('workspace');
    setThreadMessageId(null);
    selectConversation('channel', 'general');
  };
  const createWorkspace = (name: string) => {
    if (activeCall) return;
    const id = `workspace-${Date.now()}`;
    const workspace: WorkspaceRecord = {
      id,
      name,
      role: 'OWNER',
      memberIds: [currentUserId],
      channels: [
        {
          id: 'general',
          name: 'general',
          kind: 'TEXT',
          access: 'WORKSPACE',
          description: `Trao đổi chung của ${name}`,
        },
      ],
      messages: { general: [] },
      dmMessages: {},
      sample: false,
    };
    setWorkspaces((list) => [...list, workspace]);
    setCurrentWorkspaceId(id);
    setWorkspaceListMode('available');
    setCreateWorkspaceOpen(false);
    setSessionView('workspace');
    setScreen('workspace');
    setThreadMessageId(null);
    selectConversation('channel', 'general');
  };
  return (
    <>
      {accessNotice && (
        <div role="status" className="privacy-note">
          <span>{accessNotice}</span>
          <Button onClick={() => setAccessNotice('')}>Đóng thông báo</Button>
        </div>
      )}
      {sessionView !== 'workspace' && (
        <div className="access-shell">
          <AccessDemoBar
            authenticated={authenticated}
            workspaceListMode={workspaceListMode}
            loginShouldFail={loginShouldFail}
            inviteLinkScenario={inviteLinkScenario}
            inviteMembershipScenario={inviteMembershipScenario}
            onSessionView={changeDemoSession}
            onWorkspaceListMode={setWorkspaceListMode}
            onLoginShouldFail={setLoginShouldFail}
            onInviteLinkScenario={changeInviteLinkScenario}
            onInviteMembershipScenario={changeInviteMembershipScenario}
            onOpenInvite={openDemoInvite}
          />
          {sessionView === 'auth' ? (
            <AuthScreen
              key={`${authInitialMode}-${pendingInviteGeneration === null ? 'direct' : 'invite'}`}
              loginShouldFail={loginShouldFail}
              initialMode={authInitialMode}
              notice={authNotice}
              onSuccess={(registeredName) => {
                if (registeredName) setAccountDisplayName(registeredName);
                setAuthNotice('');
                setAuthenticated(true);
                setSessionView(pendingInviteGeneration === null ? 'workspaces' : 'invite');
              }}
            />
          ) : sessionView === 'invite' ? (
            <InviteScreen
              workspace={inviteWorkspace}
              authenticated={authenticated}
              accountDisplayName={accountDisplayName}
              alreadyMember={alreadyInviteMember}
              error={inviteError}
              onAuthenticate={beginInviteAuthentication}
              onConfirm={confirmInvite}
              onCancel={cancelInvite}
            />
          ) : (
            <WorkspaceListScreen
              workspaceListMode={workspaceListMode}
              workspaces={memberWorkspaces}
              accountDisplayName={accountDisplayName}
              accountAvatarUrl={accountAvatarUrl}
              activeCall={activeCall}
              callWorkspaceId={callWorkspaceId}
              onOpenWorkspace={openWorkspace}
              onCreateWorkspace={() => !activeCall && setCreateWorkspaceOpen(true)}
              onReturnToCall={() => {
                if (callWorkspaceId) setCurrentWorkspaceId(callWorkspaceId);
                setSessionView('workspace');
                setScreen('meeting');
              }}
              onLogout={requestLogout}
            />
          )}
        </div>
      )}
      {sessionView === 'workspace' && screen === 'device' && (
        <DeviceCheck
          key={`${currentWorkspaceId}/${selectedId}/${deviceInitialDevices.mic ? 'mic-on' : 'mic-off'}`}
          channelName={selectedChannel?.name ?? 'Phòng học'}
          initialDevices={deviceInitialDevices}
          onBack={() => setScreen('workspace')}
          onJoin={(nextRole, devices) => {
            setMeetingRole(nextRole);
            setMeetingDevices(devices);
            setViewerIsCallHost(nextRole === 'HOST');
            setCallWorkspaceId(currentWorkspaceId);
            setCallChannelId(selectedId);
            const sessionKey = `${currentWorkspaceId}/${selectedId}`;
            const sid = channelSessions[sessionKey] ?? crypto.randomUUID();
            setCallSessionId(sid);
            setChannelSessions((all) => ({ ...all, [sessionKey]: sid }));
            setActiveCall(true);
            setScreen('meeting');
          }}
        />
      )}
      {activeCall && hasWorkspaceAccess && (
        <MeetingRoom
          participants={currentWorkspaceMembers.map((m) =>
            m.id === currentUserId ? accountMember : m,
          )}
          recording={currentRecording}
          recordingBusy={recordingBusy}
          onRecordStart={startRecording}
          onRecordStop={() => {
            if (viewerIsCallHost && currentRecording) stopRecording(currentRecording.id);
          }}
          onRecordError={() => {
            if (currentRecording)
              setRecordings((list) =>
                list.map((r) =>
                  r.id === currentRecording.id && r.status !== 'READY'
                    ? {
                        ...r,
                        status: 'FAILED',
                        error: 'Ghi hoặc lưu video chưa thành công. Cuộc gọi vẫn tiếp tục.',
                      }
                    : r,
                ),
              );
          }}
          onRecordNearLimit={() => {
            if (currentRecording)
              setRecordings((list) =>
                list.map((r) =>
                  r.id === currentRecording.id && r.status === 'RECORDING'
                    ? { ...r, elapsed: 10795 }
                    : r,
                ),
              );
          }}
          channelName={channels.find((c) => c.id === callChannelId)?.name ?? 'Phòng chung'}
          onDemoRevokeAccess={revokeDemoAccess}
          active={sessionView === 'workspace' && activeCall && screen === 'meeting'}
          initialRole={meetingRole}
          initialDevices={meetingDevices}
          onWorkspace={() => setScreen('workspace')}
          onLeave={() => closeMeeting(false)}
          onEnd={() => closeMeeting(true)}
          onHostStatusChange={setViewerIsCallHost}
        />
      )}
      <div
        className={`app-shell ${
          sessionView !== 'workspace' || screen !== 'workspace' ? 'view-hidden' : ''
        }`}
      >
        <div className="prototype-bar">
          <div>
            <span className="prototype-dot" />
            Bản mẫu — dữ liệu mô phỏng
          </div>
          <DemoTools>
            <span>
              <Icon name="settings" size={14} />
              Tình huống demo <small>chỉ phục vụ prototype</small>
            </span>
            <label>
              <span>Vai trò</span>
              <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
                <option value="MEMBER">Thành viên</option>
                <option value="ADMIN">Quản trị viên</option>
                <option value="OWNER">Chủ Workspace</option>
              </select>
            </label>
            <label>
              <span>Gửi tin</span>
              <select
                value={chatSendShouldFail ? 'error' : 'success'}
                onChange={(e) => setChatSendShouldFail(e.target.value === 'error')}
              >
                <option value="success">Thành công</option>
                <option value="error">Trả lỗi</option>
              </select>
            </label>
            <label>
              <span>Upload avatar</span>
              <select
                value={profileUploadShouldFail ? 'error' : 'success'}
                onChange={(event) => setProfileUploadShouldFail(event.target.value === 'error')}
              >
                <option value="success">Thành công</option>
                <option value="error">Trả lỗi</option>
              </select>
            </label>
            <label>
              <span>Mật khẩu hiện tại</span>
              <select
                value={currentPasswordShouldFail ? 'wrong' : 'correct'}
                onChange={(event) => setCurrentPasswordShouldFail(event.target.value === 'wrong')}
              >
                <option value="correct">Đúng</option>
                <option value="wrong">Sai</option>
              </select>
            </label>
            <Button variant="ghost" onClick={openDemoInvite}>
              Mở lời mời demo
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                updateCurrentWorkspace((w) => ({
                  ...w,
                  memberIds: w.memberIds.filter((id) => id !== currentUserId),
                  channels: w.channels.map((c) =>
                    c.access === 'PRIVATE'
                      ? {
                          ...c,
                          memberIds: c.memberIds?.filter((id) => id !== currentUserId),
                        }
                      : c,
                  ),
                }))
              }
            >
              Mô phỏng bị loại Workspace
            </Button>
            {selectedChannel?.access === 'PRIVATE' && (
              <Button variant="ghost" onClick={revokeDemoAccess}>
                Mô phỏng mất quyền kênh
              </Button>
            )}
            {canManage && (
              <>
                <Button variant="ghost" onClick={() => setManageOpen(true)}>
                  Quản lý PRIVATE
                </Button>
                <Button variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>
                  Tạo kênh
                </Button>
              </>
            )}
          </DemoTools>
        </div>
        {activeCall && callWorkspaceId === currentWorkspaceId && (
          <div className="active-call-strip">
            <span>
              <span className="call-pulse" />
              <strong>Cuộc gọi đang diễn ra</strong> ·{' '}
              {channels.find((c) => c.id === callChannelId)?.name}
            </span>
            <div>
              <span>Mic và camera giữ nguyên trạng thái trong phòng</span>
              <Button variant="primary" icon="phone" onClick={() => setScreen('meeting')}>
                Trở lại cuộc họp
              </Button>
            </div>
          </div>
        )}
        <div className="workspace-shell" key={currentWorkspaceId}>
          <aside className="sidebar">
            <div className="workspace-menu-wrap">
              <button
                className="workspace-switcher"
                onClick={() => {
                  setWorkspaceMenuOpen((open) => !open);
                  setAccountMenuOpen(false);
                }}
                aria-expanded={workspaceMenuOpen}
              >
                <span className="workspace-mark">
                  {currentWorkspace.sample ? 'C5' : workspaceName.slice(0, 2).toUpperCase()}
                </span>
                <span>
                  <strong>{workspaceName}</strong>
                  <small>
                    {currentWorkspace.memberIds.length} thành viên · {roleLabels[role]}
                  </small>
                </span>
                <Icon name="chevron-down" size={16} />
              </button>
              {workspaceMenuOpen && (
                <div className="shell-menu workspace-menu">
                  <div>
                    <span className="workspace-mark">
                      {currentWorkspace.sample ? 'C5' : workspaceName.slice(0, 2).toUpperCase()}
                    </span>
                    <span>
                      <strong>{workspaceName}</strong>
                      <small>Workspace hiện tại</small>
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setWorkspaceMenuOpen(false);
                      setSessionView('workspaces');
                    }}
                  >
                    <Icon name="users" size={16} />
                    <span>
                      <strong>Danh sách Workspace</strong>
                      <small>Chọn hoặc tạo Workspace khác</small>
                    </span>
                  </button>
                  {canManage && (
                    <button
                      onClick={() => {
                        setWorkspaceMenuOpen(false);
                        setWorkspaceSettingsOpen(true);
                      }}
                    >
                      <Icon name="settings" size={16} />
                      <span>
                        <strong>Cài đặt Workspace</strong>
                        <small>Đổi tên và quản lý Workspace</small>
                      </span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setWorkspaceMenuOpen(false);
                      setPeopleOpen(true);
                    }}
                  >
                    <Icon name="users" size={16} />
                    <span>
                      <strong>Thành viên và lời mời</strong>
                      <small>
                        {canManage ? 'Quản lý thành viên và link mời' : 'Xem thành viên Workspace'}
                      </small>
                    </span>
                  </button>
                </div>
              )}
            </div>
            <nav aria-label="Điều hướng Workspace">
              <SidebarSection
                title="Kênh trò chuyện"
                action={
                  canManage && (
                    <IconButton label="Tạo kênh" icon="plus" onClick={() => setCreateOpen(true)} />
                  )
                }
              >
                {visibleChannels
                  .filter((channel) => channel.kind === 'TEXT')
                  .map((channel) => (
                    <SidebarItem
                      key={channel.id}
                      active={conversationType === 'channel' && selectedId === channel.id}
                      icon={channel.access === 'PRIVATE' ? 'lock' : 'hash'}
                      label={channel.name}
                      onClick={() => selectConversation('channel', channel.id)}
                    />
                  ))}
              </SidebarSection>
              <SidebarSection title="Phòng học">
                {visibleChannels
                  .filter((channel) => channel.kind === 'LIVE')
                  .map((channel) => (
                    <SidebarItem
                      key={channel.id}
                      active={conversationType === 'channel' && selectedId === channel.id}
                      icon="phone"
                      label={channel.name}
                      detail={<span className="live-indicator" />}
                      onClick={() => selectConversation('channel', channel.id)}
                    />
                  ))}
              </SidebarSection>
              <SidebarSection title="Tin nhắn riêng">
                {currentWorkspaceMembers
                  .filter((member) => member.id !== currentUserId)
                  .map((member) => (
                    <SidebarItem
                      key={member.id}
                      active={conversationType === 'dm' && selectedId === member.id}
                      label={member.name}
                      detail={member.online && <span className="online-dot" />}
                      onClick={() => selectConversation('dm', member.id)}
                      icon="message"
                    />
                  ))}
              </SidebarSection>
            </nav>
            <div className="current-user">
              <Avatar member={accountMember} size="sm" imageUrl={accountAvatarUrl} />
              <span>
                <strong>{accountDisplayName}</strong>
                <small>Đang hoạt động</small>
              </span>
              <IconButton
                label="Cài đặt tài khoản"
                icon="settings"
                onClick={() => {
                  setAccountMenuOpen((open) => !open);
                  setWorkspaceMenuOpen(false);
                }}
                aria-expanded={accountMenuOpen}
              />
              {accountMenuOpen && (
                <div className="shell-menu account-menu">
                  <div>
                    <Avatar member={accountMember} size="sm" imageUrl={accountAvatarUrl} />
                    <span>
                      <strong>{accountDisplayName}</strong>
                      <small>minh.anh@demo.local</small>
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setAccountMenuOpen(false);
                      setProfileOpen(true);
                    }}
                  >
                    <Icon name="settings" size={16} />
                    <span>
                      <strong>Hồ sơ</strong>
                      <small>Tên và ảnh đại diện</small>
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setAccountMenuOpen(false);
                      setPasswordOpen(true);
                    }}
                  >
                    <Icon name="lock" size={16} />
                    <span>
                      <strong>Đổi mật khẩu</strong>
                      <small>Thu hồi tất cả phiên sau khi đổi</small>
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setAccountMenuOpen(false);
                      setSessionView('workspaces');
                    }}
                  >
                    <Icon name="users" size={16} />
                    <span>
                      <strong>Danh sách Workspace</strong>
                      <small>Rời shell mà không rời cuộc gọi</small>
                    </span>
                  </button>
                  <button className="danger" onClick={requestLogout}>
                    <Icon name="arrow-left" size={16} />
                    <span>
                      <strong>Đăng xuất</strong>
                      <small>Chỉ đăng xuất phiên hiện tại</small>
                    </span>
                  </button>
                </div>
              )}
            </div>
          </aside>
          <section className="conversation-shell">
            {!hasConversationAccess ? (
              <div className="empty-state">
                <h2>Chưa có kênh khả dụng</h2>
                <p>
                  Chọn kênh bạn còn quyền truy cập. Nếu bạn quản lý Workspace, có thể tạo kênh mới
                  từ thanh bên.
                </p>
              </div>
            ) : (
              <>
                <header className="conversation-header">
                  <div className="conversation-title">
                    {conversationType === 'channel' ? (
                      <Icon
                        name={
                          selectedChannel?.access === 'PRIVATE' ? 'lock' : isLive ? 'phone' : 'hash'
                        }
                      />
                    ) : (
                      <Avatar member={selectedDm ?? members[0]} size="sm" />
                    )}
                    <span>
                      <h1>{title}</h1>
                      <small>
                        {conversationType === 'dm'
                          ? `${
                              selectedDm?.online ? 'Đang hoạt động' : 'Ngoại tuyến'
                            } · Tin nhắn chỉ giữa hai bạn`
                          : selectedChannel?.description}
                      </small>
                    </span>
                  </div>
                  <div className="header-actions">
                    {conversationType === 'channel' && !isLive && (
                      <button className="member-count" onClick={() => setPeopleOpen(true)}>
                        <Icon name="users" size={17} />
                        {currentWorkspace.memberIds.length}
                      </button>
                    )}
                    <IconButton
                      label="Thông tin cuộc trò chuyện"
                      icon="info"
                      onClick={() =>
                        conversationType === 'channel'
                          ? setChannelSettingsOpen(true)
                          : setPeopleOpen(true)
                      }
                    />
                  </div>
                </header>
                {isLive && selectedChannel ? (
                  <LiveRoom
                    participants={currentWorkspaceMembers}
                    channel={selectedChannel}
                    onRecordings={() => setRecordingLibraryOpen(true)}
                    onJoin={() => requestJoinLive(selectedChannel)}
                  />
                ) : (
                  <>
                    <div className="messages-scroll">
                      <div className="date-divider">
                        <span>{selectedId === 'general' ? 'Hôm nay' : 'Gần đây'}</span>
                      </div>
                      {currentMessages.length === 0 ? (
                        <EmptyConversation isDm={conversationType === 'dm'} name={title ?? ''} />
                      ) : (
                        currentMessages.map((message) => (
                          <MessageRow
                            key={message.id}
                            message={message}
                            onOpenThread={
                              conversationType === 'channel' && selectedChannel?.kind === 'TEXT'
                                ? () => setThreadMessageId(message.id)
                                : undefined
                            }
                            onRetry={() => retry(message.id)}
                          />
                        ))
                      )}
                    </div>
                    <div className="composer-wrap">
                      <Composer
                        key={`${currentWorkspaceId}-${conversationType}-${selectedId}`}
                        label={
                          conversationType === 'dm'
                            ? `Nhắn cho ${selectedDm?.name}`
                            : `Nhắn #${selectedChannel?.name}`
                        }
                        onSend={sendMessage}
                      />
                    </div>
                  </>
                )}
              </>
            )}{' '}
          </section>
          {hasConversationAccess &&
            threadMessage &&
            conversationType === 'channel' &&
            selectedChannel?.kind === 'TEXT' && (
              <aside className="thread-panel">
                <header>
                  <div>
                    <h2>Luồng thảo luận</h2>
                    <span>#{selectedChannel?.name}</span>
                  </div>
                  <IconButton
                    label="Đóng luồng"
                    icon="close"
                    onClick={() => setThreadMessageId(null)}
                  />
                </header>
                <div className="thread-scroll">
                  <MessageRow message={threadMessage} compact />
                  <div className="reply-divider">
                    <span>{threadMessage.replies?.length ?? 0} trả lời</span>
                  </div>
                  {threadMessage.replies?.map((reply) => (
                    <MessageRow key={reply.id} compact message={{ ...reply }} />
                  ))}
                </div>
                <div className="thread-composer">
                  <Composer
                    label="Trả lời trong luồng…"
                    onSend={(text, attachment) => sendReply(text, attachment)}
                  />
                </div>
              </aside>
            )}
        </div>
        {createOpen && canManage && (
          <CreateChannelDialog
            availableMembers={currentWorkspaceMembers}
            onClose={() => setCreateOpen(false)}
            onCreate={createChannel}
          />
        )}
        {manageOpen && canManage && (
          <ManagePrivateDialog
            availableMembers={currentWorkspaceMembers}
            channels={channels}
            onClose={() => setManageOpen(false)}
            onUpdate={(id, memberIds) =>
              canManage &&
              setChannels((list) =>
                list.map((channel) => (channel.id === id ? { ...channel, memberIds } : channel)),
              )
            }
          />
        )}
      </div>
      {callSwitchTarget && (
        <Dialog
          title="Chuyển sang phòng LIVE khác?"
          description={`Bạn đang ở ${activeCallChannel?.name ?? 'cuộc gọi hiện tại'} và muốn vào ${callSwitchTarget.channelName}.`}
          onClose={() => {
            setCallSwitchTarget(null);
            setCallSwitchError('');
          }}
          footer={
            <>
              <Button
                onClick={() => {
                  setCallSwitchTarget(null);
                  setCallSwitchError('');
                }}
              >
                Hủy
              </Button>
              <Button variant={viewerIsCallHost ? 'danger' : 'primary'} onClick={confirmCallSwitch}>
                {viewerIsCallHost
                  ? 'Kết thúc call cũ và kiểm tra thiết bị'
                  : 'Rời call cũ và kiểm tra thiết bị'}
              </Button>
            </>
          }
        >
          <div className="privacy-note">
            <Icon name="info" />
            <span>
              <strong>
                Cuộc gọi hiện tại: {activeCallWorkspace?.name ?? 'Workspace hiện tại'} ·{' '}
                {activeCallChannel?.name ?? 'Phòng LIVE'}
              </strong>
              {viewerIsCallHost
                ? 'Bạn vẫn là host. Xác nhận sẽ kết thúc call cũ cho mọi người; hệ thống không tự chọn host mới. Hủy để quay lại bàn giao host trước.'
                : 'Xác nhận chỉ rời tài khoản của bạn khỏi call cũ; những người khác vẫn tiếp tục.'}
            </span>
          </div>
          <div className="privacy-note">
            <Icon name="phone" />
            <span>
              <strong>
                Phòng đích: {callSwitchTarget.workspaceName} · {callSwitchTarget.channelName}
              </strong>
              Sau khi xác nhận, bạn sẽ kiểm tra thiết bị với mic và camera tắt trước khi chủ động
              tham gia.
            </span>
          </div>
          {callSwitchError && (
            <div className="auth-error" role="alert">
              <Icon name="info" size={17} />
              <span>
                <strong>Không thể chuyển phòng</strong>
                {callSwitchError}
              </span>
            </div>
          )}
        </Dialog>
      )}
      {recordingLibraryOpen && hasConversationAccess && selectedChannel?.kind === 'LIVE' && (
        <RecordingLibrary
          onDemoRevoke={revokeDemoAccess}
          records={recordings.filter(
            (r) => r.workspaceId === currentWorkspaceId && r.channelId === selectedId,
          )}
          channelName={selectedChannel.name}
          onClose={() => setRecordingLibraryOpen(false)}
        />
      )}
      {workspaceSettingsOpen && canManage && (
        <WorkspaceSettingsDialog
          workspace={currentWorkspace}
          onClose={() => setWorkspaceSettingsOpen(false)}
          onRename={(name) => {
            if (!canManage) return;
            updateCurrentWorkspace((w) => ({ ...w, name }));
            setWorkspaceSettingsOpen(false);
          }}
          onDelete={() => {
            if (role !== 'OWNER') return;
            updateCurrentWorkspace((w) => ({
              ...w,
              deleted: true,
              memberIds: [],
              channels: [],
            }));
            setWorkspaceSettingsOpen(false);
          }}
        />
      )}
      {channelSettingsOpen && selectedChannel && hasConversationAccess && (
        <ChannelSettingsDialog
          key={selectedChannel.id}
          channel={selectedChannel}
          canManage={canManage}
          onClose={() => setChannelSettingsOpen(false)}
          onRename={(name) => {
            if (!canManage) return;
            setChannels((list) => list.map((c) => (c.id === selectedId ? { ...c, name } : c)));
            setChannelSettingsOpen(false);
          }}
          onDelete={() => {
            if (!canManage) return;
            setChannels((list) => list.filter((c) => c.id !== selectedId));
            setChannelSettingsOpen(false);
          }}
        />
      )}
      {peopleOpen && (
        <WorkspacePeopleDialog
          workspace={currentWorkspace}
          accountName={accountDisplayName}
          onClose={() => setPeopleOpen(false)}
          onUpdate={updateCurrentWorkspace}
          onInviteChange={(enabled, generation) => {
            if (!canManage) return;
            updateCurrentWorkspace((w) => ({
              ...w,
              inviteEnabled: enabled,
              inviteGeneration: generation,
            }));
            if (currentWorkspaceId === 'workspace-invite') {
              setInviteLinkScenario(enabled ? 'active' : 'disabled');
              setInviteLinkGeneration(generation);
            }
          }}
        />
      )}
      {createWorkspaceOpen && (
        <CreateWorkspaceDialog
          onClose={() => setCreateWorkspaceOpen(false)}
          onCreate={createWorkspace}
        />
      )}
      {profileOpen && (
        <ProfileDialog
          currentName={accountDisplayName}
          email="minh.anh@demo.local"
          avatarUrl={accountAvatarUrl}
          uploadShouldFail={profileUploadShouldFail}
          onClose={() => setProfileOpen(false)}
          onSave={saveProfile}
        />
      )}
      {passwordOpen && (
        <PasswordDialog
          currentPasswordShouldFail={currentPasswordShouldFail}
          activeCall={activeCall}
          isCallHost={viewerIsCallHost}
          onClose={() => setPasswordOpen(false)}
          onSuccess={finishPasswordChange}
        />
      )}
      {logoutConfirm && (
        <Dialog
          title="Đăng xuất và kết thúc cuộc gọi?"
          description="Bạn vẫn là host của Phòng học chung. Đăng xuất lúc này sẽ kết thúc cuộc gọi cho mọi người."
          onClose={() => setLogoutConfirm(false)}
          footer={
            <>
              <Button onClick={() => setLogoutConfirm(false)}>Hủy</Button>
              <Button variant="danger" onClick={finishLogout}>
                Kết thúc cuộc gọi và đăng xuất
              </Button>
            </>
          }
        >
          <div className="privacy-note">
            <Icon name="phone" />
            <span>
              <strong>Phiên hiện tại sẽ được đăng xuất.</strong>Các phiên độc lập khác không bị ảnh
              hưởng.
            </span>
          </div>
        </Dialog>
      )}
    </>
  );
}
