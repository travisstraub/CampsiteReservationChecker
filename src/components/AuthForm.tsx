"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthState } from "@/app/auth/actions";
import { AppMark } from "./Icons";

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
    <div className="mx-auto flex max-w-sm flex-col items-center pt-4 text-center md:pt-10">
      <AppMark size={64} />
      <h1 className="title-lg mt-6">{isLogin ? "Sign in" : "Create account"}</h1>
      <p className="mt-2 text-[17px] text-muted">
        {isLogin ? "Welcome back. Sign in to manage your alerts." : "Get notified the moment a campsite opens up."}
      </p>

      {state.message ? (
        <div className="card mt-8 w-full">
          <p className="title-md">Check your email</p>
          <p className="mt-1 text-[15px] text-muted">{state.message}</p>
        </div>
      ) : (
        <form action={formAction} className="mt-8 w-full space-y-4 text-left">
          <input type="hidden" name="next" value={next ?? ""} />
          <div className="group-list">
            <input
              className="h-[52px] w-full bg-transparent px-4 text-[17px] outline-none placeholder:text-faint"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="Email"
              aria-label="Email"
              required
            />
            <input
              className="h-[52px] w-full bg-transparent px-4 text-[17px] outline-none placeholder:text-faint"
              name="password"
              type="password"
              minLength={isLogin ? undefined : 8}
              autoComplete={isLogin ? "current-password" : "new-password"}
              placeholder={isLogin ? "Password" : "Password (8+ characters)"}
              aria-label="Password"
              required
            />
          </div>
          {state.error && <p className="px-1 text-[15px] text-danger-ink" role="alert">{state.error}</p>}
          <button className="btn btn-lg w-full" disabled={pending}>
            {pending ? "Please wait…" : isLogin ? "Sign In" : "Create Account"}
          </button>
        </form>
      )}

      <p className="mt-6 text-[15px] text-muted">
        {isLogin ? (
          <>New here? <Link className="link" href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}>Create an account</Link></>
        ) : (
          <>Already have an account? <Link className="link" href="/login">Sign in</Link></>
        )}
      </p>
    </div>
  );
}
