import type { Limit, Reading } from '../types'

export const WARN_AT = [80, 95]

export type Level = 'good' | 'warning' | 'serious' | 'critical'

const SHORT: Record<string, string> = { five_hour: '5h', seven_day: 'wk', spend_limit: 'spend' }
const LONG: Record<string, string> = { five_hour: '5-hour', seven_day: 'Weekly', spend_limit: 'Spend' }

export const compact = (tokens: number) =>
  tokens >= 1_000_000
    ? `${(tokens / 1_000_000).toFixed(1)}M`
    : tokens >= 1000
      ? `${Math.round(tokens / 1000)}k`
      : String(tokens)

export const money = (usd: number) => `$${usd.toFixed(2)}`

export const shortLimit = (one: Limit) => `${SHORT[one.kind] ?? one.kind} ${Math.round(one.percent)}%`

export const longLimit = (kind: string) => LONG[kind] ?? kind.replace(/_/g, ' ')

/** `resets in 2h 14m`, from an ISO time and the clock; nothing when unknown or past. */
export const resetsIn = (resetsAt: string | undefined, now: number) => {
  const left = resetsAt === undefined ? Number.NaN : Date.parse(resetsAt) - now

  if (!Number.isFinite(left) || left <= 0) {
    return ''
  }

  const minutes = Math.round(left / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)

  if (days > 0) return `resets in ${days}d ${hours}h`
  if (hours > 0) return `resets in ${hours}h ${minutes % 60}m`

  return `resets in ${minutes}m`
}

/** The threshold a limit crossed going from `before` to `after`, the highest one. */
export const crossed = (before: Limit | undefined, after: Limit) =>
  [...WARN_AT].reverse().find(mark => after.percent >= mark && (before?.percent ?? 0) < mark)

/**
 * How near compaction the window is: measured against the token count
 * compaction runs at when the engine names one, the whole window otherwise.
 */
export const levelOf = (reading: Reading, compactAt: number | null): Level => {
  const ratio = reading.tokens / Math.max(1, compactAt ?? reading.window)

  if (ratio >= 0.92) return 'critical'
  if (ratio >= 0.8) return 'serious'
  if (ratio >= 0.6) return 'warning'

  return 'good'
}

/** A share of the window as the legend prints it. */
export const share = (tokens: number, window: number) => {
  const percent = (tokens / Math.max(1, window)) * 100

  return percent > 0 && percent < 1 ? '<1%' : `${Math.round(percent)}%`
}

/** A bar of cells for a surface that draws no SVG. */
export const gauge = (percent: number, width: number) => {
  const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * width)

  return '█'.repeat(filled) + '░'.repeat(width - filled)
}
