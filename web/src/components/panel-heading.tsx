import type { ReactNode } from "react";

export function PanelHeading({
    children,
    aside,
}: {
    children: ReactNode;
    aside?: ReactNode;
}) {
    return (
        <div className="flex items-center justify-between gap-2 pb-2">
            <h2 className="text-sm font-semibold">{children}</h2>
            {aside}
        </div>
    );
}
