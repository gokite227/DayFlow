-- Period Goals are independent date ranges. Existing rows remain strict calendar Goals.
alter table goals add column kind varchar(16) not null default 'CALENDAR';

alter table goals drop constraint goals_root_check;
alter table goals alter column type drop not null;

alter table goals add constraint goals_kind_check
    check (kind in ('CALENDAR', 'PERIOD'));

alter table goals add constraint goals_kind_shape_check check (
    (kind = 'CALENDAR'
        and type is not null
        and ((type = 'YEAR') = (parent_goal_id is null)))
    or
    (kind = 'PERIOD'
        and type is null
        and parent_goal_id is null)
);

create index goals_user_kind_period_idx on goals (user_id, kind, start_date, end_date);
