"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { trpc } from "./trpc";

function getBaseUrl() {
  if (typeof window !== "undefined") return "";
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

/**
 * Check if a tRPC error is an UNAUTHORIZED response.
 * Used to skip retries and trigger redirect-to-login.
 */
function isUnauthorized(error: unknown): boolean {
  if (error instanceof TRPCClientError) {
    // tRPC UNAUTHORIZED code maps to HTTP 401
    if (error.data?.code === "UNAUTHORIZED") return true;
    // Also check the HTTP status if available
    if (error.data?.httpStatus === 401) return true;
  }
  return false;
}

/**
 * Redirect to the login page on unauthorized errors.
 * Uses window.location to perform a full navigation, clearing
 * any stale client-side state. Debounced to prevent multiple
 * concurrent mutations from triggering duplicate redirects.
 */
let redirectPending = false;
function redirectToLogin() {
  if (typeof window !== "undefined" && window.location.pathname !== "/" && !redirectPending) {
    redirectPending = true;
    window.location.href = "/";
  }
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            refetchOnWindowFocus: false,
            // Don't retry on auth failures — the session is invalid
            retry(failureCount, error) {
              if (isUnauthorized(error)) return false;
              return failureCount < 3;
            },
          },
          mutations: {
            retry: false,
            onError(error) {
              if (isUnauthorized(error)) {
                redirectToLogin();
              }
            },
          },
        },
      }),
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
