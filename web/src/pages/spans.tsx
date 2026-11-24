import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChartNoAxesColumn, ChevronDown, ChevronUp, X } from "lucide-react";
import { useDeferredValue, useState } from "react";

import { PageToolbar, RefreshButton } from "@/components/page-toolbar";
import { RangePicker } from "@/components/range-picker";
import { useRange } from "@/components/range-provider";
import { EmptyBlock, QueryError, TableSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Frame, FramePanel } from "@/components/ui/frame";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectItem,
    SelectPopup,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { fetchSpans } from "@/lib/api";
import { displayLabel, formatCount, formatDuration } from "@/lib/format";
import type { GroupBy, SortDirection, SpanSort } from "@/lib/types";
import { cn } from "@/lib/utils";

const GROUPS: { value: GroupBy; label: string }[] = [
    { value: "name", label: "Span name" },
    { value: "version", label: "Version" },
    { value: "os", label: "OS" },
    { value: "arch", label: "Architecture" },
    { value: "cpu", label: "CPU tier" },
    { value: "buildProfile", label: "Build profile" },
];

function SortHead({
    label,
    sortKey,
    activeSort,
    direction,
    align = "left",
    onSort,
}: {
    label: string;
    sortKey: SpanSort;
    activeSort: SpanSort;
    direction: SortDirection;
    align?: "left" | "right";
    onSort: (sort: SpanSort) => void;
}) {
    const active = activeSort === sortKey;

    return (
        <TableHead
            aria-sort={
                active
                    ? direction === "asc"
                        ? "ascending"
                        : "descending"
                    : "none"
            }
            className={cn("h-8", align === "right" && "text-right")}
        >
            <button
                className={cn(
                    "inline-flex items-center gap-1 hover:text-foreground",
                    align === "right" && "w-full justify-end"
                )}
                onClick={() => onSort(sortKey)}
                type="button"
            >
                {label}
                {active ? (
                    direction === "asc" ? (
                        <ChevronUp className="size-3" />
                    ) : (
                        <ChevronDown className="size-3" />
                    )
                ) : null}
            </button>
        </TableHead>
    );
}

export function SpansPage() {
    const { selection } = useRange();
    const navigate = useNavigate();
    const [groupBy, setGroupBy] = useState<GroupBy>("name");
    const [name, setName] = useState("");
    const [version, setVersion] = useState("");
    const [sort, setSort] = useState<SpanSort>("calls");
    const [direction, setDirection] = useState<SortDirection>("desc");
    const deferredName = useDeferredValue(name);
    const deferredVersion = useDeferredValue(version);
    const hasFilters = name !== "" || version !== "";

    const toggleSort = (next: SpanSort) => {
        if (next === sort) {
            setDirection((current) => (current === "asc" ? "desc" : "asc"));
            return;
        }
        setSort(next);
        setDirection(next === "name" ? "asc" : "desc");
    };

    const query = useQuery({
        queryKey: [
            "spans",
            selection.from,
            selection.to,
            groupBy,
            deferredName,
            deferredVersion,
            sort,
            direction,
        ],
        queryFn: () =>
            fetchSpans({
                ...selection,
                groupBy,
                name: deferredName,
                version: deferredVersion,
                sort,
                direction,
            }),
        placeholderData: keepPreviousData,
    });

    const rows = query.data?.rows ?? [];
    const groupLabel =
        GROUPS.find((group) => group.value === groupBy)?.label ?? "Span name";

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
                    aria-label="Filter by span name"
                    className="w-44"
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Filter span"
                    size="sm"
                    type="search"
                    value={name}
                />
                <div className="w-36">
                    <Select
                        items={GROUPS}
                        onValueChange={(next) => {
                            if (typeof next === "string") {
                                setGroupBy(next as GroupBy);
                            }
                        }}
                        value={groupBy}
                    >
                        <SelectTrigger aria-label="Group by" size="sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectPopup>
                            {GROUPS.map((group) => (
                                <SelectItem
                                    key={group.value}
                                    value={group.value}
                                >
                                    {group.label}
                                </SelectItem>
                            ))}
                        </SelectPopup>
                    </Select>
                </div>
                <Input
                    aria-label="Filter by version"
                    className="w-32"
                    onChange={(event) => setVersion(event.target.value)}
                    placeholder="Version"
                    size="sm"
                    type="search"
                    value={version}
                />
                {hasFilters ? (
                    <Button
                        aria-label="Clear filters"
                        onClick={() => {
                            setName("");
                            setVersion("");
                        }}
                        size="icon-xs"
                        variant="ghost"
                    >
                        <X />
                    </Button>
                ) : null}
            </PageToolbar>

            <div className="px-2 pb-2">
                <Frame className="gap-1">
                    <FramePanel className="p-0">
                        {query.isPending ? (
                            <TableSkeleton
                                columns={[
                                    { label: groupLabel },
                                    { align: "right", label: "Calls" },
                                    { align: "right", label: "Avg" },
                                    { align: "right", label: "p50" },
                                    { align: "right", label: "p95" },
                                    { align: "right", label: "p99" },
                                    { align: "right", label: "Max" },
                                ]}
                            />
                        ) : query.error ? (
                            <div className="p-3">
                                <QueryError
                                    error={query.error}
                                    retry={() => void query.refetch()}
                                />
                            </div>
                        ) : rows.length === 0 ? (
                            <EmptyBlock
                                description="No spans match this range and filter."
                                icon={<ChartNoAxesColumn />}
                                title="No spans"
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
                                            label={groupLabel}
                                            onSort={toggleSort}
                                            sortKey="name"
                                        />
                                        <SortHead
                                            activeSort={sort}
                                            align="right"
                                            direction={direction}
                                            label="Calls"
                                            onSort={toggleSort}
                                            sortKey="calls"
                                        />
                                        <SortHead
                                            activeSort={sort}
                                            align="right"
                                            direction={direction}
                                            label="Avg"
                                            onSort={toggleSort}
                                            sortKey="avg"
                                        />
                                        <SortHead
                                            activeSort={sort}
                                            align="right"
                                            direction={direction}
                                            label="p50"
                                            onSort={toggleSort}
                                            sortKey="p50"
                                        />
                                        <SortHead
                                            activeSort={sort}
                                            align="right"
                                            direction={direction}
                                            label="p95"
                                            onSort={toggleSort}
                                            sortKey="p95"
                                        />
                                        <SortHead
                                            activeSort={sort}
                                            align="right"
                                            direction={direction}
                                            label="p99"
                                            onSort={toggleSort}
                                            sortKey="p99"
                                        />
                                        <SortHead
                                            activeSort={sort}
                                            align="right"
                                            direction={direction}
                                            label="Max"
                                            onSort={toggleSort}
                                            sortKey="max"
                                        />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.map((row) => (
                                        <TableRow
                                            className={
                                                groupBy === "name"
                                                    ? "cursor-pointer"
                                                    : undefined
                                            }
                                            key={row.bucket}
                                            onClick={
                                                groupBy === "name"
                                                    ? () =>
                                                          void navigate({
                                                              params: {
                                                                  spanName:
                                                                      row.bucket,
                                                              },
                                                              to: "/spans/$spanName",
                                                          })
                                                    : undefined
                                            }
                                        >
                                            <TableCell className="font-medium">
                                                {groupBy === "name" ? (
                                                    <Link
                                                        className="font-mono hover:underline"
                                                        params={{
                                                            spanName:
                                                                row.bucket,
                                                        }}
                                                        to="/spans/$spanName"
                                                    >
                                                        {row.bucket}
                                                    </Link>
                                                ) : (
                                                    displayLabel(row.bucket)
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right font-mono tabular-nums">
                                                {formatCount(row.calls)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-muted-foreground tabular-nums">
                                                {formatDuration(row.avgUs)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono tabular-nums">
                                                {formatDuration(row.p50Us)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono tabular-nums">
                                                {formatDuration(row.p95Us)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono tabular-nums">
                                                {formatDuration(row.p99Us)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-muted-foreground tabular-nums">
                                                {formatDuration(row.maxUs)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </FramePanel>
                </Frame>
            </div>
        </div>
    );
}
