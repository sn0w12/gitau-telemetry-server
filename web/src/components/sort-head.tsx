import { ChevronDown, ChevronUp } from "lucide-react";

import { TableHead } from "@/components/ui/table";
import type { SortDirection } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SortHead<Key extends string>({
    label,
    sortKey,
    activeSort,
    direction,
    align = "left",
    onSort,
}: {
    label: string;
    sortKey: Key;
    activeSort: Key;
    direction: SortDirection;
    align?: "left" | "right";
    onSort: (sort: Key) => void;
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
