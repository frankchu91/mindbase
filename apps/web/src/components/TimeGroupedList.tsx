// apps/web/src/components/TimeGroupedList.tsx
import { Fragment, type ReactNode } from 'react';
import { bucketByTime, type BucketMode } from '../lib/time-buckets';

interface Props<T> {
  items: T[];
  dateOf: (item: T) => string;
  mode: BucketMode;
  renderItem: (item: T) => ReactNode;
  emptyMessage?: string;
}

export function TimeGroupedList<T>({ items, dateOf, mode, renderItem, emptyMessage }: Props<T>) {
  if (items.length === 0) {
    return (
      <div className="px-3 py-6 text-[11px] text-center" style={{ color: 'var(--text-low)' }}>
        {emptyMessage ?? 'Nothing here yet.'}
      </div>
    );
  }

  const buckets = bucketByTime(items, dateOf, mode);

  return (
    <div>
      {buckets.map((bucket) => (
        <Fragment key={bucket.label}>
          <div
            className="px-2.5 pt-2.5 pb-1 flex items-center justify-between"
            style={{ color: 'var(--text-low)' }}
          >
            <span
              className="text-[9px] font-semibold uppercase"
              style={{ letterSpacing: '1.5px' }}
            >
              {bucket.label}
            </span>
            <span className="text-[9px]" style={{ color: 'var(--text-faint)' }}>
              {bucket.items.length}
            </span>
          </div>
          {bucket.items.map((item) => (
            <Fragment key={(item as { key?: string }).key ?? Math.random()}>
              {renderItem(item)}
            </Fragment>
          ))}
        </Fragment>
      ))}
    </div>
  );
}
