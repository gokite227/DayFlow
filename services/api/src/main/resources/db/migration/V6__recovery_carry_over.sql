-- REC-001..005 Recovery redesign: CARRY_OVER, continuation links and the re-surface rule (requirements §4.8, §4.9, §8.6).
-- Additive only: existing rows keep null in every new column.

-- A Day created by Carry Over points at the Day it continues. Deleting the source keeps the destination.
alter table days add column carried_from_day_id uuid references days (id) on delete set null;
create index days_carried_from_day_id_idx on days (carried_from_day_id);

-- A Goal created to continue a plan in a later period points at the Goal it continues.
alter table goals add column continued_from_goal_id uuid references goals (id) on delete set null;
create index goals_continued_from_goal_id_idx on goals (continued_from_goal_id);

alter table recovery_event_items drop constraint recovery_event_items_action_check;
-- 'CARRY_OVER' does not fit the old varchar(8).
alter table recovery_event_items alter column action type varchar(16);
alter table recovery_event_items add constraint recovery_event_items_action_check
    check (action in ('KEEP', 'REDUCE', 'MOVE', 'CARRY_OVER', 'DROP'));

-- History: the title when the decision was made (the Day may be renamed or deleted later)
-- and the Day created by CARRY_OVER.
alter table recovery_event_items add column day_title varchar(200);
alter table recovery_event_items add column destination_day_id uuid references days (id) on delete set null;

-- REC-005: the Day's planning values right after the decision (date, schedule, Goal, status, estimate).
-- While the Day still has exactly this state it is not offered again as missed.
alter table recovery_event_items add column planning_state varchar(300);

create index recovery_event_items_day_id_idx on recovery_event_items (day_id);
