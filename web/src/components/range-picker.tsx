import { useRange } from "@/components/range-provider";
import {
    SegmentedControl,
    SegmentedControlItem,
} from "@/components/ui/segmented-control";
import { RANGE_OPTIONS, type RangeKey } from "@/lib/range";

export function RangePicker() {
    const { selection, setKey } = useRange();

    return (
        <SegmentedControl
            aria-label="Time range"
            onValueChange={(next) => setKey(next as RangeKey)}
            value={selection.key}
        >
            {RANGE_OPTIONS.map((option) => (
                <SegmentedControlItem key={option.key} value={option.key}>
                    {option.label}
                </SegmentedControlItem>
            ))}
        </SegmentedControl>
    );
}
