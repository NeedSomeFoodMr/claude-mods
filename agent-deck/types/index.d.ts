/** One step of the plan an agent posted for itself. */
export type Step = { title: string; status: 'todo' | 'doing' | 'done' }

/** The four token counts the engine reports for a model request, summed over several. */
export type Spend = { input: number; output: number; cacheRead: number; cacheWrite: number }

export type AgentRow = {
  id: string
  type: string
  description: string
  /** The address the Agent call gave it, when it gave one. */
  name?: string
  /** The short name the deck shows it under and the person calls it by. */
  nick?: string
  parentId?: string
  model?: string
  effort?: string
  /** The engine's AgentStatus while it lists the agent, the last one seen after. */
  status: string
  startedAt: number
  endedAt?: number
  tools: number
  lastTool?: string
  /** What the tool in hand was called with, in a few words: a command, a path, a search. */
  lastArg?: string
  /** What the agent was asked, as its brief begins. */
  brief?: string
  /** The plan the agent posted, when it posted one. */
  steps?: Step[]
  /** Output tokens over the agent's turns so far. */
  tokens: number
  /** Every count of the turns that have ended. Absent on a row kept from before the deck counted them. */
  spent?: Spend
  /** The turn in hand: its id, and its requests' counts so far. */
  turn?: Spend & { id: string }
  /** What its last request was answered over, in tokens: how full its context window is. */
  context?: number
  /**
   * About what its requests cost in dollars, each priced at the model that answered it: an
   * estimate. Absent while none had a price, and on a row counted before each was priced.
   */
  usd?: number
  /** The tokens of its requests whose model has no listed price: counted, and in no cost. */
  unpriced?: number
}

export type MainLoop = { model: string; effort?: string }

/** An agent type the person defined themselves, as the engine offers it to the model. */
export type Role = { name: string; source: string }

/** The session's own figures as the engine measures them: the main loop's window, and what everything has cost. */
export type Meter = { window?: number; percent?: number; usd?: number }

/**
 * What the line above the prompt says while agents run: who, how far through their plans, and
 * about what the agents cost. `hasUnpriced` says the cost leaves out an agent whose model has no price.
 */
export type Strip = { running: number; finished: number; done: number; steps: number; usd?: number; hasUnpriced?: boolean }

declare module 'claude-code' {
  interface PluginState {
    'agent-deck': {
      agents: AgentRow[]
      main: MainLoop | null
      now: number
      /** How many agents have been given a short name, so a name is not reused at once. */
      named: number
      roster: Role[]
      isLight: boolean
      meter: Meter | null
      /** Null while no subagent runs: the line is not drawn. */
      strip: Strip | null
      /** True when the pane shows each running agent as its row alone, its plan folded away. */
      isFolded: boolean
    }
  }
}
