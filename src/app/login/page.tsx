import type { Metadata } from "next";
import AuthForm from "@/components/AuthForm";
import { signIn } from "../auth/actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  return (
    <AuthForm
      mode="login"
      action={signIn}
      next={typeof next === "string" ? next : undefined}
      initialError={typeof error === "string" ? error : undefined}
    />
  );
}
