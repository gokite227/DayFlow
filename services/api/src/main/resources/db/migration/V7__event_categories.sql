-- EVT-006: user defined Event Categories replace the fixed events.type enum (requirements §4.4, §8.6).
-- Existing Events keep every other column; each one points at the Category of its former type.

create table event_categories (
    id         uuid        primary key,
    name       varchar(30) not null,
    -- One of the DayFlow Event palette colors (checked by the API).
    color      varchar(16) not null,
    sort_order integer     not null,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    version    bigint      not null,
    constraint event_categories_name_check check (length(btrim(name)) > 0)
);

-- Names are unique regardless of case, like Day Tags ("Interview" and "interview" are the same).
create unique index event_categories_name_lower_idx on event_categories (lower(name));
create index event_categories_sort_order_idx on event_categories (sort_order);

-- The default Categories are ordinary rows: they can be renamed, recolored, reordered and deleted.
-- Their colors are the ones the fixed types used, so existing Events look the same.
insert into event_categories (id, name, color, sort_order, created_at, updated_at, version) values
    (gen_random_uuid(), '일정', '#66707a', 0, now(), now(), 0),
    (gen_random_uuid(), '생일', '#d9822b', 1, now(), now(), 0),
    (gen_random_uuid(), '면접', '#3a78b8', 2, now(), now(), 0),
    (gen_random_uuid(), '시험', '#7453c2', 3, now(), now(), 0),
    (gen_random_uuid(), '마감', '#cf3f5c', 4, now(), now(), 0),
    (gen_random_uuid(), '약속', '#2a927f', 5, now(), now(), 0);

-- Deleting a Category keeps its Events; they become uncategorized ("미분류").
alter table events add column category_id uuid references event_categories (id) on delete set null;

-- Map the former type to its Category. Only category_id is written: version and updated_at stay as they were.
update events e
set category_id = c.id
from event_categories c
where c.name = case e.type
    when 'OTHER' then '일정'
    when 'BIRTHDAY' then '생일'
    when 'INTERVIEW' then '면접'
    when 'EXAM' then '시험'
    when 'DEADLINE' then '마감'
    when 'APPOINTMENT' then '약속'
end;

-- The Category reference is now the only source of an Event's kind.
drop index events_type_idx;
alter table events drop constraint events_type_check;
alter table events drop column type;

create index events_category_id_idx on events (category_id);
