// PAY-13 (F13): a validation refusal carries Payload's reason (e.g. "9 is greater than the max allowed Value of 5.")
// as well as isError. Research v2.1 set isError but passed on only the headline "The following field is invalid:
// Priority", which names the field and drops the reason REST gives.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('payload/shared', () => ({ fieldIsVirtual: () => false }))

import { connect, createStore, type Store } from './fakePayload.spec-utils.js'

let store: Store
beforeEach(() => {
  store = createStore()
})

describe('validation refusals carry the reason (PAY-13)', () => {
  it('update by id: isError, the field and the reason', async () => {
    const task = (await store.payload.create({ collection: 'tasks', data: { title: 't', priority: 2 } })) as {
      id: number
      updatedAt: string
    }
    const a = await connect(store)
    const r = await a.call('updateTasks', { id: task.id, ifUpdatedAt: task.updatedAt, priority: 9 })
    expect(r.isError).toBe(true)
    expect(r.text).toContain('The following field is invalid: Priority')
    expect(r.text).toContain('priority: 9 is greater than the max allowed Value of 5.')
    expect(store.read('tasks', task.id).priority).toBe(2)
  })

  it('create: isError, the field and the reason', async () => {
    const a = await connect(store)
    const r = await a.call('createTasks', { title: 't', priority: 9 })
    expect(r.isError).toBe(true)
    expect(r.text).toContain('priority: 9 is greater than the max allowed Value of 5.')
    expect(store.all('tasks')).toHaveLength(0)
  })

  it('an error without reasons is passed on as it was', async () => {
    const a = await connect(store)
    const r = await a.call('updateTasks', { id: 999, ifUpdatedAt: '2026-01-01T00:00:00.000Z', owner: 'x' })
    expect(r.isError).toBe(true)
    expect(r.text).toMatch(/Not Found|changed since you read it/)
  })
})
