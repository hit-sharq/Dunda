/** @type {import('next').NextConfig} */
const nextConfig = {
  // Type errors now fail the build. This was set to skip validation, which meant
  // Vercel printed "Skipping validation of types" and a broken deploy would only
  // be discovered at runtime. tsc reports zero errors project-wide, so there is
  // nothing to skip.
  images: {
    unoptimized: true,
  },
}

export default nextConfig
