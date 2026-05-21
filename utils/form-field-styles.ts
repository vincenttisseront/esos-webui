/**
 * Shared form field layout and control styles (login, wizards, admin forms).
 */

/** Vertical spacing between fields inside a form. */
export const formFieldStackClass = 'flex w-full flex-col gap-5'

/** Wrapper around label + control + help + error for one field. */
export const formFieldClass = 'flex w-full min-w-0 flex-col gap-1.5'

export const formLabelClass =
  'block text-sm font-medium leading-5 text-slate-700 dark:text-slate-200'

export const formLabelRequiredClass = 'text-red-500 ml-0.5'

export const formHelpClass = 'text-xs leading-5 text-slate-500 dark:text-slate-400'

export const formErrorClass = 'text-xs leading-5 text-red-600 dark:text-red-400'

/** Native input fallback (autofill-friendly). */
export const appTextInputNativeClass = [
  'block w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3.5',
  'h-11 text-sm text-slate-900 shadow-sm transition-colors',
  'placeholder:text-slate-400',
  'hover:border-slate-300',
  'focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/25',
  'disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-slate-100',
  'read-only:bg-slate-100 read-only:cursor-default',
].join(' ')

/** Nuxt UI UInput `ui.base` merge target. */
export const appTextInputUi = {
  base: [
    'w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50',
    'h-11 px-3.5 text-sm text-slate-900 shadow-sm',
    'placeholder:text-slate-400',
    'hover:border-slate-300',
    'focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/25',
    'disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-slate-100',
  ].join(' '),
  leading: 'ps-3.5',
  trailing: 'pe-3.5',
}

export const appSelectUi = {
  base: [
    'w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50',
    'h-11 text-sm text-slate-900 shadow-sm',
    'hover:border-slate-300',
    'focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/25',
    'disabled:cursor-not-allowed disabled:opacity-60',
  ].join(' '),
}
