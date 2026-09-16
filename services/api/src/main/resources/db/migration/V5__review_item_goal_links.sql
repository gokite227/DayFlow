-- REV-003 / REV-004: optional Goal links of KPT items (requirements §8.1 review_items "Goal/Day optional link").
-- Two different relations, so two columns:
--   goal_id        the Goal the KEEP/PROBLEM/TRY line reflects on (the period being reviewed)
--   target_goal_id for TRY only, the later Goal the user chose to carry the Try into
-- Deleting a Goal keeps the review lines and only clears the link.

alter table review_items add column goal_id uuid references goals (id) on delete set null;
alter table review_items add column target_goal_id uuid references goals (id) on delete set null;

alter table review_items add constraint review_items_target_goal_try_check
    check (target_goal_id is null or kind = 'TRY');

create index review_items_goal_id_idx on review_items (goal_id);
create index review_items_target_goal_id_idx on review_items (target_goal_id);
