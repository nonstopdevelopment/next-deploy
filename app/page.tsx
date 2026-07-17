export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-16 text-zinc-100">
      <div className="mx-auto flex max-w-3xl flex-col gap-12">
        <header className="space-y-5">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-violet-300">
            Next.js example
          </p>
          <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">
            Deployment test is running.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-zinc-300">
            This small application verifies that a hosting account can build a
            production Next.js project, start its server, and expose route
            handlers without repository-owned deployment automation.
          </p>
        </header>

        <section
          className="grid gap-4 sm:grid-cols-3"
          aria-label="Application checks"
        >
          {[
            ["Runtime", "Next.js server"],
            ["Source", "Git main branch"],
            ["Health", "Page rendered"],
          ].map(([label, value]) => (
            <article
              className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
              key={label}
            >
              <p className="text-sm text-zinc-400">{label}</p>
              <p className="mt-2 font-medium">{value}</p>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-xl font-semibold">Optional service checks</h2>
          <p className="mt-2 text-zinc-400">
            Database, Redis, and object-storage route handlers remain in the
            project so managed services can be tested when credentials are
            attached to the deployment.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            {[
              ["Postgres", "/api/db-check"],
              ["Redis", "/api/redis-check"],
              ["Object storage", "/api/blob-check"],
            ].map(([label, href]) => (
              <a
                className="rounded-full border border-zinc-700 px-4 py-2 hover:border-violet-400 hover:text-violet-200"
                href={href}
                key={href}
              >
                {label}
              </a>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
