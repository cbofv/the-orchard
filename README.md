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

## Social (optional)

The **Social** tab lets friends revise together:
- **The Neighbourhood**: a 3D plaza where glossy tiles float above a grid floor and you and your friends appear as profile pins around them, with the latest notes in speech bubbles. Drag to look around and zoom with the − / + controls. Click a tile to open that section, or click a person to see their week, badges and latest note, then message or cheer them.
- **Messages**: private one-to-one chats between friends, with unread counts and "Seen".
- **Leaderboards**: flashcards reviewed this week, cards mastered, study time and streaks, for you and your friends.
- **Notice board**: short friends-only posts with cheers.
- **Friends**: add people by their exact @handle, then accept or decline requests.
- **Profile**: choose your display name, handle and status, plus a profile picture: your initials, one of about 90 emoji or one of 48 line icons, on one of 12 background colours.
- **Badges** (admins only): give Crown, Diamond, Star, Laurel, Flame and Heart badges with a note, or take them back. Badges show next to names, and someone's top badge sits on their profile pin in the plaza.

**Privacy:** nothing is public. People can only find you by typing your exact handle. Only accepted friends see your notes, stats, badges or online status, and only friends can message you. Shared stats are study time, streak, top subject and flashcard counts, never grades or ratings.

### Setup
1. In Supabase, open **SQL Editor → New query**, paste in all of [`supabase-social-setup.sql`](supabase-social-setup.sql) and click **Run**.
2. Do the same with [`supabase-social-2.sql`](supabase-social-2.sql) for messages and badges.
3. **Make yourself an admin** (to give badges): run this line in the SQL Editor, with the email you sign in with:
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'you@example.com' on conflict do nothing;
   ```
   Then reload the site. A **Badges** tab appears in Social.
4. Run [`supabase-social-3.sql`](supabase-social-3.sql) the same way, so everyone sees the **Admin** badge (The Orchard logo) next to admins' names.
5. Run [`supabase-social-4.sql`](supabase-social-4.sql) for **study rooms**, **announcements** and the **admin overview**.

### More in Social
- **Study rooms**: open a room, and friends can see and join it. When you press Start, everyone gets the same countdown, and when it ends the time is logged to each person's Study log.
- **Admin tab** (admins only): an overview of accounts and activity, **announcements** shown as a banner at the top of the site for everyone (with an end date), and badges.
- **Notifications**: turn them on in Social → Profile. You get alerts for new messages, friend requests, badges and friends' study rooms while The Orchard is open in a tab or installed as an app. The tab title and icon also show a count.

## Install as an app
The Orchard can be installed on phones and computers. On desktop Chrome or Edge, click the **download icon** in the top bar (or **Install app** in the footer). On iPhone or iPad, tap **Share → Add to Home Screen**. It opens in its own window, and the main pages still load when you're offline.

## Planning and recap
- **What should I do now? → Plan my day**: choose 1 to 4 hours and get a set of focused sessions across subjects, chosen by exam dates and weak topics, with breaks. **Start** runs the focus timer (which logs the session), and **Add to calendar** saves the plan.
- **Weekly recap**: shown on Home from Monday to Wednesday (or from **Weekly recap** next to Insights). It covers time studied versus the week before, days studied, flashcards reviewed, where your time went, your rank among friends and what's coming up.

## Speed
- The app's code and styles live in their own files (`app.js`, `app.css` and so on) rather than inside `index.html`. Each is linked with a fingerprint, e.g. `app.js?v=1a2b3c4d5e`, so a device keeps it until it actually changes. After an update, people only download the files that changed.
- Subject pages are drawn when you open them, not all at start-up.
- **After editing any `.js` or `.css` file, run** `python3 tools/stamp.py` and commit what it changes. If you forget, people may keep the old version of that file.

## Files
| File | What it is |
|---|---|
| `index.html` | The Orchard app's page layout |
| `app.js`, `app.css` | The Orchard app's code and styles (all subjects, study log, calendar and so on) |
| `login.html` | Sign in, create account, reset password |
| `account.js` | Connects the app's saving to Supabase, and adds the Account panel |
| `account.css` | Styles for the Account panel |
| `config.js` | Your Supabase URL and key (**edit this**) |
| `supabase.js` | Supabase's browser library (v2.117.2), kept in the repo so the site has no outside dependencies |
| `supabase-setup.sql` | Run once in Supabase to create the data table and its access rules |
| `social.js`, `social.css` | The Social tab and The Neighbourhood |
| `supabase-social-setup.sql` | Run once for Social: profiles, friends, notes and their privacy rules |
| `supabase-social-2.sql` | Run once more for Social: messages, admins and badges |
| `supabase-social-3.sql` | Lets everyone see who the admins are, for the Admin badge |
| `supabase-social-4.sql` | Study rooms, announcements and admin stats |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | Installable app: manifest, offline support and icons |
| `ui.js`, `ui.css` | The interface layer: header, sidebar, layouts and subject page extras |
| `tools/stamp.py` | Fingerprints the files so browsers can cache them (see Speed below) |
