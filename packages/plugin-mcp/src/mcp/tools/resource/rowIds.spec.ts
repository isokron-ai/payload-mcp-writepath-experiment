// updatePosts declares idempotentHint: true. Research v2.1 gave every array row sent without an id a new id on every
// call, so repeating the same update changed the document again (new row ids, and with them the rows' values in other
// locales). A row sent without an id that is identical to the stored row at the same position now keeps that row's id.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('payload/shared', () => ({ fieldIsVirtual: () => false }))

import { keepRowIds } from '../../helpers/rowIds.js'
import { connect, createStore, jsonIn, type Store } from './fakePayload.spec-utils.js'

let store: Store
beforeEach(() => {
  store = createStore()
})

type Row = { id: string; label: string; url?: null | string }
const rows = (id: number) => store.read('posts', id).items as Row[]
const seed = async (items: Array<Omit<Row, 'id'>>) =>
  (await store.payload.create({ collection: 'posts', data: { title: 'p', author: 'ann', items } })) as {
    id: number
    updatedAt: string
  }

describe('array row ids are stable when the same rows are sent again (MWS-ANN-3)', () => {
  it('repeating an update of an array with the same rows keeps the row ids', async () => {
    const post = await seed([{ label: 'one', url: 'https://example.test/1' }])
    const a = await connect(store)
    const items = [{ label: 'one', url: 'https://example.test/x' }]
    const r1 = await a.call('updatePosts', { id: post.id, ifUpdatedAt: post.updatedAt, items })
    expect(r1.isError).toBe(false)
    const after1 = rows(post.id)
    const r2 = await a.call('updatePosts', { id: post.id, ifUpdatedAt: jsonIn(r1.text).updatedAt, items })
    expect(r2.isError).toBe(false)
    expect(rows(post.id)).toEqual(after1)
  })

  it('a row whose values changed is a new row; an unchanged row at the same position keeps its id', async () => {
    const post = await seed([
      { label: 'one', url: 'https://example.test/1' },
      { label: 'two', url: 'https://example.test/2' },
    ])
    const before = rows(post.id)
    const a = await connect(store)
    const r = await a.call('updatePosts', {
      id: post.id,
      ifUpdatedAt: post.updatedAt,
      items: [
        { label: 'one', url: 'https://example.test/1' },
        { label: 'two', url: 'https://example.test/changed' },
      ],
    })
    expect(r.isError).toBe(false)
    const after = rows(post.id)
    expect(after[0]!.id).toBe(before[0]!.id)
    expect(after[1]!.id).not.toBe(before[1]!.id)
    expect(after[1]!.url).toBe('https://example.test/changed')
  })

  it('a row moved to another position does not take the id of the row stored there', async () => {
    const post = await seed([{ label: 'one' }, { label: 'two' }])
    const before = rows(post.id)
    const a = await connect(store)
    await a.call('updatePosts', { id: post.id, ifUpdatedAt: post.updatedAt, items: [{ label: 'two' }, { label: 'one' }] })
    const after = rows(post.id)
    expect(after.map((r) => r.label)).toEqual(['two', 'one'])
    expect(after.map((r) => r.id)).not.toContain(before[0]!.id)
    expect(after.map((r) => r.id)).not.toContain(before[1]!.id)
  })

  it('rows sent with their ids are written as sent, and an id is never given to two rows', async () => {
    const post = await seed([{ label: 'one' }, { label: 'two' }])
    const before = rows(post.id)
    const a = await connect(store)
    await a.call('updatePosts', {
      id: post.id,
      ifUpdatedAt: post.updatedAt,
      items: [{ id: before[1]!.id, label: 'two' }, { label: 'two' }],
    })
    const after = rows(post.id)
    expect(after[0]!.id).toBe(before[1]!.id)
    expect(after[1]!.id).not.toBe(before[1]!.id)
  })

  it('the same call sent twice (the same ifUpdatedAt) is refused the second time and changes nothing', async () => {
    const post = await seed([{ label: 'one' }])
    const a = await connect(store)
    const args = { id: post.id, ifUpdatedAt: post.updatedAt, items: [{ label: 'uno' }] }
    expect((await a.call('updatePosts', args)).isError).toBe(false)
    const once = store.read('posts', post.id)
    const again = await a.call('updatePosts', args)
    expect(again.isError).toBe(true)
    expect(store.read('posts', post.id)).toEqual(once)
  })

  it('updatePosts still declares idempotentHint: true', async () => {
    const a = await connect(store)
    const t = (await a.tools()).find((x) => x.name === 'updatePosts')!
    expect(t.annotations?.idempotentHint).toBe(true)
  })

  it('keepRowIds: blocks and nested arrays; a stored value the row leaves out must be empty', () => {
    const fields = [
      {
        name: 'layout',
        type: 'blocks',
        blocks: [
          { slug: 'hero', flattenedFields: [{ name: 'heading', type: 'text' }] },
          { slug: 'cta', flattenedFields: [{ name: 'label', type: 'text' }, { name: 'links', type: 'array', flattenedFields: [{ name: 'href', type: 'text' }] }] },
          { slug: 'quote', flattenedFields: [{ name: 'text', type: 'text' }, { name: 'attribution', type: 'text' }] },
        ],
      },
    ]
    const stored = {
      layout: [
        { id: 'b1', blockName: null, blockType: 'hero', heading: 'Hi' },
        { id: 'b2', blockType: 'cta', label: 'Go', links: [{ id: 'l1', href: '/a' }] },
        { id: 'b3', blockType: 'quote', text: 'q', attribution: 'someone' },
      ],
    }
    const out = keepRowIds(
      {
        layout: [
          { blockType: 'hero', heading: 'Hi' },
          { blockType: 'cta', label: 'Go', links: [{ href: '/a' }] },
          { blockType: 'quote', text: 'q' },
        ],
      },
      stored,
      fields,
    ) as { layout: Array<Record<string, unknown>> }
    expect(out.layout[0]!.id).toBe('b1')
    expect(out.layout[1]!.id).toBe('b2')
    expect((out.layout[1]!.links as Array<{ id: string }>)[0]!.id).toBe('l1')
    expect(out.layout[2]!.id).toBeUndefined()
  })

  it('keepRowIds: a json field is left as sent, and an id sent anywhere is not filled in again', () => {
    const json = keepRowIds({ meta: [{ name: 'y' }] }, { meta: [{ id: 'x', name: 'y' }] }, [{ name: 'meta', type: 'json' }])
    expect(json).toEqual({ meta: [{ name: 'y' }] })
    const fields = [
      { name: 'items', type: 'array', flattenedFields: [{ name: 'subs', type: 'array', flattenedFields: [{ name: 't', type: 'text' }] }] },
    ]
    const out = keepRowIds(
      { items: [{ subs: [{ t: 'a' }] }, { id: 'r1', subs: [{ id: 'n1', t: 'a' }] }] },
      { items: [{ id: 'r0', subs: [{ id: 'n1', t: 'a' }] }, { id: 'r1', subs: [] }] },
      fields,
    ) as { items: Array<{ id?: string; subs: Array<{ id?: string }> }> }
    expect(out.items[0]!.id).toBe('r0')
    expect(out.items[0]!.subs[0]!.id).toBeUndefined()
    expect(out.items[1]!.subs[0]!.id).toBe('n1')
  })
})
