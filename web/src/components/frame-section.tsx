import type { ReactNode } from "react";

import { FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { cn } from "@/lib/utils";

export function FrameSection({
    title,
    aside,
    panelClassName,
    children,
}: {
    title: string;
    aside?: ReactNode;
    panelClassName?: string;
    children: ReactNode;
}) {
    return (
        <>
            <FrameHeader className="flex flex-row items-center justify-between">
                <FrameTitle>{title}</FrameTitle>
                {aside}
            </FrameHeader>
            <FramePanel className={cn(panelClassName)}>{children}</FramePanel>
        </>
    );
}
