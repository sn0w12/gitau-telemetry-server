import { formatDuration } from "@/lib/format";
import type { SpanNode, TraceTree } from "@/lib/types";
import { cn } from "@/lib/utils";

const BAR_COLORS = [
    "bg-chart-2/90",
    "bg-chart-2/65",
    "bg-chart-2/45",
    "bg-chart-2/32",
];

interface Row {
    span: SpanNode;
    depth: number;
}

function flatten(span: SpanNode, depth: number, rows: Row[]): void {
    rows.push({ span, depth });
    for (const child of span.children ?? []) {
        flatten(child, depth + 1, rows);
    }
}

export function Waterfall({ trace }: { trace: TraceTree }) {
    const rows: Row[] = [];
    flatten(trace.root, 0, rows);

    const maxEnd = rows.reduce(
        (max, row) => Math.max(max, row.span.startUs + row.span.durationUs),
        0
    );
    const total = Math.max(trace.durationUs, maxEnd, 1);

    return (
        <div className="overflow-x-auto">
            <div className="sm:min-w-[640px]">
                {rows.map(({ span, depth }, index) => {
                    const error = span.error;
                    const start = (span.startUs / total) * 100;
                    const width = Math.max(
                        (span.durationUs / total) * 100,
                        0.4
                    );

                    return (
                        <div
                            className="flex flex-col gap-0.5 border-b border-border/40 px-2 py-1 last:border-b-0 hover:bg-muted/50 sm:grid sm:grid-cols-[minmax(180px,30%)_minmax(280px,1fr)_56px] sm:items-center sm:gap-2"
                            key={`${span.name}-${index}`}
                        >
                            <div
                                className="min-w-0"
                                style={{ paddingLeft: depth * 14 }}
                            >
                                <div className="flex min-w-0 items-center gap-1.5">
                                    {error ? (
                                        <span className="size-1.5 shrink-0 rounded-full bg-destructive" />
                                    ) : null}
                                    <span className="truncate font-mono text-xs font-medium">
                                        {span.name}
                                    </span>
                                </div>
                                {error ? (
                                    <div className="truncate text-xs text-destructive-foreground">
                                        {error.code}
                                        {error.message
                                            ? ` / ${error.message}`
                                            : ""}
                                    </div>
                                ) : null}
                            </div>

                            <div className="relative h-3.5 overflow-hidden rounded-sm bg-muted/60">
                                {[25, 50, 75].map((tick) => (
                                    <span
                                        className="absolute inset-y-0 w-px bg-border"
                                        key={tick}
                                        style={{ left: `${tick}%` }}
                                    />
                                ))}
                                <div
                                    className={cn(
                                        "absolute inset-y-0.5 rounded-sm",
                                        error
                                            ? "bg-destructive/80"
                                            : BAR_COLORS[
                                                  depth % BAR_COLORS.length
                                              ]
                                    )}
                                    style={{
                                        left: `${start}%`,
                                        width: `${width}%`,
                                    }}
                                />
                            </div>

                            <div className="text-right font-mono text-xs text-muted-foreground tabular-nums">
                                {formatDuration(span.durationUs)}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
