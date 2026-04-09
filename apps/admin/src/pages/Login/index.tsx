import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { verifyAdminToken } from '../../api/client';

export default function LoginPage() {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { save } = useAdminAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) {
      setError('请输入 Admin Token');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const ok = await verifyAdminToken(trimmed);
      if (ok) {
        save(trimmed);
        navigate('/admin', { replace: true });
      } else {
        setError('Token 验证失败，请检查后重试');
      }
    } catch {
      setError('服务连接失败，请确认后台已启动');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-neutral-100">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm"
      >
        <h1 className="mb-1 text-xl font-bold text-neutral-800">
          情感陪伴 · 运营后台
        </h1>
        <p className="mb-6 text-sm text-neutral-400">请输入管理员令牌以登录</p>

        <label className="mb-2 block text-sm font-medium text-neutral-600">
          Admin Token
        </label>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="请输入 Token"
          className="mb-4 w-full rounded-lg border border-neutral-300 px-4 py-2.5 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          autoFocus
        />

        {error && (
          <p className="mb-3 text-sm text-red-500">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-primary-600 py-2.5 text-sm font-medium text-white transition hover:bg-primary-700 disabled:opacity-50"
        >
          {loading ? '验证中...' : '确认登录'}
        </button>
      </form>
    </div>
  );
}
