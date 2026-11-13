import type { PayloadRequest, TypedUser } from 'payload'

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

export function lockConflict(args: {
  action: 'delete' | 'update'
  collectionSlug: string
  id: number | string
  info: { documentUpdatedAt: null | string; lockedBy: null | string; lockedSince: null | string }
  readTool: string
}): ToolResponse {
  const { action, collectionSlug, id, info, readTool } = args
  const who = info.lockedBy ?? 'another user'
  const structured = { conflict: 'locked', collection: collectionSlug, id, ...info, applied: false }
  return errorResponse(
    `Conflict: ${collectionSlug} ${id} is open for editing by ${who}${info.lockedSince ? ` (lock refreshed ${info.lockedSince})` : ''}. ` +
      `Your ${action} was NOT applied. They may save their own changes, so re-read the document with ${readTool} ` +
      `before trying again, then re-apply only your change to the current version (pass ifUpdatedAt with the updatedAt you read). ` +
      `If it is still locked, tell the user who is editing it. Pass overrideLock: true only if the user explicitly asked you to take over their editing session.\n` +
      JSON.stringify(structured),
  )
}

export function staleConflict(args: {
  action: 'delete' | 'update'
  collectionSlug: string
  current: null | string
  id: number | string
  readTool: string
  sent: string
}): ToolResponse {
  const { action, collectionSlug, current, id, readTool, sent } = args
  const structured = { conflict: 'stale', collection: collectionSlug, id, ifUpdatedAt: sent, documentUpdatedAt: current, applied: false }
  return errorResponse(
    `Conflict: ${collectionSlug} ${id} changed since you read it (you sent ifUpdatedAt ${sent}; it is now ${current ?? 'gone'}). ` +
      `Your ${action} was NOT applied. Re-read it with ${readTool}, re-apply only your own change to the current version, ` +
      `and retry with ifUpdatedAt ${current ?? '<the new updatedAt>'}.\n` +
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
 * C-readversion: the version each user last read, per document (and per document incarnation: createdAt, so a
 * re-created document with the same id starts clean). An update or delete by id with no ifUpdatedAt uses it as the
 * precondition: if the document changed since this user last read or wrote it, the write is refused as stale.
 * In-process memory only (the MCP transport is stateless); best-effort, like ifUpdatedAt.
 */
const lastSeen = new Map<string, string>()
const seenKey = (userId: unknown, collectionSlug: string, id: unknown, createdAt: unknown) =>
  `${String(userId)}|${collectionSlug}|${String(id)}|${String(createdAt)}`

export function rememberRead(user: TypedUser | undefined, collectionSlug: string, docs: unknown[]): void {
  if (!user) {
    return
  }
  for (const d of docs) {
    const doc = d as { createdAt?: string; id?: unknown; updatedAt?: string }
    if (doc && doc.id !== undefined && doc.updatedAt) {
      lastSeen.set(seenKey(user.id, collectionSlug, doc.id, doc.createdAt), doc.updatedAt)
    }
  }
}

export async function readVersionCheck(args: {
  collectionSlug: string
  id: number | string
  req: PayloadRequest
  user: TypedUser
}): Promise<{ current: null | string; seen: string } | null> {
  try {
    const doc = (await args.req.payload.findByID({
      id: args.id,
      collection: args.collectionSlug,
      depth: 0,
      draft: true,
      overrideAccess: false,
      user: args.user,
    })) as { createdAt?: string; updatedAt?: string }
    const seen = lastSeen.get(seenKey(args.user?.id, args.collectionSlug, args.id, doc?.createdAt))
    if (seen && doc?.updatedAt && seen !== doc.updatedAt) {
      return { current: doc.updatedAt, seen }
    }
  } catch {
    // a missing document is reported by the write itself
  }
  return null
}
