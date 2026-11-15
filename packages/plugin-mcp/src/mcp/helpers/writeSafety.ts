import type { PayloadRequest, TypedUser } from 'payload'

import { z } from 'zod'

/**
 * Write-safety helpers for the collection tools (IsoKron research build, isokron-payload-mcp-2026-11).
 *
 * - Conflict answers (C-conflict): when a write is refused because another user holds the document lock, or
 *   because the document changed since the agent read it (ifUpdatedAt), the answer says so with isError, names
 *   the lock holder and the current version, and tells the agent what to do next.
 * - Receipts (C-receipt): a compact write receipt (id, updatedAt, status, fields written) instead of the whole
 *   document, unless returnDocument is true.
 */

export type ToolResponse = {
  content: Array<{ text: string; type: 'text' }>
  isError?: boolean
  structuredContent?: Record<string, unknown>
}

// Text only: the JSON in the text is the machine-readable part (no structuredContent copy of the same data).
export const errorResponse = (text: string): ToolResponse => ({ content: [{ type: 'text', text }], isError: true })

export const isLockedError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === 'Locked' || (error as { status?: number }).status === 423 || /currently locked/i.test(error.message))

/** Current lock holder and document version, read without the failed request's transaction. */
export async function lockInfo(args: {
  collectionSlug: string
  id: number | string
  req: PayloadRequest
  user: TypedUser
}): Promise<{ documentUpdatedAt: null | string; lockedBy: null | string; lockedSince: null | string }> {
  const { collectionSlug, id, req, user } = args
  const { payload } = req
  let lockedBy: null | string = null
  let lockedSince: null | string = null
  let documentUpdatedAt: null | string = null
  try {
    const { docs } = await payload.find({
      collection: 'payload-locked-documents',
      depth: 1,
      limit: 1,
      overrideAccess: true,
      sort: '-updatedAt',
      where: {
        and: [{ 'document.relationTo': { equals: collectionSlug } }, { 'document.value': { equals: id } }],
      },
    })
    const lock = docs[0] as { updatedAt?: string; user?: { value?: unknown } } | undefined
    if (lock) {
      const holder = lock.user?.value as { email?: string; id?: number | string } | number | string | undefined
      lockedBy =
        holder && typeof holder === 'object' ? (holder.email ?? String(holder.id)) : holder !== undefined ? String(holder) : null
      lockedSince = lock.updatedAt ?? null
    }
  } catch {
    // the lock collection is optional
  }
  documentUpdatedAt = await currentUpdatedAt({ collectionSlug, id, req, user })
  return { documentUpdatedAt, lockedBy, lockedSince }
}

export async function currentUpdatedAt(args: {
  collectionSlug: string
  id: number | string
  req: PayloadRequest
  user: TypedUser
}): Promise<null | string> {
  try {
    const doc = (await args.req.payload.findByID({
      id: args.id,
      collection: args.collectionSlug,
      depth: 0,
      draft: true,
      overrideAccess: false,
      user: args.user,
    })) as { updatedAt?: string }
    return doc?.updatedAt ?? null
  } catch {
    return null
  }
}

/** The document as it is now (depth 0, latest draft), carried in conflict answers so a retry can be informed. */
export async function currentDocument(args: {
  collectionSlug: string
  id: number | string
  req: PayloadRequest
  user: TypedUser
}): Promise<null | Record<string, unknown>> {
  try {
    return (await args.req.payload.findByID({
      id: args.id,
      collection: args.collectionSlug,
      depth: 0,
      draft: true,
      overrideAccess: false,
      user: args.user,
    })) as unknown as Record<string, unknown>
  } catch {
    return null
  }
}

export function lockConflict(args: {
  action: 'delete' | 'update'
  collectionSlug: string
  current?: null | Record<string, unknown>
  id: number | string
  info: { documentUpdatedAt: null | string; lockedBy: null | string; lockedSince: null | string }
  readTool: string
}): ToolResponse {
  const { action, collectionSlug, id, info, readTool } = args
  const who = info.lockedBy ?? 'another user'
  const structured = { conflict: 'locked', collection: collectionSlug, id, ...info, applied: false, currentDocument: args.current ?? null }
  return errorResponse(
    `Conflict: ${collectionSlug} ${id} is open for editing by ${who}${info.lockedSince ? ` (lock refreshed ${info.lockedSince})` : ''}. ` +
      `Your ${action} was NOT applied. The current document is below (currentDocument); they may save more changes, so re-read it with ${readTool} ` +
      `before trying again, then re-apply only your change to the current version (pass ifUpdatedAt with the updatedAt you read). ` +
      `If it is still locked, tell the user who is editing it. Pass overrideLock: true only if the user explicitly asked you to take over their editing session.\n` +
      JSON.stringify(structured),
  )
}

export function staleConflict(args: {
  action: 'delete' | 'update'
  collectionSlug: string
  current: null | string
  currentDoc?: null | Record<string, unknown>
  id: number | string
  readTool: string
  sent: string
}): ToolResponse {
  const { action, collectionSlug, current, id, readTool, sent } = args
  const structured = { conflict: 'stale', collection: collectionSlug, id, ifUpdatedAt: sent, documentUpdatedAt: current, applied: false, currentDocument: args.currentDoc ?? null }
  return errorResponse(
    `Conflict: ${collectionSlug} ${id} changed since you read it (you sent ifUpdatedAt ${sent}; it is now ${current ?? 'gone'}). ` +
      `Your ${action} was NOT applied. The current document is below (currentDocument): re-apply only your own change to it ` +
      `(or re-read it with ${readTool}) and retry with ifUpdatedAt ${current ?? '<the new updatedAt>'}.\n` +
      JSON.stringify(structured),
  )
}

export function receipt(args: {
  action: 'created' | 'deleted' | 'updated'
  collectionSlug: string
  doc: Record<string, unknown>
  written?: string[]
}): ToolResponse {
  const { action, collectionSlug, doc, written } = args
  const r: Record<string, unknown> = { [action]: true, collection: collectionSlug, id: doc.id }
  if (doc.updatedAt) r.updatedAt = doc.updatedAt
  if (doc._status) r._status = doc._status
  if (written?.length) r.fieldsWritten = written
  return {
    content: [
      {
        type: 'text',
        text: `${collectionSlug} ${String(doc.id)} ${action}. ${JSON.stringify(r)}\n(Compact receipt; pass returnDocument: true for the whole document.)`,
      },
    ],
  }
}

/** Operation arguments that share a name with the tool's own arguments (C-args). */
export const OPERATION_ARGS = [
  'all',
  'data',
  'depth',
  'draft',
  'fallbackLocale',
  'id',
  'ifUpdatedAt',
  'locale',
  'overrideLock',
  'returnDocument',
  'select',
  'where',
]

/**
 * C-version (research v2.2, PAY-09): the version precondition is per write. Every update and delete carries the version
 * its change is based on (ifUpdatedAt: the document's updatedAt as the caller read it, or as its last write receipt
 * gave it). A write whose version is no longer current is refused, whoever sends it: another user, another client, or
 * another session using the same key. Research v1 to v2.1 used the version the server remembered per user when
 * ifUpdatedAt was left out; two clients sharing one key refreshed each other's memory, so a stale write went through.
 * Collections without timestamps have no version to send; their writes are not checked. Best-effort: the check reads
 * the document, then writes, so a change landing between the two is not detected.
 */
export const versionRequired = (req: PayloadRequest, collectionSlug: string): boolean =>
  (req.payload.collections?.[collectionSlug as never] as { config?: { timestamps?: boolean } } | undefined)?.config
    ?.timestamps !== false

/** A write by id that carries no version: refused, with the current document so the change can be re-applied to it. */
export function missingVersion(args: {
  action: 'delete' | 'update'
  collectionSlug: string
  currentDoc: null | Record<string, unknown>
  id: number | string
  readTool: string
}): ToolResponse {
  const { action, collectionSlug, currentDoc, id, readTool } = args
  const current = (currentDoc?.updatedAt as string | undefined) ?? null
  const structured = { conflict: 'no_version', collection: collectionSlug, id, documentUpdatedAt: current, applied: false, currentDocument: currentDoc }
  return errorResponse(
    `Refused: ${action === 'delete' ? 'a delete' : 'an update'} needs ifUpdatedAt, the updatedAt of the version your change is based on ` +
      `(${readTool} answers carry it, and so does the receipt of your last write). Your ${action} was NOT applied. ` +
      `The current document is below (currentDocument): ${action === 'delete' ? 'check it' : 're-apply only your own change to it'} ` +
      `and retry with ifUpdatedAt ${current ?? '<its updatedAt>'}.\n` +
      JSON.stringify(structured),
  )
}

/**
 * The ifUpdatedAt argument of update and delete. Required (in the advertised schema too) when the collection has
 * versions; the message of a call without it names the argument and says what to send.
 */
export function versionArg(versioned: boolean, action: 'delete' | 'update') {
  const verb = action === 'delete' ? 'deleted' : 'written'
  const arg = z
    .union([z.string(), z.record(z.string(), z.string())], {
      required_error:
        `Nothing was ${action === 'delete' ? 'deleted' : 'changed'}: send the updatedAt of the version your ${action} is based on ` +
        `(find answers and write receipts carry it; a map {"<id>": "<updatedAt>"} for several documents); it is required`,
    })
    .describe(
      `Required: the version your ${action} is based on (updatedAt, from a find answer or your last write receipt). With id: that updatedAt string. ` +
        `For several documents: a map {"<id>": "<updatedAt>"} (it selects those ids; with where, every match must be in it). ` +
        `A document changed since that version is not ${verb}, whoever changed it; you get its current version`,
    )
  return versioned
    ? arg
    : arg.optional().describe('This collection keeps no versions (timestamps are off), so writes cannot be checked; leave it out')
}

/** ifUpdatedAt as a per-document version map (bulk calls): {"<id>": "<updatedAt>"}. */
export type VersionMap = Record<string, string>

export const isVersionMap = (v: unknown): v is VersionMap =>
  !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v as object).every((x) => typeof x === 'string')

/** Map keys as ids for a where clause (numeric ids on SQL adapters arrive as strings in a JSON object key). */
export const idsOf = (versions: VersionMap): Array<number | string> =>
  Object.keys(versions).map((k) => (/^\d+$/.test(k) ? Number(k) : k))

export type BulkRefusal = {
  conflict: 'no_version' | 'stale'
  currentDocument: null | Record<string, unknown>
  documentUpdatedAt: null | string
  id: unknown
  ifUpdatedAt: null | string
  ok: false
}

/**
 * C-bulk-versions (research v2; per write since v2.2): per-document preconditions for a where-based update or delete.
 * Every matching document is checked against the version the caller pinned for it in `versions` (the ifUpdatedAt
 * map). A document that changed since that version is refused as "stale", and one the map does not name is refused as
 * "no_version" (both with their current state); the rest may be written. Without a map (`versions` undefined, only for a
 * collection that keeps no versions) nothing is checked.
 */
export async function bulkPreflight(args: {
  collectionSlug: string
  req: PayloadRequest
  user: TypedUser
  versions?: VersionMap
  where: Record<string, unknown>
}): Promise<{ allowed: Array<number | string>; matched: number; refused: BulkRefusal[]; unmatchedPins: string[] }> {
  const { collectionSlug, user, versions, where } = args
  const { docs } = (await args.req.payload.find({
    collection: collectionSlug,
    depth: 0,
    draft: true,
    overrideAccess: false,
    pagination: false,
    user,
    where: where as never,
  })) as unknown as { docs: Array<Record<string, unknown> & { id: number | string; updatedAt?: string }> }
  const allowed: Array<number | string> = []
  const refused: BulkRefusal[] = []
  for (const doc of docs) {
    const pinned = versions?.[String(doc.id)]
    const now = doc.updatedAt ?? null
    if (versions && pinned === undefined) {
      refused.push({ id: doc.id, conflict: 'no_version', currentDocument: doc, documentUpdatedAt: now, ifUpdatedAt: null, ok: false })
    } else if (pinned !== undefined && now && pinned !== now) {
      refused.push({ id: doc.id, conflict: 'stale', currentDocument: doc, documentUpdatedAt: now, ifUpdatedAt: pinned, ok: false })
    } else {
      allowed.push(doc.id)
    }
  }
  const matchedIds = new Set(docs.map((d) => String(d.id)))
  const unmatchedPins = Object.keys(versions || {}).filter((k) => !matchedIds.has(k))
  return { allowed, matched: docs.length, refused, unmatchedPins }
}

/**
 * The answer to a bulk update or delete (C-bulk, v2). Best-effort and said so: documents refused as stale or that
 * failed were NOT changed; the others were applied and stay applied (nothing is rolled back). Headline: plain
 * success, "PARTIAL:" (some applied, some not) or "Conflict:" (none applied because every match was refused).
 */
export function bulkAnswer(args: {
  action: 'deleted' | 'updated'
  applied: Array<Record<string, unknown>>
  collectionSlug: string
  errors: Array<{ id?: unknown; message?: string }>
  readTool: string
  refused: BulkRefusal[]
  returnDocument: boolean
  unmatchedPins: string[]
}): ToolResponse {
  const { action, applied, collectionSlug, errors, readTool, refused, unmatchedPins } = args
  const notChanged = refused.length + errors.length
  const items = [
    ...applied.map((d) => (action === 'updated' ? { id: d.id, ok: true, updatedAt: d.updatedAt } : { id: d.id, ok: true })),
    ...refused,
    ...errors.map((e) => ({ id: e.id, error: e.message, ok: false })),
  ]
  const pins = Object.fromEntries(refused.map((r) => [String(r.id), r.documentUpdatedAt]))
  const next =
    action === 'deleted'
      ? `check them; if they should still be deleted, retry those ids in one call with ifUpdatedAt ${JSON.stringify(pins)}`
      : `re-apply only your change to those ids and retry them in one call with ifUpdatedAt ${JSON.stringify(pins)}`
  const stale = refused.filter((r) => r.conflict === 'stale').length
  const noVersion = refused.length - stale
  const staleText = stale
    ? `${stale} changed since you read them (conflict "stale"; currentDocument shows each one now)`
    : ''
  const noVersionText = noVersion
    ? `${noVersion} matched your where but had no version in ifUpdatedAt (conflict "no_version"; currentDocument shows each one now)`
    : ''
  const retryText = refused.length ? `for those: ${next}, or re-read them with ${readTool}` : ''
  const errText = errors.length ? `${errors.length} failed (see error)` : ''
  const why = [staleText, noVersionText, retryText, errText].filter(Boolean).join('; ')
  let head: string
  if (notChanged === 0) {
    head = `${action === 'deleted' ? 'Deleted' : 'Updated'} ${applied.length} document(s) ${action === 'deleted' ? 'from' : 'in'} "${collectionSlug}".`
  } else if (applied.length === 0) {
    head = `Conflict: nothing was ${action} in "${collectionSlug}": ${notChanged} matching document(s) NOT changed: ${why}.`
  } else {
    head = `PARTIAL: ${action} ${applied.length} document(s) ${action === 'deleted' ? 'from' : 'in'} "${collectionSlug}"; ${notChanged} NOT changed: ${why}. Best-effort: the ${applied.length} applied stay ${action} (nothing is rolled back).`
  }
  const summary: Record<string, unknown> = { mode: 'best_effort', applied: applied.length, not_changed: notChanged, results: items }
  if (unmatchedPins.length) {
    summary.pinsNotMatched = unmatchedPins
    head += ` ifUpdatedAt named ${unmatchedPins.length} id(s) your where did not match; they were not touched.`
  }
  const body = args.returnDocument
    ? `\n\`\`\`json\n${JSON.stringify({ mode: 'best_effort', docs: applied, refused, errors })}\n\`\`\``
    : `\n${JSON.stringify(summary)}`
  return { content: [{ type: 'text', text: head + body }], ...(notChanged ? { isError: true } : {}) }
}

/**
 * C-version with select (research v2.1; v2.2): a find with an inclusion select that leaves out updatedAt (e.g.
 * {title, items}) would give the caller no version to send with its next write. The query always asks for updatedAt,
 * and the answer keeps it (v2.1 removed it again; with a per-write precondition the caller needs it).
 */
export function versionSelect(select?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!select || typeof select !== 'object' || Object.keys(select).length === 0) {
    return select
  }
  const inclusion = Object.values(select).some((v) => v !== false)
  const out: Record<string, unknown> = { ...select }
  if (inclusion) {
    out.updatedAt = true
  } else if (out.updatedAt === false) {
    delete out.updatedAt
  }
  return out
}
