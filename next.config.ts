import type { NextConfig } from 'next'

/* The textures, models and star data in /public rarely change but are
   large (some 20 MB in all): let browsers keep them for a week and use
   them straight away, checking for a newer copy in the background, rather
   than asking the server about every file on every visit. */
const LONG_CACHE = 'public, max-age=604800, stale-while-revalidate=86400'

const nextConfig: NextConfig = {
  async headers() {
    return ['/textures/:path*', '/models/:path*', '/data/:path*', '/draco/:path*'].map((source) => ({
      source,
      headers: [{ key: 'Cache-Control', value: LONG_CACHE }],
    }))
  },
}

export default nextConfig
