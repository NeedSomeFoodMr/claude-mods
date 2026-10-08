import type { Goal, GoalStatus } from '../types'

const STATUSES: readonly GoalStatus[] = ['todo', 'doing', 'done']
const MAX_GOALS = 30
const MAX_TITLE = 90
const MAX_NOTE = 120
// Collapsed, the list shows what is in hand and this many of what follows.
const NEXT_SHOWN = 2

const MARKS: Record<GoalStatus, string> = { done: '[x]', doing: '[>]', todo: '[ ]' }

const clip = (text: string, most: number) => (text.length > most ? `${text.slice(0, most - 1).trimEnd()}…` : text)

/** The list a tool call carries, checked; a sentence saying what is wrong with it otherwise. */
export const parse = (input: unknown): Goal[] | string => {
  if (!Array.isArray(input)) {
    return '`goals` must be an array of { title, status }.'
  }

  if (input.length > MAX_GOALS) {
    return `At most ${MAX_GOALS} goals: group the small ones.`
  }

  const goals: Goal[] = []

  for (const one of input) {
    const { title, status, note } = (typeof one === 'object' && one !== null ? one : {}) as Record<string, unknown>

    if (typeof title !== 'string' || title.trim() === '') {
      return 'Every goal needs a non-empty `title`.'
    }

    if (typeof status !== 'string' || !STATUSES.includes(status as GoalStatus)) {
      return `Goal "${clip(title, 40)}": \`status\` must be one of ${STATUSES.join(', ')}.`
    }

    goals.push({
      title: clip(title.trim().replace(/\s+/g, ' '), MAX_TITLE),
      status: status as GoalStatus,
      ...(typeof note === 'string' && note.trim() !== '' ? { note: clip(note.trim().replace(/\s+/g, ' '), MAX_NOTE) } : {}),
    })
  }

  return goals
}

export const counts = (goals: readonly Goal[]) => ({
  done: goals.filter(one => one.status === 'done').length,
  doing: goals.filter(one => one.status === 'doing').length,
  todo: goals.filter(one => one.status === 'todo').length,
})

/** The list as the model reads it, in a tool result or beside the person's prompt. */
export const outline = (goals: readonly Goal[]) =>
  goals.length === 0
    ? 'The goals list is empty.'
    : [
        `Goals (${counts(goals).done} of ${goals.length} done):`,
        ...goals.map(one => `${MARKS[one.status]} ${one.title}${one.note === undefined ? '' : ` (${one.note})`}`),
      ].join('\n')

/**
 * The rows the band draws: every goal when open; otherwise what is in hand and
 * the next few, with the rest counted in `more` (to do) and `done`.
 */
export const visible = (goals: readonly Goal[], isOpen: boolean) => {
  const { done, todo } = counts(goals)

  if (isOpen) {
    return { rows: [...goals], more: 0, done: 0 }
  }

  const doing = goals.filter(one => one.status === 'doing')
  const next = goals.filter(one => one.status === 'todo').slice(0, NEXT_SHOWN)

  return { rows: [...doing, ...next], more: todo - next.length, done }
}

/** One line under a collapsed list for what it leaves out. */
export const rest = (more: number, done: number) =>
  [more > 0 ? `+${more} more to do` : '', done > 0 ? `${done} done` : ''].filter(part => part !== '').join(' · ')
