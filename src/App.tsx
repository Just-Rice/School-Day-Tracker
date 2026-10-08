import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { DataProvider } from './data/DataProvider';
import Layout from './components/Layout';
import TodayPage from './pages/TodayPage';
import WeekPage from './pages/WeekPage';
import SchedulePage from './pages/SchedulePage';
import ClassesPage from './pages/ClassesPage';
import ClassDetailPage from './pages/ClassDetailPage';
import ClassEditPage from './pages/ClassEditPage';
import HomeworkPage from './pages/HomeworkPage';
import HomeworkEditPage from './pages/HomeworkEditPage';
import MapPage from './pages/MapPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';

// HashRouter so deep links work on GitHub Pages without server rewrites.
export default function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <HashRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/welcome" element={<OnboardingPage />} />
            <Route element={<Layout />}>
              <Route index element={<TodayPage />} />
              <Route path="week" element={<WeekPage />} />
              <Route path="schedule" element={<SchedulePage />} />
              <Route path="classes" element={<ClassesPage />} />
              <Route path="classes/new" element={<ClassEditPage />} />
              <Route path="classes/:id" element={<ClassDetailPage />} />
              <Route path="classes/:id/edit" element={<ClassEditPage />} />
              <Route path="homework" element={<HomeworkPage />} />
              <Route path="homework/new" element={<HomeworkEditPage />} />
              <Route path="homework/:id" element={<HomeworkEditPage />} />
              <Route path="map" element={<MapPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </HashRouter>
      </DataProvider>
    </AuthProvider>
  );
}
