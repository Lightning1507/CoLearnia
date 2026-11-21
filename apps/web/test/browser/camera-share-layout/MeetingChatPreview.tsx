import { useState } from 'react';

type MeetingChatPreviewProps = { draft: string; onDraftChange: (draft: string) => void };

export function MeetingPeoplePreview() {
  const [query, setQuery] = useState('');
  const members = ['Minh Anh', 'Lan Chi', 'Gia Khoa', 'Thảo Vy', 'Hoàng Nam'];
  return (
    <div className="camera-layout-people">
      <label>
        <span className="sr-only">Tìm người trong danh sách mô phỏng</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm người tham gia"
        />
      </label>
      <p>5 người · dữ liệu mô phỏng</p>
      <ul aria-label="Người tham gia mẫu">
        {members
          .filter((name) => name.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')))
          .map((name) => (
            <li key={name}>
              <span className="camera-layout-chat-avatar" aria-hidden="true">
                {name
                  .split(' ')
                  .map((part) => part[0])
                  .join('')}
              </span>
              <div>
                <strong>
                  {name}
                  {name === 'Minh Anh' ? ' (Bạn)' : ''}
                </strong>
                <span>
                  {name === 'Lan Chi' ? 'Host · Phòng chung' : 'Thành viên · Phòng chung'}
                </span>
              </div>
            </li>
          ))}
      </ul>
    </div>
  );
}

// Presentation fixture only. M2-T6.3 owns delivery, history, images and recipient access.
export function MeetingChatPreview({ draft, onDraftChange }: MeetingChatPreviewProps) {
  return (
    <div className="camera-layout-chat-preview">
      <ol className="camera-layout-chat-list" aria-label="Tin nhắn mẫu, dữ liệu mô phỏng">
        <li>
          <span className="camera-layout-chat-avatar" aria-hidden="true">
            LC
          </span>
          <div>
            <div className="camera-layout-chat-meta">
              <strong>Lan Chi</strong>
              <span>19:20 · Mọi người</span>
            </div>
            <p>Mọi người xem sơ đồ trên màn hình nhé. Mình sẽ đi qua từng bước.</p>
          </div>
        </li>
        <li>
          <span className="camera-layout-chat-avatar" aria-hidden="true">
            GK
          </span>
          <div>
            <div className="camera-layout-chat-meta">
              <strong>Gia Khoa</strong>
              <span>19:21 · Mọi người</span>
            </div>
            <p>Mình đã thấy nội dung chia sẻ rồi.</p>
          </div>
        </li>
        <li>
          <span className="camera-layout-chat-avatar" aria-hidden="true">
            TV
          </span>
          <div>
            <div className="camera-layout-chat-meta">
              <strong>Thảo Vy</strong>
              <span>19:22 · Mọi người</span>
            </div>
            <p>Ví dụ minh họa luồng xử lý:</p>
            <svg
              className="camera-layout-chat-image"
              viewBox="0 0 220 100"
              role="img"
              aria-label="Ảnh sơ đồ mẫu, không phải ảnh được gửi qua chat"
            >
              <rect width="220" height="100" rx="6" fill="var(--cl-color-canvas)" />
              <path d="M58 50h25m55 0h25" stroke="var(--cl-color-border-control)" strokeWidth="2" />
              {[16, 87, 158].map((x, index) => (
                <g key={x}>
                  <rect
                    x={x}
                    y="32"
                    width="46"
                    height="36"
                    rx="5"
                    fill="var(--workspace-channel-selected-bg)"
                  />
                  <text
                    x={x + 23}
                    y="54"
                    textAnchor="middle"
                    fill="var(--workspace-channel-selected-text)"
                    fontSize="12"
                  >
                    {['Web', 'API', 'DB'][index]}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </li>
      </ol>
      <div className="camera-layout-chat-composer">
        <label className="camera-layout-chat-target">
          Gửi đến{' '}
          <select disabled aria-label="Đích chat mô phỏng">
            <option>Mọi người trong Phòng chung</option>
          </select>
        </label>
        <div className="camera-layout-chat-input">
          <button type="button" disabled aria-label="Đính kèm ảnh chưa triển khai trong preview">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <circle cx="8" cy="8" r="1" />
              <path d="m3 17 6-6 4 4 3-3 5 5" />
            </svg>
          </button>
          <label className="camera-layout-chat-draft">
            <span className="sr-only">Bản nháp chat mô phỏng</span>
            <textarea
              rows={2}
              value={draft}
              placeholder="Nhập bản nháp…"
              onChange={(event) => onDraftChange(event.target.value)}
            />
          </label>
          <button type="button" disabled aria-label="Gửi tin chưa triển khai trong preview">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path d="m3 3 18 9-18 9 4-9zm4 9h14" />
            </svg>
          </button>
        </div>
        <p className="camera-layout-chat-limit">
          Mẫu bố cục · chưa gửi/nhận tin hoặc ảnh. Nghiệp vụ chat thuộc M2-T6.3.
        </p>
      </div>
    </div>
  );
}
