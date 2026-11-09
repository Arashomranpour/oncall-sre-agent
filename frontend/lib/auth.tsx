import { useAuth } from "@clerk/nextjs";

// Clerk is optional: without a publishable key the app runs in local demo mode (no sign-in).
export const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const noToken = async () => null;

export function useGetToken(): () => Promise<string | null> {
  if (CLERK_ENABLED) {
    // CLERK_ENABLED is a build-time constant, so the hook order never changes between renders.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useAuth().getToken;
  }
  return noToken;
}
