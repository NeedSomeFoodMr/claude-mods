export const DEFAULT_PORT = 3000

/** The ports `.claude/launch.json` names, in order, each once; the default when it names none. */
export const portsOf = (launchJson: string | undefined): number[] => {
  try {
    const parsed: unknown = JSON.parse(launchJson ?? '')
    const list =
      typeof parsed === 'object' && parsed !== null ? (parsed as { configurations?: unknown }).configurations : undefined
    const ports = (Array.isArray(list) ? list : [])
      .map(one => (typeof one === 'object' && one !== null ? (one as { port?: unknown }).port : undefined))
      .filter((port): port is number => typeof port === 'number' && Number.isInteger(port) && port > 0)
    const unique = [...new Set(ports)]

    return unique.length === 0 ? [DEFAULT_PORT] : unique
  } catch {
    return [DEFAULT_PORT]
  }
}

export const urlOf = (port: number) => `http://localhost:${port}`

/** The status entry: the servers that answer, or which ports were tried. */
export const pill = (ports: readonly number[], up: readonly number[]) =>
  up.length > 0
    ? `● dev ${up.map(urlOf).join('  ')}`
    : `○ dev server down (${ports.map(port => `:${port}`).join(', ')})`
