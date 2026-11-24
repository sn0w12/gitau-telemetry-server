import type {
    AverageWaterfall,
    BucketUnit,
    ErrorSummary,
    GroupBy,
    Overview,
    SeriesResponse,
    SortDirection,
    SpanSort,
    SpanSummary,
    SystemStatus,
    TraceDetail,
    TracePage,
    TraceSort,
} from "@/lib/types";

export class ApiError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "ApiError";
        this.status = status;
    }
}

type Params = Record<string, string | number | boolean | null | undefined>;

async function get<T>(path: string, params: Params = {}): Promise<T> {
    const url = new URL(path, window.location.origin);
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === "") continue;
        url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
    });
    if (!response.ok) {
        let message = response.statusText || `HTTP ${response.status}`;
        try {
            const body = (await response.json()) as { error?: unknown };
            if (typeof body.error === "string") message = body.error;
        } catch {
            // The status text is enough when the error body is not JSON.
        }
        throw new ApiError(response.status, message);
    }
    return (await response.json()) as T;
}

export interface TimeRange {
    from: string;
    to: string;
}

export function fetchOverview(range: TimeRange): Promise<Overview> {
    return get("/v1/admin/overview", { from: range.from, to: range.to });
}

export function fetchSeries(
    range: TimeRange,
    bucket: BucketUnit,
    span?: string
): Promise<SeriesResponse> {
    return get("/v1/admin/series", {
        from: range.from,
        to: range.to,
        bucket,
        span,
    });
}

export interface SpanFilters extends TimeRange {
    name?: string;
    groupBy: GroupBy;
    version?: string;
    sort?: SpanSort;
    direction?: SortDirection;
}

export function fetchSpans(filters: SpanFilters): Promise<SpanSummary> {
    return get("/v1/admin/spans", {
        from: filters.from,
        to: filters.to,
        name: filters.name,
        version: filters.version,
        groupBy: filters.groupBy,
        sort: filters.sort,
        direction: filters.direction,
    });
}

export interface ErrorFilters extends TimeRange {
    code?: string;
    version?: string;
}

export function fetchErrors(filters: ErrorFilters): Promise<ErrorSummary> {
    return get("/v1/admin/errors", {
        from: filters.from,
        to: filters.to,
        code: filters.code,
        version: filters.version,
    });
}

export interface TraceFilters extends TimeRange {
    root?: string;
    version?: string;
    errorsOnly?: boolean;
    span?: string;
    sort?: TraceSort;
    direction?: SortDirection;
    offset?: number;
    limit?: number;
}

export function fetchTraces(filters: TraceFilters): Promise<TracePage> {
    return get("/v1/admin/traces", {
        from: filters.from,
        to: filters.to,
        root: filters.root,
        version: filters.version,
        errorsOnly: filters.errorsOnly || undefined,
        span: filters.span || undefined,
        sort: filters.sort,
        direction: filters.direction,
        offset: filters.offset,
        limit: filters.limit,
    });
}

export function fetchSpanWaterfall(
    name: string,
    range: TimeRange
): Promise<AverageWaterfall> {
    return get(`/v1/admin/spans/${encodeURIComponent(name)}/waterfall`, {
        from: range.from,
        to: range.to,
    });
}

export function fetchTrace(id: number): Promise<TraceDetail> {
    return get(`/v1/admin/traces/${id}`);
}

export function fetchSystem(): Promise<SystemStatus> {
    return get("/v1/admin/system");
}
