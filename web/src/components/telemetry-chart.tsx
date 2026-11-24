import {
    areaY,
    crosshair,
    defineChart,
    lineY,
    type ChartCurve,
} from "@tanstack/charts";
import { motion } from "@tanstack/charts/motion";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { RendererChart } from "@tanstack/react-charts/tooltip";
import { useId, useMemo, type CSSProperties } from "react";

import { formatCount, formatDuration } from "@/lib/format";

export const TELEMETRY_CHART_HEIGHT = 73;

export type TelemetryChartVariant = "traffic" | "errors" | "latency";

export interface TelemetryChartRow {
    label: string;
    traces: number;
    spans: number;
    errors: number;
    avgUs: number;
    p95Us: number;
}

const SERIES = [
    {
        field: "traces",
        label: "Traces",
        color: "var(--foreground)",
        format: formatCount,
    },
    {
        field: "spans",
        label: "Spans",
        color: "var(--success)",
        format: formatCount,
    },
    {
        field: "errors",
        label: "Errors",
        color: "var(--destructive)",
        format: formatCount,
    },
    {
        field: "avgUs",
        label: "Average",
        color: "var(--muted-foreground)",
        format: formatDuration,
    },
    {
        field: "p95Us",
        label: "p95",
        color: "var(--foreground)",
        format: formatDuration,
    },
] as const;

const SERIES_BY_VARIANT: Record<
    TelemetryChartVariant,
    readonly (typeof SERIES)[number][]
> = {
    traffic: SERIES.filter((series) => series.field === "traces"),
    errors: SERIES.filter((series) => series.field === "errors"),
    latency: SERIES.filter((series) =>
        ["avgUs", "p95Us"].includes(series.field)
    ),
};

function monotoneLine(points: readonly (readonly [number, number])[]): string {
    if (points.length === 0) return "";
    if (points.length === 1) return `M${points[0][0]},${points[0][1]}`;

    const last = points.length - 1;
    if (last === 1) {
        return `M${points[0][0]},${points[0][1]}L${points[1][0]},${points[1][1]}`;
    }

    const slope: number[] = [];
    for (let i = 0; i < last; i++) {
        const dx = points[i + 1][0] - points[i][0];
        slope[i] = dx === 0 ? 0 : (points[i + 1][1] - points[i][1]) / dx;
    }

    const tangent: number[] = [];
    tangent[0] = slope[0];
    tangent[last] = slope[last - 1];
    for (let i = 1; i < last; i++) {
        const before = slope[i - 1];
        const after = slope[i];
        if (before * after <= 0) {
            tangent[i] = 0;
            continue;
        }
        const mean = 2 / (1 / before + 1 / after);
        const limit = 3 * Math.min(Math.abs(before), Math.abs(after));
        tangent[i] = Math.sign(mean) * Math.min(Math.abs(mean), limit);
    }

    let d = `M${points[0][0]},${points[0][1]}`;
    for (let i = 0; i < last; i++) {
        const [x0, y0] = points[i];
        const [x1, y1] = points[i + 1];
        const step = (x1 - x0) / 3;
        d += `C${x0 + step},${y0 + tangent[i] * step} ${x1 - step},${
            y1 - tangent[i + 1] * step
        } ${x1},${y1}`;
    }
    return d;
}

const monotoneCurve: ChartCurve = {
    line: monotoneLine,
    area(top, bottom) {
        if (top.length === 0) return "";
        const closing = [...bottom]
            .reverse()
            .map(([x, y]) => `L${x},${y}`)
            .join("");
        return `${monotoneLine(top)}${closing}Z`;
    },
};

export function TelemetryChart({
    rows,
    variant,
    ariaLabel,
}: {
    rows: readonly TelemetryChartRow[];
    variant: TelemetryChartVariant;
    ariaLabel: string;
}) {
    const uid = useId().replace(/[^a-zA-Z0-9-]/g, "");
    const gradientId = `telemetry-area-${uid}`;
    const revealId = `telemetry-reveal-${uid}`;

    const renderer = useMemo(
        () => motion<TelemetryChartRow, string, number>(),
        []
    );

    const definition = useMemo(() => {
        const marks =
            variant === "traffic"
                ? [
                      areaY(rows, {
                          x: "label",
                          y1: 0,
                          y2: "traces",
                          fill: `url(#${gradientId})`,
                          curve: monotoneCurve,
                          motion: false,
                      }),
                      lineY(rows, {
                          x: "label",
                          y: "traces",
                          stroke: "var(--foreground)",
                          strokeWidth: 1.5,
                          curve: monotoneCurve,
                          motion: false,
                      }),
                  ]
                : variant === "errors"
                  ? [
                        lineY(rows, {
                            x: "label",
                            y: "errors",
                            stroke: "var(--destructive)",
                            strokeWidth: 1.5,
                            curve: monotoneCurve,
                            motion: false,
                        }),
                    ]
                  : [
                        areaY(rows, {
                            x: "label",
                            y1: 0,
                            y2: "p95Us",
                            fill: `url(#${gradientId})`,
                            curve: monotoneCurve,
                            motion: false,
                        }),
                        lineY(rows, {
                            x: "label",
                            y: "avgUs",
                            stroke: "var(--muted-foreground)",
                            strokeWidth: 1.5,
                            curve: monotoneCurve,
                            motion: false,
                        }),
                        lineY(rows, {
                            x: "label",
                            y: "p95Us",
                            stroke: "var(--foreground)",
                            strokeWidth: 1.5,
                            curve: monotoneCurve,
                            motion: false,
                        }),
                    ];

        return defineChart(
            {
                marks: [
                    crosshair({
                        x: {
                            band: {
                                radius: 3,
                                fill: "var(--foreground)",
                                fillOpacity: 0.06,
                            },
                        },
                        y: false,
                        motion: false,
                    }),
                    ...marks,
                ],
                scales: {
                    x: {
                        scale: () => scaleBand<string>().padding(0),
                        axis: false,
                    },
                    y: { scale: scaleLinear, axis: false },
                },
                gradients: [
                    {
                        id: gradientId,
                        y1: 0,
                        y2: 1,
                        stops: [
                            {
                                offset: 0,
                                color: "var(--foreground)",
                                opacity: 0.32,
                            },
                            {
                                offset: 1,
                                color: "var(--foreground)",
                                opacity: 0,
                            },
                        ],
                    },
                ],
                margin: 0,
                clip: true,
            },
            {
                focus: "group-x",
                maxFocusDistance: Number.POSITIVE_INFINITY,
                focusRing: false,
                tooltip: {
                    use: tooltip,
                    anchor: "pointer",
                    offset: 12,
                    motion: false,
                },
            }
        );
    }, [gradientId, rows, variant]);

    return (
        <div
            className="size-full"
            style={
                {
                    "--telemetry-chart-reveal": `url(#${revealId})`,
                } as CSSProperties
            }
        >
            <svg
                width="0"
                height="0"
                className="absolute"
                aria-hidden="true"
                focusable="false"
            >
                <defs>
                    <clipPath id={revealId} clipPathUnits="objectBoundingBox">
                        <rect
                            x="0"
                            y="0"
                            width="1"
                            height="1"
                            className="telemetry-chart__reveal"
                        />
                    </clipPath>
                </defs>
            </svg>
            <RendererChart
                className="telemetry-chart size-full"
                height={TELEMETRY_CHART_HEIGHT}
                definition={definition}
                renderer={renderer}
                ariaLabel={ariaLabel}
                renderTooltipBody={({ points }) => (
                    <TelemetryTooltip
                        row={points[0]?.datum}
                        variant={variant}
                    />
                )}
            />
        </div>
    );
}

function TelemetryTooltip({
    row,
    variant,
}: {
    row: TelemetryChartRow | undefined;
    variant: TelemetryChartVariant;
}) {
    if (!row) return null;

    return (
        <div className="rounded-lg border border-border/50 bg-background shadow-xl">
            <div className="grid w-max min-w-32 items-start gap-1 px-2.5 py-1.5 text-xs text-foreground">
                <div className="font-medium">{row.label}</div>
                <div className="grid gap-0.5">
                    {SERIES_BY_VARIANT[variant].map((series) => (
                        <div
                            key={series.field}
                            className="flex items-center justify-between gap-4"
                        >
                            <div className="flex items-center gap-2">
                                <span
                                    aria-hidden="true"
                                    className="size-2.5 shrink-0 rounded-xs"
                                    style={{ background: series.color }}
                                />
                                <span className="text-muted-foreground">
                                    {series.label}
                                </span>
                            </div>
                            <span className="font-mono font-medium tabular-nums">
                                {series.format(row[series.field])}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
