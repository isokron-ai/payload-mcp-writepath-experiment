import type { CollectionConfig } from 'payload'

// Editorial posts: localized fields, drafts, an array and a blocks field (row ids), locking on (default).
export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: { useAsTitle: 'title' },
  access: { read: () => true },
  versions: { drafts: true, maxPerDoc: 50 },
  fields: [
    { name: 'title', type: 'text', required: true, localized: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'summary', type: 'textarea', localized: true },
    { name: 'category', type: 'select', options: ['news', 'guide', 'release', 'opinion'] },
    { name: 'tags', type: 'text', hasMany: true },
    { name: 'author', type: 'text' },
    { name: 'readingMinutes', type: 'number', min: 0 },
    {
      name: 'items',
      type: 'array',
      labels: { singular: 'Item', plural: 'Items' },
      fields: [
        { name: 'label', type: 'text', required: true, localized: true },
        { name: 'url', type: 'text' },
      ],
    },
    {
      name: 'layout',
      type: 'blocks',
      blocks: [
        { slug: 'hero', fields: [{ name: 'heading', type: 'text', localized: true }] },
        { slug: 'quote', fields: [{ name: 'text', type: 'textarea' }, { name: 'attribution', type: 'text' }] },
        { slug: 'cta', fields: [{ name: 'label', type: 'text' }, { name: 'href', type: 'text' }] },
      ],
    },
  ],
}
