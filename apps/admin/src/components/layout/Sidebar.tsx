import { NavLink, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../hooks/useAdminAuth';

const NAV_ITEMS = [
  { to: '/admin', label: '数据概览', icon: '📊', end: true },
  { to: '/admin/users', label: '用户管理', icon: '👥' },
  { to: '/admin/conversations', label: '对话数据', icon: '💬' },
  { to: '/admin/safety', label: '安全事件', icon: '🛡️' },
  { to: '/admin/recovery', label: '恢复计划', icon: '📅' },
];

function CurrentTime() {
  const now = new Date();
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  const str = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return <span className="text-xs text-neutral-500">{str}</span>;
}

export default function Sidebar() {
  const { clear } = useAdminAuth();
  const navigate = useNavigate();

  function handleLogout() {
    clear();
    navigate('/admin/login', { replace: true });
  }

  return (
    <aside className="flex h-full w-56 flex-col bg-neutral-900 text-neutral-300">
      {/* logo */}
      <div className="flex items-center gap-2 px-5 py-6">
        <span className="text-lg font-bold text-white">情感陪伴</span>
        <span className="text-xs text-neutral-500">运营后台</span>
      </div>

      {/* nav */}
      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                isActive
                  ? 'bg-neutral-700 text-white font-medium'
                  : 'hover:bg-neutral-800 hover:text-white'
              }`
            }
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* footer */}
      <div className="border-t border-neutral-800 px-5 py-4 space-y-2">
        <CurrentTime />
        <button
          type="button"
          onClick={handleLogout}
          className="block w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
        >
          退出登录
        </button>
      </div>
    </aside>
  );
}
