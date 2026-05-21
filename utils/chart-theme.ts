/**
 * Chart.js colors aligned with ESOS CSS tokens / color mode.
 */
export type ChartThemeMode = 'light' | 'dark'

export function resolveChartThemeMode(colorModeValue: string): ChartThemeMode {
  return colorModeValue === 'dark' ? 'dark' : 'light'
}

export function getChartTheme(mode: ChartThemeMode) {
  const isDark = mode === 'dark'
  return {
    grid: isDark ? 'rgba(75, 85, 99, 0.35)' : 'rgba(229, 231, 235, 0.9)',
    tick: isDark ? '#9ca3af' : '#6b7280',
    legend: isDark ? '#d1d5db' : '#374151',
    tooltipBg: isDark ? '#111827' : '#ffffff',
    tooltipBorder: isDark ? '#374151' : '#e5e7eb',
    tooltipText: isDark ? '#f3f4f6' : '#111827',
    readBorder: isDark ? '#60a5fa' : '#3b82f6',
    readFill: isDark ? 'rgba(96, 165, 250, 0.12)' : 'rgba(59, 130, 246, 0.08)',
    writeBorder: isDark ? '#fb923c' : '#f97316',
    writeFill: isDark ? 'rgba(251, 146, 60, 0.12)' : 'rgba(249, 115, 22, 0.08)',
    neutralBorder: isDark ? '#9ca3af' : '#9ca3af',
    neutralFill: isDark ? 'rgba(156, 163, 175, 0.1)' : 'rgba(156, 163, 175, 0.08)',
  }
}

/** Use inside Vue setup: `const chartTheme = useChartTheme()` */
export function useChartTheme() {
  const colorMode = useColorMode()
  return computed(() => getChartTheme(resolveChartThemeMode(colorMode.value)))
}

/** Shared Chart.js scale + legend styling for light/dark. */
export function buildChartJsOptions(theme: ReturnType<typeof getChartTheme>, extra?: Record<string, unknown>) {
  return {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          boxWidth: 12,
          font: { size: 11 },
          color: theme.legend,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { font: { size: 10 }, color: theme.tick },
        grid: { color: theme.grid },
      },
      x: {
        ticks: { font: { size: 10 }, color: theme.tick, maxTicksLimit: 8 },
        grid: { color: theme.grid },
      },
    },
    ...extra,
  }
}
