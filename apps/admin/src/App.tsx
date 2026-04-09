import { Navigate, Route, Routes } from 'react-router-dom';
import AdminLayout from './components/layout/AdminLayout';
import { useAdminAuth } from './hooks/useAdminAuth';
import LoginPage from './pages/Login';
import OverviewPage from './pages/Overview';
import UsersPage from './pages/Users';
import UserDetailPage from './pages/UserDetail';
import ConversationsPage from './pages/Conversations';
import SafetyPage from './pages/Safety';
import RecoveryPage from './pages/Recovery';

function RequireAuth({ children }: { children: JSX.Element }) {
  const { token } = useAdminAuth();
  if (!token) return <Navigate to="/admin/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/admin/login" element={<LoginPage />} />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="users/:id" element={<UserDetailPage />} />
        <Route path="conversations" element={<ConversationsPage />} />
        <Route path="safety" element={<SafetyPage />} />
        <Route path="recovery" element={<RecoveryPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
