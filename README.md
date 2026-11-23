# The Orchard (website)

The Orchard study planner as a website with its own accounts. Each person signs up with
their name, email and password, and everything they log is saved to their account on the
server. That includes sessions, exams, grades, past papers and revision progress, so it
follows them to any device.

No packages to install. It needs **Node.js 22.13 or newer**.

## Run it

```bash
npm start
```

Then open http://localhost:3000. You'll be sent to the sign-in page. Choose **Create account** to begin.

Settings:

| Variable   | Default  | What it does                           |
|------------|----------|----------------------------------------|
| `PORT`     | `3000`   | Port to listen on                      |
| `DATA_DIR` | `./data` | Where the SQLite database file is kept |

## What's in it

- `server.js`: web server, accounts (scrypt-hashed passwords, 30-day sign-in cookies), and the data API
- `public/app.html`: The Orchard itself, unchanged except for two lines that load the account bridge
- `public/account.js`: connects the app's saving to the signed-in account, and adds the **Account** panel to Settings
- `public/login.html`: sign-in and create-account page
- `data/orchard.db`: created on first run. Back this file up.

## Account features

In the app, open **Settings** (the gear icon). The Account panel lets you:
- see who you're signed in as, and sign out
- change your name
- change your password, which signs out your other devices
- download all your data as a JSON backup, and restore from one
- delete your account and all its data

Security basics: passwords are never stored, only scrypt hashes. Sign-in cookies are
HttpOnly and SameSite=Lax. Repeated wrong passwords are rate-limited. Each account can
only read and write its own data.

## Putting it online

Any host that runs Node and keeps a persistent disk will work, for example a small VPS,
Railway, Render or Fly.io. Point `DATA_DIR` at the persistent volume. Serve it over
HTTPS (most hosts do this for you). When the host sets `X-Forwarded-Proto: https`, the
cookie is marked `Secure` automatically.

There's no "forgot password" email yet, because that needs an email-sending service.
Until one is added, an account whose password is lost can't be recovered.
