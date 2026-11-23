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
