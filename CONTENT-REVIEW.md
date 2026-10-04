# Content review — decisions needed before launch

Found while migrating the WordPress export (1 October 2026). Each item can be fixed
by asking Claude, e.g. "Apply item 3: replace the cyber offerings on Program and
Project Delivery with …".

## Broken on the live site — already fixed in this build
1. All six service tiles on Home and What We Do linked to `/social-sustainability`.
   They now go to the correct service pages.
2. "See our case studies" had no link; "Join our team" pointed to `/careers`, which
   doesn't exist. Both fixed, and `/careers` now redirects.
3. Nick Major's LinkedIn link pointed to Amna Saleem's profile. Removed until you
   supply the right one.
4. Shared services listed "Recruitment and onboarding costs" three times. De-duplicated.
5. AI Leaderboard: "Pompt engineering" typo fixed; the three "why transparency" tiles
   linked to `/social-sustainability`, links removed.
6. Footer copyright was stuck on 2025; it now updates itself.

## Copy errors carried over — need your decision
7. **Program and Project Delivery** — offerings 2 and 4 are copied from Cyber Security
   ("cyber security maturity uplift…", "cyber resilience and security advisory…").
8. **Financial Management** (formerly Financial and Benefit Management) — offering 2 is the same cyber uplift line.
9. ~~**AI Leaderboard**~~ (page removed 3 October 2026) — the "Cyber security" reason reuses the "Ethical governance"
   sentence. The "Why AI transparency is more than compliance" intro is the generic
   What We Do paragraph.
10. **About → values** — the old site showed these as images with titles baked in;
    only the sentences survived. Short titles (e.g. "People first", "Integrity") would
    help. Two near-identical sustainability values were merged into one.
11. **Testimonial** — "While the beginning of the engagement was a bit bumpy…" is
    honest but may not be the impression you want on the experience page.

## Facts to confirm
12. Team: grid says **Mia Wrightson**, bio template says **Mia Connell** — which is
    current? Melita Justic has no bio; Mia, Melita and Ben have no LinkedIn.
13. Utena Wang has a bio template but isn't on the team page, so she's not included.
14. Client logos: Defence appears twice (two different logo files); `apc.png` and
    `ama.png` need names for accessibility alt text.
15. Procurement panels — check every panel is still current (e.g. Victorian
    Professional Advisory Services SS-04-2019). The "Coming soon" WA panel was dropped.
16. Office address: site uses Unit 5, 24 Napier Close, Deakin ACT 2600. An old header
    template had Moore St, Civic. Update `site.json` if you move.

## New copy written for this build — approve or edit
17. Home: AI Leaderboard strip text, "Careers" and "Collaboration" lines, hero buttons.
18. The "Talk to us about your next initiative" band at the foot of most pages.
19. Footer Acknowledgement of Country (new; adjust wording if you have a standard one).

## Not migrated
20. **Privacy policy** — only a WordPress draft existed. A firm doing privacy and
    security work for OAIC and others should publish one; ask Claude to draft it.
21. Draft "Bluebird AI" page (empty), page copies, "Home – Temporary Preview",
    events calendar, shop templates and the WPForms contact form (replaced with email links).
