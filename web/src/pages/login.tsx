import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import { Form } from "@/components/ui/form";
import { Frame, FramePanel } from "@/components/ui/frame";
import { Input } from "@/components/ui/input";

function nextPath(): string {
    const next = new URLSearchParams(window.location.search).get("next");
    if (
        !next ||
        !next.startsWith("/") ||
        next.startsWith("//") ||
        next.includes("\\")
    ) {
        return "/";
    }
    return next;
}

export function LoginPage() {
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        setSubmitting(true);

        const form = new FormData(event.currentTarget);
        const body = new URLSearchParams();
        body.set("username", String(form.get("username") ?? ""));
        body.set("password", String(form.get("password") ?? ""));

        try {
            const response = await fetch("/auth/login", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body,
            });

            if (response.ok) {
                window.location.assign(nextPath());
                return;
            }

            const payload = (await response.json().catch(() => null)) as {
                error?: unknown;
            } | null;
            setError(
                typeof payload?.error === "string"
                    ? payload.error
                    : "Sign in failed."
            );
        } catch {
            setError("Could not reach the server.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="flex min-h-svh items-center justify-center overflow-y-auto bg-sidebar p-4">
            <Frame className="w-full max-w-sm">
                <FramePanel className="p-6">
                    <Form
                        action="/auth/login"
                        method="post"
                        onSubmit={handleSubmit}
                    >
                        <Fieldset className="flex flex-col gap-4">
                            <FieldsetLegend className="sr-only">
                                Sign in
                            </FieldsetLegend>

                            <Field>
                                <FieldLabel htmlFor="username">
                                    Username
                                </FieldLabel>
                                <Input
                                    autoCapitalize="none"
                                    autoComplete="username"
                                    autoFocus
                                    id="username"
                                    name="username"
                                    required
                                    spellCheck={false}
                                    type="text"
                                />
                            </Field>

                            <Field>
                                <FieldLabel htmlFor="password">
                                    Password
                                </FieldLabel>
                                <Input
                                    autoComplete="current-password"
                                    id="password"
                                    name="password"
                                    required
                                    type="password"
                                />
                            </Field>

                            {error ? (
                                <p
                                    className="text-xs text-destructive-foreground"
                                    role="alert"
                                >
                                    {error}
                                </p>
                            ) : null}

                            <Button
                                className="mt-1 w-full"
                                loading={submitting}
                                type="submit"
                            >
                                Sign in
                            </Button>
                        </Fieldset>
                    </Form>
                </FramePanel>
            </Frame>
        </div>
    );
}
