import { createParser } from 'nuqs';
import type { ExtendedColumnSort } from '@/types/data-table';

export function getSortingStateParser<TData>(columnIds: Set<string>) {
  return createParser<ExtendedColumnSort<TData>[]>({
    parse: (value) => {
      if (!value) {
        return [];
      }

      const parsed = value
        .split(',')
        .map((item) => {
          const [id, order = 'asc'] = item.split('.');

          if (!id || !columnIds.has(id)) {
            return null;
          }

          return {
            id,
            desc: order === 'desc',
          };
        })
        .filter((item): item is ExtendedColumnSort<TData> => item !== null);

      return parsed;
    },
    serialize: (value) =>
      value
        .filter((item) => item.id && columnIds.has(String(item.id)))
        .map((item) => `${item.id}.${item.desc ? 'desc' : 'asc'}`)
        .join(','),
    eq: (a, b) =>
      a.length === b.length &&
      a.every((item, index) => item.id === b[index]?.id && item.desc === b[index]?.desc),
  });
}
