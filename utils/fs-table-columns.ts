import type { TableColumn } from '@nuxt/ui'

/** Nuxt UI v4 table columns (TanStack accessorKey + header). */
export function fsTableColumn<T extends object>(
  accessorKey: keyof T & string,
  header: string,
): TableColumn<T> {
  return { accessorKey, header }
}

export function fsTableColumnId<T extends object>(id: string, header: string): TableColumn<T> {
  return { id, header }
}
