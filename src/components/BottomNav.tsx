import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/', icon: '🏠', label: 'ホーム' },
  { to: '/kakeibo', icon: '📊', label: '家計簿' },
  { to: '/history', icon: '📜', label: '履歴/分析' },
  { to: '/settings', icon: '⚙️', label: '設定' },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.to === '/'}
          className={({ isActive }) =>
            `nav-item${isActive ? ' active' : ''}`
          }
          aria-label={t.label}
        >
          <span className="nav-icon">{t.icon}</span>
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
