/** @type {import('next').NextConfig} */
const nextConfig = {
  // Exclude the native canvas module (used by konva server-side) —
  // CanvasViewer is dynamically imported with { ssr: false } so this is safe.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals ?? []), { canvas: 'canvas' }];
    }
    return config;
  },

  // API proxy — forward /v1/* to the backend.
  // Uses NEXT_PUBLIC_API_URL env var if set (e.g. Catalyst AppSail URL),
  // otherwise defaults to local FastAPI backend at localhost:8000.
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return [
      {
        source: '/v1/:path*',
        destination: `${backendUrl}/v1/:path*`,
      },
    ];
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },

  // Suppress noisy terminal logging for proxy errors
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
};

export default nextConfig;
