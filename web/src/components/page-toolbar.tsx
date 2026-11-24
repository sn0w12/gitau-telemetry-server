import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PageToolbar({
    children,
    actions,
}: {
    children?: ReactNode;
    actions?: ReactNode;
}) {
    return (
        <div className="flex flex-wrap items-center gap-2 p-2">
            {children}
            <div className="ml-auto flex items-center gap-1.5">{actions}</div>
        </div>
    );
}

export function RefreshButton() {
    const queryClient = useQueryClient();
    const fetching = useIsFetching() > 0;

    return (
        <Button
            aria-label="Refresh"
            className="size-[calc(var(--spacing)*9.5)] sm:size-[calc(var(--spacing)*8.5)]"
            onClick={() => void queryClient.invalidateQueries()}
            size="icon"
            variant="ghost"
        >
            <RefreshCw className={cn("size-4", fetching && "animate-spin")} />
        </Button>
    );
}
