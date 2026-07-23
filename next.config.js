/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cxfkwstpztxhkfknuqtj.supabase.co' },
    ],
  },
  // Next 14.2.x uses experimental.serverComponentsExternalPackages (renamed to
  // serverExternalPackages in Next 15). Keep the native/binary-backed packages out of the
  // server bundle so puppeteer-core + @sparticuz/chromium load their assets at runtime.
  experimental: {
    serverComponentsExternalPackages: ['nodemailer', 'puppeteer-core', '@sparticuz/chromium'],
    // Keeping the package external stops webpack bundling it, but does NOT guarantee its
    // binary + brotli-compressed shared libraries (libnss3.so, etc.) get traced into the
    // serverless function. Force-include the whole @sparticuz/chromium package for the PDF
    // route so `chromium.executablePath()` can extract a COMPLETE Chromium at runtime.
    outputFileTracingIncludes: {
      '/api/documents': ['./node_modules/@sparticuz/chromium/**'],
    },
  },
  generateBuildId: async () => 'build-v5',
};

module.exports = nextConfig;
