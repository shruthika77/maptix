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

  // API proxy — forward /v1/* to the FastAPI backend in development.
  // When the backend is not running, Next.js will return a 500/502 to the fetch
  // which gets caught by the try/catch in our API service layer.
  async rewrites() {
    return [
      {
        source: '/v1/:path*',
        destination: 'http://localhost:8000/v1/:path*',
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
