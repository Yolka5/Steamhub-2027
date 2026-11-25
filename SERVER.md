# Running Steamhub on a workshop PC, with files on the WD My Cloud

Written 2026-11-25. Nothing here is built yet. This explains how it would work, what works and what doesn't, so you can decide.

## Where Steamhub runs today

Steamhub has two halves:

| Half | What it is | Where it runs now |
| --- | --- | --- |
| The site | The pages, the buttons, the code you see | Vercel, from GitHub, at steamhub1577.com |
| The data | Database, sign-in, files (photos, STEP files, videos), the nightly Claude recap, GitHub and Google Calendar syncs, pushes | Supabase, free plan |

Today's sizes: the database is 24 MB, files are about 145 MB (73 MB of STEP files, 69 MB of part pictures, 2.5 MB of prototype photos and clips). The free plan allows 500 MB of database and **1 GB of files**. Every test video is shrunk to about 5 MB before upload for this reason, and it's the limit you'll hit first: about 150 more test videos.

## What "the workshop PC as the server" means

You would run your own copy of Supabase on one workshop PC. Supabase is open source and ships as a set of Docker containers: the database (Postgres), sign-in, the file store, live updates, the edge functions, and the admin page. On Windows that means Docker Desktop with WSL 2. The site itself (the pages) can be served by the same PC.

Phones and laptops in the workshop then talk to the PC over the workshop Wi-Fi instead of the internet.

### What works offline, in the workshop

- Everything people do by hand: stock, Manufacturing, parts, the Calendar, prototypes, tests and videos, SteamLab, the checklists.
- Live updates between screens (the workshop map, the board), since they go through the PC.
- The nightly SteamLab step that collects the day (pg_cron runs on the PC too).

### What still needs the internet, wherever the server is

| Feature | Why |
| --- | --- |
| Signing in with Google | Google has to say who you are. People who are already signed in stay signed in; a new sign-in needs internet. A local fallback (email and password, or a PIN per person) can be added. |
| Claude: the nightly recap, drawing review, part review, Ask Claude | Claude runs at Anthropic. Offline, the recap would be written when the internet is back. |
| GitHub sync, Google Calendar sync, Google Sheets plates sync, Onshape | They read other services. They catch up when the internet is back. |
| Push notifications to phones | Pushes go through Google's and Apple's push servers. |
| Using Steamhub from home | Needs a way in from outside, see below. |

So offline you get the whole team app, and lose the parts that talk to other services. Those wait, they don't break.

### The things that make or break it

1. **HTTPS on the local network.** Phones only allow the installed app, the camera for videos, and pushes on HTTPS. A bare address like `http://192.168.1.20` breaks all three. The fix is a real name, for example `local.steamhub1577.com`, pointed at the PC's address in Cloudflare DNS, with a free certificate from Let's Encrypt (Cloudflare can prove the domain is yours without the PC being reachable from outside). Doable, and needs the PC to have a fixed address on the workshop network.
2. **The PC has to stay on.** No sleep, no surprise Windows Update restarts at 15:00, ideally a small UPS. If it's off, Steamhub is off for everyone, at home too.
3. **Backups are now your job.** Supabase does them for you today. On a PC, a dead disk is the whole season's data. A nightly copy of the database and files to the My Cloud, and a weekly one off-site (Google Drive, or the cloud Supabase), is the minimum.
4. **Someone owns it.** Updates to Supabase's containers, the certificate renewing, disk space. Maybe an hour a month, more when something breaks during build season.
5. **The PC.** 16 GB of memory is comfortable, 8 GB works. An SSD. It can still be used as a normal PC, but not one that gets turned off at night.

### Using it from home

Two ways:

- **Cloudflare Tunnel** (free): the PC keeps a connection out to Cloudflare, and steamhub1577.com goes through it to the PC. Nothing is opened on the school's router. Works whenever the workshop has internet and the PC is on. Mentors away see the real, live data.
- **Keep the cloud as the main copy** and the PC as the offline one: see the options below.

## Three ways to set it up

| | A. PC is the only server | B. Cloud stays main, the app works offline better | C. Both, kept in sync |
| --- | --- | --- | --- |
| Offline in the workshop | Everything but the internet features | Reading works, and changes wait in the phone until it's back online | Everything |
| From home | Through Cloudflare Tunnel, only when the PC and the workshop internet are up | Always | Always |
| File space | The PC's disk and the My Cloud: terabytes | 1 GB free, or 100 GB on Supabase Pro ($25 a month) | Both |
| Risk | PC or disk dies, everything stops | Low, same as today | High: two copies that both change will conflict, and fixing that is hard |
| Work to build | A few days, then upkeep | A few days, no upkeep | Weeks, and fragile |

**My recommendation:** B for the app, plus the My Cloud for big files.

- How often is the workshop really offline? If it's rare, A trades a small problem for a bigger one: the season's data on one PC, and mentors at home cut off whenever it's down.
- B means making the app keep working with no connection: it already opens offline and shows the saved stock and pages; it would also keep the Calendar, parts and prototypes, and queue changes (a part marked done, a test recorded) until the connection is back.
- The real limit today is file space, not being offline. The My Cloud solves that on its own, without moving the database.

If the workshop internet is often down for whole days, A is the one that fixes it, and it's worth doing carefully, with the backups above from day one.

## The WD My Cloud

What it's good for: lots of space (terabytes) for videos, full-size STEP files, photos, match footage, CAD exports, anything big and not secret.

What decides how it can be used is **which My Cloud it is**, so please check the model on its label:

- **My Cloud Home** (the consumer one, one box with a light): it only works through WD's app and website. Other programs can't reach it reliably, so Steamhub can't store files on it directly. Fine for backups copied by a PC.
- **My Cloud EX2 Ultra, PR2100, PR4100, DL2100** or similar with **My Cloud OS 5**: it shares folders on the network (SMB), so a PC can treat it as a drive. This is the one that works with Steamhub.
- If it still runs **OS 3**, WD stopped updating it in 2022. Update it to OS 5, or keep it off the internet entirely. (In 2021 WD's older My Book Live drives were wiped remotely through an unfixed flaw, and in 2023 a break-in at WD took the My Cloud remote service down for over a week.)

### How Steamhub would use it

- **With A (PC server):** the PC's file store points at a folder on the My Cloud, so every video and STEP file lands there. The database stays on the PC's own disk (databases on network drives get corrupted).
- **With B (cloud main):** the cloud keeps the small files (part pictures, photos). Big files (long test videos, full match recordings) go to the My Cloud through a small upload service on a workshop PC, and Steamhub keeps only the link. Those files open only on the workshop network, unless the same Cloudflare Tunnel is added.
- **Either way:** the nightly backup of Steamhub goes to the My Cloud.

### Don't

- Turn on the My Cloud's own "remote access" or open ports to it on the router. Drives reachable from the internet are how the 2021 wipe happened.
- Put the database itself on the My Cloud.
- Keep anything private there (passwords, personal details): treat it as a shared shelf.

## What I need from you to go on

1. How often is the workshop offline, and for how long? (Rarely for a few minutes, or whole days?)
2. The My Cloud's exact model and OS version (Settings, or the label).
3. Which PC would be the server, and can it stay on all season?
4. Is the school network yours to configure (a fixed address for the PC), or does the school's IT run it?

With those, I'll write the build plan for A or B and the My Cloud.
