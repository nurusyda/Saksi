import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Every image upload in this app (payment bukti, resubmitted bukti, and
    // §45's dispute-statement images) travels through a Server Action, whose
    // request body defaults to a 1 MB cap — smaller than the app's own 10 MB
    // upload limit (MAX_UPLOAD_BYTES in lib/db/storage.ts), so a phone-camera
    // photo could be rejected by the framework before the action ever runs.
    // Aligned here so the two limits agree; storage.ts remains the real guard.
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
