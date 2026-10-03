-- Removing a medication or supplement now archives it instead of deleting it,
-- so the add form can offer it again in one tap and past days' ticks still
-- point at a real row. Additive: safe to run on the live database.

alter table public.medications add column if not exists archived_at timestamptz;
