-- Event (EVT-001..005, NOTI-001), requirements §8.1 and §8.4.
-- An Event is a schedule that happens to the user; it is a separate domain from Day.

create table events (
    id                 uuid          primary key,
    title              varchar(200)  not null,
    type               varchar(16)   not null,
    all_day            boolean       not null,
    -- Timed Events only (UTC instants).
    start_at           timestamptz,
    end_at             timestamptz,
    -- All-day Events only (calendar dates in the Event timezone, never UTC midnight instants).
    start_date         date,
    end_date_exclusive date,
    -- IANA timezone: wall-clock, recurrence and reminder base for both kinds.
    timezone           varchar(64)   not null,
    location           varchar(200),
    notes              varchar(2000),
    recurrence         varchar(16)   not null,
    -- Deleting the Goal keeps the Event and only clears the link.
    linked_goal_id     uuid          references goals (id) on delete set null,
    created_at         timestamptz   not null,
    updated_at         timestamptz   not null,
    version            bigint        not null,
    constraint events_type_check
        check (type in ('BIRTHDAY', 'INTERVIEW', 'EXAM', 'DEADLINE', 'APPOINTMENT', 'OTHER')),
    constraint events_recurrence_check
        check (recurrence in ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY')),
    -- Timed and all-day fields must never be mixed.
    constraint events_time_shape_check check (
        (all_day = false
            and start_at is not null and end_at is not null
            and start_date is null and end_date_exclusive is null
            and end_at >= start_at)
        or
        (all_day = true
            and start_date is not null and end_date_exclusive is not null
            and start_at is null and end_at is null
            and end_date_exclusive > start_date)
    )
);

create index events_linked_goal_id_idx on events (linked_goal_id);
create index events_type_idx on events (type);

-- Reminders are part of their Event (versioned through it). The limit of 5 per Event is
-- checked by the API service because a CHECK constraint cannot count rows.
create table event_reminders (
    id             uuid    primary key,
    event_id       uuid    not null references events (id) on delete cascade,
    -- Minutes before the occurrence start (all-day: 09:00 in the Event timezone).
    offset_minutes integer not null,
    constraint event_reminders_offset_check check (offset_minutes between 0 and 43200),
    constraint event_reminders_event_offset_unique unique (event_id, offset_minutes)
);
