# The Orchard

The Orchard study planner as a free website with accounts.

- **GitHub Pages** hosts the site.
- **Supabase** handles sign-in and stores each person's data: study sessions, exams,
  grades, past papers and revision progress. It all follows them to any device.

## One-time setup

### 1. Create the Supabase project
1. Sign up at supabase.com and click **New project**. Pick any name, set a database
   password (you won't need it again), choose a region near you (e.g. London), and
   create it.
2. When it's ready, open **SQL Editor** → **New query**. Paste in everything from
   [`supabase-setup.sql`](supabase-setup.sql) and click **Run**. You should see "Success".

### 2. Connect the site to it
1. In Supabase, find your **Project URL** and **publishable key** (older projects call it
   the **anon** key). They're under **Project Settings → API Keys** and **Data API**, or
   behind the **Connect** button at the top.
2. On GitHub, open [`config.js`](config.js), click the pencil to edit, paste both values
   between the quotes, and **Commit changes**.

Both values are meant to be public. The rules in `supabase-setup.sql` make sure each
person can only see and change their own data. **Never** paste the `service_role` or
"secret" key anywhere.

### 3. Turn on GitHub Pages
**Settings → Pages → Build and deployment**: Source **Deploy from a branch**, branch
**main**, folder **/ (root)** → **Save**. After a minute the site is live at
`https://<your-username>.github.io/the-orchard/`.

### 4. Tell Supabase the site's address
In Supabase, go to **Authentication → URL Configuration**:
- **Site URL**: `https://<your-username>.github.io/the-orchard/login.html`
- **Redirect URLs**: add `https://<your-username>.github.io/the-orchard/**`

This makes the links in confirmation and password-reset emails take people back to your site.

## Good to know
- **Email confirmation:** by default, new accounts must click a link in an email before
  they can sign in. Supabase's built-in email sender only sends a few emails per hour.
  For a small group that's fine. To skip confirmation, turn off **Confirm email** under
  **Authentication → Sign In / Providers → Email**.
- **Free plan pausing:** Supabase pauses free projects that go unused for about a week.
  If the site stops signing in, open the Supabase dashboard and click **Restore**.
- **Forgot password** is on the sign-in page.
- **In the app**, Settings (gear icon) → **Account** lets you change your name or
  password, download or restore a backup, sign out, or delete your account.

## AI tutor (optional)

The **AI tutor** page lets each person chat with Claude about their revision. It can
explain topics, quiz them and mark answers. It knows their subjects and upcoming exams.
Chats are saved to their account.

The Claude API is **paid**, billed per use. The tutor uses Claude Opus 5.5 and is limited
to **40 messages per person per day** to keep costs in check. The key is kept in Supabase
and never sent to the browser.

### Setup
1. **Get a Claude API key:** sign in at platform.claude.com, add some credit under
   **Billing**, then create a key under **API Keys**. You can set a monthly spend limit
   there too.
2. **Create the usage table:** in Supabase, go to **SQL Editor → New query**, paste in
   [`supabase-ai-setup.sql`](supabase-ai-setup.sql) and click **Run**.
3. **Add the key as a secret:** in Supabase, go to **Edge Functions → Secrets** and add
   `ANTHROPIC_API_KEY` with your key as the value. Optionally add `AI_DAILY_LIMIT` (e.g.
   `20`) to change the daily limit.
4. **Deploy the function:**
   1. In Supabase, go to **Edge Functions → Deploy a new function → Via Editor**.
   2. Name it exactly **`ai-chat`**.
   3. Replace the example code with everything in
      [`supabase/functions/ai-chat/index.ts`](supabase/functions/ai-chat/index.ts), then click **Deploy**.
   4. In the function's **Details** tab, turn **off** "Verify JWT" (sometimes labelled
      "Enforce JWT verification") and save. The function checks sign-in itself, and this
      setting can block requests from newer Supabase projects.

Until this is done, the AI tutor page shows "The AI tutor isn't set up yet".

If Claude declines to answer something for safety reasons, the request automatically
retries on another Claude model (Anthropic's "fallbacks" feature).

## Social (optional)

The **Social** tab lets friends revise together:
- **The Neighbourhood**: a little park where your neighbours wander around, with their latest notes in speech bubbles. Click one to see their week, streak and latest note, and cheer them on. Until friends join, three guides (Hazel, Rowan and Juniper) share study tips.
- **Notice board**: short friends-only posts (140 characters) with cheers.
- **Friends**: add people by their exact @handle, then accept or decline requests.
- **Your neighbour**: build your character and choose your name, handle and status, plus whether to share study stats.

**Privacy:** nothing is public. People can only find you by typing your exact handle. Only accepted friends see your notes, online status and stats (time this week, streak and top subject, never grades or ratings). You can remove a friend at any time.

### Setup
In Supabase, open **SQL Editor → New query**, paste in all of
[`supabase-social-setup.sql`](supabase-social-setup.sql) and click **Run**. Until you do,
the Social tab shows "Social isn't switched on yet".

## Files
| File | What it is |
|---|---|
| `index.html` | The Orchard app |
| `login.html` | Sign in, create account, reset password |
| `account.js` | Connects the app's saving to Supabase, and adds the Account panel |
| `account.css` | Styles for the Account panel |
| `config.js` | Your Supabase URL and key (**edit this**) |
| `supabase.js` | Supabase's browser library (v2.117.2), kept in the repo so the site has no outside dependencies |
| `supabase-setup.sql` | Run once in Supabase to create the data table and its access rules |
| `ai-chat.js`, `ai-chat.css` | The AI tutor page |
| `supabase-ai-setup.sql` | Run once for the AI tutor: daily message limits |
| `supabase/functions/ai-chat/index.ts` | The AI tutor's server code (a Supabase Edge Function) |
| `social.js`, `social.css` | The Social tab and The Neighbourhood |
| `supabase-social-setup.sql` | Run once for Social: profiles, friends, notes and their privacy rules |
| `ui.js`, `ui.css` | The interface layer: header, sidebar, layouts and subject page extras |
