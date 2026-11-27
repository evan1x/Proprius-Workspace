import { useState, type FormEvent } from "react";
import { createAccount, signIn, type Account } from "../services/auth";

interface LoginScreenProps {
  onSignedIn: (account: Account) => void;
}

export function LoginScreen({ onSignedIn }: LoginScreenProps) {
  const [mode, setMode] = useState<"sign-in" | "create">("sign-in");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function switchMode(next: "sign-in" | "create") {
    setMode(next);
    setError(null);
    setPassword("");
    setConfirmPassword("");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;

    if (mode === "create" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const account =
        mode === "create"
          ? await createAccount(username, password)
          : await signIn(username, password);
      onSignedIn(account);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="login-screen flex h-full items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-panel px-6 py-7 shadow-[0_16px_40px_rgb(0_0_0_/_0.18)]">
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-ink-muted">
          Proprius Workspace
        </p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-ink">
          {mode === "sign-in" ? "Sign in" : "Create an account"}
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          {mode === "sign-in"
            ? "Chats and files stay with the account you use."
            : "New accounts start with an empty workspace."}
        </p>

        <form className="mt-6" onSubmit={(event) => void handleSubmit(event)}>
          <label className="block text-xs font-medium text-ink" htmlFor="login-username">
            Username
          </label>
          <input
            id="login-username"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="mt-1.5 w-full border border-line bg-surface px-3 py-2 text-sm text-ink outline-none"
          />

          <label
            className="mt-4 block text-xs font-medium text-ink"
            htmlFor="login-password"
          >
            Password
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete={mode === "create" ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1.5 w-full border border-line bg-surface px-3 py-2 text-sm text-ink outline-none"
          />

          {mode === "create" && (
            <>
              <label
                className="mt-4 block text-xs font-medium text-ink"
                htmlFor="login-confirm"
              >
                Confirm password
              </label>
              <input
                id="login-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="mt-1.5 w-full border border-line bg-surface px-3 py-2 text-sm text-ink outline-none"
              />
            </>
          )}

          {error && (
            <p className="mt-3 text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-5 w-full border border-ink bg-ink px-3 py-2.5 text-sm font-medium text-paper transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending
              ? "Please wait…"
              : mode === "sign-in"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        <button
          type="button"
          className="mt-4 text-sm text-ink-muted underline-offset-2 hover:text-ink hover:underline"
          onClick={() => switchMode(mode === "sign-in" ? "create" : "sign-in")}
        >
          {mode === "sign-in"
            ? "Create an account"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
