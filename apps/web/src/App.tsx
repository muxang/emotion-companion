import { Routes, Route, Link } from 'react-router-dom';

function HomePage(): JSX.Element {
  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold text-warm-700">情感陪伴助手</h1>
      <p className="mt-4 text-warm-700/80">
        Phase 0：项目骨架已就绪。后续阶段将逐步接入对话、分析、恢复计划与安全模块。
      </p>
      <nav className="mt-6 flex gap-4 text-warm-500">
        <Link to="/chat">对话</Link>
      </nav>
    </div>
  );
}

function ChatPlaceholder(): JSX.Element {
  return (
    <div className="mx-auto max-w-xl p-8">
      <h2 className="text-xl font-semibold">对话页（占位）</h2>
      <p className="mt-2 text-sm">将在 Phase 1 接入流式对话。</p>
    </div>
  );
}

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/chat" element={<ChatPlaceholder />} />
    </Routes>
  );
}
