// PAY-09 (F9): the version precondition is checked per write. The caller sends the version it read (ifUpdatedAt);
// a write based on a version that is no longer current is refused whoever sends it, including a second session
// that uses the same key as the session that changed the document. Research v2.1 kept the version per user in
// server memory instead, so a second session of the same user refreshed it and the stale write went through.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('payload/shared', () => ({ fieldIsVirtual: () => false }))

import { connect, createStore, jsonIn, type Store } from './fakePayload.spec-utils.js'

let store: Store
beforeEach(() => {
  store = createStore()
})

const seedPost = async () =>
  (await store.payload.create({
    collection: 'posts',
    data: { title: 'p', author: 'ann', items: [{ label: 'one', url: 'https://example.test/1' }] },
  })) as { id: number; updatedAt: string }
const seedTask = async (title: string) =>
  (await store.payload.create({ collection: 'tasks', data: { title, owner: 'ann', status: 'todo', priority: 2 } })) as {
    id: number
    updatedAt: string
  }

describe('per-write version precondition (PAY-09)', () => {
  it('refuses a stale write from one session after another session of the same key changed the document', async () => {
    const post = await seedPost()
    const a = await connect(store)
    const b = await connect(store)
    const readA = jsonIn((await a.call('findPosts', { id: post.id })).text)
    const readB = jsonIn((await b.call('findPosts', { id: post.id })).text)
    const wB = await b.call('updatePosts', { id: post.id, author: 'carol', ifUpdatedAt: readB.updatedAt })
    expect(wB.isError).toBe(false)

    const wA = await a.call('updatePosts', {
      id: post.id,
      ifUpdatedAt: readA.updatedAt,
      items: [{ label: 'one', url: 'https://example.test/a' }],
    })
    expect(wA.isError).toBe(true)
    expect(wA.text).toMatch(/changed since you read it/)
    expect(wA.text).toMatch(/NOT applied/)
    const now = store.read('posts', post.id)
    expect(now.author).toBe('carol')
    expect((now.items as Array<{ url: string }>)[0]!.url).toBe('https://example.test/1')
  })

  it('refuses an update by id that carries no version, whoever wrote last, and changes nothing', async () => {
    const post = await seedPost()
    const a = await connect(store)
    const b = await connect(store)
    await a.call('findPosts', { id: post.id })
    const readB = jsonIn((await b.call('findPosts', { id: post.id })).text)
    await b.call('updatePosts', { id: post.id, author: 'carol', ifUpdatedAt: readB.updatedAt })
    const before = store.read('posts', post.id)

    const wA = await a.call('updatePosts', { id: post.id, items: [{ label: 'one', url: 'https://example.test/a' }] })
    expect(wA.isError).toBe(true)
    expect(wA.text).toMatch(/ifUpdatedAt/)
    expect(store.read('posts', post.id)).toEqual(before)
  })

  it('refuses a delete by id with no version or a stale one, and deletes with the current one', async () => {
    const task = await seedTask('t')
    const a = await connect(store)
    const b = await connect(store)
    const read = jsonIn((await a.call('findTasks', { id: task.id })).text)
    const readB = jsonIn((await b.call('findTasks', { id: task.id })).text)
    await b.call('updateTasks', { id: task.id, owner: 'bob', ifUpdatedAt: readB.updatedAt })

    const noVersion = await a.call('deleteTasks', { id: task.id })
    expect(noVersion.isError).toBe(true)
    expect(noVersion.text).toMatch(/ifUpdatedAt/)
    const stale = await a.call('deleteTasks', { id: task.id, ifUpdatedAt: read.updatedAt })
    expect(stale.isError).toBe(true)
    expect(stale.text).toMatch(/changed since you read it/)
    expect(store.all('tasks')).toHaveLength(1)

    const ok = await a.call('deleteTasks', { id: task.id, ifUpdatedAt: store.read('tasks', task.id).updatedAt })
    expect(ok.isError).toBe(false)
    expect(store.all('tasks')).toHaveLength(0)
  })

  it('refuses a bulk update with no version map, and changes nothing', async () => {
    const t1 = await seedTask('t1')
    const t2 = await seedTask('t2')
    const a = await connect(store)
    const b = await connect(store)
    await a.call('findTasks', { where: JSON.stringify({ id: { in: [t1.id, t2.id] } }) })
    const readB = jsonIn((await b.call('findTasks', { id: t2.id })).text)
    await b.call('updateTasks', { id: t2.id, owner: 'bob', ifUpdatedAt: readB.updatedAt })

    const w = await a.call('updateTasks', { where: JSON.stringify({ id: { in: [t1.id, t2.id] } }), status: 'done' })
    expect(w.isError).toBe(true)
    expect(w.text).toMatch(/ifUpdatedAt/)
    expect(store.all('tasks').map((t) => t.status)).toEqual(['todo', 'todo'])
  })

  it('bulk update with a version map: the stale document is refused, the current one is written', async () => {
    const t1 = await seedTask('t1')
    const t2 = await seedTask('t2')
    const a = await connect(store)
    const b = await connect(store)
    await a.call('findTasks', { where: JSON.stringify({ id: { in: [t1.id, t2.id] } }) })
    const v1 = store.read('tasks', t1.id).updatedAt
    const v2 = store.read('tasks', t2.id).updatedAt
    const readB = jsonIn((await b.call('findTasks', { id: t2.id })).text)
    await b.call('updateTasks', { id: t2.id, owner: 'bob', ifUpdatedAt: readB.updatedAt })

    const w = await a.call('updateTasks', { ifUpdatedAt: { [t1.id]: v1, [t2.id]: v2 }, status: 'done' })
    expect(w.isError).toBe(true)
    expect(w.text).toMatch(/^PARTIAL/)
    expect(store.read('tasks', t1.id).status).toBe('done')
    expect(store.read('tasks', t2.id).status).toBe('todo')
    expect(store.read('tasks', t2.id).owner).toBe('bob')
  })

  it('bulk: a document the where matches but the version map does not name is not changed', async () => {
    const t1 = await seedTask('t1')
    const t2 = await seedTask('t2')
    const a = await connect(store)
    await a.call('findTasks', { where: JSON.stringify({ id: { in: [t1.id, t2.id] } }) })
    const v1 = store.read('tasks', t1.id).updatedAt

    const w = await a.call('updateTasks', {
      ifUpdatedAt: { [t1.id]: v1 },
      status: 'done',
      where: JSON.stringify({ id: { in: [t1.id, t2.id] } }),
    })
    expect(w.isError).toBe(true)
    expect(w.text).toMatch(/^PARTIAL/)
    expect(w.text).toMatch(/no version/)
    expect(store.read('tasks', t1.id).status).toBe('done')
    expect(store.read('tasks', t2.id).status).toBe('todo')
  })

  it('refuses a bulk delete with no version map', async () => {
    const t1 = await seedTask('t1')
    const a = await connect(store)
    await a.call('findTasks', { id: t1.id })
    const d = await a.call('deleteTasks', { where: JSON.stringify({ id: { in: [t1.id] } }) })
    expect(d.isError).toBe(true)
    expect(d.text).toMatch(/ifUpdatedAt/)
    expect(store.all('tasks')).toHaveLength(1)
  })

  it('a find with select still answers updatedAt, so the caller has the version to send', async () => {
    const task = await seedTask('t')
    const a = await connect(store)
    const byId = jsonIn((await a.call('findTasks', { id: task.id, select: { title: true } })).text)
    expect(byId.updatedAt).toBe(store.read('tasks', task.id).updatedAt)
    const list = (await a.call('findTasks', { select: { title: true } })).text
    expect(list).toContain(`"updatedAt":"${store.read('tasks', task.id).updatedAt}"`)
  })

  it('a write receipt carries the new version, which the next write can send', async () => {
    const task = await seedTask('t')
    const a = await connect(store)
    const r1 = await a.call('updateTasks', { id: task.id, owner: 'x', ifUpdatedAt: task.updatedAt })
    expect(r1.isError).toBe(false)
    const v = jsonIn(r1.text).updatedAt
    expect(v).toBe(store.read('tasks', task.id).updatedAt)
    const r2 = await a.call('updateTasks', { id: task.id, owner: 'y', ifUpdatedAt: v })
    expect(r2.isError).toBe(false)
    expect(store.read('tasks', task.id).owner).toBe('y')
  })

  it('declares ifUpdatedAt as required on update and delete, and an id missing from a map is refused with the current document', async () => {
    const task = await seedTask('t')
    const a = await connect(store)
    const tools = await a.tools()
    for (const name of ['updateTasks', 'deleteTasks', 'updatePosts', 'deletePosts']) {
      const t = tools.find((x) => x.name === name)!
      expect(t.inputSchema.required).toContain('ifUpdatedAt')
    }
    const w = await a.call('updateTasks', { id: task.id, ifUpdatedAt: { '999': task.updatedAt }, owner: 'x' })
    expect(w.isError).toBe(true)
    expect(w.text).toMatch(/needs ifUpdatedAt/)
    expect(jsonIn(w.text).currentDocument).toMatchObject({ id: task.id, owner: 'ann' })
    expect(store.read('tasks', task.id).owner).toBe('ann')
  })
})
