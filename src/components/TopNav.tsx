import Link from "next/link";

export function TopNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link
          href="/feed"
          className="flex items-center gap-2 text-base font-semibold tracking-tight"
        >
          <span className="grid h-8 w-8 place-items-center rounded-md bg-zinc-900 text-sm font-bold text-white dark:bg-white dark:text-zinc-900">
            U
          </span>
          <span>Unilex</span>
        </Link>

        <nav className="hidden gap-1 text-sm font-medium text-zinc-600 sm:flex dark:text-zinc-400">
          <NavLink href="/feed">Feed</NavLink>
        </nav>

        <form action="/api/auth/logout" method="post" className="ml-auto">
          <button
            type="submit"
            className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-2 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    >
      {children}
    </Link>
  );
}
