# Supabase (Codescape API)

This folder holds the Supabase CLI project and Edge Functions for the Codescape website API.

## Prerequisites

Install the [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started):

- **Homebrew (macOS):** `brew install supabase/tap/supabase`
- **npm (no global install):** `npx supabase@latest <command>`

Link to your hosted project (once per machine):

```bash
cd /path/to/codescape
npx supabase@latest login
npx supabase@latest link --project-ref <your-project-ref>
```

## Edge Function: `codescape-api`

Single router that maps REST-style paths **after** the function name.

Base URL (production):

`https://<project-ref>.supabase.co/functions/v1/codescape-api`

| Method | Path (append to base URL) | Auth |
|--------|---------------------------|------|
| `GET` | `/users/me/repos` | Bearer access token (Supabase JWT) |
| `PATCH` | `/repos/<linked_repos.id>` | Bearer + JSON `{ "is_public": boolean }` |
| `POST` | `/follow/<username>` | Bearer |
| `DELETE` | `/follow/<username>` | Bearer |
| `GET` | `/users/<username>` | None (public profile + public repos) |
| `POST` | `/extension/link` | None (send GitHub token below; not a Supabase JWT) |

### Website ↔ VS Code account linking (`POST /extension/link`)

After a user signs in on the **website**, `public.users` must include a stable **`github_id`** (GitHub numeric user id) so the extension can resolve the same row using VS Code’s GitHub auth.

1. Apply the migration `migrations/20260413120000_account_linking_github_id.sql` to your project (`supabase db push` or SQL editor).
2. Ensure RLS on `public.users` allows each authenticated user to **insert/update their own row** for columns `username`, `avatar_url`, `github_id`, `updated_at` (the web app upserts on sign-in).
3. Deploy the `codescape-api` function, then from the extension run **Codescape: Link website account (GitHub)** with settings `codescape.supabaseUrl` and `codescape.functionsAnonKey` set.

The extension calls:

```http
POST /functions/v1/codescape-api/extension/link
X-GitHub-Access-Token: <token from vscode.authentication GitHub session>
apikey: <SUPABASE_ANON_KEY>
Authorization: Bearer <SUPABASE_ANON_KEY>
```

The Edge Function verifies the token with `GET https://api.github.com/user`, looks up `users.github_id`, refreshes `username` / `avatar_url`, and returns `supabase_user_id` for local storage in the extension.

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/codescape-api/extension/link" \
  -H "X-GitHub-Access-Token: $GITHUB_OAUTH_TOKEN" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

Authenticated API example:

```bash
curl -sS "$SUPABASE_URL/functions/v1/codescape-api/users/me/repos" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "apikey: $SUPABASE_ANON_KEY"
```

If your gateway does not forward path segments after the function name, call:

`.../codescape-api?path=users/me/repos`

### Local serve

```bash
npx supabase@latest start
npx supabase@latest functions serve codescape-api --env-file ./supabase/.env.local
```

Create `supabase/.env.local` with secrets for local testing (do not commit):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Deploy

```bash
npx supabase@latest functions deploy codescape-api
```

## Expected database shape

The function assumes:

- **`public.users`:** at least `id`, `username`, `avatar_url`, `created_at`, **`github_id`** (unique per non-null value), **`updated_at`** (optional; maintained by website + link endpoint).
- **`public.linked_repos`:** `id`, `user_id`, `repo_owner`, `repo_name`, `is_public`, `city_state`, `last_synced_at`.
- **`public.follows`:** `follower_id`, `following_id` (composite uniqueness).

If your `users` profile column is not named `username`, update the queries in `functions/codescape-api/index.ts` (or add a DB view) to match your schema.
