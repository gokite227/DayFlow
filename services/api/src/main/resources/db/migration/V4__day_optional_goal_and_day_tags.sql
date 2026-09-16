-- DAY-001 optional Goal, DAY-004 priority range, DAY-005 user defined Tags (requirements §8.5).
-- Existing Day/Goal links and priority values are kept: only the NOT NULL rule is dropped.

alter table days alter column goal_id drop not null;

-- priority keeps its integer storage; only the meaning is fixed (0=NONE, 1=LOW, 2=MEDIUM, 3=HIGH).
alter table days drop constraint days_priority_check;
alter table days add constraint days_priority_check check (priority between 0 and 3);

create table day_tags (
    id         uuid        primary key,
    name       varchar(30) not null,
    -- One of the DayFlow palette colors (checked by the API).
    color      varchar(16) not null,
    sort_order integer     not null,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    version    bigint      not null,
    constraint day_tags_name_check check (length(btrim(name)) > 0)
);

-- Tag names are unique regardless of case ("운동" vs "운동", "Work" vs "work").
create unique index day_tags_name_lower_idx on day_tags (lower(name));
create index day_tags_sort_order_idx on day_tags (sort_order);

create table day_tag_links (
    -- Deleting a Day or a Tag removes only the link rows, never the other side.
    day_id uuid not null references days (id) on delete cascade,
    tag_id uuid not null references day_tags (id) on delete cascade,
    primary key (day_id, tag_id)
);

create index day_tag_links_tag_id_idx on day_tag_links (tag_id);
