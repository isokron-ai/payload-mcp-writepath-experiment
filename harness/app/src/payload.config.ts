import { postgresAdapter } from '@payloadcms/db-postgres'
import { mcpPlugin } from '@payloadcms/plugin-mcp'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'

import { Listings } from './collections/Listings'
import { Posts } from './collections/Posts'
import { Tasks } from './collections/Tasks'
import { Users } from './collections/Users'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Loopback-only sandbox. DATABASE_URL points at the audit's Postgres container on 127.0.0.1.
export default buildConfig({
  admin: { user: Users.slug, importMap: { baseDir: path.resolve(dirname) } },
  collections: [Users, Posts, Listings, Tasks],
  localization: { locales: ['en', 'es', 'de'], defaultLocale: 'en', fallback: true },
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  telemetry: false,
  db: postgresAdapter({ pool: { connectionString: process.env.DATABASE_URL || '' } }),
  plugins: [
    mcpPlugin({
      collections: {
        posts: { enabled: true },
        listings: { enabled: true },
        tasks: { enabled: true },
      },
    }),
  ],
})
