# Public demo: deployment plan

This plan puts the project online so anyone with the link can try it. The
Next.js page goes on **Vercel**. The PHP API goes on **Render's free plan** as
a Docker container, which is a packaged copy of PHP, Apache and the API code
that runs the same way on any host.

The API can't go on Vercel. Vercel runs server code as short-lived functions
with no lasting disk, so the SQLite database file would disappear within
minutes. Vercel also has no official PHP support.

Nothing in this plan changes how the project runs locally. Assessors still
use `npm run setup` and `npm run dev`, and nobody needs Docker.

The rules behind the plan are in the bible (decisions D18 to D21 and section
B15). If this file and the bible disagree, the bible wins.

## What was decided

| Question | Answer |
|---|---|
| Where the API runs | Render's free plan, in a Docker container |
| What happens to data | It goes back to the sample data every time the API starts |
| Who can use it | Only people with the access code. There is one shared code, which the API checks on every request |
| How people get in | A share link with the code in it, or by typing the code into the page |
| What visitors can do | Everything (submit, correct, switch role), with a banner saying it is a demo |
| Where the banner shows | Only on the public copy, switched on by a Vercel setting |
| Web addresses | The free defaults (`….vercel.app` and `….onrender.com`) |
| Abuse protection | Nothing extra: the resets and the existing validation are enough |
| Getting code to GitHub | A branch and a pull request. I push only when you say so, and you merge |
| Who creates the Vercel project | I do, through the Vercel connector, and I ask before it goes live |

## How it fits together

```
Visitor's browser
   │
   ├── loads the page ──────────►  Vercel  (Next.js, from the web folder)
   │
   └── calls the API directly ──►  Render  (Docker: Apache + PHP 8.5 + SQLite)
```

The browser calls the API directly, not through Vercel. That is why the API
needs a public address, and why it has to be told which website may call it.
That permission is CORS, set by `DEBONAIRE_ALLOWED_ORIGINS`. Without it, the
browser blocks the page's requests.

## The steps

### Step 1. Package the API as a Docker container (me)

I'll add these files under `api/`:

- **`Dockerfile`**, the recipe for building the container, in two stages.
  - **The first stage** installs the PHP packages with
    `composer install --no-dev`. That leaves out PHPUnit, because the live
    copy doesn't run tests. It also adds `unzip`, which Composer needs to
    unpack packages.
  - **The second stage** is the container that actually runs. It starts from
    the official `php:8.5.12-apache` image and copies in the code and the
    installed packages. The tag names an exact PHP version because Render
    keeps copies of the images it downloads. A moving tag such as
    `8.5-apache` could quietly build on an older PHP.
  - **The build stops** if PHP is older than 8.5.12, the first release with
    the PHP2Shell fixes, or if any extension the API needs is missing.
    Composer doesn't check either of these when it installs from the lock
    file, so the build checks them itself.
- **`docker/apache.conf`**, the web server settings.
  - Apache serves the `public` folder.
  - Every request goes to `index.php` (Apache's `FallbackResource`), just as
    `php -S public/index.php` does locally.
  - Apache listens on the address `0.0.0.0`, at the port in the `PORT`
    variable. Render's documentation asks for exactly this, and its default
    port is 10000.

  PHP's built-in server isn't used in the container, because PHP documents it
  as unsuitable for public use.
- **`docker/start.sh`**, which runs when the container starts. It loads fresh
  sample data with `php database/seed.php --fresh`, then starts Apache. In
  between, it gives the database folder to `www-data`, the user Apache runs
  PHP as, because SQLite must be able to write both the database file and the
  folder it sits in.
- **`docker/php.ini`**, a few PHP settings on top of PHP's own production
  settings. Errors go to the log, never into a response, and PHP's version
  is left out of the headers.
- **`.dockerignore`**, which keeps `vendor`, `var`, the tests and any local
  database out of the container.

At the repo root, a `.gitattributes` file keeps `.sh` files with Linux line
endings even on a Windows checkout. A Linux container can't run a script
with Windows line endings.

### Step 2. Try the container on this Mac (me)

Docker is installed here, so I can check everything before anything goes
online:

1. Build the container and run it on port 8080, with CORS set to allow
   `http://localhost:3000`.
2. Run the README's curl examples against it: health, the listing with
   totals, a submit, a lost-response retry, a duplicate (`409`) and a dealer
   asking for another dealership (`403`).
3. Run the local page against it with
   `NEXT_PUBLIC_API_URL=http://127.0.0.1:8080`. Check that the page loads, so
   CORS works, and that submitting, correcting and the history all work.
4. Run the summary script with `--api http://127.0.0.1:8080` and check it
   matches the page: 10 returns, 2,090 enquiries, 497 sales, 23.78%.
5. Restart the container and check the data is back to the sample data.

### Step 3. Add the demo banner (me)

I'll add a `DemoBanner` component above the red header bar. It shows only
when `NEXT_PUBLIC_DEMO_MODE` is `true`, so local runs and the tests look
exactly as they do now. Draft wording:

> Public demo with made-up dealerships. Sign-in is a stand-in, so anyone can
> switch to manager. The data goes back to the sample data whenever the server
> restarts, and after a quiet spell the first load can take up to a minute.

The same setting also asks search engines not to list the demo. A Vitest test
checks that the banner is hidden by default and shown when the setting is on.

### Step 4. Add the Render blueprint and the README section (me)

- **`render.yaml`** at the repo root is a Render "Blueprint": a file that
  describes the service, so setting it up in Render takes a few clicks.
  - It defines one web service, `debonaire-api`, built from `api/Dockerfile`
    on the free plan.
  - It runs in the Frankfurt region, which is Render's closest to the UK.
    The region can't be changed later.
  - Render checks `/api/health` to see that the API is up, and redeploys on
    every merge to `main`.
  - `DEBONAIRE_ALLOWED_ORIGINS` is marked to be typed in the dashboard rather
    than stored in the file.

  Render's documentation lists `free` as a valid plan for web services, but
  it doesn't say anything specific about Docker on that plan. If the
  Blueprint refuses the free plan, the fallback is Render's cheapest paid
  plan, and I'll check with you first.
- **A "Live demo" section in the README**, in the AI notes part. Your message
  at the top stays as it is. The section gives the two links and says what
  resets and why the first load can be slow. It says the identity switch is a
  stand-in, explains briefly how the deployment works, and notes that running
  locally needs no Docker.

### Step 5. Push the branch and merge (you approve, you merge)

The work goes on a branch called `deploy/public-demo`. Commits:

1. `docs(repo): record the public demo decisions and plan`
2. `feat(api): Docker image for the public demo`
3. `feat(web): show a demo banner when NEXT_PUBLIC_DEMO_MODE is on`
4. `chore(repo): add a Render blueprint for the API`
5. `docs: add a live demo section to the README`

`npm test` passes at every commit. When you say so, I push the branch and
open a pull request. You merge it on GitHub, and both hosts then build from
`main`.

### Step 6. Reserve the Vercel address (me, with the connector)

I'll create the Vercel project with the connector before anything is
deployed, so we know the page's address, for example
`https://debonaire-dealership.vercel.app`. Render needs that address in
step 7. The project settings:

- **Root directory:** `web`. Vercel spots the npm workspaces and installs
  from the repo root, so the `shared` package comes along.
- **Production branch:** `main`.
- **Settings:** `NEXT_PUBLIC_DEMO_MODE=true` now, and `NEXT_PUBLIC_API_URL`
  once Render has given the API its address.

You may need to let Vercel's GitHub app see the repo. If the connector would
deploy straight away when it creates a GitHub-linked project, I'll tell you
before doing it.

### Step 7. Create the API on Render (you, about five minutes)

1. Sign in at <https://render.com> with your GitHub account.
2. Choose **New → Blueprint**, pick `Jim247/dealership-project`, and let
   Render read `render.yaml`.
3. When it asks for `DEBONAIRE_ALLOWED_ORIGINS`, paste the Vercel address
   from step 6, with no slash at the end.
4. When it asks for `DEBONAIRE_ACCESS_CODE`, paste a long random code. On a
   Mac, `openssl rand -hex 16` prints one. Keep it somewhere safe, such as a
   password manager, and never commit it. Anyone with the code can use the
   demo.
5. Wait for the first build (a few minutes), then send me the service's
   address, for example `https://debonaire-api.onrender.com`. Don't send me
   the access code. I'll test with a code of my own on this Mac, and you can
   check the live one yourself.

Render asks for these settings only the first time. To change one later,
for example to switch to a new access code, use the service's
**Environment** tab, and Render redeploys.

### Step 8. Deploy the page (me, after you say go)

I'll set `NEXT_PUBLIC_API_URL` to the Render address and start the first
production deploy. Vercel builds that address into the page, so changing it
later needs a redeploy.

### Step 9. Check the live demo (me)

In the browser pane, I'll check:

- **The banner and data:** the banner shows, the totals match the sample
  data, and the browser reports no CORS errors.
- **Submitting:** a submit works, a duplicate gives the 409 message, and
  switching to a dealer limits the view.
- **Corrections:** a correction works and the history shows it.

Then I'll run the summary script against the live API and check that it
matches the page. Finally, I'll wait for the API to fall asleep, reload, and
time how long it takes to wake. After that, I'll put the real links in the
README, as one more commit on a new branch.

## Who does what

| Step | Me | You |
|---|---|---|
| 1 to 4 | Write the files, test locally, commit on the branch | Nothing |
| 5 | Push and open the pull request, when you say so | Say "push", then merge on GitHub |
| 6 | Create the Vercel project | Let Vercel's GitHub app see the repo, if it asks |
| 7 | Nothing | Set up the Blueprint on Render and send me the address |
| 8 | Deploy the page | Say "go" |
| 9 | Check it live and update the README | Nothing |

## Cost and limits

It costs nothing. Vercel's free Hobby plan covers the page. Render's free
plan covers the API, within these limits, taken from Render's documentation
on 16 November 2026:

- **Sleeping.** After 15 minutes with no visitors, the API goes to sleep. The
  next visitor waits about a minute while it wakes up. The page shows its
  loading state meanwhile, because the app sets no time limit on requests.
- **Resets.** The disk is wiped whenever the service restarts, redeploys or
  sleeps, which is what gives the reset to sample data. Render may also
  restart a free service at any time, so the data can occasionally reset in
  the middle of someone's visit.
- **Free hours.** Each account gets 750 free hours a month, more than the 744
  hours in the longest month, so one service never runs out. A sleeping
  service uses no hours.
- **Bandwidth and build minutes** have monthly allowances that a demo won't
  come near.

## Things to know

- **Sharing it.** Send people
  `https://<the Vercel address>/?code=<the access code>`. Opening the link
  saves the code in their browser and removes it from the address bar, so it
  isn't left showing on screen. Someone given just the address sees an
  "Enter access code" screen. For curl, send the header
  `Authorization: Bearer <the code>`. For the summary script, add
  `--access-code <the code>`.
- **Changing the code** locks out everyone who has the old one, because there
  is a single shared code. Set the new one in Render's **Environment** tab
  and send people the new link. A browser with the old code saved shows the
  access code screen again, with a message that the code isn't valid.
- **Anyone with the code can act as a manager.** The role switcher is a
  stand-in for sign-in, so any visitor with the code can submit and correct.
  The banner says so, and every reset wipes their changes.
- **The code is a gate, not a login.** It keeps strangers out of the demo,
  but it doesn't say who anyone is. A long random code can't realistically
  be guessed, so there is no limit on wrong attempts.
- **Only the production address works.** Vercel builds a preview copy for
  every branch, at its own address. The API only allows the production
  address, so previews show "the reporting service is not responding". Add a
  preview's address to `DEBONAIRE_ALLOWED_ORIGINS` if you ever need one.
- **PHP security updates.** The image tag in `api/Dockerfile` fixes the
  container's PHP version. It is currently `php:8.5.12-apache`. When PHP
  releases a security fix, change the tag to the new version and merge, and
  Render rebuilds the container. The build's version check stops anything
  older than 8.5.12.
- **If the data should be kept later**, Render's paid plan with a disk, or
  Railway with a volume, is the upgrade. Only `render.yaml` and the start
  script change: the seed would add missing rows rather than start fresh.

## How it went (16 November 2026)

The demo is live:

- **Page:** <https://debonaire-dealership.vercel.app>
- **API:** <https://debonaire-api.onrender.com>

A few things went differently from the plan:

- **Render accepted the free plan for a Docker service.** James created the
  Blueprint in Render's dashboard, and the first deploy came from the merge
  of pull request #2.
- **The Vercel connector couldn't create projects.** Vercel refused both
  routes with a permission error. James imported the repo in Vercel's
  dashboard instead, as `dealership-project`.
- **That project's default address was already taken.**
  `dealership-project.vercel.app` belongs to someone else's app. James
  added `debonaire-dealership.vercel.app` under **Settings → Domains**,
  which is the address Render allows.
- **The first Vercel build failed at the TypeScript step.** Vercel installs
  from inside `web/`, which leaves out the packages listed at the repo's top
  level. Pull request #3 fixed it by listing `typescript`, `@types/node` and
  `vitest` in `web/package.json` (bible B15).
- **Checked live without the access code:**
  - the page's banner and its `noindex` tag;
  - that the page calls the Render API;
  - that CORS allows only the page's address, including the `Authorization`
    header;
  - that a wrong code gets "That access code isn't valid". That proves the
    page reaches the API and reads its reply.

  James checks the real code himself.
- **Afterwards, James removed the demo banner** (step 3), and the footer's
  "Identity switching is a demo stand-in" line. Demo mode still asks for the
  access code and keeps the demo out of search engines (bible B15).
