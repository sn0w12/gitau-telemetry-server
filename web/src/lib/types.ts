export interface Bucket {
    value: string;
    count: number;
}

export interface Overview {
    from: string;
    to: string;
    batches: number;
    traces: number;
    spans: number;
    errors: number;
    errorRate: number;
    versions: Bucket[];
    buildProfiles: Bucket[];
    os: Bucket[];
    arch: Bucket[];
    cpuTiers: Bucket[];
}

export type GroupBy =
    | "name"
    | "version"
    | "os"
    | "arch"
    | "cpu"
    | "buildProfile";

export type SpanSort = "name" | "calls" | "avg" | "p50" | "p95" | "p99" | "max";

export type TraceSort =
    | "root"
    | "received"
    | "duration"
    | "spans"
    | "errors"
    | "version";

export type SortDirection = "asc" | "desc";

export interface SpanBucket {
    bucket: string;
    calls: number;
    avgUs: number;
    p50Us: number;
    p95Us: number;
    p99Us: number;
    maxUs: number;
}

export interface SpanSummary {
    from: string;
    to: string;
    groupBy: GroupBy;
    rows: SpanBucket[];
}

export interface ErrorBucket {
    code: string;
    kind: string;
    count: number;
    firstSeen: string;
    lastSeen: string;
    sampleMessage: string | null;
}

export interface ErrorSummary {
    from: string;
    to: string;
    rows: ErrorBucket[];
}

export interface TraceRow {
    id: number;
    batchId: string;
    root: string;
    receivedAt: string;
    durationUs: number;
    spanCount: number;
    errorCount: number;
    appVersion: string;
    buildProfile: string;
    os: string;
    arch: string;
    cpuTier: string;
}

export interface TracePage {
    traces: TraceRow[];
    total: number;
}

export interface AverageWaterfall {
    from: string;
    to: string;
    span: string;
    traces: number;
    root: SpanNode;
    durationUs: number;
}

export interface TraceDetail extends TraceRow {
    tree: TraceTree;
}

export type BucketUnit = "minute" | "hour" | "day";

export interface SeriesPoint {
    bucket: string;
    traces: number;
    spans: number;
    errors: number;
    avgUs: number | null;
    p95Us: number | null;
}

export interface SeriesResponse {
    from: string;
    to: string;
    bucket: BucketUnit;
    rows: SeriesPoint[];
}

export interface StorageBucket {
    table: string;
    bytes: number;
}

export interface SystemStatus {
    firstBatchAt: string | null;
    lastBatchAt: string | null;
    batches: number;
    traces: number;
    spans: number;
    errors: number;
    databaseBytes: number;
    serverTime: string;
    retentionDays: number;
    storage: StorageBucket[];
    rateLimitPerMinute: number;
    maxBodyBytes: number;
}

export type AttrValue = boolean | number | string;

export interface ErrorRecord {
    code: string;
    kind: string;
    message?: string | null;
    sources?: string[];
    atUnixMs?: number | null;
}

export interface SpanNode {
    name: string;
    startUs: number;
    durationUs: number;
    attributes?: Record<string, AttrValue>;
    error?: ErrorRecord | null;
    children?: SpanNode[];
}

export interface TraceTree {
    startUnixMs: number;
    durationUs: number;
    droppedSpans?: number;
    root: SpanNode;
}
