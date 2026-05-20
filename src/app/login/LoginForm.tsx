"use client";

import { useState, useTransition } from "react";
import { signIn } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await signIn(formData);
      // On success, signIn() throws redirect() and never returns here.
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <form action={onSubmit} className="mt-5 space-y-3">
      {next && <input type="hidden" name="next" value={next} />}
      <label className="block">
        <span className="sr-only">Email</span>
        <input
          type="email"
          name="email"
          autoFocus
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-600 dark:focus:ring-zinc-700"
        />
      </label>
      <label className="block">
        <span className="sr-only">Password</span>
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          placeholder="Password"
          className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-600 dark:focus:ring-zinc-700"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="h-10 w-full rounded-lg bg-zinc-900 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </form>
  );
}
