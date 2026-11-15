// PAY-11 (F11): an argument the tool's schema does not name is refused on every collection tool (create, find,
// update, delete), also when it sits next to valid fields, and the refusal names it. Research v2.1 refused only an
// update made of nothing but unknown arguments ("nothing to write"); every other call dropped them silently.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('payload/shared', () => ({ fieldIsVirtual: () => false }))

import { connect, createStore, type Store } from './fakePayload.spec-utils.js'

let store: Store
beforeEach(() => {
  store = createStore()
})

const seedTask = async () =>
  (await store.payload.create({ collection: 'tasks', data: { title: 't', owner: 'ann', status: 'todo', priority: 2 } })) as {
    id: number
    updatedAt: string
  }

describe('unknown arguments are refused and named (PAY-11)', () => {
  it('update: a misspelled field next to a valid one is refused, named, and nothing is written', async () => {
    const task = await seedTask()
    const a = await connect(store)
    const r = await a.call('updateTasks', { id: task.id, ifUpdatedAt: task.updatedAt, owner: 'zed', ttle: 'y' })
    expect(r.isError).toBe(true)
    expect(r.text).toContain('"ttle"')
    expect(r.text).toMatch(/did you mean "title"/)
    expect(store.read('tasks', task.id)).toMatchObject({ owner: 'ann', title: 't' })
  })

  it('update: a call made only of a misspelled field is refused and names it', async () => {
    const task = await seedTask()
    const a = await connect(store)
    const r = await a.call('updateTasks', { id: task.id, ifUpdatedAt: task.updatedAt, ttle: 'x' })
    expect(r.isError).toBe(true)
    expect(r.text).toContain('"ttle"')
  })

  it('create: a misspelled field is refused, named, and nothing is created', async () => {
    const a = await connect(store)
    const r = await a.call('createTasks', { title: 'new', status: 'todo', owner: 'ann', priority: 2, ttle: 'z' })
    expect(r.isError).toBe(true)
    expect(r.text).toContain('"ttle"')
    expect(store.all('tasks')).toHaveLength(0)
  })

  it('find: a misspelled argument is refused and named', async () => {
    const task = await seedTask()
    const a = await connect(store)
    const r = await a.call('findTasks', { id: task.id, dpth: 1 })
    expect(r.isError).toBe(true)
    expect(r.text).toContain('"dpth"')
    expect(r.text).toMatch(/did you mean "depth"/)
  })

  it('delete: an unknown argument is refused, named, and nothing is deleted', async () => {
    const task = await seedTask()
    const a = await connect(store)
    const r = await a.call('deleteTasks', { id: task.id, ifUpdatedAt: task.updatedAt, force: true })
    expect(r.isError).toBe(true)
    expect(r.text).toContain('"force"')
    expect(store.all('tasks')).toHaveLength(1)
  })

  it('an unknown key inside an array row is refused and named with its path', async () => {
    const post = (await store.payload.create({ collection: 'posts', data: { title: 'p', items: [{ label: 'one' }] } })) as {
      id: number
      updatedAt: string
    }
    const a = await connect(store)
    const r = await a.call('updatePosts', { id: post.id, ifUpdatedAt: post.updatedAt, items: [{ lable: 'two' }] })
    expect(r.isError).toBe(true)
    expect(r.text).toContain('lable')
    expect(r.text).toMatch(/items/)
    expect((store.read('posts', post.id).items as Array<{ label: string }>)[0]!.label).toBe('one')
  })

  it('every collection tool advertises that it takes no other arguments', async () => {
    const a = await connect(store)
    const tools = await a.tools()
    for (const verb of ['create', 'find', 'update', 'delete']) {
      for (const c of ['Tasks', 'Posts']) {
        const t = tools.find((x) => x.name === `${verb}${c}`)!
        expect(t.inputSchema.additionalProperties, `${verb}${c}`).toBe(false)
      }
    }
  })

  it('calls with only known arguments still work', async () => {
    const a = await connect(store)
    const c = await a.call('createTasks', { title: 'ok', status: 'todo', owner: 'ann', priority: 1 })
    expect(c.isError).toBe(false)
    const task = store.all('tasks')[0]!
    const f = await a.call('findTasks', { id: task.id, depth: 0 })
    expect(f.isError).toBe(false)
    const u = await a.call('updateTasks', { id: task.id, ifUpdatedAt: task.updatedAt, owner: 'bob' })
    expect(u.isError).toBe(false)
    expect(store.read('tasks', task.id).owner).toBe('bob')
  })
})
