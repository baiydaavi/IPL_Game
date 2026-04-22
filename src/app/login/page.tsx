import { redirect } from "next/navigation";

import { isIdentityBypassMode } from "@/lib/demo";

import { LoginForm } from "./login-form";

export const metadata = {
  title: "Sign in — Gully IPL Fantasy",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; sent?: string; error?: string }>;
}) {
  // In demo mode real auth is off; send visitors straight home so they
  // don't land on a broken magic-link form.
  if (isIdentityBypassMode()) redirect("/");
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-8 px-6 py-12">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-xs uppercase tracking-widest text-muted">
          Gully IPL Fantasy
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted">
          We&apos;ll email you a one-tap magic link. No password needed.
        </p>
      </div>

      <LoginForm searchParamsPromise={searchParams} />
    </main>
  );
}
