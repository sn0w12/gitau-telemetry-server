import { useQueryClient } from "@tanstack/react-query";
import {
    createContext,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from "react";

import { makeRange, type RangeKey, type RangeSelection } from "@/lib/range";

interface RangeContextValue {
    selection: RangeSelection;
    setKey: (key: RangeKey) => void;
    refresh: () => void;
}

const RangeContext = createContext<RangeContextValue | null>(null);

export function RangeProvider({ children }: { children: ReactNode }) {
    const [selection, setSelection] = useState<RangeSelection>(() =>
        makeRange("24h")
    );
    const queryClient = useQueryClient();

    const value = useMemo<RangeContextValue>(
        () => ({
            selection,
            setKey: (key) => setSelection(makeRange(key)),
            refresh: () => {
                setSelection(makeRange(selection.key));
                void queryClient.invalidateQueries();
            },
        }),
        [queryClient, selection]
    );

    return (
        <RangeContext.Provider value={value}>{children}</RangeContext.Provider>
    );
}

export function useRange(): RangeContextValue {
    const value = useContext(RangeContext);
    if (!value) throw new Error("useRange must be used inside RangeProvider");
    return value;
}
