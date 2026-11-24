import type { AttrValue, BucketUnit } from "@/lib/types";

const countFormat = new Intl.NumberFormat("en-US");
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
});
const timeFormat = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
});
const dayFormat = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
});
const chartTimeFormat = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
});

export function formatCount(value: number): string {
    return countFormat.format(value);
}

export function pluralize(
    count: number,
    singular: string,
    plural = `${singular}s`
): string {
    return count === 1 ? singular : plural;
}

export function formatDuration(micros: number): string {
    if (!Number.isFinite(micros) || micros < 0) return "-";
    if (micros < 1_000) return `${Math.round(micros)}µs`;
    if (micros < 1_000_000) {
        const milliseconds = micros / 1_000;
        return `${milliseconds < 10 ? milliseconds.toFixed(2) : milliseconds.toFixed(1)}ms`;
    }
    return `${(micros / 1_000_000).toFixed(2)}s`;
}

export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return "-";
    if (bytes < 1_024) return `${bytes} B`;
    if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
    if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
    return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

export function formatPercent(rate: number): string {
    if (!Number.isFinite(rate)) return "-";
    return `${(rate * 100).toFixed(rate < 0.01 ? 2 : 1)}%`;
}

export function formatRelative(iso: string): string {
    const time = new Date(iso).getTime();
    if (Number.isNaN(time)) return "-";
    const seconds = Math.max(0, Math.round((Date.now() - time) / 1_000));
    if (seconds < 45) return "just now";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days}d ago`;
    return dateTimeFormat.format(new Date(time));
}

export function formatDateTime(iso: string): string {
    const time = new Date(iso);
    if (Number.isNaN(time.getTime())) return "-";
    return dateTimeFormat.format(time);
}

export function formatBucket(
    bucket: string,
    unit: BucketUnit,
    spanMs = 0
): string {
    const time = new Date(bucket);
    if (Number.isNaN(time.getTime())) return "-";
    const daily = unit === "day" || spanMs > 2 * 24 * 60 * 60 * 1000;
    return daily ? dayFormat.format(time) : timeFormat.format(time);
}

export function formatChartLabel(bucket: string, unit: BucketUnit): string {
    const time = new Date(bucket);
    if (Number.isNaN(time.getTime())) return "-";
    return unit === "day"
        ? dayFormat.format(time)
        : chartTimeFormat.format(time);
}

export function formatValue(value: AttrValue): string {
    if (typeof value === "string") return value;
    return String(value);
}

const labels: Record<string, string> = {
    aarch64: "ARM64",
    buildProfile: "Build",
    build_profile: "Build",
    cpuTier: "CPU",
    cpu_tier: "CPU",
    debug: "Debug",
    linux: "Linux",
    macos: "macOS",
    release: "Release",
    very_high: "Very high",
    windows: "Windows",
    x86_64: "x86_64",
};

export function displayLabel(value: string): string {
    return labels[value] ?? value;
}
