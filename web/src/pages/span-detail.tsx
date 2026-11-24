import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useParams, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { FrameSection } from "@/components/frame-section";
import { PageToolbar, RefreshButton } from "@/components/page-toolbar";
import { RangePicker } from "@/components/range-picker";
import { useRange } from "@/components/range-provider";
import { QueryError, TableSkeleton } from "@/components/states";
import {
    TelemetryChart,
    TELEMETRY_CHART_HEIGHT,
} from "@/components/telemetry-chart";
import { Button } from "@/components/ui/button";
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
import { Waterfall } from "@/components/waterfall";
import {
    fetchSeries,
    fetchSpanWaterfall,
    fetchSpans,
    fetchTraces,
} from "@/lib/api";
import {
    formatChartLabel,
    formatCount,
    formatDuration,
    formatRelative,
} from "@/lib/format";
import { bucketForRange } from "@/lib/range";

export function SpanDetailPage() {
    const params = useParams({ from: "/spans/$spanName" });
    const router = useRouter();
    const spanName = decodeURIComponent(params.spanName);
    const { selection } = useRange();
    const bucket = bucketForRange(selection.key);

    const summary = useQuery({
        queryKey: ["spans", "detail", selection.from, selection.to, spanName],
        queryFn: () =>
            fetchSpans({
                ...selection,
                groupBy: "name",
                name: spanName,
                version: "",
            }),
        placeholderData: keepPreviousData,
    });
    const series = useQuery({
        queryKey: [
            "series",
            "span",
            selection.from,
            selection.to,
            bucket,
            spanName,
        ],
        queryFn: () => fetchSeries(selection, bucket, spanName),
        placeholderData: keepPreviousData,
    });
    const waterfall = useQuery({
        queryKey: ["span-waterfall", selection.from, selection.to, spanName],
        queryFn: () => fetchSpanWaterfall(spanName, selection),
        placeholderData: keepPreviousData,
    });
    const traces = useQuery({
        queryKey: ["traces", "span", selection.from, selection.to, spanName],
        queryFn: () =>
            fetchTraces({
                ...selection,
                span: spanName,
                limit: 10,
            }),
        placeholderData: keepPreviousData,
    });

    const stats = summary.data?.rows[0];
    const chartRows = (series.data?.rows ?? []).map((point) => ({
        label: formatChartLabel(point.bucket, series.data?.bucket ?? "hour"),
        traces: point.traces,
        spans: point.spans,
        errors: point.errors,
        avgUs: point.avgUs ?? 0,
        p95Us: point.p95Us ?? 0,
    }));
    const traceRows = traces.data?.traces ?? [];

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col">
            <PageToolbar
                actions={
                    <>
                        <RefreshButton />
                        <RangePicker />
                    </>
                }
            />

            <div className="px-2 pb-2">
                <Frame className="gap-1">
                    <FrameHeader className="flex flex-row items-center">
                        <Button
                            aria-label="Back to spans"
                            onClick={() => {
                                if (router.history.canGoBack()) {
                                    router.history.back();
                                } else {
                                    void router.navigate({ to: "/spans" });
                                }
                            }}
                            size="icon-xs"
                            variant="ghost"
                        >
                            <ArrowLeft />
                        </Button>
                        <FrameTitle className="min-w-0 flex-1 truncate font-mono text-base font-semibold">
                            {spanName}
                        </FrameTitle>
                    </FrameHeader>

                    <FramePanel className="grid grid-cols-2 gap-x-6 gap-y-3 p-3 sm:grid-cols-3 lg:grid-cols-6">
                        {summary.isPending ? (
                            [
                                "Calls",
                                "Average",
                                "p50",
                                "p95",
                                "p99",
                                "Max",
                            ].map((label) => (
                                <div key={label}>
                                    <div className="text-xs text-muted-foreground">
                                        {label}
                                    </div>
                                    <Skeleton className="mt-1 h-5 w-20" />
                                </div>
                            ))
                        ) : summary.error ? (
                            <div className="col-span-full">
                                <QueryError
                                    error={summary.error}
                                    retry={() => void summary.refetch()}
                                />
                            </div>
                        ) : (
                            [
                                ["Calls", formatCount(stats?.calls ?? 0)],
                                ["Average", formatDuration(stats?.avgUs ?? 0)],
                                ["p50", formatDuration(stats?.p50Us ?? 0)],
                                ["p95", formatDuration(stats?.p95Us ?? 0)],
                                ["p99", formatDuration(stats?.p99Us ?? 0)],
                                ["Max", formatDuration(stats?.maxUs ?? 0)],
                            ].map(([label, value]) => (
                                <div key={label}>
                                    <div className="text-xs text-muted-foreground">
                                        {label}
                                    </div>
                                    <div className="font-mono text-base tabular-nums">
                                        {value}
                                    </div>
                                </div>
                            ))
                        )}
                    </FramePanel>

                    <FrameSection
                        panelClassName="p-0"
                        title="Average waterfall"
                    >
                        {waterfall.isPending ? (
                            <div className="flex flex-col p-2">
                                {Array.from({ length: 7 }).map((_, index) => (
                                    <div
                                        className="flex items-center gap-2 py-1"
                                        key={index}
                                    >
                                        <Skeleton
                                            className="h-3"
                                            style={{
                                                width: `${150 - (index % 3) * 24}px`,
                                            }}
                                        />
                                        <Skeleton className="h-2 flex-1" />
                                        <Skeleton className="h-3 w-12" />
                                    </div>
                                ))}
                            </div>
                        ) : waterfall.error ? (
                            <div className="p-3">
                                <QueryError
                                    error={waterfall.error}
                                    retry={() => void waterfall.refetch()}
                                />
                            </div>
                        ) : (
                            <div className="overflow-hidden rounded-[inherit]">
                                <Waterfall
                                    trace={{
                                        durationUs: waterfall.data.durationUs,
                                        root: waterfall.data.root,
                                        startUnixMs: 0,
                                    }}
                                />
                            </div>
                        )}
                    </FrameSection>

                    <FrameSection panelClassName="p-3" title="Latency">
                        {series.isPending ? (
                            <Skeleton
                                className="w-full"
                                style={{ height: TELEMETRY_CHART_HEIGHT }}
                            />
                        ) : series.error ? (
                            <QueryError
                                error={series.error}
                                retry={() => void series.refetch()}
                            />
                        ) : (
                            <div style={{ height: TELEMETRY_CHART_HEIGHT }}>
                                <TelemetryChart
                                    ariaLabel={`Average and p95 latency for ${spanName}`}
                                    rows={chartRows}
                                    variant="latency"
                                />
                            </div>
                        )}
                    </FrameSection>

                    <FrameSection panelClassName="p-0" title="Recent traces">
                        {traces.isPending ? (
                            <TableSkeleton
                                columns={[
                                    { label: "Root" },
                                    { align: "right", label: "Received" },
                                    { align: "right", label: "Duration" },
                                    { align: "right", label: "Spans" },
                                    { align: "right", label: "Errors" },
                                    { label: "Version" },
                                ]}
                            />
                        ) : traces.error ? (
                            <div className="p-3">
                                <QueryError
                                    error={traces.error}
                                    retry={() => void traces.refetch()}
                                />
                            </div>
                        ) : traceRows.length === 0 ? (
                            <div className="px-3 py-6 text-xs text-muted-foreground">
                                No traces contain this span in the selected
                                range.
                            </div>
                        ) : (
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
                                            Errors
                                        </TableHead>
                                        <TableHead>Version</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {traceRows.map((trace) => (
                                        <TableRow key={trace.id}>
                                            <TableCell className="font-mono font-medium">
                                                <Link
                                                    className="hover:underline"
                                                    params={{
                                                        traceId: String(
                                                            trace.id
                                                        ),
                                                    }}
                                                    to="/traces/$traceId"
                                                >
                                                    {trace.root}
                                                </Link>
                                            </TableCell>
                                            <TableCell className="text-right text-muted-foreground tabular-nums">
                                                {formatRelative(
                                                    trace.receivedAt
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right font-mono tabular-nums">
                                                {formatDuration(
                                                    trace.durationUs
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right font-mono tabular-nums">
                                                {formatCount(trace.spanCount)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono tabular-nums">
                                                {trace.errorCount > 0
                                                    ? formatCount(
                                                          trace.errorCount
                                                      )
                                                    : "-"}
                                            </TableCell>
                                            <TableCell>
                                                {trace.appVersion}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </FrameSection>
                </Frame>
            </div>
        </div>
    );
}
