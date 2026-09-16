import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import InstallButton from '../components/InstallButton';
import './landing.css';

const FEATURES: { icon: string; title: string; desc: string }[] = [
  {
    icon: '⚡',
    title: 'Không cài đặt, không tài khoản',
    desc: 'Mở link là dùng được ngay trên trình duyệt. Dữ liệu lưu cục bộ, riêng tư tuyệt đối.',
  },
  {
    icon: '📦',
    title: 'Collection & môi trường',
    desc: 'Gom request theo collection, dùng biến {{baseUrl}} cho nhiều môi trường, chạy cả bộ một lần.',
  },
  {
    icon: '✅',
    title: 'Kiểm thử tự động',
    desc: 'Viết assertion cho status, thời gian, body, header. Collection Runner chạy lặp, data-driven CSV/JSON.',
  },
  {
    icon: '🔑',
    title: 'Auth & script linh hoạt',
    desc: 'Bearer, Basic, API key. Pre/post-script và tự trích token từ response vào biến môi trường.',
  },
  {
    icon: '🔄',
    title: 'Đồng bộ cloud tùy chọn',
    desc: 'Đăng nhập để đồng bộ workspace qua nhiều thiết bị — hoặc dùng offline hoàn toàn, tùy bạn.',
  },
  {
    icon: '📥',
    title: 'Import & export',
    desc: 'Nhập từ Postman hay cURL, xuất workspace ra JSON, chia sẻ request qua link chỉ một cú bấm.',
  },
];

const STEPS: { n: string; title: string; desc: string }[] = [
  { n: '1', title: 'Nhập URL', desc: 'Dán endpoint hoặc dùng biến môi trường {{baseUrl}}.' },
  { n: '2', title: 'Cấu hình', desc: 'Chọn method, thêm params, headers, auth và body.' },
  {
    n: '3',
    title: 'Gửi & kiểm tra',
    desc: 'Xem response, chạy assertion, so sánh giữa các lần gọi.',
  },
];

function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.15 },
    );
    root.querySelectorAll('.reveal').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return ref;
}

export default function Landing() {
  const ref = useReveal();

  return (
    <div className="landing" data-theme="dark" ref={ref}>
      <div className="lp-orb lp-orb-1" aria-hidden />
      <div className="lp-orb lp-orb-2" aria-hidden />

      <header className="lp-nav">
        <img
          className="lp-logo-img"
          src={`${import.meta.env.BASE_URL}curly-logo-horizontal.svg`}
          alt="curly"
          height={30}
        />
        <div className="lp-nav-right">
          <InstallButton className="lp-btn ghost sm" />
          <Link className="lp-nav-cta" to="/app">
            Mở ứng dụng
          </Link>
        </div>
      </header>

      <section className="lp-hero">
        <span className="lp-badge lp-fade" style={{ animationDelay: '0.05s' }}>
          Miễn phí · Mã nguồn mở
        </span>
        <h1 className="lp-title lp-fade" style={{ animationDelay: '0.15s' }}>
          API client bạn mở ra
          <br />
          <span className="lp-title-accent">là gọi được ngay.</span>
        </h1>
        <p className="lp-sub lp-fade" style={{ animationDelay: '0.28s' }}>
          Không cài đặt, không tài khoản. Dán URL, bấm Send — có ngay response. Đủ mạnh cho việc
          hằng ngày, nhẹ như một tab trình duyệt.
        </p>
        <div className="lp-actions lp-fade" style={{ animationDelay: '0.4s' }}>
          <Link className="lp-btn primary" to="/app">
            Dùng thử ngay
          </Link>
          <a
            className="lp-btn ghost"
            href="https://github.com/hanhlt107/curly"
            target="_blank"
            rel="noreferrer"
          >
            Xem trên GitHub
          </a>
        </div>

        <div className="lp-demo lp-fade" style={{ animationDelay: '0.55s' }}>
          <div className="lp-demo-bar">
            <span className="lp-demo-method">GET</span>
            <span className="lp-demo-url">https://api.example.com/users</span>
            <span className="lp-demo-send">Send</span>
          </div>
          <div className="lp-demo-resp">
            <span className="lp-demo-status">200 OK</span>
            <span className="lp-demo-time">128 ms</span>
            <span className="lp-demo-size">2.4 KB</span>
          </div>
        </div>

        <div className="lp-methods lp-fade" style={{ animationDelay: '0.68s' }}>
          <span className="lp-m get">GET</span>
          <span className="lp-m post">POST</span>
          <span className="lp-m put">PUT</span>
          <span className="lp-m del">DELETE</span>
          <span className="lp-m patch">PATCH</span>
        </div>
      </section>

      <section className="lp-section">
        <h2 className="lp-h2 reveal">Đủ tính năng cho công việc hằng ngày</h2>
        <div className="lp-grid">
          {FEATURES.map((f, i) => (
            <div
              className="lp-card reveal"
              key={f.title}
              style={{ transitionDelay: `${i * 0.07}s` }}
            >
              <span className="lp-card-icon">{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section">
        <h2 className="lp-h2 reveal">Ba bước là xong</h2>
        <div className="lp-steps">
          {STEPS.map((s, i) => (
            <div className="lp-step reveal" key={s.n} style={{ transitionDelay: `${i * 0.1}s` }}>
              <span className="lp-step-n">{s.n}</span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-cta reveal">
        <h2>Sẵn sàng gọi API đầu tiên?</h2>
        <Link className="lp-btn primary lg" to="/app">
          Bắt đầu ngay
        </Link>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-top">
          <div className="lp-footer-brand">
            <img
              className="lp-logo-img"
              src={`${import.meta.env.BASE_URL}curly-logo-horizontal.svg`}
              alt="curly"
              height={26}
            />
            <span>Công cụ kiểm thử REST API</span>
          </div>
          <nav className="lp-footer-links">
            <Link to="/app">Mở ứng dụng</Link>
            <a href="https://github.com/hanhlt107/curly#readme" target="_blank" rel="noreferrer">
              Tài liệu
            </a>
            <a href="https://github.com/hanhlt107/curly/issues" target="_blank" rel="noreferrer">
              Báo lỗi
            </a>
            <a href="https://github.com/hanhlt107/curly" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </nav>
        </div>
        <div className="lp-footer-bottom">
          <span>© {new Date().getFullYear()} curly · MIT</span>
          <span className="lp-status">
            <i className="lp-status-dot" />
            Miễn phí & mã nguồn mở
          </span>
        </div>
      </footer>
    </div>
  );
}
