-- Goal / Day / DaySchedule (requirements §8, GOAL-001, DAY-001, DAY-002).
-- Rules that need another row (parent type, child period, WEEK Goal period)
-- are enforced by the API services; the constraints below guard single rows
-- and relationships.

create table goals (
    id              uuid         primary key,
    parent_goal_id  uuid         references goals (id) on delete restrict,
    type            varchar(16)  not null,
    title           varchar(200) not null,
    why             varchar(2000) not null,
    start_date      date         not null,
    end_date        date         not null,
    priority        integer      not null,
    progress_policy varchar(16)  not null,
    created_at      timestamptz  not null,
    updated_at      timestamptz  not null,
    version         bigint       not null,
    constraint goals_type_check check (type in ('YEAR', 'QUARTER', 'MONTH', 'WEEK')),
    constraint goals_progress_policy_check check (progress_policy in ('AUTO', 'MANUAL')),
    constraint goals_period_check check (start_date <= end_date),
    constraint goals_priority_check check (priority >= 0),
    -- Only YEAR Goals are roots.
    constraint goals_root_check check ((type = 'YEAR') = (parent_goal_id is null))
);

create index goals_parent_goal_id_idx on goals (parent_goal_id);
create index goals_type_period_idx on goals (type, start_date, end_date);

create table days (
    id                uuid         primary key,
    -- Must reference a WEEK Goal (checked by the API).
    goal_id           uuid         not null references goals (id) on delete restrict,
    title             varchar(200) not null,
    status            varchar(16)  not null,
    priority          integer      not null,
    estimated_minutes integer      not null,
    -- NULL is a valid "date not decided yet" state.
    planned_date      date,
    planning_mode     varchar(16)  not null,
    core_day          boolean      not null,
    created_at        timestamptz  not null,
    updated_at        timestamptz  not null,
    version           bigint       not null,
    constraint days_status_check check (status in ('NOT_STARTED', 'IN_PROGRESS', 'DONE', 'DEFERRED', 'SKIPPED')),
    constraint days_planning_mode_check check (planning_mode in ('FIXED', 'WINDOW', 'ANYTIME')),
    constraint days_priority_check check (priority >= 0),
    constraint days_estimated_minutes_check check (estimated_minutes > 0)
);

create index days_goal_id_idx on days (goal_id);
create index days_planned_date_idx on days (planned_date);

create table day_schedules (
    id         uuid        primary key,
    -- UNIQUE makes the relationship 0..1 per Day. Deleting a Day removes its
    -- schedule; deleting a schedule never touches the Day.
    day_id     uuid        not null unique references days (id) on delete cascade,
    start_at   timestamptz not null,
    end_at     timestamptz not null,
    -- IANA timezone used to resolve the schedule's local date.
    timezone   varchar(64) not null,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    version    bigint      not null,
    constraint day_schedules_range_check check (end_at > start_at)
);
