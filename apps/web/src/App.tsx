import { Navigate, Route, Routes } from 'react-router-dom';
import { ChatPage } from './pages/Chat/ChatPage.js';
import { AnalysisPage } from './pages/Analysis/AnalysisPage.js';
import { GrowthPage } from './pages/Growth/GrowthPage.js';
import { RecoveryPage } from './pages/Recovery/RecoveryPage.js';
import { SettingsPage } from './pages/Settings/SettingsPage.js';
import { useAuth } from './hooks/useAuth.js';

export function App(): JSX.Element {
  // 在挂载时启动匿名登录流程；页面组件根据 status 显示 loading/error
  useAuth();

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/chat" replace />} />
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/analysis" element={<AnalysisPage />} />
      <Route path="/growth" element={<GrowthPage />} />
      <Route path="/recovery" element={<RecoveryPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/chat" replace />} />
    </Routes>
  );
}
