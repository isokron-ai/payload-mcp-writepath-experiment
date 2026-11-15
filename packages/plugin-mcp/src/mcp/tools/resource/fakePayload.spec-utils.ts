/**
 * Test fixture for the resource tool specs (IsoKron research build): an in-memory stand-in for the parts of
 * Payload's Local API the collection tools call, two collections shaped like the experiment's sandbox app (tasks,
 * posts), and a real MCP server and client over the SDK's in-memory transport, so input validation, `isError` and
 * tools/list go through the SDK exactly as they do in the app. Not part of the plugin build (build.sh skips
 * *.spec.ts and *.spec-utils.ts).
 */
import type { JSONSchema4 } from 'json-schema'
import type { PayloadRequest, TypedUser } from 'payload'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { createResourceTool } from './create.js'
import { deleteResourceTool } from './delete.js'
import { findResourceTool } from './find.js'
import { updateResourceTool } from './update.js'

type Doc = Record<string, unknown> & { createdAt: string; id: number; updatedAt: string }

export const schemas: Record<string, JSONSchema4> = {
  tasks: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'integer' },
      title: { type: 'string' },
      status: { type: ['string', 'null'], enum: ['todo', 'doing', 'done', null] },
      owner: { type: ['string', 'null'] },
      priority: { type: ['number', 'null'] },
      archived: { type: ['boolean', 'null'] },
      updatedAt: { type: 'string' },
      createdAt: { type: 'string' },
    },
    required: ['id', 'title', 'updatedAt', 'createdAt'],
  },
  posts: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'integer' },
      title: { type: 'string' },
      author: { type: ['string', 'null'] },
      items: {
        type: ['array', 'null'],
        items: {
          type: 'object',
          additionalProperties: false,
          properties: { id: { type: ['string', 'null'] }, label: { type: 'string' }, url: { type: ['string', 'null'] } },
          required: ['label'],
        },
      },
      updatedAt: { type: 'string' },
      createdAt: { type: 'string' },
    },
    required: ['id', 'title', 'updatedAt', 'createdAt'],
  },
}

/** Payload's ValidationError as the Local API throws it (message, plus the reasons in data.errors). */
class FakeValidationError extends Error {
  data: { errors: Array<{ label: string; message: string; path: string }> }
  status = 400
  constructor(errors: Array<{ label: string; message: string; path: string }>) {
    super(`The following field is invalid: ${errors.map((e) => e.label).join(', ')}`)
    this.name = 'ValidationError'
    this.data = { errors }
  }
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

export function createStore() {
  const docs: Record<string, Map<number, Doc>> = { posts: new Map(), tasks: new Map() }
  let nextId = 1
  let rowSeq = 0
  let clock = Date.parse('2026-11-15T12:00:00.000Z')
  const tick = () => new Date((clock += 1000)).toISOString()
  const rowId = () => `row${String(++rowSeq).padStart(4, '0')}`

  // Payload keeps the id of an array row sent with one and gives every row sent without one a new id.
  const withRowIds = (data: Record<string, unknown>) => {
    const out = { ...data }
    for (const [k, v] of Object.entries(out)) {
      if (Array.isArray(v)) {
        out[k] = v.map((row) =>
          row && typeof row === 'object' ? { ...(row as object), id: (row as { id?: unknown }).id ?? rowId() } : row,
        )
      }
    }
    return out
  }
  const validate = (collection: string, data: Record<string, unknown>) => {
    if (collection === 'tasks' && typeof data.priority === 'number' && data.priority > 5) {
      throw new FakeValidationError([
        { label: 'Priority', message: `${data.priority} is greater than the max allowed Value of 5.`, path: 'priority' },
      ])
    }
  }
  const matches = (doc: Doc, where: Record<string, unknown> | undefined): boolean => {
    if (!where || Object.keys(where).length === 0) {
      return true
    }
    return Object.entries(where).every(([k, cond]) => {
      if (k === 'and') {
        return (cond as Record<string, unknown>[]).every((w) => matches(doc, w))
      }
      const c = cond as { equals?: unknown; in?: unknown[] }
      const v = doc[k]
      if ('equals' in c) {
        return String(v) === String(c.equals)
      }
      if (Array.isArray(c.in)) {
        return c.in.map(String).includes(String(v))
      }
      return false
    })
  }
  const select = (doc: Doc, sel?: Record<string, unknown>) => {
    if (!sel || Object.keys(sel).length === 0) {
      return clone(doc)
    }
    const inclusion = Object.values(sel).some((v) => v !== false)
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(doc)) {
      if (k === 'id' || (inclusion ? sel[k] === true : sel[k] !== false)) {
        out[k] = clone(v)
      }
    }
    return out
  }
  const get = (collection: string, id: number | string) => {
    const d = docs[collection]!.get(Number(id))
    if (!d) {
      const e = new Error('Not Found')
      e.name = 'NotFound'
      throw e
    }
    return d
  }
  const updateOne = (collection: string, id: number, data: Record<string, unknown>) => {
    const d = get(collection, id)
    validate(collection, data)
    const next = { ...d, ...withRowIds(data), updatedAt: tick() } as Doc
    docs[collection]!.set(id, next)
    return clone(next)
  }

  const payload = {
    collections: { posts: { config: { timestamps: true } }, tasks: { config: { timestamps: true } } },
    config: { collections: [{ slug: 'posts', flattenedFields: [] }, { slug: 'tasks', flattenedFields: [] }] },
    count: async ({ collection }: { collection: string }) => ({ totalDocs: docs[collection]!.size }),
    create: async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => {
      validate(collection, data)
      const now = tick()
      const doc = { ...withRowIds(data), id: nextId++, createdAt: now, updatedAt: now } as Doc
      docs[collection]!.set(doc.id, doc)
      return clone(doc)
    },
    delete: async ({ collection, id, where }: { collection: string; id?: number; where?: Record<string, unknown> }) => {
      if (id !== undefined) {
        const d = get(collection, id)
        docs[collection]!.delete(d.id)
        return clone(d)
      }
      const hit = [...docs[collection]!.values()].filter((d) => matches(d, where))
      for (const d of hit) {
        docs[collection]!.delete(d.id)
      }
      return { docs: hit.map(clone), errors: [] }
    },
    find: async ({ collection, select: sel, where }: { collection: string; select?: Record<string, unknown>; where?: Record<string, unknown> }) => {
      if (collection === 'payload-locked-documents') {
        return { docs: [], page: 1, totalDocs: 0, totalPages: 1 }
      }
      const hit = [...docs[collection]!.values()].filter((d) => matches(d, where)).map((d) => select(d, sel))
      return { docs: hit, page: 1, totalDocs: hit.length, totalPages: 1 }
    },
    findByID: async ({ id, collection, select: sel }: { collection: string; id: number | string; select?: Record<string, unknown> }) =>
      select(get(collection, id), sel),
    logger: { error: () => {}, info: () => {}, warn: () => {} },
    update: async ({ id, collection, data, where }: { collection: string; data: Record<string, unknown>; id?: number; where?: Record<string, unknown> }) => {
      if (id !== undefined) {
        return updateOne(collection, Number(id), data)
      }
      const hit = [...docs[collection]!.values()].filter((d) => matches(d, where))
      const out: Doc[] = []
      const errors: Array<{ id: unknown; message: string }> = []
      for (const d of hit) {
        try {
          out.push(updateOne(collection, d.id, data) as Doc)
        } catch (e) {
          errors.push({ id: d.id, message: (e as Error).message })
        }
      }
      return { docs: out, errors }
    },
  }

  /** A write by another writer (REST, or anyone): changes the document and its updatedAt. */
  const writeDirect = (collection: string, id: number, data: Record<string, unknown>) => updateOne(collection, id, data)
  const read = (collection: string, id: number) => clone(get(collection, id))
  const all = (collection: string) => [...docs[collection]!.values()].map(clone)
  return { all, payload, read, writeDirect }
}

export type Store = ReturnType<typeof createStore>

/**
 * One MCP client session on its own server instance (the plugin builds a server per request), all of them signed
 * in as the same user through the same key, which is how two agents sharing one MCP API key look to the plugin.
 */
export async function connect(store: Store, user: TypedUser = { id: 1, collection: 'users' } as unknown as TypedUser) {
  const server = new McpServer({ name: 'payload-test', version: '0.0.0' })
  const req = { payload: store.payload, user } as unknown as PayloadRequest
  const collections = { posts: { enabled: true }, tasks: { enabled: true } } as never
  for (const slug of ['tasks', 'posts']) {
    createResourceTool(server, req, user, false, slug, collections, schemas[slug]!)
    updateResourceTool(server, req, user, false, slug, collections, schemas[slug]!)
    findResourceTool(server, req, user, false, slug, collections)
    deleteResourceTool(server, req, user, false, slug, collections)
  }
  const [a, b] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'spec', version: '0.0.0' })
  await Promise.all([server.connect(a), client.connect(b)])
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = (await client.callTool({ name, arguments: args })) as { content: Array<{ text: string }>; isError?: boolean }
    return { isError: Boolean(r.isError), text: r.content?.[0]?.text ?? '' }
  }
  const tools = async () => (await client.listTools()).tools
  return { call, close: () => client.close(), tools }
}

/** The JSON object a compact receipt or a conflict answer carries on its first line that starts with "{". */
export const jsonIn = (text: string): Record<string, unknown> => {
  const line = text.split('\n').find((l) => l.trim().startsWith('{')) ?? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  return JSON.parse(line.slice(line.indexOf('{'), line.lastIndexOf('}') + 1)) as Record<string, unknown>
}
