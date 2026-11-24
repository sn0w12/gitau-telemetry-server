import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Waypoints, X } from "lucide-react";
import { useDeferredValue, useEffect, useRef, useState } from "react";

import { PageToolbar, RefreshButton } from "@/components/page-toolbar";
import { RangePicker } from "@/components/range-picker";
import { useRange } from "@/components/range-provider";
import { SortHead } from "@/components/sort-head";
import { EmptyBlock, QueryError, TableSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Frame, FrameFooter, FramePanel } from "@/components/ui/frame";
import { Input } from "@/components/ui/input";
import {
    NumberField,
    NumberFieldDecrement,
    NumberFieldGroup,
    NumberFieldIncrement,
    NumberFieldInput,
} from "@/components/ui/number-field";
import { Switch } from "@/components/ui/switch";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { fetchTraces } from "@/lib/api";
import {
    displayLabel,
    formatCount,
    formatDuration,
    formatRelative,
} from "@/lib/format";
import type { SortDirection, TraceSort } from "@/lib/types";

export function TracesPage() {
    const { selection } = useRange();
    const navigate = useNavigate();
    const [root, setRoot] = useState("");
    const [version, setVersion] = useState("");
    const [errorsOnly, setErrorsOnly] = useState(false);
    const [sort, setSort] = useState<TraceSort>("received");
    const [direction, setDirection] = useState<SortDirection>("desc");
    const deferredRoot = useDeferredValue(root);
    const deferredVersion = useDeferredValue(version);
    const hasFilters = root !== "" || version !== "" || errorsOnly;
    const pageSize = 50;
    const [page, setPage] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);

    const toggleSort = (next: TraceSort) => {
        if (next === sort) {
            setDirection((current) => (current === "asc" ? "desc" : "asc"));
            return;
        }
        setSort(next);
        setDirection(next === "root" ? "asc" : "desc");
    };

    useEffect(() => {
        setPage(0);
    }, [
        selection.from,
        selection.to,
        deferredRoot,
        deferredVersion,
        errorsOnly,
        sort,
        direction,
    ]);

    const query = useQuery({
        queryKey: [
            "traces",
            selection.from,
            selection.to,
            deferredRoot,
            deferredVersion,
            errorsOnly,
            sort,
            direction,
            page,
        ],
        queryFn: () =>
            fetchTraces({
                ...selection,
                root: deferredRoot,
                version: deferredVersion,
                errorsOnly,
                sort,
                direction,
                offset: page * pageSize,
                limit: pageSize,
            }),
        placeholderData: keepPreviousData,
    });

    const traces = query.data?.traces ?? [];
    const total = query.data?.total ?? 0;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));

    const scrollToList = () => {
        requestAnimationFrame(() => {
            listRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
            });
        });
    };

    const goToPage = (next: number) => {
        const clamped = Math.min(pageCount, Math.max(1, next));
        setPage(clamped - 1);
        scrollToList();
    };

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col">
            <PageToolbar
                actions={
                    <>
                        <RefreshButton />
                        <RangePicker />
                    </>
                }
            >
                <Input
                    aria-label="Filter by root span"
                    className="w-48"
                    onChange={(event) => setRoot(event.target.value)}
                    placeholder="Root span"
                    size="sm"
                    type="search"
                    value={root}
                />
                <Input
                    aria-label="Filter by version"
                    className="w-32"
                    onChange={(event) => setVersion(event.target.value)}
                    placeholder="Version"
                    size="sm"
                    type="search"
                    value={version}
                />
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Switch
                        checked={errorsOnly}
                        onCheckedChange={setErrorsOnly}
                    />
                    Errors only
                </label>
                {hasFilters ? (
                    <Button
                        aria-label="Clear filters"
                        onClick={() => {
                            setRoot("");
                            setVersion("");
                            setErrorsOnly(false);
                        }}
                        size="icon-xs"
                        variant="ghost"
                    >
                        <X />
                    </Button>
                ) : null}
            </PageToolbar>

            <div className="px-2 pb-2" ref={listRef}>
                <Frame className="gap-1">
                    <FramePanel className="p-0">
                        {query.isPending ? (
                            <TableSkeleton
                                columns={[
                                    { label: "Root" },
                                    { label: "Received" },
                                    { align: "right", label: "Duration" },
                                    { align: "right", label: "Spans" },
                                    { align: "right", label: "Errors" },
                                    { label: "Version" },
                                    { label: "OS" },
                                    { label: "CPU" },
                                ]}
                                rows={50}
                            />
                        ) : query.error ? (
                            <div className="p-3">
                                <QueryError
                                    error={query.error}
                                    retry={() => void query.refetch()}
                                />
                            </div>
                        ) : traces.length === 0 ? (
                            <EmptyBlock
                                description="No traces match this range and filter."
                                icon={<Waypoints />}
                                title="No traces"
                            />
                        ) : (
                            <Table
                                className="text-xs"
                                containerClassName="overflow-hidden rounded-[inherit]"
                            >
                                <TableHeader>
                                    <TableRow>
                                        <SortHead
                                            activeSort={sort}
                                            direction={direction}
                                            label="Root"
                                            onSort={toggleSort}
                                            sortKey="root"
                                        />
                                        <SortHead
                                            activeSort={sort}
                                            direction={direction}
                                            label="Received"
                                            onSort={toggleSort}
                                            sortKey="received"
                                        />
                                        <SortHead
                                            activeSort={sort}
                                            align="right"
                                            direction={direction}
                                            label="Duration"
                                            onSort={toggleSort}
                                            sortKey="duration"
                                        />
                                        <SortHead
                                            activeSort={sort}
                                            align="right"
                                            direction={direction}
                                            label="Spans"
                                            onSort={toggleSort}
                                            sortKey="spans"
                                        />
                                        <SortHead
                                            activeSort={sort}
                                            align="right"
                                            direction={direction}
                                            label="Errors"
                                            onSort={toggleSort}
                                            sortKey="errors"
                                        />
                                        <SortHead
                                            activeSort={sort}
                                            direction={direction}
                                            label="Version"
                                            onSort={toggleSort}
                                            sortKey="version"
                                        />
                                        <TableHead>OS</TableHead>
                                        <TableHead>CPU</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {traces.map((trace) => (
                                        <TableRow
                                            className="cursor-pointer"
                                            key={trace.id}
                                            onClick={() =>
                                                void navigate({
                                                    params: {
                                                        traceId: String(
                                                            trace.id
                                                        ),
                                                    },
                                                    to: "/traces/$traceId",
                                                })
                                            }
                                        >
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
                                            <TableCell className="text-muted-foreground tabular-nums">
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
                                                {trace.errorCount > 0 ? (
                                                    <span className="text-destructive-foreground">
                                                        {formatCount(
                                                            trace.errorCount
                                                        )}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">
                                                        -
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {trace.appVersion}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {displayLabel(trace.os)}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {displayLabel(trace.cpuTier)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </FramePanel>

                    {pageCount > 1 ? (
                        <FrameFooter className="flex items-center justify-center gap-2 py-2">
                            <NumberField
                                aria-label="Page"
                                className="w-32"
                                max={pageCount}
                                min={1}
                                onValueCommitted={(value) => {
                                    if (value !== null) goToPage(value);
                                }}
                                size="sm"
                                value={page + 1}
                            >
                                <NumberFieldGroup>
                                    <NumberFieldDecrement
                                        aria-label="Previous page"
                                        disabled={page === 0}
                                    />
                                    <NumberFieldInput
                                        aria-label="Page"
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                                event.preventDefault();
                                                event.currentTarget.blur();
                                            }
                                        }}
                                    />
                                    <NumberFieldIncrement
                                        aria-label="Next page"
                                        disabled={page >= pageCount - 1}
                                    />
                                </NumberFieldGroup>
                            </NumberField>
                        </FrameFooter>
                    ) : null}
                </Frame>
            </div>
        </div>
    );
}
