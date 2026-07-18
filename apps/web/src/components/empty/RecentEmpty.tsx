import { Clock } from 'lucide-react';
import { EmptyState } from './EmptyState';

export function RecentEmpty() {
  return (
    <EmptyState
      icon={Clock}
      title="No recent notes"
      subtitle="Notes you open will appear here."
      size="compact"
    />
  );
}
