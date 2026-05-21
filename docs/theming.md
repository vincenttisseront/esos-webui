# ESOS WebUI — Theming

## Modes

- **Clair** (`light`), **Sombre** (`dark`), **Système** (`system`)
- Engine: `@nuxtjs/color-mode` (via `@nuxt/ui`), class on `<html>`, cookie `esos_theme`
- Authenticated users: `users.preferred_theme` + PATCH `/api/auth/preferences`
- Before login: cookie only

## Tokens

Single source: [`assets/css/tokens.css`](../assets/css/tokens.css). Light values on `:root`, dark overrides on `.dark`.

Use CSS variables in custom CSS:

- `--color-surface`, `--color-surface-alt`
- `--color-border`, `--color-text`, `--color-text-muted`
- Semantic: `--color-success`, `--color-warning`, `--color-danger`, `--color-info`

Utility classes: `.esos-card`, `.data-table`, `.esos-command-pre` in [`assets/css/utilities.css`](../assets/css/utilities.css).

## New components

1. Prefer Nuxt UI semantic colors (`color="primary"`, `variant="subtle"`).
2. For Tailwind grays, pair light + dark on the same node, e.g. `bg-white dark:bg-gray-900`.
3. Do not use raw `#fff` / `#000` except terminal canvas or fixed brand panels (login left panel).
4. Charts: `useChartTheme()` from [`utils/chart-theme.ts`](../utils/chart-theme.ts).
5. Command previews: class `esos-command-pre`.

## Terminal

[`components/sysconfig/TerminalPane.vue`](../components/sysconfig/TerminalPane.vue) stays **dark** (xterm); only chrome borders may use tokens.

## Audit

```bash
npm run audit:theme
```

Reports lines with light-only classes and no `dark:` on the same line. Allowlist: terminal, login brand, topology/tokens CSS.

## Composables

- `useEsosTheme()` — set preference + persist when logged in
- `ThemeSwitcher` — `menu` | `compact` | `profile` modes
