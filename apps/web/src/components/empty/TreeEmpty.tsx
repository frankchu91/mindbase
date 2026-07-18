import { FolderTree } from 'lucide-react';
import { EmptyState } from './EmptyState';

interface Props {
  onCreate: () => void;
}

export function TreeEmpty({ onCreate }: Props) {
  return (
    <EmptyState
      icon={FolderTree}
      title="No notes here yet"
      cta={{ label: '+ Create note', onClick: onCreate }}
    />
  );
}
