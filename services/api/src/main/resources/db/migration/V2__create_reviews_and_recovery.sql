-- Review (REV-001..004) and Recovery (REC-001, REC-002), requirements §8.1.

create table reviews (
    id           uuid        primary key,
    type         varchar(16) not null,
    period_start date        not null,
    period_end   date        not null,
    -- Satisfaction 1..5; NULL until the user rates the period.
    rating       integer,
    completed    boolean     not null,
    created_at   timestamptz not null,
    updated_at   timestamptz not null,
    version      bigint      not null,
    constraint reviews_type_check check (type in ('DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR')),
    constraint reviews_period_check check (period_start <= period_end),
    constraint reviews_rating_check check (rating is null or rating between 1 and 5),
    -- One review per period.
    constraint reviews_type_period_unique unique (type, period_start)
);

create table review_items (
    id               uuid          primary key,
    review_id        uuid          not null references reviews (id) on delete cascade,
    kind             varchar(16)   not null,
    content          varchar(1000) not null,
    position         integer       not null,
    -- The Day created from a TRY item (REV-004 idempotency). Deleting that Day keeps the item.
    converted_day_id uuid          references days (id) on delete set null,
    constraint review_items_kind_check check (kind in ('KEEP', 'PROBLEM', 'TRY'))
);

create index review_items_review_id_idx on review_items (review_id);

-- REC-002: a day the user explicitly marks for recovery, with an optional return date.
create table recovery_days (
    id            uuid         primary key,
    recovery_date date         not null unique,
    return_date   date,
    note          varchar(500) not null,
    created_at    timestamptz  not null,
    updated_at    timestamptz  not null,
    version       bigint       not null,
    constraint recovery_days_return_check check (return_date is null or return_date > recovery_date)
);

-- REC-001: one applied recovery plan (append-only) and what it changed per Day.
create table recovery_events (
    id         uuid        primary key,
    local_date date        not null,
    applied_at timestamptz not null
);

create table recovery_event_items (
    id                         uuid        primary key,
    event_id                   uuid        not null references recovery_events (id) on delete cascade,
    day_id                     uuid        references days (id) on delete set null,
    action                     varchar(8)  not null,
    previous_status            varchar(16) not null,
    new_status                 varchar(16) not null,
    previous_planned_date      date,
    new_planned_date           date,
    previous_estimated_minutes integer     not null,
    new_estimated_minutes      integer     not null,
    constraint recovery_event_items_action_check check (action in ('KEEP', 'REDUCE', 'MOVE', 'DROP'))
);

create index recovery_event_items_event_id_idx on recovery_event_items (event_id);
create index recovery_events_local_date_idx on recovery_events (local_date);
