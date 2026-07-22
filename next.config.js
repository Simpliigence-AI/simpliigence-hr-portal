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
  },
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  generateBuildId: async () => 'build-v4',
  generateBuildId: async () => 'build-v4',
};

module.exports = nextConfig;
