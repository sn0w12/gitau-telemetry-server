import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { useDeferredValue, useState } from "react";

import { PageToolbar, RefreshButton } from "@/components/page-toolbar";
import { RangePicker } from "@/components/range-picker";
import { useRange } from "@/components/range-provider";
import { EmptyBlock, QueryError, TableSkeleton } from "@/components/states";
import { Frame, FramePanel } from "@/components/ui/frame";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { fetchErrors } from "@/lib/api";
import { formatCount, formatRelative } from "@/lib/format";

export function ErrorsPage() {
    const { selection } = useRange();
    const [code, setCode] = useState("");
    const [version, setVersion] = useState("");
    const deferredCode = useDeferredValue(code);
    const deferredVersion = useDeferredValue(version);

    const query = useQuery({
        queryKey: [
            "errors",
            selection.from,
            selection.to,
            deferredCode,
            deferredVersion,
        ],
        queryFn: () =>
            fetchErrors({
                ...selection,
                code: deferredCode,
                version: deferredVersion,
            }),
        placeholderData: keepPreviousData,
    });

    const rows = query.data?.rows ?? [];

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
                    aria-label="Filter by error code"
                    className="w-48"
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="Error code"
                    size="sm"
                    type="search"
                    value={code}
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
            </PageToolbar>

            <div className="px-2 pb-2">
                <Frame className="gap-1">
                    <FramePanel className="p-0">
                        {query.isPending ? (
                            <TableSkeleton
                                columns={[
                                    { label: "Code" },
                                    { label: "Type" },
                                    { align: "right", label: "Count" },
                                    { label: "First seen" },
                                    { label: "Last seen" },
                                    { label: "Sample" },
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
                                description="No errors were recorded in this range."
                                icon={<ShieldAlert />}
                                title="No errors"
                            />
                        ) : (
                            <Table
                                className="text-xs"
                                containerClassName="overflow-hidden rounded-[inherit]"
                            >
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Code</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead className="text-right">
                                            Count
                                        </TableHead>
                                        <TableHead>First seen</TableHead>
                                        <TableHead>Last seen</TableHead>
                                        <TableHead>Sample</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.map((row) => (
                                        <TableRow
                                            key={`${row.code}:${row.kind}`}
                                        >
                                            <TableCell className="font-mono font-medium">
                                                {row.code}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {row.kind}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-destructive-foreground tabular-nums">
                                                {formatCount(row.count)}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground tabular-nums">
                                                {formatRelative(row.firstSeen)}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground tabular-nums">
                                                {formatRelative(row.lastSeen)}
                                            </TableCell>
                                            <TableCell className="max-w-80 truncate font-mono text-muted-foreground">
                                                {row.sampleMessage ?? "-"}
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
