/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['10.11.82.229'],
  async headers() {
    return [
      {
        // Never cache HTML pages — browser must always revalidate so new deploys are picked up immediately
        source: '/((?!_next/static|_next/image|icons|favicon).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
