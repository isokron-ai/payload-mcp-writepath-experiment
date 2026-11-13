import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'

// Team task list: the bulk and empty-where collection. Archived tasks are read-only (a hook refuses
// any change), which gives a realistic partial failure for bulk updates.
export const Tasks: CollectionConfig = {
  slug: 'tasks',
  admin: { useAsTitle: 'title' },
  access: { read: () => true },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'status', type: 'select', options: ['todo', 'doing', 'done'], defaultValue: 'todo' },
    { name: 'owner', type: 'text' },
    { name: 'priority', type: 'number', min: 1, max: 5 },
    { name: 'archived', type: 'checkbox', defaultValue: false },
  ],
  hooks: {
    beforeChange: [
      ({ operation, originalDoc }) => {
        if (operation === 'update' && originalDoc?.archived) {
          throw new APIError(`Task "${originalDoc.title}" is archived and cannot be changed`, 400)
        }
      },
    ],
  },
}
