import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Check, Copy } from "lucide-react";
import { useState } from "react";

import { QueryError } from "@/components/states";
import { Button } from "@/components/ui/button";
import {
    Frame,
    FrameHeader,
    FramePanel,
    FrameTitle,
} from "@/components/ui/frame";
import { Skeleton } from "@/components/ui/skeleton";
import { Waterfall } from "@/components/waterfall";
import { fetchTrace } from "@/lib/api";
import {
    displayLabel,
    formatCount,
    formatDuration,
    formatRelative,
} from "@/lib/format";

export function TraceDetailPage() {
    const { traceId } = useParams({ from: "/traces/$traceId" });
    const router = useRouter();
    const id = Number(traceId);
    const [copied, setCopied] = useState(false);

    const query = useQuery({
        queryKey: ["trace", id],
        queryFn: () => fetchTrace(id),
        enabled: Number.isFinite(id),
    });

    if (!Number.isFinite(id)) {
        return <QueryError error={new Error("Invalid trace id")} />;
    }
    if (query.isPending) {
        return (
            <div className="mx-auto w-full max-w-6xl p-2">
                <Frame className="gap-1">
                    <FrameHeader className="flex flex-row items-center">
                        <Skeleton className="size-7 rounded-md" />
                        <Skeleton className="h-5 w-56" />
                        <Skeleton className="ml-auto h-6 w-24" />
                    </FrameHeader>
                    <FramePanel className="p-0">
                        <div className="flex flex-col p-2">
                            {Array.from({ length: 6 }).map((_, index) => (
                                <div
                                    className="flex items-center gap-2 py-1"
                                    key={index}
                                >
                                    <Skeleton
                                        className="h-3"
                                        style={{
                                            width: `${160 - (index % 3) * 24}px`,
                                        }}
                                    />
                                    <Skeleton className="h-2 flex-1" />
                                    <Skeleton className="h-3 w-12" />
                                </div>
                            ))}
                        </div>
                    </FramePanel>
                    <FramePanel className="grid grid-cols-2 gap-x-6 gap-y-1 p-2 sm:grid-cols-3 xl:grid-cols-5">
                        {Array.from({ length: 9 }).map((_, index) => (
                            <div
                                className="flex items-center gap-2"
                                key={index}
                            >
                                <Skeleton className="h-3 w-14" />
                                <Skeleton className="h-3 w-16" />
                            </div>
                        ))}
                    </FramePanel>
                </Frame>
            </div>
        );
    }
    if (query.error) {
        return (
            <QueryError
                error={query.error}
                retry={() => void query.refetch()}
            />
        );
    }

    const detail = query.data;
    const trace = detail.tree;
    const details: Array<[string, string]> = [
        ["Duration", formatDuration(detail.durationUs)],
        ["Received", formatRelative(detail.receivedAt)],
        ["Spans", formatCount(detail.spanCount)],
        ["Errors", formatCount(detail.errorCount)],
        ["Version", detail.appVersion],
        ["OS", displayLabel(detail.os)],
        ["Architecture", displayLabel(detail.arch)],
        ["CPU tier", displayLabel(detail.cpuTier)],
        ["Build", displayLabel(detail.buildProfile)],
    ];
    if ((trace.droppedSpans ?? 0) > 0) {
        details.push(["Dropped spans", formatCount(trace.droppedSpans ?? 0)]);
    }

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(
                JSON.stringify(detail, null, 2)
            );
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1_500);
        } catch {
            setCopied(false);
        }
    };

    return (
        <div className="mx-auto w-full max-w-6xl p-2">
            <Frame className="gap-1">
                <FrameHeader className="flex flex-row items-center">
                    <Button
                        aria-label="Back to traces"
                        onClick={() => {
                            if (router.history.canGoBack()) {
                                router.history.back();
                            } else {
                                void router.navigate({ to: "/traces" });
                            }
                        }}
                        size="icon-xs"
                        variant="ghost"
                    >
                        <ArrowLeft />
                    </Button>
                    <FrameTitle className="min-w-0 flex-1 truncate font-mono text-base font-semibold">
                        {detail.root}
                    </FrameTitle>
                    <Button
                        onClick={() => void copy()}
                        size="xs"
                        variant="outline"
                    >
                        {copied ? <Check /> : <Copy />}
                        {copied ? "Copied" : "Copy JSON"}
                    </Button>
                </FrameHeader>

                <FramePanel className="p-0">
                    <div className="overflow-hidden rounded-[inherit]">
                        <Waterfall trace={trace} />
                    </div>
                </FramePanel>

                <FramePanel className="grid grid-cols-2 gap-x-6 gap-y-1 p-2 text-xs sm:grid-cols-3 xl:grid-cols-5">
                    {details.map(([label, value]) => (
                        <div
                            className="flex min-w-0 items-baseline gap-2"
                            key={label}
                        >
                            <span className="text-muted-foreground">
                                {label}
                            </span>
                            <span className="truncate font-mono tabular-nums">
                                {value}
                            </span>
                        </div>
                    ))}
                </FramePanel>
            </Frame>
        </div>
    );
}
