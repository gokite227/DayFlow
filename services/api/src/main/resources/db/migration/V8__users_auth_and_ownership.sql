-- AUTH-001..005: Google-first sign-in, DayFlow users and per-user ownership of all planning data
-- (requirements §4.10, §8.7, §12).
--
-- The single-user development data is intentionally not kept: there is no legacy owner to hand it to, so
-- the planning tables are emptied before user_id becomes NOT NULL. On a fresh database this is a no-op, so
-- V1 → V8 applies the same way with or without earlier rows.

truncate table recovery_event_items, recovery_events, recovery_days, review_items, reviews,
    event_reminders, events, event_categories, day_tag_links, day_tags, day_schedules, days, goals;

-- A DayFlow user. The email is profile data from the provider, not an identity: two users may share it.
create table users (
    id           uuid          primary key,
    email        varchar(320)  not null,
    display_name varchar(200)  not null,
    avatar_url   varchar(2000),
    created_at   timestamptz   not null,
    updated_at   timestamptz   not null,
    version      bigint        not null
);

-- How a user signs in. The provider's stable subject (Google "sub") identifies the user, never the email,
-- so the same subject is always the same user and a different subject is always a different user.
create table user_identities (
    id                 uuid         primary key,
    user_id            uuid         not null references users (id) on delete cascade,
    provider           varchar(16)  not null,
    provider_subject   varchar(255) not null,
    email_at_link_time varchar(320),
    created_at         timestamptz  not null,
    constraint user_identities_provider_check check (provider in ('GOOGLE')),
    constraint user_identities_provider_subject_unique unique (provider, provider_subject)
);

create index user_identities_user_id_idx on user_identities (user_id);

-- One-time code handed to the Web/Mobile callback after the provider login (never a token in a URL).
-- Only the SHA-256 hash of the code is stored; it is bound to the PKCE challenge and the platform.
create table auth_exchange_codes (
    id             uuid         primary key,
    code_hash      varchar(64)  not null unique,
    user_id        uuid         not null references users (id) on delete cascade,
    code_challenge varchar(128) not null,
    platform       varchar(16)  not null,
    return_to      varchar(500),
    expires_at     timestamptz  not null,
    used_at        timestamptz,
    created_at     timestamptz  not null,
    constraint auth_exchange_codes_platform_check check (platform in ('WEB', 'MOBILE'))
);

create index auth_exchange_codes_expires_at_idx on auth_exchange_codes (expires_at);

-- Opaque refresh tokens (hash only). Every refresh rotates the token inside the same family; presenting a
-- rotated token again revokes the family (reuse detection). Logout revokes the family.
create table auth_refresh_tokens (
    id                   uuid        primary key,
    user_id              uuid        not null references users (id) on delete cascade,
    family_id            uuid        not null,
    token_hash           varchar(64) not null unique,
    platform             varchar(16) not null,
    expires_at           timestamptz not null,
    revoked_at           timestamptz,
    replaced_by_token_id uuid,
    created_at           timestamptz not null,
    last_used_at         timestamptz,
    constraint auth_refresh_tokens_platform_check check (platform in ('WEB', 'MOBILE'))
);

create index auth_refresh_tokens_user_id_idx on auth_refresh_tokens (user_id);
create index auth_refresh_tokens_family_id_idx on auth_refresh_tokens (family_id);

-- Owners of the top-level aggregates. Child rows (day_schedules, day_tag_links, event_reminders,
-- review_items, recovery_event_items) belong to their parent's owner. Relations between rows of
-- different users are rejected by the API services.
alter table goals add column user_id uuid not null references users (id);
alter table days add column user_id uuid not null references users (id);
alter table day_tags add column user_id uuid not null references users (id);
alter table event_categories add column user_id uuid not null references users (id);
alter table events add column user_id uuid not null references users (id);
alter table reviews add column user_id uuid not null references users (id);
alter table recovery_days add column user_id uuid not null references users (id);
alter table recovery_events add column user_id uuid not null references users (id);

-- Former global rules become per-user rules: two users may both have a "공부" Tag, a "마감" Category,
-- a review of the same week and a Recovery Day on the same date.
drop index goals_type_period_idx;
create index goals_user_type_period_idx on goals (user_id, type, start_date, end_date);

drop index days_planned_date_idx;
create index days_user_planned_date_idx on days (user_id, planned_date);

drop index day_tags_name_lower_idx;
drop index day_tags_sort_order_idx;
create unique index day_tags_user_name_lower_idx on day_tags (user_id, lower(name));
create index day_tags_user_sort_order_idx on day_tags (user_id, sort_order);

drop index event_categories_name_lower_idx;
drop index event_categories_sort_order_idx;
create unique index event_categories_user_name_lower_idx on event_categories (user_id, lower(name));
create index event_categories_user_sort_order_idx on event_categories (user_id, sort_order);

create index events_user_id_idx on events (user_id);

alter table reviews drop constraint reviews_type_period_unique;
alter table reviews add constraint reviews_user_type_period_unique unique (user_id, type, period_start);

alter table recovery_days drop constraint recovery_days_recovery_date_key;
alter table recovery_days add constraint recovery_days_user_date_unique unique (user_id, recovery_date);

drop index recovery_events_local_date_idx;
create index recovery_events_user_applied_at_idx on recovery_events (user_id, applied_at);
