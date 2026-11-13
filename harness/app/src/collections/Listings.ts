import type { CollectionConfig } from 'payload'

// Marketplace listings. Three ordinary content fields happen to be named like Payload operation
// arguments: `locale` (the market the listing is sold in), `draft` (the listing is still a
// draft offer, a plain checkbox, not Payload drafts) and `select` (the merchandising slot).
export const Listings: CollectionConfig = {
  slug: 'listings',
  admin: { useAsTitle: 'name' },
  access: { read: () => true },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'sku', type: 'text', required: true, unique: true },
    { name: 'price', type: 'number', min: 0 },
    { name: 'locale', type: 'text', admin: { description: 'Market, e.g. en-GB' } },
    { name: 'draft', type: 'checkbox', defaultValue: false },
    { name: 'select', type: 'text', admin: { description: 'Merchandising slot, e.g. homepage-hero' } },
  ],
}
