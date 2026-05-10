// Root route (/) is handled by middleware.ts which redirects to /dashboard
// This file exists as a fallback only and should not render in normal usage
export default function RootPage() {
  return null
}
