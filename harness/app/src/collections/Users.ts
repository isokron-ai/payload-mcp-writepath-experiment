import type { CollectionConfig } from 'payload'

// Two admin users (editor-a, editor-b). The agent acts as editor-a through an MCP API key;
// editor-b holds document locks (admin-panel editing) and is the concurrent writer in seeded conflicts.
export const Users: CollectionConfig = {
  slug: 'users',
  admin: { useAsTitle: 'email' },
  auth: true,
  fields: [{ name: 'name', type: 'text' }],
}
