import { SetupWizard } from './SetupWizard';

export function SettingsPage({ onBack }: { onBack?: () => void }) {
  return <SetupWizard mode="settings" onBack={onBack} onComplete={onBack} />;
}
