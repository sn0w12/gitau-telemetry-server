"use client";

import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";

import {
    segmentedControlItemVariants,
    segmentedControlRootClassName,
    type SegmentedControlSize,
} from "@/lib/segmented-control";
import { cn } from "@/lib/utils";

export function SegmentedControl<Value extends string>({
    value,
    onValueChange,
    size = "default",
    className,
    children,
    ...props
}: Omit<
    React.ComponentProps<typeof ToggleGroup<Value>>,
    "value" | "onValueChange" | "multiple"
> & {
    value: Value;
    onValueChange: (value: Value) => void;
    size?: SegmentedControlSize;
    children: ReactNode;
}) {
    const rootRef = useRef<HTMLDivElement>(null);
    const [indicator, setIndicator] = useState({ left: 0, width: 0 });

    const measure = useCallback(() => {
        const root = rootRef.current;
        const active = root?.querySelector<HTMLElement>("[data-pressed]");
        if (!root || !active) return;
        const rootRect = root.getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();
        setIndicator({
            left: activeRect.left - rootRect.left,
            width: activeRect.width,
        });
    }, []);

    useLayoutEffect(() => {
        measure();
    }, [measure, value]);

    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        const observer = new ResizeObserver(measure);
        observer.observe(root);
        return () => observer.disconnect();
    }, [measure]);

    return (
        <ToggleGroup
            className={cn(segmentedControlRootClassName, className)}
            data-slot="segmented-control"
            multiple={false}
            onValueChange={(next) => {
                const selected = next[0];
                if (selected) onValueChange(selected as Value);
            }}
            ref={rootRef}
            value={[value]}
            {...props}
        >
            <span
                aria-hidden="true"
                className="pointer-events-none absolute top-0.5 bottom-0.5 z-0 rounded-md bg-background shadow-sm/5 transition-[left,width] duration-200 ease-in-out dark:bg-input"
                style={{ left: indicator.left, width: indicator.width }}
            />
            {children}
        </ToggleGroup>
    );
}

export function SegmentedControlItem<Value extends string>({
    value,
    size = "default",
    className,
    children,
    ...props
}: React.ComponentProps<typeof Toggle<Value>> & {
    size?: SegmentedControlSize;
}) {
    return (
        <Toggle
            className={cn(
                segmentedControlItemVariants({ size }),
                "relative z-10 data-[pressed]:text-foreground",
                className
            )}
            value={value}
            {...props}
        >
            {children}
        </Toggle>
    );
}
