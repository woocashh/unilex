import { LoginForm } from "./LoginForm";

type SearchParams = Promise<{ next?: string; error?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { next } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-zinc-900 text-base font-bold text-white dark:bg-white dark:text-zinc-900">
            U
          </span>
          <span className="text-lg font-semibold tracking-tight">Unilex</span>
        </div>

        <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Zaloguj się</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Podaj dane logowania, aby uzyskać dostęp do aktualności.
        </p>

        <LoginForm next={next} />

        <p className="mt-6 text-[11px] leading-relaxed text-zinc-400">
          Każdy użytkownik ma własny widok aktualności — statusy przeczytania
          i obsłużenia są prywatne dla Twojego konta.
        </p>
      </div>
    </div>
  );
}
