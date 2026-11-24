import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "gitau-telemetry-theme";

function systemPrefersDark(): boolean {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readMode(): ThemeMode {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "system"
        ? stored
        : "system";
}

function resolve(mode: ThemeMode): ResolvedTheme {
    if (mode === "system") return systemPrefersDark() ? "dark" : "light";
    return mode;
}

function apply(resolved: ResolvedTheme): void {
    document.documentElement.classList.toggle("dark", resolved === "dark");
}

export function applyInitialTheme(): void {
    const mode = readMode();
    apply(resolve(mode));
}

export function useTheme(): {
    mode: ThemeMode;
    resolved: ResolvedTheme;
    setMode: (mode: ThemeMode) => void;
    toggle: () => void;
} {
    const [mode, setModeState] = useState<ThemeMode>(readMode);
    const [resolved, setResolved] = useState<ResolvedTheme>(() =>
        resolve(readMode())
    );

    useEffect(() => {
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const sync = () => {
            const next = resolve(mode);
            setResolved(next);
            apply(next);
        };
        sync();
        media.addEventListener("change", sync);
        return () => media.removeEventListener("change", sync);
    }, [mode]);

    const setMode = (next: ThemeMode) => {
        localStorage.setItem(STORAGE_KEY, next);
        setModeState(next);
    };

    const toggle = () => {
        setMode(resolve(mode) === "dark" ? "light" : "dark");
    };

    return { mode, resolved, setMode, toggle };
}
