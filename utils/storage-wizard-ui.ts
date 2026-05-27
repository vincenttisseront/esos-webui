/** Native &lt;select&gt; styling for storage modal wizards (avoids USelect popper z-index under AppModalHost). */
export const STORAGE_NATIVE_SELECT_CLASS =
  'w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed'

export type StorageSelectOption = {
  value: string
  label: string
  disabled?: boolean
}
