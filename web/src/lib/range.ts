export type RangeKey = "1h" | "24h" | "7d" | "30d" | "90d";

export interface RangeOption {
    key: RangeKey;
    label: string;
    durationMs: number;
}

export const RANGE_OPTIONS: RangeOption[] = [
    { key: "1h", label: "1h", durationMs: 60 * 60 * 1_000 },
    { key: "24h", label: "24h", durationMs: 24 * 60 * 60 * 1_000 },
    { key: "7d", label: "7d", durationMs: 7 * 24 * 60 * 60 * 1_000 },
    { key: "30d", label: "30d", durationMs: 30 * 24 * 60 * 60 * 1_000 },
    { key: "90d", label: "90d", durationMs: 90 * 24 * 60 * 60 * 1_000 },
];

export interface RangeSelection {
    key: RangeKey;
    from: string;
    to: string;
}

export function bucketForRange(key: RangeKey): "minute" | "hour" | "day" {
    if (key === "1h") return "minute";
    if (key === "24h" || key === "7d") return "hour";
    return "day";
}

export function makeRange(key: RangeKey): RangeSelection {
    const option = RANGE_OPTIONS.find((entry) => entry.key === key) ?? RANGE_OPTIONS[1];
    const to = new Date();
    const from = new Date(to.getTime() - option.durationMs);
    return {
        key: option.key,
        from: from.toISOString(),
        to: to.toISOString(),
    };
}
