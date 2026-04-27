import type { LucideIcon } from 'lucide-react';
import type { RowData, SortingState } from '@tanstack/react-table';

export interface Option {
  label: string;
  value: string;
  icon?: LucideIcon;
  count?: number;
}

export type DataTableColumnVariant =
  | 'text'
  | 'number'
  | 'range'
  | 'date'
  | 'dateRange'
  | 'select'
  | 'multiSelect';

export type ExtendedColumnSort<TData> = Extract<SortingState[number], { id: string }> & {
  id: Extract<keyof TData, string> | string;
};

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string;
    placeholder?: string;
    variant?: DataTableColumnVariant;
    options?: Option[];
    range?: [number, number];
    unit?: string;
  }
}
