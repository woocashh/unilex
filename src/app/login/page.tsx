type SearchParams = Promise<{ next?: string; error?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { next, error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-zinc-900 text-base font-bold text-white dark:bg-white dark:text-zinc-900">
            U
          </span>
          <span className="text-lg font-semibold tracking-tight">Unilex</span>
        </div>

        <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Sign in</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Enter the shared password to access the feed.
        </p>

        <form action="/api/auth/login" method="post" className="mt-5 space-y-3">
          {next && <input type="hidden" name="next" value={next} />}
          <label className="block">
            <span className="sr-only">Password</span>
            <input
              type="password"
              name="password"
              autoFocus
              required
              autoComplete="current-password"
              placeholder="Password"
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-600 dark:focus:ring-zinc-700"
            />
          </label>
          <button
            type="submit"
            className="h-10 w-full rounded-lg bg-zinc-900 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Sign in
          </button>
        </form>

        {error && (
          <p className="mt-3 text-xs text-red-600 dark:text-red-400">
            Wrong password.
          </p>
        )}

        <p className="mt-6 text-[11px] leading-relaxed text-zinc-400">
          This is a shared-password gate — same password for everyone using this
          instance. We&apos;ll move to magic-link auth in a future release.
        </p>
      </div>
    </div>
  );
}
