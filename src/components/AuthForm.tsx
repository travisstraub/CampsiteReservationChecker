"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthState } from "@/app/auth/actions";

type Props = {
  mode: "login" | "signup";
  action: (state: AuthState, form: FormData) => Promise<AuthState>;
  next?: string;
  initialError?: string;
};

export default function AuthForm({ mode, action, next, initialError }: Props) {
  const [state, formAction, pending] = useActionState(action, { error: initialError });
  const isLogin = mode === "login";

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-semibold">{isLogin ? "Sign in" : "Create an account"}</h1>
      <form action={formAction} className="card space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input
            className="input"
            id="password"
            name="password"
            type="password"
            minLength={isLogin ? undefined : 8}
            autoComplete={isLogin ? "current-password" : "new-password"}
            required
          />
        </div>
        {state.error && <p className="text-sm text-danger" role="alert">{state.error}</p>}
        {state.message && <p className="text-sm text-accent" role="status">{state.message}</p>}
        <button className="btn w-full" disabled={pending}>
          {pending ? "Please wait…" : isLogin ? "Sign in" : "Sign up"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        {isLogin ? (
          <>No account? <Link className="text-accent underline" href="/signup">Sign up</Link></>
        ) : (
          <>Already have an account? <Link className="text-accent underline" href="/login">Sign in</Link></>
        )}
      </p>
    </div>
  );
}
