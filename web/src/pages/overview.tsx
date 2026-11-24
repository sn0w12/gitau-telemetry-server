import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";

import { FrameSection } from "@/components/frame-section";
import { PageToolbar, RefreshButton } from "@/components/page-toolbar";
import { RangePicker } from "@/components/range-picker";
import { useRange } from "@/components/range-provider";
import { QueryError, TableSkeleton } from "@/components/states";
import {
    TelemetryChart,
    TELEMETRY_CHART_HEIGHT,
} from "@/components/telemetry-chart";
import {
    Frame,
    FrameHeader,
    FramePanel,
    FrameTitle,
} from "@/components/ui/frame";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { fetchOverview, fetchSeries, fetchSpans, fetchTraces } from "@/lib/api";
import {
    displayLabel,
    formatChartLabel,
    formatCount,
    formatDuration,
    formatPercent,
    formatRelative,
} from "@/lib/format";
import { bucketForRange } from "@/lib/range";
import type { Bucket, SeriesPoint } from "@/lib/types";

function BucketList({ title, buckets }: { title: string; buckets: Bucket[] }) {
    const max = Math.max(1, ...buckets.map((bucket) => bucket.count));

    return (
        <div className="min-w-0">
            <div className="pb-1 text-xs text-muted-foreground">{title}</div>
            <div className="flex flex-col gap-1">
                {buckets.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                        No data
                    </span>
                ) : (
                    buckets.slice(0, 6).map((bucket) => (
                        <div
                            className="flex items-center gap-2 text-xs"
                            key={bucket.value}
                        >
                            <span className="w-16 shrink-0 truncate">
                                {displayLabel(bucket.value)}
                            </span>
                            <div className="h-1 min-w-0 flex-1 rounded-full bg-muted">
                                <div
                                    className="h-full rounded-full bg-foreground/60"
                                    style={{
                                        width: `${(bucket.count / max) * 100}%`,
                                    }}
                                />
                            </div>
                            <span className="w-8 shrink-0 text-right font-mono text-muted-foreground tabular-nums">
                                {formatCount(bucket.count)}
                            </span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

function OverviewSkeleton() {
    const statLabels = ["Batches", "Traces", "Spans", "Errors", "Error rate"];
    const breakdown = [
        "Versions",
        "Operating systems",
        "CPU tier",
        "Architecture",
        "Build",
    ];

    return (
        <div className="flex flex-col gap-2 px-2 pb-2">
            <Frame className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-5">
                {statLabels.map((label) => (
                    <FramePanel
                        className="p-3 last:col-span-2 lg:last:col-span-1"
                        key={label}
                    >
                        <div className="text-xs text-muted-foreground">
                            {label}
                        </div>
                        <Skeleton className="mt-1 h-5 w-20" />
                    </FramePanel>
                ))}
            </Frame>

            <Frame className="grid gap-1 md:grid-cols-3">
                {["Traffic", "Errors", "Latency"].map((title) => (
                    <div className="flex flex-col gap-1" key={title}>
                        <FrameHeader className="flex flex-row items-center justify-between">
                            <FrameTitle>{title}</FrameTitle>
                            <Skeleton className="h-3 w-16" />
                        </FrameHeader>
                        <FramePanel className="p-3">
                            <Skeleton
                                className="w-full"
                                style={{ height: TELEMETRY_CHART_HEIGHT }}
                            />
                        </FramePanel>
                    </div>
                ))}
            </Frame>

            <Frame className="grid grid-cols-1 gap-1 sm:grid-cols-2 xl:grid-cols-5">
                {breakdown.map((title, index) => (
                    <FramePanel
                        className={
                            index === breakdown.length - 1
                                ? "p-3 last:col-span-2 xl:last:col-span-1"
                                : "p-3"
                        }
                        key={title}
                    >
                        <div className="text-xs text-muted-foreground">
                            {title}
                        </div>
                        <div className="mt-1 flex flex-col gap-2">
                            {Array.from({ length: 3 }).map((_, row) => (
                                <div
                                    className="flex items-center gap-2"
                                    key={row}
                                >
                                    <Skeleton className="h-3 w-16" />
                                    <Skeleton className="h-1 flex-1" />
                                    <Skeleton className="h-3 w-6" />
                                </div>
                            ))}
                        </div>
                    </FramePanel>
                ))}
            </Frame>

            <Frame className="gap-1">
                <FrameSection panelClassName="p-0" title="Slowest spans">
                    <div className="flex flex-col">
                        {Array.from({ length: 6 }).map((_, index) => (
                            <div
                                className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0"
                                key={index}
                            >
                                <Skeleton className="h-3 w-40" />
                                <Skeleton className="ml-auto h-3 w-16" />
                                <Skeleton className="h-3 w-12" />
                            </div>
                        ))}
                    </div>
                </FrameSection>
            </Frame>

            <Frame className="gap-1">
                <FrameSection panelClassName="p-0" title="Recent traces">
                    <TableSkeleton
                        columns={[
                            { label: "Root" },
                            { align: "right", label: "Received" },
                            { align: "right", label: "Duration" },
                            { align: "right", label: "Spans" },
                            { align: "right", label: "Version" },
                        ]}
                        rows={5}
                    />
                </FrameSection>
            </Frame>
        </div>
    );
}

export function OverviewPage() {
    const { selection } = useRange();
    const navigate = useNavigate();
    const bucket = bucketForRange(selection.key);
    const overview = useQuery({
        queryKey: ["overview", selection.from, selection.to],
        queryFn: () => fetchOverview(selection),
        placeholderData: keepPreviousData,
    });
    const series = useQuery({
        queryKey: ["series", selection.from, selection.to, bucket],
        queryFn: () => fetchSeries(selection, bucket),
        placeholderData: keepPreviousData,
    });
    const spans = useQuery({
        queryKey: ["spans", selection.from, selection.to, "name"],
        queryFn: () =>
            fetchSpans({
                ...selection,
                groupBy: "name",
                name: "",
                version: "",
            }),
        placeholderData: keepPreviousData,
    });
    const recent = useQuery({
        queryKey: ["traces", "recent", selection.from, selection.to],
        queryFn: () =>
            fetchTraces({
                ...selection,
                root: "",
                version: "",
                errorsOnly: false,
                cursor: null,
                limit: 8,
            }),
        placeholderData: keepPreviousData,
    });

    const toolbar = (
        <PageToolbar
            actions={
                <>
                    <RefreshButton />
                    <RangePicker />
                </>
            }
        />
    );

    if (
        overview.isPending ||
        series.isPending ||
        spans.isPending ||
        recent.isPending
    ) {
        return (
            <div className="mx-auto flex w-full max-w-6xl flex-col">
                {toolbar}
                <OverviewSkeleton />
            </div>
        );
    }

    if (overview.error || series.error || spans.error || recent.error) {
        return (
            <div className="mx-auto flex w-full max-w-6xl flex-col">
                {toolbar}
                <div className="px-2 pb-2">
                    <QueryError
                        error={
                            overview.error ??
                            series.error ??
                            spans.error ??
                            recent.error
                        }
                        retry={() => {
                            void overview.refetch();
                            void series.refetch();
                            void spans.refetch();
                            void recent.refetch();
                        }}
                    />
                </div>
            </div>
        );
    }

    const data = overview.data;
    const points: SeriesPoint[] = series.data.rows;
    const chartRows = points.map((point) => ({
        label: formatChartLabel(point.bucket, series.data.bucket),
        traces: point.traces,
        spans: point.spans,
        errors: point.errors,
        avgUs: point.avgUs ?? 0,
        p95Us: point.p95Us ?? 0,
    }));
    const totalTraces = points.reduce((sum, point) => sum + point.traces, 0);
    const totalErrors = points.reduce((sum, point) => sum + point.errors, 0);
    const peakLatency = points.reduce(
        (max, point) => Math.max(max, point.p95Us ?? 0),
        0
    );
    const slowest = (spans.data?.rows ?? [])
        .slice()
        .sort((left, right) => right.p95Us - left.p95Us)
        .slice(0, 6);
    const charts = [
        {
            title: "Traffic",
            value: `${formatCount(totalTraces)} traces`,
            variant: "traffic" as const,
            ariaLabel: "Traces over time",
        },
        {
            title: "Errors",
            value: `${formatCount(totalErrors)} errors`,
            variant: "errors" as const,
            ariaLabel: "Errors over time",
        },
        {
            title: "Latency",
            value: `${formatDuration(peakLatency)} p95`,
            variant: "latency" as const,
            ariaLabel: "Average and p95 latency over time",
        },
    ];

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col">
            {toolbar}

            <div className="flex flex-col gap-2 px-2 pb-2">
                <Frame className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-5">
                    {[
                        ["Batches", formatCount(data.batches)],
                        ["Traces", formatCount(data.traces)],
                        ["Spans", formatCount(data.spans)],
                        ["Errors", formatCount(data.errors)],
                        ["Error rate", formatPercent(data.errorRate)],
                    ].map(([label, value]) => (
                        <FramePanel
                            className="p-3 last:col-span-2 lg:last:col-span-1"
                            key={label}
                        >
                            <div className="text-xs text-muted-foreground">
                                {label}
                            </div>
                            <div className="font-mono text-base tabular-nums">
                                {value}
                            </div>
                        </FramePanel>
                    ))}
                </Frame>

                <Frame className="grid gap-1 md:grid-cols-3">
                    {charts.map((chart) => (
                        <div className="flex flex-col gap-1" key={chart.title}>
                            <FrameHeader className="flex flex-row items-center justify-between">
                                <FrameTitle>{chart.title}</FrameTitle>
                                <span className="text-xs text-muted-foreground tabular-nums">
                                    {chart.value}
                                </span>
                            </FrameHeader>
                            <FramePanel className="p-3">
                                <div style={{ height: TELEMETRY_CHART_HEIGHT }}>
                                    <TelemetryChart
                                        ariaLabel={chart.ariaLabel}
                                        rows={chartRows}
                                        variant={chart.variant}
                                    />
                                </div>
                            </FramePanel>
                        </div>
                    ))}
                </Frame>

                <Frame className="grid grid-cols-1 gap-1 sm:grid-cols-2 xl:grid-cols-5">
                    <FramePanel className="p-3">
                        <BucketList buckets={data.versions} title="Versions" />
                    </FramePanel>
                    <FramePanel className="p-3">
                        <BucketList
                            buckets={data.os}
                            title="Operating systems"
                        />
                    </FramePanel>
                    <FramePanel className="p-3">
                        <BucketList buckets={data.cpuTiers} title="CPU tier" />
                    </FramePanel>
                    <FramePanel className="p-3">
                        <BucketList buckets={data.arch} title="Architecture" />
                    </FramePanel>
                    <FramePanel className="p-3 last:col-span-2 xl:last:col-span-1">
                        <BucketList
                            buckets={data.buildProfiles}
                            title="Build"
                        />
                    </FramePanel>
                </Frame>

                <Frame className="gap-1">
                    <FrameSection
                        aside={
                            <Link
                                className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
                                to="/spans"
                            >
                                All spans
                                <ArrowUpRight className="size-3" />
                            </Link>
                        }
                        panelClassName="p-0"
                        title="Slowest spans"
                    >
                        {slowest.length === 0 ? (
                            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                                No spans in this range.
                            </div>
                        ) : (
                            <div className="flex flex-col overflow-hidden rounded-[inherit]">
                                {slowest.map((row) => (
                                    <Link
                                        className="flex items-center gap-3 border-b px-3 py-2 text-xs last:border-b-0 hover:bg-muted"
                                        key={row.bucket}
                                        params={{ spanName: row.bucket }}
                                        to="/spans/$spanName"
                                    >
                                        <span className="min-w-0 flex-1 truncate font-mono">
                                            {row.bucket}
                                        </span>
                                        <span className="text-muted-foreground tabular-nums">
                                            {formatCount(row.calls)} calls
                                        </span>
                                        <span className="font-mono tabular-nums">
                                            {formatDuration(row.p95Us)}
                                        </span>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </FrameSection>
                </Frame>

                <Frame className="gap-1">
                    <FrameSection
                        aside={
                            <Link
                                className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
                                to="/traces"
                            >
                                All traces
                                <ArrowUpRight className="size-3" />
                            </Link>
                        }
                        panelClassName="p-0"
                        title="Recent traces"
                    >
                        <Table
                            className="text-xs"
                            containerClassName="overflow-hidden rounded-[inherit]"
                        >
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Root</TableHead>
                                    <TableHead className="text-right">
                                        Received
                                    </TableHead>
                                    <TableHead className="text-right">
                                        Duration
                                    </TableHead>
                                    <TableHead className="text-right">
                                        Spans
                                    </TableHead>
                                    <TableHead className="text-right">
                                        Version
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(recent.data?.traces ?? []).map((trace) => (
                                    <TableRow
                                        className="cursor-pointer"
                                        key={trace.id}
                                        onClick={() =>
                                            void navigate({
                                                params: {
                                                    traceId: String(trace.id),
                                                },
                                                to: "/traces/$traceId",
                                            })
                                        }
                                    >
                                        <TableCell className="font-mono font-medium">
                                            <Link
                                                className="hover:underline"
                                                onClick={(event) =>
                                                    event.stopPropagation()
                                                }
                                                params={{
                                                    traceId: String(trace.id),
                                                }}
                                                to="/traces/$traceId"
                                            >
                                                {trace.root}
                                            </Link>
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground tabular-nums">
                                            {formatRelative(trace.receivedAt)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono tabular-nums">
                                            {formatDuration(trace.durationUs)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono tabular-nums">
                                            {formatCount(trace.spanCount)}
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground">
                                            {trace.appVersion}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </FrameSection>
                </Frame>
            </div>
        </div>
    );
}
