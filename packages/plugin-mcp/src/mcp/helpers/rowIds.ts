/**
 * C-row-ids (research v2.2): stable array row ids when the same rows are sent again. Payload gives every array or
 * blocks row sent without an id a new id, so an update that re-sends the rows it read, without their ids, replaced
 * them all: the row ids changed on every call (the update tools declare idempotentHint: true) and the rows' values in
 * other locales were lost. A row sent without an id that is identical to the stored row at the same position (every
 * value it sends equal, every value it leaves out empty in the stored row) now keeps that row's id, as if the caller
 * had sent it. A row that differs in any value, or that moved, is still a new row. An id is never given to two rows.
 */
type Plain = Record<string, unknown>

const isPlain = (v: unknown): v is Plain => v !== null && typeof v === 'object' && !Array.isArray(v)
const isEmpty = (v: unknown) => v === null || v === undefined

/** The data to write, with the ids of unchanged rows filled in from the stored document. */
export function keepRowIds(data: Plain, stored: null | Plain | undefined): Plain {
  return isPlain(stored) ? (keepFields(data, stored) as Plain) : data
}

/** True when any value in the data is an array (only then can rows lose their ids). */
export const hasArrays = (data: Plain): boolean =>
  Object.values(data).some((v) => Array.isArray(v) || (isPlain(v) && hasArrays(v)))

function keepFields(sent: Plain, stored: Plain): Plain {
  const out: Plain = {}
  for (const [k, v] of Object.entries(sent)) {
    out[k] = keep(v, stored[k])
  }
  return out
}

function keep(sent: unknown, stored: unknown): unknown {
  if (Array.isArray(sent) && Array.isArray(stored)) {
    const taken = new Set(sent.filter((r) => isPlain(r) && !isEmpty(r.id)).map((r) => String((r as Plain).id)))
    return sent.map((row, i) => {
      if (!isPlain(row)) {
        return row
      }
      if (!isEmpty(row.id)) {
        const same = stored.find((r) => isPlain(r) && String(r.id) === String(row.id))
        return isPlain(same) ? keepFields(row, same) : row
      }
      const at = stored[i]
      if (isPlain(at) && !isEmpty(at.id) && !taken.has(String(at.id)) && sameContent(row, at)) {
        taken.add(String(at.id))
        return adopt(row, at)
      }
      return row
    })
  }
  if (isPlain(sent) && isPlain(stored)) {
    return keepFields(sent, stored)
  }
  return sent
}

/** Equal values, ignoring the ids the sent side leaves out; a value the sent side leaves out must be empty. */
function sameContent(sent: unknown, stored: unknown): boolean {
  if (Array.isArray(sent)) {
    return Array.isArray(stored) && sent.length === stored.length && sent.every((v, i) => sameContent(v, stored[i]))
  }
  if (isPlain(sent)) {
    if (!isPlain(stored)) {
      return false
    }
    for (const [k, v] of Object.entries(sent)) {
      if (k === 'id' && isEmpty(v)) {
        continue
      }
      if (!sameContent(v, stored[k])) {
        return false
      }
    }
    return Object.entries(stored).every(([k, v]) => k === 'id' || k in sent || isEmpty(v))
  }
  return sent === stored || (isEmpty(sent) && isEmpty(stored))
}

/** The sent row with the stored ids filled in where it left them out (the content is the same, so is the shape). */
function adopt(sent: unknown, stored: unknown): unknown {
  if (Array.isArray(sent) && Array.isArray(stored)) {
    return sent.map((v, i) => adopt(v, stored[i]))
  }
  if (isPlain(sent) && isPlain(stored)) {
    const out: Plain = {}
    for (const [k, v] of Object.entries(sent)) {
      out[k] = adopt(v, stored[k])
    }
    if (isEmpty(sent.id) && !isEmpty(stored.id)) {
      out.id = stored.id
    }
    return out
  }
  return sent
}
