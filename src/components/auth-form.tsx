"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader } from "lucide-react";
import { Alert, Button, Field, Input } from "./ui/primitives";
import { useToast } from "./ui/toast";

interface ApiIssue {
  path: string;
  message: string;
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<ApiIssue[]>([]);

  const isRegister = mode === "register";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setIssues([]);

    const form = new FormData(event.currentTarget);
    const payload: Record<string, string> = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    };
    if (isRegister) {
      payload.displayName = String(form.get("displayName") ?? "");
      payload.householdName = String(form.get("householdName") ?? "");
      const joinCode = String(form.get("joinCode") ?? "").trim();
      if (joinCode) payload.joinCode = joinCode;
    }

    try {
      const res = await fetch(`/api/auth/${isRegister ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        error?: string;
        details?: ApiIssue[];
        driver?: { displayName: string };
      };

      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setIssues(Array.isArray(data.details) ? data.details : []);
        return;
      }

      toast.push(`Welcome${isRegister ? "" : " back"}, ${data.driver?.displayName ?? "driver"}.`, "success");
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function issueFor(path: string): string | undefined {
    return issues.find((i) => i.path === path)?.message;
  }

  return (
    <form onSubmit={onSubmit} className="di-card space-y-4 p-5" noValidate>
      {isRegister ? (
        <>
          <Field label="Your name" error={issueFor("displayName")}>
            <Input name="displayName" autoComplete="name" required placeholder="Alex Rivera" />
          </Field>
          <Field
            label="Household name"
            hint="Both family members share this, but their money stays separate."
            error={issueFor("householdName")}
          >
            <Input name="householdName" required placeholder="Rivera Household" />
          </Field>
        </>
      ) : null}

      <Field label="Email" error={issueFor("email")}>
        <Input name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      </Field>

      <Field
        label="Password"
        hint={isRegister ? "10+ characters with upper, lower and a number." : undefined}
        error={issueFor("password")}
      >
        <Input
          name="password"
          type="password"
          autoComplete={isRegister ? "new-password" : "current-password"}
          required
          placeholder="••••••••••"
        />
      </Field>

      {isRegister ? (
        <Field
          label="Household invite code (optional)"
          hint="Already have a household? Enter its code to join instead of creating a new one."
          error={issueFor("joinCode")}
        >
          <Input name="joinCode" placeholder="ABCD1234" className="uppercase" />
        </Field>
      ) : null}

      {error ? (
        <Alert tone="bad" title={error}>
          {issues.length > 0 ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-ink-muted">
              {issues.map((issue) => (
                <li key={`${issue.path}-${issue.message}`}>
                  <span className="text-ink-dim">{issue.path}:</span> {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? <Loader size={16} className="animate-spin" /> : null}
        {busy ? "Working…" : isRegister ? "Create household" : "Sign in"}
      </Button>
    </form>
  );
}
