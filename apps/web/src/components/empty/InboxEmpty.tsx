import { Inbox } from 'lucide-react';
import { EmptyState } from './EmptyState';

export function InboxEmpty() {
  return (
    <EmptyState
      icon={Inbox}
      title="Inbox is empty"
      subtitle="Captured items appear here for triage."
    />
  );
}
