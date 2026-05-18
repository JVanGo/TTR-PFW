import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Admin sign-in</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Enter your FLTT admin email. We&apos;ll send you a one-time sign-in link.
      </p>
      <div className="mt-6">
        <LoginForm />
      </div>
    </div>
  );
}
