create table batches (
    id uuid primary key,
    received_at timestamptz not null,
    schema_version integer not null,
    app_version text not null,
    build_profile text not null,
    os text not null,
    arch text not null,
    cpu_tier text not null,
    dropped_traces bigint not null,
    payload jsonb not null
);

create index batches_received_at_idx on batches (received_at);

create table traces (
    id bigserial primary key,
    batch_id uuid not null references batches (id) on delete cascade,
    trace_index integer not null,
    root text not null,
    received_at timestamptz not null,
    duration_us bigint not null,
    span_count integer not null,
    error_count integer not null,
    app_version text not null,
    build_profile text not null,
    os text not null,
    arch text not null,
    cpu_tier text not null,
    unique (batch_id, trace_index)
);

create index traces_received_at_idx on traces (received_at);
create index traces_version_received_at_idx on traces (app_version, received_at);
create index traces_root_received_at_idx on traces (root, received_at);
create index traces_batch_id_idx on traces (batch_id);

create table spans (
    id bigserial primary key,
    trace_id bigint not null references traces (id) on delete cascade,
    path text not null,
    name text not null,
    depth integer not null,
    start_us bigint not null,
    duration_us bigint not null,
    attributes jsonb not null default '{}'::jsonb,
    error_code text,
    error_kind text,
    received_at timestamptz not null
);

create index spans_trace_id_idx on spans (trace_id);
create index spans_name_received_at_idx on spans (name, received_at);
create index spans_received_at_idx on spans (received_at);

create table errors (
    id bigserial primary key,
    batch_id uuid not null references batches (id) on delete cascade,
    trace_id bigint references traces (id) on delete cascade,
    span_path text,
    code text not null,
    kind text not null,
    message text,
    sources jsonb not null default '[]'::jsonb,
    app_version text not null,
    received_at timestamptz not null
);

create index errors_code_received_at_idx on errors (code, received_at);
create index errors_version_received_at_idx on errors (app_version, received_at);
create index errors_received_at_idx on errors (received_at);
