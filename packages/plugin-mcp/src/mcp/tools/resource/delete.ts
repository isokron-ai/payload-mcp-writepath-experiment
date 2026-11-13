import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PayloadRequest, TypedUser } from 'payload'

import { z } from 'zod'

import type { MCPPluginConfig } from '../../../types.js'

import { toCamelCase } from '../../../utils/camelCase.js'
import {
  bulkAnswer,
  bulkPreflight,
  currentDocument,
  currentUpdatedAt,
  errorResponse,
  idsOf,
  isLockedError,
  isVersionMap,
  lockConflict,
  lockInfo,
  readVersionCheck,
  receipt,
  staleConflict,
  type ToolResponse,
  type VersionMap,
} from '../../helpers/writeSafety.js'
import { toolSchemas } from '../schemas.js'

const toolName = (slug: string, verb: string) =>
  `${verb}${slug.charAt(0).toUpperCase() + toCamelCase(slug).slice(1)}`

export const deleteResourceTool = (
  server: McpServer,
  req: PayloadRequest,
  user: TypedUser,
  verboseLogs: boolean,
  collectionSlug: string,
  collections: MCPPluginConfig['collections'],
) => {
  const readTool = toolName(collectionSlug, 'find')
  const out = (response: ToolResponse, result: unknown = {}) =>
    (collections?.[collectionSlug]?.overrideResponse?.(response as never, result as never, req) ||
      response) as ToolResponse

  const tool = async (o: {
    all: boolean
    depth: number
    fallbackLocale?: string
    id?: number | string
    ifUpdatedAt?: string | VersionMap
    locale?: string
    overrideLock: boolean
    returnDocument: boolean
    where?: string
  }): Promise<ToolResponse> => {
    const payload = req.payload
    const { id } = o
    const versions = isVersionMap(o.ifUpdatedAt) ? o.ifUpdatedAt : undefined
    // C-bulk-versions (v2): a version map alone selects the documents it names.
    const where = o.where ?? (id === undefined && versions && Object.keys(versions).length ? JSON.stringify({ id: { in: idsOf(versions) } }) : undefined)
    if (id === undefined && !where) {
      return out(errorResponse('Error: Either id or where clause must be provided'))
    }
    if (id === undefined && typeof o.ifUpdatedAt === 'string') {
      return out(
        errorResponse(
          'Error: ifUpdatedAt as a single value pins one document (use it with id). For a bulk call pass a map {"<id>": "<updatedAt>"}, or leave it out: each document is checked against the version you last read. Nothing was deleted.',
        ),
      )
    }
    const pin = typeof o.ifUpdatedAt === 'string' ? o.ifUpdatedAt : id !== undefined ? versions?.[String(id)] : undefined
    const deleteOptions: Record<string, unknown> = {
      collection: collectionSlug,
      depth: o.depth,
      overrideAccess: false,
      overrideLock: o.overrideLock,
      req,
      user,
      ...(o.locale && { locale: o.locale }),
      ...(o.fallbackLocale && { fallbackLocale: o.fallbackLocale }),
    }
    if (id === undefined && where) {
      let whereClause: Record<string, unknown>
      try {
        whereClause = JSON.parse(where)
      } catch {
        return out(errorResponse('Error: Invalid JSON in where clause'))
      }
      if ((!whereClause || typeof whereClause !== 'object' || Object.keys(whereClause).length === 0) && !o.all) {
        const { totalDocs } = await payload.count({ collection: collectionSlug, overrideAccess: false, user })
        return out(
          errorResponse(
            `Refused: the where clause is empty, so it matches every document in "${collectionSlug}" (${totalDocs}). Nothing was deleted. Pass a filter, or all: true if the user really asked to delete all of them.`,
          ),
        )
      }
      deleteOptions.where = whereClause
    } else {
      deleteOptions.id = id
    }

    try {
      if (id !== undefined) {
        if (pin) {
          const current = await currentUpdatedAt({ collectionSlug, id, req, user })
          if (current !== pin) {
            return out(staleConflict({ action: 'delete', collectionSlug, current, currentDoc: await currentDocument({ collectionSlug, id, req, user }), id, readTool, sent: pin }))
          }
        } else {
          const stale = await readVersionCheck({ collectionSlug, id, req, user })
          if (stale) {
            return out(staleConflict({ action: 'delete', collectionSlug, current: stale.current, currentDoc: await currentDocument({ collectionSlug, id, req, user }), id, readTool, sent: stale.seen }))
          }
        }
        const result = (await payload.delete(deleteOptions as never)) as unknown as Record<string, unknown>
        if (o.returnDocument) {
          return out(
            {
              content: [
                {
                  type: 'text',
                  text: `Document deleted successfully from collection "${collectionSlug}"!\nDeleted document:\n\`\`\`json\n${JSON.stringify(result)}\n\`\`\``,
                },
              ],
            },
            result,
          )
        }
        return out(receipt({ action: 'deleted', collectionSlug, doc: result }), result)
      }
      // Bulk (v2): every matching document is checked against its pinned or last-read version first; the stale ones
      // are refused with their current state, the rest are deleted (best-effort, per document).
      const whereClause = deleteOptions.where as Record<string, unknown>
      const pre = await bulkPreflight({ collectionSlug, req, user, versions, where: whereClause })
      let docs: Record<string, unknown>[] = []
      let errors: { id?: unknown; message?: string }[] = []
      if (pre.allowed.length) {
        const result = (await payload.delete({
          ...deleteOptions,
          where: { and: [whereClause, { id: { in: pre.allowed } }] },
        } as never)) as { docs?: Record<string, unknown>[]; errors?: { id?: unknown; message?: string }[] }
        docs = result.docs || []
        errors = result.errors || []
        const seen = new Set([...docs.map((d) => String(d.id)), ...errors.map((e) => String(e.id))])
        for (const a of pre.allowed) {
          if (!seen.has(String(a))) {
            errors.push({ id: a, message: 'no longer matched the where clause when it was deleted; not deleted' })
          }
        }
      }
      return out(
        bulkAnswer({ action: 'deleted', applied: docs, collectionSlug, errors, readTool, refused: pre.refused, returnDocument: o.returnDocument, unmatchedPins: pre.unmatchedPins }),
        { docs, errors, refused: pre.refused },
      )
    } catch (error) {
      if (id !== undefined && isLockedError(error)) {
        const info = await lockInfo({ collectionSlug, id, req, user })
        return out(lockConflict({ action: 'delete', collectionSlug, current: await currentDocument({ collectionSlug, id, req, user }), id, info, readTool }))
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      payload.logger.error(`[payload-mcp] Error deleting resource from ${collectionSlug}: ${errorMessage}`)
      return out(errorResponse(`Error deleting resource from collection "${collectionSlug}": ${errorMessage}`))
    }
  }

  if (collections?.[collectionSlug]?.enabled) {
    const deleteSchema = z.object({
      ...toolSchemas.deleteResource.parameters.shape,
      all: z.boolean().optional().default(false).describe('Required to delete every document with an empty where clause'),
      ifUpdatedAt: z
        .union([z.string(), z.record(z.string(), z.string())])
        .optional()
        .describe(
          'Optional pin; without it each document is checked against the version you last read. With id: the updatedAt string. With where: a map {"<id>": "<updatedAt>"}. A changed document is not deleted',
        ),
      overrideLock: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'Default false: a document another user has open for editing is not deleted, and you are told who has it. True deletes it anyway; only when the user asked for that',
        ),
      returnDocument: z.boolean().optional().default(false).describe('Return the whole deleted document instead of a compact receipt'),
    })
    server.registerTool(
      toolName(collectionSlug, 'delete'),
      {
        annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false, readOnlyHint: false },
        description: `${collections?.[collectionSlug]?.description || toolSchemas.deleteResource.description.trim()}`,
        inputSchema: deleteSchema.shape,
      },
      async (p: Record<string, unknown>) =>
        await tool({
          all: Boolean(p.all),
          depth: (p.depth as number) ?? 0,
          fallbackLocale: p.fallbackLocale as string | undefined,
          id: p.id as number | string | undefined,
          ifUpdatedAt: p.ifUpdatedAt as string | undefined | VersionMap,
          locale: p.locale as string | undefined,
          overrideLock: Boolean(p.overrideLock),
          returnDocument: Boolean(p.returnDocument),
          where: p.where as string | undefined,
        }),
    )
  }
}
