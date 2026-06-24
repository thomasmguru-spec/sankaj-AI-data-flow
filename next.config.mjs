/** @type {import('next').NextConfig} */
const nextConfig = {
  // Tie each build to a unique id so stale clients fail fast after redeploy.
  generateBuildId: async () => process.env.BUILD_ID || `build-${Date.now()}`,
};

export default nextConfig;
