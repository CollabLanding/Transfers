alter table public.profiles add column bubble_color text not null default '#1d5c8f' check (bubble_color ~ '^#[0-9a-fA-F]{6}$');
alter publication supabase_realtime add table public.profiles;