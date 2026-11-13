import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { JSONSchema4 } from 'json-schema'
import type { PayloadRequest, SelectType, TypedUser } from 'payload'

import { z } from 'zod'

import type { MCPPluginConfig } from '../../../types.js'

import { toCamelCase } from '../../../utils/camelCase.js'
import {
  getCollectionVirtualFieldNames,
  stripVirtualFields,
} from '../../../utils/getVirtualFieldNames.js'
import { convertCollectionSchemaToZod } from '../../../utils/schemaConversion/convertCollectionSchemaToZod.js'
import { transformPointDataToPayload } from '../../../utils/transformPointDataToPayload.js'
import {
  currentUpdatedAt,
  errorResponse,
  isLockedError,
  lockConflict,
  lockInfo,
  OPERATION_ARGS,
  readVersionCheck,
  receipt,
  rememberRead,
  staleConflict,
  type ToolResponse,
} from '../../helpers/writeSafety.js'
import { toolSchemas } from '../schemas.js'

const toolName = (slug: string, verb: string) =>
  `${verb}${slug.charAt(0).toUpperCase() + toCamelCase(slug).slice(1)}`

export const updateResourceTool = (
  server: McpServer,
  req: PayloadRequest,
  user: TypedUser,
  verboseLogs: boolean,
  collectionSlug: string,
  collections: MCPPluginConfig['collections'],
  schema: JSONSchema4,
) => {
  const readTool = toolName(collectionSlug, 'find')
  const out = (response: ToolResponse, result: unknown = {}) =>
    (collections?.[collectionSlug]?.overrideResponse?.(response as never, result as never, req) ||
      response) as ToolResponse

  const tool = async (o: {
    all: boolean
    data: Record<string, unknown>
    depth: number
    draft: boolean
    fallbackLocale?: string
    id?: number | string
    ifUpdatedAt?: string
    locale?: string
    overrideLock: boolean
    returnDocument: boolean
    select?: Record<string, unknown>
    where?: string
  }): Promise<ToolResponse> => {
    const payload = req.payload
    const { id, where } = o
    let parsedData = transformPointDataToPayload(o.data)
    parsedData = stripVirtualFields(parsedData, getCollectionVirtualFieldNames(payload.config, collectionSlug))
    const written = Object.keys(parsedData)
    if (written.length === 0) {
      return out(errorResponse(`Error: nothing to write. Pass the fields to change (or put them under data).`))
    }

    if (id === undefined && !where) {
      return out(errorResponse('Error: Either id or where clause must be provided'))
    }

    let whereClause: Record<string, unknown> = {}
    if (id === undefined && where) {
      try {
        whereClause = JSON.parse(where)
      } catch {
        return out(errorResponse('Error: Invalid JSON in where clause'))
      }
      // C-where: an empty filter matches every document; refuse it unless the caller says so.
      if (!whereClause || typeof whereClause !== 'object' || Object.keys(whereClause).length === 0) {
        if (!o.all) {
          const { totalDocs } = await payload.count({ collection: collectionSlug, overrideAccess: false, user })
          return out(
            errorResponse(
              `Refused: the where clause is empty, so it matches every document in "${collectionSlug}" (${totalDocs}). Nothing was changed. Pass a filter, or all: true if the user really asked to change all of them.`,
            ),
          )
        }
      }
    }

    try {
      if (id !== undefined) {
        // C-conflict: optional precondition on the version the agent read.
        if (o.ifUpdatedAt) {
          const current = await currentUpdatedAt({ collectionSlug, id, req, user })
          if (current !== o.ifUpdatedAt) {
            return out(staleConflict({ action: 'update', collectionSlug, current, id, readTool, sent: o.ifUpdatedAt }))
          }
        } else {
          // C-readversion: no explicit precondition: the version this user last read is the precondition.
          const stale = await readVersionCheck({ collectionSlug, id, req, user })
          if (stale) {
            return out(staleConflict({ action: 'update', collectionSlug, current: stale.current, id, readTool, sent: stale.seen }))
          }
        }
        const result = await payload.update({
          id,
          collection: collectionSlug,
          data: parsedData,
          depth: o.depth,
          draft: o.draft,
          overrideAccess: false,
          overrideLock: o.overrideLock,
          req,
          user,
          ...(o.locale && { locale: o.locale }),
          ...(o.fallbackLocale && { fallbackLocale: o.fallbackLocale }),
          ...(o.select && { select: o.select as SelectType }),
        } as never)
        const doc = result as unknown as Record<string, unknown>
        rememberRead(user, collectionSlug, [doc])
        if (o.returnDocument || o.select) {
          return out(
            {
              content: [
                {
                  type: 'text',
                  text: `Document updated successfully in collection "${collectionSlug}"!\nUpdated document:\n\`\`\`json\n${JSON.stringify(result)}\n\`\`\``,
                },
              ],
            },
            result,
          )
        }
        return out(receipt({ action: 'updated', collectionSlug, doc, written }), result)
      }

      // Bulk: per-document results; isError when any document failed (C-bulk).
      const result = (await payload.update({
        collection: collectionSlug,
        data: parsedData,
        depth: o.depth,
        draft: o.draft,
        overrideAccess: false,
        overrideLock: o.overrideLock,
        req,
        user,
        where: whereClause,
        ...(o.locale && { locale: o.locale }),
        ...(o.fallbackLocale && { fallbackLocale: o.fallbackLocale }),
        ...(o.select && { select: o.select as SelectType }),
      } as never)) as { docs?: Record<string, unknown>[]; errors?: { id?: unknown; message?: string }[] }
      const docs = result.docs || []
      const errors = result.errors || []
      rememberRead(user, collectionSlug, docs)
      const items = [
        ...docs.map((d) => ({ id: d.id, ok: true, updatedAt: d.updatedAt })),
        ...errors.map((e) => ({ id: e.id, error: e.message, ok: false })),
      ]
      const head =
        errors.length === 0
          ? `Updated ${docs.length} document(s) in "${collectionSlug}".`
          : `PARTIAL: updated ${docs.length} document(s) in "${collectionSlug}"; ${errors.length} failed and were NOT changed (the others stay changed).`
      const body = o.returnDocument ? `\n\`\`\`json\n${JSON.stringify({ docs, errors })}\n\`\`\`` : `\n${JSON.stringify({ results: items })}`
      return out(
        { content: [{ type: 'text', text: head + body }], ...(errors.length ? { isError: true } : {}) },
        { docs, errors },
      )
    } catch (error) {
      if (id !== undefined && isLockedError(error)) {
        const info = await lockInfo({ collectionSlug, id, req, user })
        return out(lockConflict({ action: 'update', collectionSlug, id, info, readTool }))
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      payload.logger.error(`[payload-mcp] Error updating resource in ${collectionSlug}: ${errorMessage}`)
      return out(errorResponse(`Error updating resource in collection "${collectionSlug}": ${errorMessage}`))
    }
  }

  if (collections?.[collectionSlug]?.enabled) {
    const convertedFields = convertCollectionSchemaToZod(schema)
    const fieldShape = convertedFields.partial().shape as Record<string, z.ZodTypeAny>
    // C-args: fields whose names collide with an operation argument are only reachable through `data`.
    const flatFields = Object.fromEntries(Object.entries(fieldShape).filter(([k]) => !OPERATION_ARGS.includes(k)))
    const colliding = Object.keys(fieldShape).filter((k) => OPERATION_ARGS.includes(k))

    const updateResourceSchema = z.object({
      ...flatFields,
      all: z
        .boolean()
        .optional()
        .default(false)
        .describe('Required to update every document with an empty where clause'),
      data: z
        .object(fieldShape)
        .partial()
        .optional()
        .describe(
          colliding.length
            ? `Document fields to write. Fields named ${colliding.join(', ')} can only be written here (the top-level names are operation arguments).`
            : 'Document fields to write (alternative to passing them at the top level)',
        ),
      depth: z.number().int().min(0).max(10).optional().default(0).describe('How many levels deep to populate relationships'),
      draft: z.boolean().optional().default(false).describe('Whether to update the document as a draft'),
      fallbackLocale: z
        .string()
        .optional()
        .describe('Optional: fallback locale code to use when requested locale is not available'),
      id: z.union([z.string(), z.number()]).optional().describe('The ID of the document to update'),
      ifUpdatedAt: z
        .string()
        .optional()
        .describe(
          'Recommended for edits based on an earlier read: the updatedAt you read. If the document changed since, nothing is written and you get the current updatedAt',
        ),
      locale: z
        .string()
        .optional()
        .describe('Optional: locale code to update the document in (e.g., "en", "es"). Defaults to the default locale'),
      overrideLock: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'Default false: a document another user has open for editing is not changed, and you are told who has it. True takes over their editing session and discards their lock; only when the user asked for that',
        ),
      returnDocument: z
        .boolean()
        .optional()
        .default(false)
        .describe('Return the whole updated document instead of a compact receipt'),
      select: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Optional: define exactly which fields you'd like to return in the response, e.g., {\"title\": true}"),
      where: z.string().optional().describe('JSON string for where clause to update multiple documents'),
    })

    server.registerTool(
      toolName(collectionSlug, 'update'),
      {
        annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false, readOnlyHint: false },
        description: `${collections?.[collectionSlug]?.description || toolSchemas.updateResource.description.trim()}`,
        inputSchema: updateResourceSchema.shape,
      },
      async (params: Record<string, unknown>) => {
        const {
          all,
          data,
          depth,
          draft,
          fallbackLocale,
          id,
          ifUpdatedAt,
          locale,
          overrideLock,
          returnDocument,
          select,
          where,
          ...flat
        } = params
        return await tool({
          all: Boolean(all),
          data: { ...flat, ...((data as Record<string, unknown>) || {}) },
          depth: (depth as number) ?? 0,
          draft: Boolean(draft),
          fallbackLocale: fallbackLocale as string | undefined,
          id: id as number | string | undefined,
          ifUpdatedAt: ifUpdatedAt as string | undefined,
          locale: locale as string | undefined,
          overrideLock: Boolean(overrideLock),
          returnDocument: Boolean(returnDocument),
          select: select as Record<string, unknown> | undefined,
          where: where as string | undefined,
        })
      },
    )
  }
}
