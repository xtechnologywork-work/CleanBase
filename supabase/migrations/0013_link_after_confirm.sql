-- CleanBase: link an invitation only to an account whose email is confirmed.
--
-- When a company owner (or the platform admin) invites someone, a profile is created with that email.
-- Before this migration, ANY new sign-up with that email was linked to it at once, even before the
-- email was confirmed, so someone who knew the invited address could sign up first and block or take
-- the invitation. Now the link is made only once Supabase has confirmed the email.
-- (With "Confirm email" switched off in Supabase, every account counts as confirmed: keep it ON.)

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
    if new.email_confirmed_at is null then
        return new;                              -- not confirmed yet: linked by the update trigger below
    end if;
    perform set_config('cb.bypass', '1', true);
    update public.profiles set auth_id = new.id where lower(email) = lower(new.email) and auth_id is null;
    return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users
    for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
    execute function public.handle_new_user();
