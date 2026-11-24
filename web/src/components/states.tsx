import { RotateCw, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyMedia,
    EmptyTitle,
} from "@/components/ui/empty";
import { Frame, FramePanel } from "@/components/ui/frame";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface SkeletonColumn {
    label: string;
    align?: "left" | "right";
}

export function TableSkeleton({
    columns,
    rows = 8,
}: {
    columns: SkeletonColumn[];
    rows?: number;
}) {
    return (
        <Table
            className="text-xs"
            containerClassName="overflow-hidden rounded-[inherit]"
        >
            <TableHeader>
                <TableRow>
                    {columns.map((column) => (
                        <TableHead
                            className={cn(
                                column.align === "right" && "text-right"
                            )}
                            key={column.label}
                        >
                            {column.label}
                        </TableHead>
                    ))}
                </TableRow>
            </TableHeader>
            <TableBody>
                {Array.from({ length: rows }).map((_, row) => (
                    <TableRow key={row}>
                        {columns.map((column, index) => (
                            <TableCell
                                className={cn(
                                    column.align === "right" && "text-right"
                                )}
                                key={column.label}
                            >
                                <Skeleton
                                    className={cn(
                                        "h-3",
                                        index === 0 ? "w-32" : "w-16",
                                        column.align === "right" && "ml-auto"
                                    )}
                                />
                            </TableCell>
                        ))}
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

export function QueryError({
    error,
    retry,
}: {
    error: unknown;
    retry?: () => void;
}) {
    const message =
        error instanceof Error ? error.message : "The request failed.";

    return (
        <Frame>
            <FramePanel className="flex items-center gap-2.5 border-destructive/24 p-3">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-destructive/24 bg-destructive/8 text-destructive-foreground">
                    <TriangleAlert className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium">
                        Could not load telemetry
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                        {message}
                    </div>
                </div>
                {retry ? (
                    <Button onClick={retry} size="xs" variant="outline">
                        <RotateCw />
                        Retry
                    </Button>
                ) : null}
            </FramePanel>
        </Frame>
    );
}

export function EmptyBlock({
    icon,
    title,
    description,
    children,
}: {
    icon: ReactNode;
    title: string;
    description?: string;
    children?: ReactNode;
}) {
    return (
        <Empty className="py-10">
            <EmptyMedia variant="icon">{icon}</EmptyMedia>
            <EmptyContent>
                <div>
                    <EmptyTitle className="text-base">{title}</EmptyTitle>
                    {description ? (
                        <EmptyDescription>{description}</EmptyDescription>
                    ) : null}
                </div>
                {children}
            </EmptyContent>
        </Empty>
    );
}
