/**
 * C-row-ids (research v2.2): stable array row ids when the same rows are sent again. Payload gives every array or
 * blocks row sent without an id a new id, so an update that re-sends the rows it read, without their ids, replaced
 * them all: the row ids changed on every call (the update tools declare idempotentHint: true) and the rows' values in
 * other locales were lost. A row sent without an id that is identical to the stored row at the same position (every
 * value it sends equal, every value it leaves out empty in the stored row) now keeps that row's id, as if the caller
 * had sent it. A row that differs in any value, or that moved, is still a new row.
 *
 * Only array and blocks fields of the collection's config have rows (a json field holding a list of objects does not,
 * and is left as sent). An id is never given to two rows: ids the caller sent anywhere in the data, and ids already
 * filled in, are not filled in again.
 */
type Plain = Record<string, unknown>
type Field = {
  blocks?: Array<{ flattenedFields?: Field[]; slug: string }>
  flattenedFields?: Field[]
  name?: string
  type: string
}

const isPlain = (v: unknown): v is Plain => v !== null && typeof v === 'object' && !Array.isArray(v)
const isEmpty = (v: unknown) => v === null || v === undefined

/** The data to write, with the ids of unchanged rows filled in from the stored document (read without fallback). */
export function keepRowIds(data: Plain, stored: null | Plain | undefined, fields: Field[] | undefined): Plain {
  if (!isPlain(stored) || !Array.isArray(fields)) {
    return data
  }
  const taken = new Set<string>()
  collectIds(data, taken)
  return keepFields(data, stored, fields, taken)
}

/** True when any value in the data is an array (only then can rows lose their ids). */
export const hasArrays = (data: Plain): boolean =>
  Object.values(data).some((v) => Array.isArray(v) || (isPlain(v) && hasArrays(v)))

function collectIds(v: unknown, taken: Set<string>): void {
  if (Array.isArray(v)) {
    v.forEach((x) => collectIds(x, taken))
  } else if (isPlain(v)) {
    if (!isEmpty(v.id)) {
      taken.add(String(v.id))
    }
    Object.values(v).forEach((x) => collectIds(x, taken))
  }
}

function keepFields(sent: Plain, stored: Plain, fields: Field[], taken: Set<string>): Plain {
  const out: Plain = { ...sent }
  for (const f of fields) {
    if (!f.name || !(f.name in sent)) {
      continue
    }
    const v = sent[f.name]
    if ((f.type === 'array' || f.type === 'blocks') && Array.isArray(v) && Array.isArray(stored[f.name])) {
      out[f.name] = keepRows(v, stored[f.name] as unknown[], f, taken)
    } else if ((f.type === 'group' || f.type === 'tab') && isPlain(v) && isPlain(stored[f.name]) && f.flattenedFields) {
      out[f.name] = keepFields(v, stored[f.name] as Plain, f.flattenedFields, taken)
    }
  }
  return out
}

/** The fields of one row: the array's fields, or the fields of the row's block. */
function rowFields(row: Plain, field: Field): Field[] | undefined {
  if (field.type === 'array') {
    return field.flattenedFields
  }
  return field.blocks?.find((b) => b.slug === row.blockType)?.flattenedFields
}

function keepRows(sent: unknown[], stored: unknown[], field: Field, taken: Set<string>): unknown[] {
  return sent.map((row, i) => {
    if (!isPlain(row)) {
      return row
    }
    const fields = rowFields(row, field)
    if (!fields) {
      return row
    }
    if (!isEmpty(row.id)) {
      const same = stored.find((r) => isPlain(r) && String(r.id) === String(row.id))
      return isPlain(same) ? keepFields(row, same, fields, taken) : row
    }
    const at = stored[i]
    if (isPlain(at) && !isEmpty(at.id) && !taken.has(String(at.id)) && sameContent(row, at)) {
      taken.add(String(at.id))
      return { ...keepFields(row, at, fields, taken), id: at.id }
    }
    return row
  })
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
