import { useQuery } from '@tanstack/react-query';
import { Link, Route, Routes } from 'react-router-dom';
import { getSystemStatus } from '../lib/api/system';

function HomePage() {
  const status = useQuery({
    queryKey: ['system', 'status'],
    queryFn: ({ signal }) => getSystemStatus(signal),
    refetchInterval: 15_000,
  });
  const label = (value: string | undefined) => {
    if (value === 'connected') return 'Đã kết nối';
    if (value === 'disabled') return 'Chưa bật';
    return 'Chưa kết nối';
  };

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Không gian học tập">
        <Link className="brand" to="/">
          <span className="brand-mark" aria-hidden="true">
            C
          </span>
          CoLearnia
        </Link>
        <div className="workspace-heading">KHÔNG GIAN HỌC TẬP</div>
        <div className="sidebar-empty">
          <span aria-hidden="true">＋</span>
          <strong>Chưa có Workspace</strong>
          <p>Các kênh trò chuyện và phòng học của bạn sẽ xuất hiện tại đây.</p>
        </div>
        <div className="sidebar-footer">Cùng học. Cùng kết nối.</div>
      </aside>

      <main className="content">
        <header className="topbar">
          <span>Không gian học tập & cộng tác</span>
          <span className="environment">Bản khởi tạo</span>
        </header>
        <section className="welcome">
          <p className="eyebrow">CHÀO MỪNG ĐẾN VỚI COLEARNIA</p>
          <h1>
            Mỗi nhóm học,
            <br />
            một nơi kết nối.
          </h1>
          <p className="lead">
            Trò chuyện theo chủ đề, chia sẻ tài liệu và gặp nhau trong phòng học trực tiếp. Cùng
            giải thích, cùng thảo luận, cùng tiến bộ.
          </p>
          <div className="feature-grid">
            <article>
              <span className="feature-icon" aria-hidden="true">
                #
              </span>
              <h2>Kênh trò chuyện</h2>
              <p>Thông báo, tài liệu và hỏi đáp được sắp xếp theo từng chủ đề.</p>
            </article>
            <article>
              <span className="feature-icon" aria-hidden="true">
                ◉
              </span>
              <h2>Phòng học trực tiếp</h2>
              <p>Gặp nhau qua cuộc gọi, chia sẻ màn hình và trao đổi trong nhóm.</p>
            </article>
            <article>
              <span className="feature-icon" aria-hidden="true">
                ↗
              </span>
              <h2>Cùng nhau giải bài</h2>
              <p>Tạm dừng hình để chỉ bài, rồi trở lại nội dung đang được chia sẻ.</p>
            </article>
          </div>
        </section>

        <section className="status-panel" aria-labelledby="status-title">
          <div className="status-heading">
            <div>
              <p className="eyebrow">MÔI TRƯỜNG PHÁT TRIỂN</p>
              <h2 id="status-title">Kết nối dịch vụ</h2>
            </div>
            <button
              type="button"
              onClick={() => void status.refetch()}
              disabled={status.isFetching}
            >
              {status.isFetching ? 'Đang kiểm tra…' : 'Kiểm tra lại'}
            </button>
          </div>
          <div className="status-items" aria-live="polite">
            <div>
              <span>Máy chủ</span>
              <strong className={status.isSuccess ? 'connected' : ''}>
                {status.isPending
                  ? 'Đang kết nối…'
                  : status.isError
                    ? 'Không kết nối được'
                    : 'Đã kết nối'}
              </strong>
            </div>
            <div>
              <span>Cơ sở dữ liệu</span>
              <strong className={status.data?.database === 'connected' ? 'connected' : ''}>
                {label(status.data?.database)}
              </strong>
            </div>
            <div>
              <span>Media worker</span>
              <strong className={status.data?.media === 'connected' ? 'connected' : ''}>
                {label(status.data?.media)}
              </strong>
            </div>
          </div>
          <p className="scaffold-note">
            Đây là giao diện nền của project. Tài khoản, Workspace, kênh và cuộc gọi sẽ được triển
            khai theo kế hoạch kỹ thuật v2.
          </p>
        </section>
      </main>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="*"
        element={
          <main className="not-found">
            <h1>Không tìm thấy trang</h1>
            <Link to="/">Về trang chính</Link>
          </main>
        }
      />
    </Routes>
  );
}
