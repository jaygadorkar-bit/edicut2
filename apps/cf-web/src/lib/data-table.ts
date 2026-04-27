import type { CSSProperties } from 'react';
import type { Column } from '@tanstack/react-table';

export function getCommonPinningStyles<TData>({
  column,
}: {
  column: Column<TData>;
}): CSSProperties {
  const pinned = column.getIsPinned();

  if (!pinned) {
    return {};
  }

  const isLastLeftPinnedColumn = pinned === 'left' && column.getIsLastColumn('left');
  const isFirstRightPinnedColumn = pinned === 'right' && column.getIsFirstColumn('right');

  return {
    position: 'sticky',
    left: pinned === 'left' ? `${column.getStart('left')}px` : undefined,
    right: pinned === 'right' ? `${column.getAfter('right')}px` : undefined,
    zIndex: 1,
    background: 'var(--background)',
    boxShadow: isLastLeftPinnedColumn
      ? '-4px 0 4px -4px rgb(0 0 0 / 0.2) inset'
      : isFirstRightPinnedColumn
        ? '4px 0 4px -4px rgb(0 0 0 / 0.2) inset'
        : undefined,
  };
}
