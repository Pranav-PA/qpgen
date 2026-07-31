# Moving Supabase from Seoul to Mumbai

Why: the database currently runs in AWS `ap-northeast-2` (Seoul) while nearly
every teacher using QPGen is in India. Vercel functions are pinned to `icn1`
(Seoul) so they at least sit beside the database, but users still pay one
India→Seoul hop on every page. Moving the database to `ap-south-1` (Mumbai) and
the functions to `bom1` puts the whole request path inside India.

Supabase cannot change a project's region in place. The migration is: create a
new project in Mumbai, copy everything across, swap the keys, then repoint the
functions.

**Verify the exact CLI flags against the current Supabase migration guide before
running them — the CLI changes often.**

---

## The trap that matters most

A `pg_dump` of the `public` schema alone will **lose every user account**.

Accounts live in the `auth` schema, not `public`. If `auth.users` does not come
across, every teacher has to sign up again, and every `papers.user_id` points at
a user that no longer exists. Dump `auth` and `storage` alongside `public`, and
verify the row counts before switching anything over.

---

## 1. Before you start

- Pick a maintenance window. There will be real downtime.
- Put the app in a read-only state, or accept that papers created during the
  copy are lost. The simplest option is the existing kill switch: set
  `generation_paused` in the admin panel so nobody starts new work mid-move.
- Have the old project's DB password to hand. Reset it in the dashboard if you
  no longer have it.

## 2. Create the Mumbai project

In the Supabase dashboard: **New project** → region **South Asia (Mumbai)
`ap-south-1`**. Keep the same Postgres major version as the Seoul project;
restoring across major versions is where dumps usually break.

## 3. Dump the old project

Connection strings are in **Project Settings → Database**. Use the direct
connection, not the pooler — the pooler drops long-running dumps.

```bash
supabase db dump --db-url "$OLD_DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$OLD_DB_URL" -f schema.sql
supabase db dump --db-url "$OLD_DB_URL" -f data.sql --use-copy --data-only
```

Confirm `data.sql` actually contains `auth.users` rows before continuing. If it
does not, dump that schema explicitly:

```bash
pg_dump "$OLD_DB_URL" --schema=auth --schema=storage --data-only --use-copy -f auth_storage.sql
```

## 4. Restore into Mumbai

```bash
psql "$NEW_DB_URL" -f roles.sql
psql "$NEW_DB_URL" -f schema.sql
psql "$NEW_DB_URL" -f data.sql
```

Then apply anything the dump did not carry:

- `supabase/migrations/001_init.sql` defines `consume_generation`, the RLS
  policies and the `handle_new_user` trigger. Confirm all three exist in the new
  project; re-run the migration if not.
- Recreate the public `logos` storage bucket and copy its objects. Bucket
  contents are not part of a database dump.

## 5. Verify before switching

Run against both databases and compare:

```sql
select 'profiles' t, count(*) from profiles
union all select 'papers', count(*) from papers
union all select 'auth.users', count(*) from auth.users
union all select 'usage_logs', count(*) from usage_logs;
```

Counts must match. Also confirm `select proname from pg_proc where proname = 'consume_generation';` returns a row — losing it silently disables rate limiting.

## 6. Repoint the app

Update these in Vercel (**Settings → Environment Variables**), from the new
project's API settings:

| Variable | Note |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | new project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | new anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | new service-role key — server only, never expose |

Then in the new Supabase project's auth settings:

- Add the site URL and the `/auth/callback` redirect URL.
- Re-add the Google OAuth client. The Google Cloud console also needs the new
  project's callback URL added to its authorised redirect URIs, or Google
  sign-in breaks.

## 7. Flip the function region — last, not first

Only once the Mumbai database is live and the env vars are swapped:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["bom1"]
}
```

Doing this before the data moves makes the app **slower**, not faster: functions
in Mumbai talking to a database in Seoul pay that cross-region hop on all four
sequential calls per page.

Redeploy, then confirm the header shows `bom1::bom1`:

```bash
curl -sI https://qpgen-one.vercel.app/support | grep -i x-vercel-id
```

## 8. After

- Sign in, load the dashboard, create a paper, export a PDF.
- Confirm an existing account still works — that is the real test that
  `auth.users` came across.
- Keep the Seoul project paused but not deleted for a couple of weeks.
