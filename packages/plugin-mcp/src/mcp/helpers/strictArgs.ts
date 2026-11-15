import { z } from 'zod'

/**
 * C-strict-args (research v2.2, PAY-11): the collection tools refuse an argument their schema does not name, and say
 * which one. The schemas already advertise `additionalProperties: false`, but the MCP SDK parses a plain object
 * schema in zod's default "strip" mode, so an unknown argument (a misspelled field, a field of another collection)
 * was dropped without a word and the rest of the call went ahead. Nothing runs when the call is refused.
 */
export function strictArgs<T extends z.ZodRawShape>(shape: T, toolName: string) {
  const known = Object.keys(shape)
  return z
    .object(shape, {
      errorMap: (issue, ctx) =>
        issue.code === 'unrecognized_keys' ? { message: unknownArgsMessage(toolName, issue.keys, known) } : { message: ctx.defaultError },
    })
    .strict()
}

export function unknownArgsMessage(toolName: string, keys: string[], known: string[]): string {
  const named = keys.map((k) => {
    const near = closest(k, known)
    return near ? `"${k}" (did you mean "${near}"?)` : `"${k}"`
  })
  return (
    `${toolName} does not take the argument${keys.length > 1 ? 's' : ''} ${named.join(', ')}. ` +
    `The call was refused and nothing was read or changed: send only the arguments in the tool's schema.`
  )
}

/**
 * The known name nearest to a misspelled one, if any: a case-insensitive edit distance of at most 1 for names of 3 or 4
 * letters and 2 for longer ones (none for shorter ones). Arguments that widen a write (all, overrideLock) are never
 * suggested.
 */
const NEVER_SUGGESTED = ['all', 'overrideLock']
function closest(name: string, known: string[]): string | undefined {
  const limit = name.length <= 2 ? 0 : name.length <= 4 ? 1 : 2
  let best: string | undefined
  let bestD = limit + 1
  for (const k of known) {
    if (NEVER_SUGGESTED.includes(k)) {
      continue
    }
    const d = distance(name.toLowerCase(), k.toLowerCase())
    if (d < bestD) {
      best = k
      bestD = d
    }
  }
  return best
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return row[b.length]!
}
