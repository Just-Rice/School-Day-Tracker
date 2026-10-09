import { useAuth } from '../auth/AuthProvider';
import { Page } from '../components/ui';
import AboutCard from '../components/account/AboutCard';
import AccountCard from '../components/account/AccountCard';
import AppearanceCard from '../components/account/AppearanceCard';
import DataCard from '../components/account/DataCard';
import ProfileCard from '../components/account/ProfileCard';
import ScheduleCard from '../components/account/ScheduleCard';
import './account.css';

export default function SettingsPage() {
  const { user } = useAuth();
  return (
    <Page title="Settings" subtitle={user ? 'Changes sync to every device where you’re signed in.' : 'Changes are saved on this device.'}>
      <AccountCard />
      <ProfileCard />
      <AppearanceCard />
      <ScheduleCard />
      <DataCard />
      <AboutCard />
    </Page>
  );
}
