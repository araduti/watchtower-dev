export default function HomePage() {
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
      <div className="rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
        <p className="text-sm text-muted-foreground">
          Phase 3.0 — UI foundation scaffolded. Dashboard coming soon.
        </p>
      </div>
    </main>
  );
}
