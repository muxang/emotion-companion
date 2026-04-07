import { Navigate, Route, Routes } from 'react-router-dom';
import { ChatPage } from './pages/Chat/ChatPage.js';
import { useAuth } from './hooks/useAuth.js';

export function App(): JSX.Element {
  // 在挂载时启动匿名登录流程；ChatPage 内部会根据 status 显示 loading/error
  useAuth();

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/chat" replace />} />
      <Route path="/chat" element={<ChatPage />} />
      <Route path="*" element={<Navigate to="/chat" replace />} />
    </Routes>
  );
}
