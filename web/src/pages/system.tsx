import { useQuery } from "@tanstack/react-query";

import { FrameSection } from "@/components/frame-section";
import { QueryError } from "@/components/states";
import { Frame, FramePanel } from "@/components/ui/frame";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchSystem } from "@/lib/api";
import {
    formatBytes,
    formatCount,
    formatDateTime,
    formatRelative,
} from "@/lib/format";

function Detail({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="tabular-nums">{value}</dd>
        </div>
    );
}

function SystemSkeleton() {
    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 p-2">
            <Frame className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-5">
                {["Traces", "Spans", "Errors", "Batches", "Database"].map(
                    (label) => (
                        <FramePanel className="p-3" key={label}>
                            <div className="text-xs text-muted-foreground">
                                {label}
                            </div>
                            <Skeleton className="mt-1 h-5 w-20" />
                        </FramePanel>
                    )
                )}
            </Frame>

            <Frame className="gap-1">
                <FrameSection panelClassName="p-3" title="Collector">
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                        {[
                            "Last batch",
                            "First batch",
                            "Server time",
                            "Retention",
                            "Rate limit",
                            "Max payload",
                        ].map((label) => (
                            <div key={label}>
                                <dt className="text-xs text-muted-foreground">
                                    {label}
                                </dt>
                                <Skeleton className="mt-1 h-4 w-24" />
                            </div>
                        ))}
                    </dl>
                </FrameSection>
            </Frame>

            <Frame className="gap-1">
                <FrameSection
                    aside={<Skeleton className="h-3 w-16" />}
                    panelClassName="p-3"
                    title="Storage"
                >
                    <div className="flex flex-col gap-2">
                        {["spans", "traces", "batches", "errors"].map(
                            (table) => (
                                <div key={table}>
                                    <div className="flex items-baseline justify-between gap-2 text-xs">
                                        <span className="font-mono">
                                            {table}
                                        </span>
                                        <Skeleton className="h-3 w-12" />
                                    </div>
                                    <Skeleton className="mt-1.5 h-1 w-full" />
                                </div>
                            )
                        )}
                    </div>
                </FrameSection>
            </Frame>
        </div>
    );
}

export function SystemPage() {
    const query = useQuery({
        queryKey: ["system"],
        queryFn: fetchSystem,
        refetchInterval: 30_000,
    });

    if (query.isPending) return <SystemSkeleton />;
    if (query.error) {
        return (
            <QueryError
                error={query.error}
                retry={() => void query.refetch()}
            />
        );
    }

    const data = query.data;
    const storageMax = Math.max(
        1,
        ...data.storage.map((bucket) => bucket.bytes)
    );

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 p-2">
                <Frame className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-5">
                    {[
                        ["Traces", formatCount(data.traces)],
                        ["Spans", formatCount(data.spans)],
                        ["Errors", formatCount(data.errors)],
                        ["Batches", formatCount(data.batches)],
                        ["Database", formatBytes(data.databaseBytes)],
                    ].map(([label, value]) => (
                        <FramePanel className="p-3" key={label}>
                            <div className="text-xs text-muted-foreground">
                                {label}
                            </div>
                            <div className="font-mono text-base tabular-nums">
                                {value}
                            </div>
                        </FramePanel>
                    ))}
                </Frame>

                <Frame className="gap-1">
                    <FrameSection panelClassName="p-3" title="Collector">
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                            <Detail
                                label="Last batch"
                                value={
                                    data.lastBatchAt
                                        ? formatRelative(data.lastBatchAt)
                                        : "Never"
                                }
                            />
                            <Detail
                                label="First batch"
                                value={
                                    data.firstBatchAt
                                        ? formatRelative(data.firstBatchAt)
                                        : "Never"
                                }
                            />
                            <Detail
                                label="Server time"
                                value={formatDateTime(data.serverTime)}
                            />
                            <Detail
                                label="Retention"
                                value={`${data.retentionDays} days`}
                            />
                            <Detail
                                label="Rate limit"
                                value={`${formatCount(data.rateLimitPerMinute)} / min`}
                            />
                            <Detail
                                label="Max payload"
                                value={formatBytes(data.maxBodyBytes)}
                            />
                        </dl>
                    </FrameSection>
                </Frame>

                <Frame className="gap-1">
                    <FrameSection
                        aside={
                            <span className="text-xs text-muted-foreground tabular-nums">
                                {formatBytes(data.databaseBytes)}
                            </span>
                        }
                        panelClassName="p-3"
                        title="Storage"
                    >
                        <div className="flex flex-col gap-2">
                            {data.storage.map((bucket) => (
                                <div key={bucket.table}>
                                    <div className="flex items-baseline justify-between gap-2 text-xs">
                                        <span className="font-mono">
                                            {bucket.table}
                                        </span>
                                        <span className="text-muted-foreground tabular-nums">
                                            {formatBytes(bucket.bytes)}
                                        </span>
                                    </div>
                                    <div className="mt-1 h-1 rounded-full bg-muted">
                                        <div
                                            className="h-full rounded-full bg-foreground/60"
                                            style={{
                                                width: `${(bucket.bytes / storageMax) * 100}%`,
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </FrameSection>
                </Frame>
            </div>
        </div>
    );
}
