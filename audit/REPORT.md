# GM Seat Baseball, UI density audit

Audited build: JackStrawNYC/gmseat at f0d87f5, apps/web served from `vite build` with the mock account API. A new league on default settings, Brooklyn Harbor taken over, advanced with the date bar's own buttons. Screens were photographed with Playwright at 1440x900 and 390x844; each screen has a viewport shot (`name-1440.png`, `name-390.png`) and a full page shot (`name-1440-full.png`). The full page shots repeat the sticky header at the scroll offset; that is a capture artifact, not the UI. Numbers below (header height, ink coverage, column counts) were read from the DOM at capture time and are in `metrics.json`.

States reached. March 29, three days after opening day, with two walk-year extension letters on the desk (contract decisions with a clock) and an unsolicited trade offer from Minneapolis: `02-desk-contract-decision-*.png`. July 7, mid-season, 38-52, with a Chicago offer on the desk, the deadline build board up, the draft six days out: the `10` through `52` set. July 12 and 13 for the advance flow, where the calendar stopped on the club's draft pick. The contract decision at mid-season is Carlos Garza, the starting shortstop, in his final contract year with extension talks open on his page; the walk letters expire seven days after opening day, so at mid-season the decision lives on the player page and not on the desk.

Not reached. The week advance at 390 wide: the sim landed on draft day, where the calendar is on the clock and the Week button is disabled, so `63-week-during-390.png` and `64-week-after-390.png` do not exist. The Sim season confirmation, the DFA and release confirmations are native `confirm()` prompts and cannot be screenshotted. Nothing modal opens from the desk itself; the only `<dialog>` in the app is the free agent signing review, captured as `73-free-agent-review-dialog-1440.png`.

## Verdict

Too noisy. The bones are right: an inbox-driven desk, one green action, dense tabular pages, a restrained palette. But the desk buries its own inbox under a three-band header, a five-card stat strip that repeats the header, and a deadline board, so the first decision sits 600px down at 1440 and 800px down at 390, where the header alone is a third of the phone. The club page opens on ticket prices with the roster 1,500px below. Twenty-nine of the app's roughly forty-five tables exceed seven default columns, counted in the source and confirmed on every screen captured, and none can be collapsed. Every list page opens with a paragraph of explanation. The player status line is written eight different ways across the screens audited and the club's record is printed three times above the fold on the desk. Football Manager's inbox puts the decision first and everything else behind it; OOTP is dense but lets you choose the columns. This app is dense everywhere and hierarchical nowhere yet.

## Findings, ranked by impact

1. GM desk. The decision is not the first thing on the screen. Above the desk panel sit the page title, five stat cards, the division table, the owner card and the deadline build board; at 1440 the first Accept is at y=635, at 390 the panel starts at y=800 and the first choice is off screen while the club title and five stat cards take 260px of the fold. Fix: put the desk panel first in the center column and drop the stat strip, whose numbers are already in the date bar. `10-desk-390.png`, `10-desk-1440.png`.

2. Every screen. The header is three stacked bands (brand and nav, club status plus six buttons, the score ticker) at 155px on the desk at 1440 (17% of the viewport; 130px on pages where the button row does not wrap) and 280px at 390 (33%). The ticker is a fourth row of chrome that scrolls by hand and duplicates the desk's own scoreboard card. Fix: one status row with the club, record, date and one Advance; the other five buttons in a menu on Advance; the ticker collapsed to one chip (last result, next game) or off by default. `60-advance-before-1440.png`, `10-desk-390.png`.

3. Roster / depth chart. Your club page opens on the Business panel (ticket price table, market, fans, park) then the ledger, finances, clubhouse and rotation policy; the lineup editor starts around 1,550px down an 8,435px page, with the roster jump link the only hint. Fix: roster first; business, ledger and finances behind the Finances section link, ideally a separate page. `20-club-1440.png`, `20-club-1440-full.png`.

4. Tables. Default column counts with no toggle anywhere in the app: league stats 25, draft board 14 (horizontally scrolled even at 1440 inside a two-thirds panel, with a caption apologising for it), prospects 14, scouts 11, trade assets 10, farm 10, players 10, standings 10, club finances 19, player batting by season 19, game log 13. The roster editor's lineup table clips its own action column at 1440 (the swap select is cut at the panel edge). Fix: a default set of at most seven columns per table with a "more" toggle stored per table, and the roster editor's row actions moved into a row menu instead of a ninth column. `51-draft-1440.png`, `84-stats-1440.png`, `21-roster-lineup-1440.png`.

5. Trade screen. Above the two asset tables, the deadline build board in full mode prints every day a need was logged, thirty lines of "an arm for the pen: the manager, May 9", and the phone panel and title push the tables to about y=1,150. The deal itself (what you send, what you get, the verdict, Make the trade) is the last panel on a 2,098px page, at about y=1,950. Fix: the board shows the four open needs with the log behind a disclosure; The deal becomes a sticky bar under the tables. `40-trade-negotiation-1440-full.png`, `41-trade-deal-panel-1440.png`.

6. Advance flow. Six equal-weight buttons sit in the bar (Export, Roster file, Week, To amateur draft, Sim season, Advance), four of them advancing time; during a sim two of them read "Simulating…" at once, and the "Saving to your account…" notice inserts a 33px row above the club bar so the whole page jumps. Fix: one Advance with a split menu, one busy state on that button only, and a fixed-height status slot so the save notice never shifts layout. `61-advance-during-1440.png`, `60-advance-before-1440.png`.

7. Mobile, roster and trades. At 390 the lineup editor's OVR, AVG, OPS and HR columns and the action column are off the right edge inside the panel, the bench's "Replace with…" selects overrun the panel width, the trade asset tables cut after Pos, and the waiver table cuts at Salary. On the club page the roster is three screens down. Fix: below 640px render roster and asset rows as cards (name, pos, one number, one action) rather than tables. `21-roster-lineup-390.png`, `40-trade-negotiation-390.png`, `50-free-agents-390.png`.

8. Player page. The contract decision (Extension talks: a years select, the number he would sign for today, Open talks) is one of six equal panels in a three-column grid, second row, middle. The contract stat card reads "arbitration, through 2026 · arbitration · final contract year", the kind and the service class printed as the same word. The eyebrow runs to five items ("NO. 30 · SS · BKN · ACTIVE · MAY REFUSE AN ASSIGNMENT"). Fix: when the man is in his walk year, lift Extension talks to the first panel with the live tone and dedupe the contract meta. `30-player-1440.png`, `31-player-contract-1440.png`.

9. Free agents, draft, players, farm. Every list page opens with a paragraph explaining the columns ("Overall is current ability on the 20–80 scouting scale…", "Bureau is the league-wide scouting service…"), then a second caption on the waiver panel, then filters; the market table starts at y=560 at 1440 and below the fold at 390. Fix: one-line captions with the glossary term linked, dismissed after the first visit. `50-free-agents-1440.png`, `51-draft-390.png`.

10. GM desk and trade screen. The same offer exists twice with different verbs: on the desk as Accept / Decline and on the trades page's phone panel as Take it / To the table / Decline, with a different summary line ("Jesse Wheeler, SP, 30, 2.87 ERA in 91 IP" against "Jesse Wheeler (SP, 30, 56)"). Fix: one offer component with one set of verbs, rendered in both places. `10-desk-1440.png`, `40-trade-negotiation-1440-full.png`.

11. GM desk. The record and payroll are printed three times above the fold (date bar, stat card, the desk brief sentence) and games back four times, while the 240px left rail clips the division table's GB column to a single digit. Fix: keep the numbers in the date bar only, and give the rail table three columns (club, W-L, GB). `10-desk-1440.png`, `02-desk-contract-decision-1440.png`.

12. Consistency. The player status line has no shared component: desk messages use comma prose, the phone panel uses parentheses with OVR, the trade tables use Pos Lvl Age Role Ovr Salary Thru, the roster editor uses number and position with no age, the reserve list uses "LF · 34 · yes · 2 options left", the player page uses two lines with different separators, the card art uses "SS · BKN · age 31 · S/L", the depth chart uses "59 · 22", the wire uses "Jake Vargas, CF, FA". Contract term appears in a status line only on the player page. Fix: one PlayerLine component (pos, age, OVR, contract through) used everywhere a name is not in a table. `40-trade-negotiation-1440-full.png` shows three formats on one screen.

13. Phone nav drawer. Menu opens a 735px list of twenty page names covering 87% of the viewport, the current page marked only by weight, with the green primary action pushed below the list. Fix: a bottom tab bar with Desk, Club, Trades, More, and the four groups as chip rows inside More. `70-phone-nav-drawer-390.png`.

14. Advance flow. After Advance the desk is identical to before except the date and one more message at the top; nothing marks what is new, and "two that cannot wait" is a sentence rather than a badge. Fix: a "new since last advance" marker on messages and a one-line delta in the brief. `60-advance-before-1440.png`, `62-advance-after-1440.png`.

15. GM desk. The left rail's owner card restates the "Checking in at the break" message that is also on the desk, and the right rail's Departments and The league's dollar cards are settings and finance data, not daily state. Fix: the owner card to one line (name, patience meter, mandate on or off pace); the two money cards to the club's Finances section. `10-desk-1440-full.png`.

## The single change

Make the desk panel the first thing on the desk and the header one row. Remove the five stat cards and the build board from above the inbox (both are one click away and the date bar already carries record, standing and payroll), collapse Export, Roster file, Week, To next stop and Sim season into a menu on the single green Advance, and drop the ticker to one chip. On the July 7 desk that moves the first decision from y=635 to about y=150 at 1440 and from y=800 to under y=300 at 390, cuts the desk header from 17% to under 8% of the viewport, and leaves the eye with exactly two things: the decision and the button that advances the day, which is the loop the design document says the game is.

## What's working

The desk message format. Sender, role, date, a subject that links to the screen, a two-line body, and choices as decision rows with a one-line consequence under each, urgent first. This is the Football Manager shape and it is already here; it just needs to be the first thing on the page. `10-desk-1440.png`.

Standings. Six division panels, ten columns of tabular figures, elimination numbers and odds, nothing to explain. This is the OOTP bar met. `80-standings-1440.png`.

The signing review dialog. Four numbers, one sentence, Cancel and Confirm, no modal stacked on a modal. `73-free-agent-review-dialog-1440.png`.

## Screen by screen

### GM desk (home)

Screenshots: `10-desk-1440.png`, `10-desk-1440-full.png`, `10-desk-390.png`, `10-desk-390-full.png`, `11-desk-decisions-filter-1440.png`, `02-desk-contract-decision-*.png` for the March state with walk letters.

1. Five-second test. At 1440 the eye goes to the green ADVANCE at top right, then has to decide whether the Accept under the Chicago offer is the real job; two candidates, so it takes two sentences. At 390 the only visible action is ADVANCE at y=220; the desk panel and its decision are below the fold.

2. Above the fold at 1440: the brand and nav row, the club status row with six buttons, the score ticker, the page title with five stat cards, the division table, the owner card with the mandate block, the build board, the desk panel with three filter chips and three messages, and the news card. Fourteen distinct elements, of which four are panels and one is a table, with 28 clickable things in the main area and about 22 in the header.

3. The decision: the desk panel's first message (the Chicago offer) and Advance. Glance context: the date bar's club line (record, standing, payroll, date, next deadline), the division table, the owner's patience meter. Noise: the five stat cards (all repeated from the date bar), the ticker, the build board above the desk, the mandate block, the news rail, the transactions rail, the departments card, the league's dollar card, the staff table, the recent and upcoming table, the around the league card, the league leaders card. Everything in the third bucket is a cut or a collapse.

4. Tables: division 4 columns (GB clipped to one digit in the 240px rail), staff 8 columns, departments 4, recent and upcoming 4 without a header. Staff fails; move Grade, Read, Salary and Signed behind a toggle and keep Chair, Who, Age.

5. Clicks from the desk. Offer a trade: Front office menu, Trades, partner select, a checkbox, Ask them, Make the trade: two clicks to the screen, six to the action, fail (an offer already on the desk is one click, Accept). Extend a contract mid-season: club link in the date bar, scroll past business and finances, the player's name, the Contract talks section link, years, Open talks: five, fail; in the seven days after opening day the walk letter's Talk now is one click. Call up a prospect: club link, scroll to the bench, Replace with…, pick a name, Save roster: four, fail; the farm route (Front office, Farm, the Level select) is three. Advance a week: the Week button, one click, pass, but it is a ghost button among five and disabled whenever the calendar is on the clock.

6. Consistency. The club is stated four ways on this one screen: "38-52 4th in division, 7.5 GB · $99.8M of $230.0M" in the bar, five stat cards ("4 of 5 / 7.5 GB", "338 for, 404 against", "$130.2M under budget"), the brief sentence "38-52, fourth in the division, 7.5 back", and the mandate line "43 percent of the budget". Owner mood is a pip meter with a word ("content") and appears nowhere else in the app except Settings, where it is a number. Players in desk messages are comma prose ("Jesse Wheeler, SP, 30, 2.87 ERA in 91 IP, $8.7M through 2026").

7. Mobile. No page-level horizontal scroll; the ticker scrolls sideways inside its band. The header is 280px (33%) before any content; the primary action ADVANCE is above the fold at y=220, the first decision is not (the desk panel begins at y=800 after the stat cards and the build board). The full page is 7,808px.

8. Chrome ratio at 1440: header band 17%, ink 37%, the remaining 46% padding, borders and gutters inside main. At 390: header 33%, ink 43%, remainder 24%.

### Roster / depth chart (your club page, roster editor, organization)

Screenshots: `20-club-1440.png`, `20-club-1440-full.png`, `20-club-390.png`, `21-roster-lineup-1440.png`, `21-roster-lineup-390.png`, `87-organization-1440.png`, `87-organization-390.png`.

1. Five-second test. On the club page there is no obvious click: the fold is a four-line prose header, four stat cards, five section buttons and the ticket price table; Roster is the first section button but the panel under it is Business. On the roster editor (scrolled), Save roster is the click, correctly disabled until something changes.

2. Above the fold at 1440 on the club page: the header bands, the club title with four prose lines and three links, four stat cards, the section nav (five buttons), the Business panel with its caption, ticket input, a nine-row table and four prose blocks with three "Ask Harlan" buttons, and the top of the ledger. Ten elements. On the roster editor: the roster bar (three buttons, two badges), the Lineup card, the Pitching staff card with rotation and bullpen, the Reserve panel. Four panels, 139 clickable controls in view.

3. The decision on the club page: nothing on the fold. Glance context: record, run diff, home/away, payroll cards; the section nav. Noise on the fold: the ticket price table, the market and fans prose, the park buttons, the four-line club history header, the ledger. On the roster editor the decision is the lineup order and the swaps; glance context is OVR, AVG, OPS, HR and ERA; noise is the "Not on the active roster" caption and the hundred-row reserve list that follows.

4. Tables. Ticket price 4; finances by season 19 (fail; keep Season, Revenue, Payroll, Profit, Next budget); lineup editor 7 plus an actions column, 8 (fail, and the actions column is clipped at 1440); rotation and bullpen headerless 6-cell rows; reserve 5; waivers 4; injured list 6. Organization depth chart: 6 columns by level, pass, and the cleanest density in the app. For a rival club the lineup DataTable is the full battingColumns set, 25, and rotation and bullpen 23 each, fail.

5. Clicks. From the desk to the roster editor: club link, then a scroll or the Roster section button, two. Call up: as above, four. Extend: the player's name from the lineup, then Contract talks, then the offer: three from here.

6. Consistency. Lineup rows are "Tanner Parker #15 CF" with OVR in a column; the reserve list is "LF · 34 · yes · 2 options left"; the depth chart is "59 · 22" (OVR then age, reversed from every other screen). Club status cards here read "338 / 404" and "budget $230.0M" where the desk reads "338 for, 404 against" and "$130.2M under budget"; the Division card is missing here.

7. Mobile. The club header runs to 270px of prose before the stat cards; the roster is three screens down. The lineup table overflows inside its panel (OVR, AVG, OPS, HR and the swap select are off the right edge), the bench "Replace with…" selects run past the panel width, the DFA selects wrap to a second line. The primary action Save roster is above the fold only when scrolled to the editor.

8. Chrome ratio at 1440: header 14% (the button row fits on one line here because the primary is DAY, not ADVANCE), ink 29% on the club fold and 42% on the roster editor. At 390: header 33%, ink 41% and 51%.

### Player page (Carlos Garza, SS, walk year)

Screenshots: `30-player-1440.png`, `30-player-1440-full.png`, `30-player-390.png`, `31-player-contract-1440.png`, `31-player-contract-390.png`.

1. Five-second test. There is no single click. The fold holds the face, name, three status lines, four stat cards, six section buttons and six equal panels; the extension decision (Open talks) is in the middle of the second row of panels with the same weight as the glove table. Two sentences to find it.

2. Above the fold at 1440: the face and header block (eyebrow, name, vitals line, mood line, injury badge line), four stat cards, the section nav (six buttons), then Ratings, Defense, Scouting report, The glove by the plays made, Extension talks, Development plan. Fifteen elements, six of them panels, plus one table.

3. The decision: Extension talks (years, the number today, Open talks). Glance context: the eyebrow (position, club, status), the contract card, the season line card, the ratings bars. Noise on the fold: the agent card, the "May refuse an assignment" clause in the eyebrow, the glove by the plays table, the development plan select, the injury badge repeated as a sentence, the progression line in the scouting report.

4. Tables: the glove 7, pass; batting by season 19 (fail; keep Season, Team, Lvl, PA, AVG, OBP, SLG, OPS, HR); splits 8 (fail by one; fold BB and SO); game log 13 (fail; keep Date, Opp, Result, AB, H, HR, RBI).

5. Clicks. From the desk to this decision: club link, scroll, name, Contract talks, years, Open talks: five, fail. Once here, the extension is two clicks (years, Open talks).

6. Consistency. The eyebrow is "NO. 30 · SS · BKN · ACTIVE · MAY REFUSE AN ASSIGNMENT"; the vitals line is "Age 31 · born 1995-05-14 · United States · bats S, throws L · Major-league service 6 years, 65 days" (dots and commas mixed); the card art below reads "SS · BKN · age 31 · S/L"; the contract card meta prints "arbitration" twice. This is the only screen where contract term is in a status line.

7. Mobile. No overflow. The stat cards stack one per row, so Contract is at y=700 and the section nav and Extension talks are two screens down; the primary action for this page (Open talks) is not above the fold.

8. Chrome ratio at 1440: header 14%, ink 28%; the six-panel grid leaves the fold 58% padding and rule. At 390: header 33%, ink 44%.

### Trade screen, mid-negotiation (Chicago's offer on the table, asked, verdict returned)

Screenshots: `40-trade-negotiation-1440.png`, `40-trade-negotiation-1440-full.png`, `40-trade-negotiation-390.png`, `41-trade-deal-panel-1440.png`, `41-trade-deal-panel-390.png`.

1. Five-second test. On the full page the eye lands on the phone panel's Take it; the deal panel with Make the trade and the green verdict is at the bottom, about y=1,950. Two sentences: the offer is up top, the answer to your counter is at the bottom.

2. Above the fold from the top of the page at 1440: title and partner select with a sentence of instructions, the phone panel (a shop-a-player select and button, the offer with three buttons), the build board in full mode (four needs and a thirty-line log), and the top of the two asset tables. Six elements before any table. In the viewport captured after asking: the two asset tables and The deal panel, three panels, 136 clickable controls.

3. The decision: The deal panel (what you send, what you get, payroll after, Ask them, Make the trade, the verdict). Glance context: the partner's stance line ("a bargain hunter: calls often, opens low"), the two payroll metas, the Role and Ovr columns. Noise: the thirty-line need log, the "Pick players and picks on both sides" instruction sentence, the "A man on the block" footnote, the cash and player-to-be-named controls shown before they are relevant, the Lvl column (every row says MLB).

4. Tables. Our assets 10 columns (checkbox, Player, Pos, Lvl, Age, Role, Ovr, Salary, Thru, Block), theirs 9. Fail. Keep checkbox, Player, Pos, Age, Ovr, Salary; move Lvl, Role, Thru and Block behind a toggle.

5. Clicks. From the desk: two to the screen, six to a proposal. With an offer tabled from the desk link, three (To the table, Ask them, Make the trade).

6. Consistency. Three player formats on one page: the phone panel "Jesse Wheeler (SP, 30, 56)", the asset row "Jesse Wheeler | SP | MLB | 30 | Rotation | 56", the deal line "Jesse Wheeler · $8.7M". The partner select shows the club as "Chicago Foundry (38-53)" with no games back; the panel meta shows "payroll $81.5M of $196.0M". The desk's version of the same offer used Accept and Decline; here it is Take it, To the table, Decline.

7. Mobile. Both asset tables overflow inside their panels (cut after Pos); The deal panel stacks cleanly and Make the trade is above the fold once scrolled there, but from the top of the page it is 3,000px down.

8. Chrome ratio at 1440: header 14%, ink 49% (the densest fold in the audit). At 390: header 33%, ink 67%.

### Free agency and draft board (both exist)

Screenshots: `50-free-agents-1440.png`, `50-free-agents-390.png`, `51-draft-1440.png`, `51-draft-390.png`, `73-free-agent-review-dialog-1440.png`.

1. Five-second test. Free agents: Review signing on the first market row, one sentence, but it is at y=600 after two paragraphs and a waiver panel. Draft: nothing to click before the draft starts; Review on the first prospect is the only candidate and the page's caption says "Scroll the table to see all columns", which is a warning, not a call to action.

2. Above the fold at 1440, free agents: title, a two-line instruction paragraph, the waivers panel (caption, one-row table), the market panel (two-line explainer, name filter, position select, checkbox, table). Seven elements. Draft: title with one line, the board panel (four-line explainer, two filters, a count, the scroll caption, the table), the picks panel ("The draft has not started"). Five elements.

3. The decision: the market table's Review signing; the board's Review. Glance context: payroll room in the intro line, the "123 of 123 available" meta, Now and Ceiling columns. Noise: both explainer paragraphs, the waiver caption, the "Scroll the table" caption, the B/T column, the From column, the empty picks panel taking a third of the width before the draft.

4. Tables. Waivers 8 (fail by one; fold Clears), market 8 (fail by one; fold B/T). Draft prospects 14 (fail; keep #, Player, Pos, Age, Now, Ceiling, Ask), draft log 7. The free agent review dialog is not a table and is the right size.

5. Clicks. Sign a free agent from the desk: Front office, Free agents, Review signing, Confirm: four. Draft by hand: Front office, Draft, Review or Draft on a row: three; the desk's "Let the director pick" is one.

6. Consistency. Free agent rows are Pos Age B/T Overall Asking Years; draft rows are Pos Age B/T From Now Ceiling; the farm's are Pos Age Now Ceiling Trend; the players page adds Team, Level, Ceil, Salary. "Overall", "Ovr", "OVR" and "Now" are four labels for the same number across these four tables.

7. Mobile. The waiver table cuts at Salary and the draft table at B/T inside their panels; the market table's first row is below the fold at 390 (the explainer alone is 200px), and the draft's first Review link sits at the bottom edge of the fold. Review signing is not above the fold on free agents.

8. Chrome ratio at 1440: header 14%, ink 24% on free agents (the emptiest fold in the audit) and 31% on the draft. At 390: header 33%, ink 51% and 53%.

### Advance day and week, before and after

Screenshots: `60-advance-before-1440.png`, `61-advance-during-1440.png`, `62-advance-after-1440.png`, `63-week-during-1440.png`, `64-week-after-1440.png`, `60-advance-before-390.png`, `61-advance-during-390.png`, `62-advance-after-390.png`.

1. Five-second test. Before: ADVANCE is the click. During: two buttons read "Simulating…" and a "Saving to your account…" line appears above the club bar, so the fold has three busy signals and a layout shift of 33px. After: the page is the same page with a new date; the new message at the top of the desk is not marked as new.

2. Above the fold, same fourteen elements as the desk; during the sim, one more (the save notice).

3. The decision: Advance. Glance context: the date, the next deadline, the brief's "two that cannot wait". Noise: the other five bar buttons, the two simultaneous "Simulating…" labels, the save notice as a full-width row.

4. Tables: the desk's, unchanged.

5. Clicks. Advance a day: one. Advance a week: one (the ghost Week button). To the next stop: one. Season: one plus a native confirm. All pass on count; the problem is that the six sit side by side with equal weight and the two that matter most (day, week) are the least distinguished.

6. Consistency. After the week the primary changes text to "You are on the clock in the draft" and the desk grows a draft strip with three buttons while the desk message repeats two of them as decision rows; the same choice is offered in two components with different labels ("Let the director pick" as a button and "LET THE DIRECTOR PICK" as a decision row).

7. Mobile. ADVANCE is above the fold at y=220. On the clock the primary becomes a wide green link reading "You are on the clock in the draft" and Week and To trade deadline go grey; the phone week advance could not be captured for that reason.

8. Chrome ratio during the sim at 1440: header 21% (188px with the save notice), ink 37%.

### Modals and drawers that open from the desk

Screenshots: `70-phone-nav-drawer-390.png`, `71-menu-play-1440.png`, `72-menu-front-office-1440.png`, `73-free-agent-review-dialog-1440.png`.

1. Five-second test. The desktop menus are five plain links, one sentence. The phone drawer is twenty links in four groups filling 87% of the viewport; the current page is marked by weight only and the primary action is below the list.

2. Above the fold in the drawer: four group labels and twenty links, then the language select and the club bar. Twenty-six elements. In the review dialog: a title, four rows, one sentence, two buttons.

3. The decision: in the drawer, the page you want; in the dialog, Confirm signing. Glance context: none needed. Noise: the "All games ↗" link in the System group, the language select inside the drawer, the twenty-item flat list where a phone needs four.

4. Tables: none.

5. Clicks. Any page from the drawer: two (Menu, page). The dialog: one to confirm.

6. Consistency. The desktop menus and the phone drawer use the same groups and labels, pass. The dialog uses a title case heading and plain rows; the desk's decision rows use uppercase labels with mono notes. Two styles for "choose one of two".

7. Mobile. The drawer needs no horizontal scroll but pushes the green primary action to y=662; the dialog was captured at 1440 only.

8. Chrome ratio: the drawer is 87% chrome by definition. The dialog covers 31% of the viewport and every line in it is content.
