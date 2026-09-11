/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next.js defaults Server Actions to a 1MB request body limit —
  // fine for tiny forms, but far too small for real PDFs, photos,
  // and Word documents. Every file upload in this app goes through
  // a Server Action, so this needs to be raised app-wide.
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
};

export default nextConfig;
