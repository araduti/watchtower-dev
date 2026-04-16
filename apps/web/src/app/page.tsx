"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Input,
} from "@watchtower/ui";

/**
 * Landing page with sign-in / sign-up forms.
 *
 * After successful sign-in, resolves the user's first organization
 * (workspace) and calls `setActiveOrganization` before redirecting
 * to /dashboard. This ensures `resolveSession()` on the server can
 * read `activeOrganizationId` from the session cookie.
 */
export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function activateFirstOrganization(): Promise<boolean> {
    try {
      const orgsResult =
        await authClient.organization.listOrganizations();

      const orgs = orgsResult.data;
      if (orgs && orgs.length > 0) {
        await authClient.organization.setActive({
          organizationId: orgs[0].id,
        });
        return true;
      }
      return false;
    } catch {
      // Organization resolution failed — user may not have any workspaces yet
      return false;
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await authClient.signIn.email({
        email,
        password,
      });

      if (result.error) {
        setError(result.error.message ?? "Sign-in failed.");
        setLoading(false);
        return;
      }

      // Activate the first workspace so tRPC calls have a workspaceId
      await activateFirstOrganization();

      router.push("/dashboard");
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await authClient.signUp.email({
        email,
        password,
        name: name || email.split("@")[0],
      });

      if (result.error) {
        setError(result.error.message ?? "Sign-up failed.");
        setLoading(false);
        return;
      }

      // After sign-up, try to activate a workspace
      await activateFirstOrganization();

      router.push("/dashboard");
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          Watchtower
        </h1>
        <p className="text-lg text-muted-foreground">
          Multi-tenant compliance platform for Microsoft 365
        </p>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            {mode === "sign-in" ? "Sign in" : "Create account"}
          </CardTitle>
          <CardDescription>
            {mode === "sign-in"
              ? "Enter your credentials to access the dashboard."
              : "Create a new account to get started."}
          </CardDescription>
        </CardHeader>

        <form onSubmit={mode === "sign-in" ? handleSignIn : handleSignUp}>
          <CardContent className="flex flex-col gap-4">
            {mode === "sign-up" && (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="name"
                  className="text-sm font-medium text-foreground"
                >
                  Name
                </label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="text-sm font-medium text-foreground"
              >
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-sm font-medium text-foreground"
              >
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={
                  mode === "sign-in" ? "current-password" : "new-password"
                }
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? "Please wait…"
                : mode === "sign-in"
                  ? "Sign in"
                  : "Create account"}
            </Button>
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => {
                setMode(mode === "sign-in" ? "sign-up" : "sign-in");
                setError(null);
              }}
            >
              {mode === "sign-in"
                ? "Don't have an account? Sign up"
                : "Already have an account? Sign in"}
            </button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
