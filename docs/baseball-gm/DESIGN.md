# Baseball GM: product and simulation design

Design document for a standalone baseball GM game, the second sport in the GM-mode family after the draftanomics franchise mode. This is a thinking document, not a spec to build from yet. It covers positioning, the simulation model, the transaction system, UI, architecture, and a phased roadmap, with open questions at the end.

## 1. Where this sits in the market

Four games define the genre, and each one tells us something:

- Out of the Park Baseball (OOTP) is the depth ceiling. 25+ annual versions, pitch-by-pitch play-by-play, full minor league systems, real rosters via license, historical replay back to 1871. It's also $40 every year, desktop-first, and its UI is a wall of early-2000s tabs. New players bounce off it constantly.
- ZenGM (Basketball GM etc.) proved the opposite bet: free, browser-based, sim runs entirely client-side, you're playing within 30 seconds of landing on the page. Its baseball game is good but nowhere near OOTP's transaction and farm-system fidelity.
- Hardball Dynasty (WhatIfSports) had the best farm-system gameplay ever made. Coaching hires per affiliate, real promotion dilemmas, scouting budgets that mattered. It's been abandoned for a decade and looks like it. Its orphaned player base is a real, reachable audience.
- Baseball Mogul got financial simulation and sim speed right and almost nothing else.

Nobody occupies the quadrant we want: OOTP-grade fidelity in a browser, with a UI that looks like it was designed this decade, playable free in 30 seconds. That's the product. Baseball is the right sport to plant this flag on because the baseball-sim audience has the highest tolerance for depth of any sports-game audience. They read Fangraphs. They know what a 40-man crunch is. Depth isn't a cost for them, it's the product.

The multi-sport strategy: each sport ships as its own product with its own identity and domain, on shared platform infrastructure (accounts, save format, table components, league scheduling, faces engine). One account, a family of GM games. Baseball is the flagship for depth; draftanomics' franchise mode already covers its sport; more follow.

## 2. Design pillars

Everything below hangs off five commitments. When two features conflict, these decide.

1. Real rules, not approximations. For a GM, the transaction system is the game. Options, waivers, service time, arbitration, the Rule 5 draft. Fake versions of these ("players just become free agents after their contract") gut the strategy. We implement the actual MLB ruleset, configurable where leagues differ.
2. Fog of war. True ratings are never shown. You see your scouts' estimates, with error bars, and the error bars are the game. Certainty is something you buy, with scouting budget and time.
3. Layered depth. Playable in ten minutes, masterable in hundreds of hours. Every subsystem has a "delegate this" switch with a competent AI behind it. A casual player who auto-delegates the minors and scouting still has a complete game. Depth is opt-in, never a toll.
4. Statistical fidelity. A simulated season's aggregate output should be indistinguishable from a real MLB season: league slash lines, run environment, the shape of the leaderboards, the distribution of team win totals. This is testable and we test it (section 8).
5. A living world. History accumulates. Awards, records, Hall of Fame inductions, retired numbers, franchise droughts, that one fictional shortstop who hit .360 in 2041 and everyone in your league's Discord still talks about. Long-run attachment is the retention engine, and it's built from accumulated history plus a narrative layer that surfaces it.

And one aesthetic commitment: beautiful density. Baseball UIs are either dense and ugly (OOTP) or clean and shallow. Baseball Savant and The Athletic proved dense can be gorgeous. That's the bar.

## 3. The player model

Players are the atoms. Get this layer right and everything downstream (sim, trades, development) has something real to operate on.

### Ratings

Internally, ratings are continuous (0-1000). Displayed on the 20-80 scouting scale, because it's baseball-native and communicates uncertainty culturally: everyone who follows prospects already knows what "a 45 hit tool with 60 raw" means.

Batters:

| Rating | Drives |
|---|---|
| Contact | strikeout avoidance, BABIP |
| Power | exit velocity distribution, HR/fly ball |
| Eye | walk rate, chase rate, count leverage |
| Avoid K | whiff rate, distinct from contact quality |
| Speed | baserunning, infield hits, range component |
| Batted-ball profile | GB/FB tendency, pull/spray, not a "rating" but a fingerprint |

Contact and Avoid K are deliberately separate: it's the difference between Luis Arraez and Joey Gallo, and collapsing them into one number makes every hitter feel the same.

Pitchers get the classic trinity (Stuff, Movement, Control) as the top-level summary, backed by a per-pitch arsenal underneath: each pitch has a type, velocity, and quality rating, and the arsenal is what scouts actually report on ("plus slider, fringy change, needs a third pitch"). Plus Stamina, Hold Runners, GB/FB tendency, and a starter/reliever suitability derived from arsenal depth and stamina.

Defense: per-position ratings for range, arm strength, arm accuracy, error avoidance, plus catcher-specific skills (framing, blocking, game-calling). Position experience is tracked separately from ability, so moving your blocked shortstop to second base has a real adjustment cost.

Off-field: durability, work ethic, intelligence, leadership, and a personality profile (greed/loyalty, ego, adaptability) that feeds contract negotiations, morale, and development. Personality should be scouted like everything else, and mis-scouting makeup should be one of the ways a top pick busts.

### Current vs. potential, and development

Every rating has a current value and a potential ceiling. Development is a stochastic walk toward (and sometimes past, and sometimes never near) potential, shaped by:

- Age curves per skill. Speed peaks at 23 and erodes steadily. Power peaks around 27. Eye keeps improving into the early 30s. Stuff falls off a cliff with velocity loss; control can age gracefully. Skill-specific aging is what makes old players interesting instead of uniformly worse.
- Playing time at the appropriate level. A prospect rotting on a bench develops slower than one playing every day one level down. A prospect overmatched two levels up can stall or regress. This is the core promotion dilemma and it has to have teeth.
- Coaching and facilities, per affiliate. Hiring a good AAA hitting coach is a real decision with a real effect size.
- Work ethic and intelligence, mostly hidden, partially scoutable.
- Injuries, which can permanently cap or reroute a career (the pitcher who loses 3 mph and has to reinvent himself as a command guy).
- Randomness. Breakouts and busts must both happen at realistic rates, because the possibility of either is what makes prospect ranking a game and not a spreadsheet lookup.

## 4. The simulation engine

### Two-fidelity, one distribution

The engine question that decides everything else: simulate pitch-by-pitch, or at-bat level?

Pitch-by-pitch is required for watchability, realistic pitch counts, and pitcher usage. But simulating ~300 pitches a game for 2,430 games a season for a 30-team league, times minor league affiliates, is the performance budget. The answer, and I'd treat this as a hard architectural rule: one statistical model, two rendering fidelities.

The core model resolves each plate appearance from the matchup (batter ratings vs. pitcher ratings vs. defense vs. park vs. base-out state), using odds-ratio math calibrated to the league environment. That's the fast path, and it's what runs when you sim a week. When a game is being watched, or when pitch-level detail is needed (pitch counts always are), the engine expands the plate appearance into a pitch sequence conditioned on the already-sampled outcome. The expansion is constrained so that pitch-level aggregates (pitches per PA, first-pitch strike rate, chase rate) match the players' profiles. This is roughly what OOTP does, and it's the only way to get sub-minute season sims and a watchable game from the same engine without maintaining two models that drift apart.

Pitch counts and times-through-the-order penalties still need to exist on the fast path, so the fast path carries a lightweight pitch-count estimator per PA. It doesn't need the sequence, just the count.

### Batted-ball resolution

When contact happens, sample an exit velocity and launch angle from the batter's profile modulated by pitch quality, then resolve through:

1. A park-aware landing model (each park has real dimensions, wall heights, foul territory, altitude, producing per-handedness factors for 1B/2B/3B/HR).
2. Defensive conversion: fielder range and positioning turn would-be hits into outs. This is where defense earns its ratings, visibly, in the play-by-play.

This gives us Statcast-flavored outputs (a player page can show an EV/LA profile) essentially for free, and it makes park effects and defense emergent rather than bolted-on multipliers.

### Baserunning, managing, and game state

Baserunning is advancement matrices (first-to-third rates, tag-up decisions, steal attempts) driven by speed, instincts, outfielder arms, and the manager's aggressiveness profile.

Every AI manager has a tendency profile: bullpen leverage philosophy, platoon strictness, bunt/steal appetite, hook quickness, closer orthodoxy. Managers should be hireable, fireable, and legibly different. When you play manager-mode in a watched game, you make these calls yourself.

### Determinism and the permanent record

Seeded PRNG, fully deterministic: the same league state and seed produce the same game. Every game ever played stores a box score and a compact play-by-play log. Full replayability, cheap "condensed game" highlights, and a permanent statistical record that the history layer is built on. Storage for this is a solved problem at the compression levels a text log allows.

### Calibration as CI

A statistical test suite runs thousands of simulated seasons and asserts distributional properties: league BA in a configured band, run environment on target, team win totals shaped like reality (a 116-win team should be rare, a 130-win team should be effectively impossible), leaderboard plausibility (someone occasionally hits .350; nobody hits 90 homers), aging curves matching their spec in aggregate. Any engine change that shifts these fails CI. This is the enforcement mechanism for pillar 4, and it's what the era settings (deadball, 1968, 1999, current) tune against.

## 5. The GM's actual game: rosters and transactions

This is the moat. It's what OOTP has and ZenGM doesn't, and it's the part we refuse to fake.

### Roster architecture

26-man active roster, 40-man roster, and a full farm: AAA, AA, High-A, Single-A, and a complex/rookie level, with an optional international academy. Injured list at 10-day, 15-day (pitchers), and 60-day (frees a 40-man spot, and knowing that is gameplay).

### The rules that create dilemmas

- Option years. Three per player. When they're gone, the player must clear waivers to go down. The out-of-options veteran in spring training is one of baseball's classic squeezes and the game must produce it naturally.
- Waivers, DFA, and outrighting, with the 7-day clock and the real claim-priority order.
- Rule 5 draft, including the must-stay-on-the-26-man-all-year condition. The November 40-man protection deadline is a genuinely great annual puzzle and we get it for free by implementing the rule.
- Service time. Pre-arb years, Super Two, three arbitration years with a comparables-based salary model, free agency at six years. Service-time manipulation should be possible and should carry the real costs (grievances, player resentment, fan-base noise in the news layer).
- Contracts with the full toolkit: club/player/vesting options, opt-outs, incentives, no-trade clauses, salary deferrals, extensions, retained salary in trades. Qualifying offers with draft-pick compensation.
- A competitive balance tax with escalating and repeater penalties, plus revenue sharing. League financial structure (CBT vs. hard cap vs. nothing) is configurable per league, because custom leagues will want it.

All of it enforced by a transaction validator: there should be no reachable illegal roster state, ever, and that validator is property-tested (section 8).

### Acquisition channels

- Amateur draft: 20 rounds, slot values, a bonus pool, over/under-slot strategy, unsigned picks and compensation. Draft prep (the big board, scouting allocation) is a season-long subsystem, and the draft room is a marquee UI moment.
- International amateur free agency: July 2 class, bonus pools, the early-verbal-agreement meta, an academy pipeline. Ships in a later phase but the player model is designed for 16-year-old signees from day one.
- Free agency: a market model where player decisions weigh money, term, contender status, role, geography, and personality, with agents who leak to the press. Markets should develop over the offseason (early frenzy, February freeze-outs) rather than resolving instantly.
- Trades: see below.
- Posting system for foreign pro leagues, later phase.

### Trade AI

The single hardest AI problem in the genre and the one players judge hardest. A GM game with an exploitable trade AI is a solved puzzle, and solved puzzles die.

The valuation core is surplus value: projected WAR by year (from the AI's own scouted view of the player, not the true ratings), priced at a dollars-per-WAR curve, minus salary, discounted for risk and time. On top of that, team context: contenders overweight now, rebuilders overweight later, teams pay premiums to fill holes and discount surplus at blocked positions. Each AI GM gets a persona (risk appetite, prospect-hugging, win-now desperation, and a memory of how you've treated them).

Design rules learned from every game that got this wrong: the AI never accepts a trade it wouldn't propose, quantity never sums to quality (three 45s don't buy a 70), and there's a fairness governor that flags lopsided accepted trades in testing. Support 3-team deals, cash, PTBNL, and salary retention. Expose an honest interest meter during negotiation ("they like this but want more certainty") instead of silent rejection loops.

## 6. Scouting: the fog of war

You never see true ratings. You see estimates.

- Your scouting department is a budget, a director, and individual scouts with accuracy profiles and specialties (amateur, pro, international, pitching). Better scouts cost more. Where you assign them determines what sharpens.
- Estimates are displayed as a value plus confidence, visualized as an error band on the 20-80 scale: "hit: 50 (40-60)" from a single look, tightening to "50 (47-53)" after a season of coverage. The band is drawn, not just implied; the whole UI treats uncertainty as a first-class value.
- Accumulated stats reveal information too, at the rate sample sizes actually allow. A thousand minor league PAs tell you a lot about contact and eye, less about how the power plays up a level.
- A public consensus view (an OSA-style scouting bureau and prospect rankings) exists as a free baseline, so casual players have opinions to lean on and sharp players have a market to beat. The distance between the bureau's view and your scouts' view is where trades and draft steals live.
- Makeup and durability are the hardest things to scout, and busts should trace back to that at realistic rates.

## 7. The world around the roster

### Injuries and fatigue

A body-part-level injury model: day-to-day knocks, IL stints, and career events (Tommy John with its 14-month recovery and command wobble afterward). Fatigue accumulates from pitch counts, short rest, and catcher workload, and elevated fatigue raises injury risk and dents performance, so workload management is a real ongoing decision rather than flavor. Durability ratings and injury history compound: some players are made of glass and your medical staff's job is to know which ones before you sign them.

### Finances and the owner

Revenue: gate (an attendance model driven by winning, market size, star power, ticket pricing, and stadium quality), local TV (market-size-based, renegotiated on performance), national TV share, playoff gates, merchandise. Expenses: payroll, staff, draft and international bonuses, facilities. The owner sets the budget, has a patience profile and goals, and fires you if you fail them. Getting fired, and taking over another franchise mid-rebuild, should be a supported career arc, not a game over. Stadium construction and relocation are a later-phase system.

### History and narrative

Everything is recorded and everything is browsable: any past season, any career, any franchise's full timeline. Awards with realistic voting (MVP, Cy Young, ROY, Gold Gloves, All-Star selections), a Hall of Fame with a voting model and induction ceremonies, milestone tracking (3,000 hits, 300 wins, hitting streaks), all-time single-season and career record books that your league's players actually chase.

On top of the record sits a news engine: a beat-writer layer that generates stories from real sim events. Trade rumors sourced from actual AI GM negotiations, agent gossip, hot-seat columns, prospect hype, milestone watches, a weekly digest. This is not decoration. In long-running sim leagues, the stories are what players screenshot and share, and shared screenshots are the acquisition channel.

### Identity: faces, logos, cards

Procedural vector faces (the ZenGM approach, executed better: age progression, facial hair eras, expressions), a team identity builder (logos, uniforms, colors), and a baseball-card renderer that produces genuinely beautiful shareable images of any player-season. The card renderer is a marketing engine disguised as a feature.

### Real players

We ship fictional. Licensing MLB players is not a realistic opening move, and OOTP owns that license anyway. Instead: a great name generator (era- and origin-aware), and first-class import/export so the community can build and share real-roster files, historical seasons, and fictional universes, exactly the mod path that ZenGM and pre-license OOTP thrived on. League customization (size, structure, playoff format, DH rules, era settings) is native, because custom leagues are where the most devoted players live.

## 8. UI and experience

### The loop

The game advances day by day, and the core loop is inbox-driven, borrowed from Football Manager because it's the best solution anyone has found: you press Continue, the world advances, and the game stops you only when something needs you. A DFA decision with a clock on it. Arb figures due. Your scout filed a report that changed a grade. A trade offer. The inbox is triaged and everything in it deep-links to the screen where you act. A player who only ever presses Continue and handles the inbox is playing a complete, coherent game; every screen beyond that is depth they wander into.

Commitment presets at league creation set the delegation defaults: Casual (minors and scouting auto-managed, weekly digests), Standard, and Full Control. These only set defaults; every delegation is individually reversible later.

### Design language

Modern editorial sports design: The Athletic's typography discipline, Baseball Savant's data density, and the tactile warmth of a well-designed baseball card. Light and dark themes from day one. A restrained palette that lets 30 team identities provide the color. Numbers set in tabular figures everywhere. This should be the best-looking sports management game ever made, and given the competition that is a low bar we should clear by a lot.

### The screens that matter most

- Franchise home: today's date, next game, standings snapshot with playoff-odds sparklines, the inbox, roster alerts, and a farm report. The whole game is reachable in two clicks from here.
- Player page: the centerpiece. A card-style header (face, vitals, badges), then tabs: scouting view (ratings as error bands), stats (career, splits, game logs, sortable everything), contract and transaction history, a career timeline, and side-by-side comparison mode. Every player name anywhere in the app links here.
- League pages: virtualized sortable/filterable stat tables that handle 150 years of history without breaking a sweat, leaderboards, transaction wire.
- Trade center: two-panel deal builder, live interest meter, counteroffers, a rumor board fed by the news engine.
- Draft room: your big board with tiering, live pick ticker, scout reports in a side panel, pool math always visible. This screen should feel like an event.
- Game watch: a stylized 2D field view, pitch-by-pitch narration, live win-probability graph, adjustable speed, a condensed-game mode that plays only the leverage moments, and manage-mode where you make the in-game calls. Watchability is a phase-3 polish target, but the pitch-level engine hooks for it exist from the start.

Interaction principles: everything hyperlinked, a command palette for power users (jump to any player, team, or season by typing), keyboard-first tables, browsable time (any past date's standings and box scores), and no modal stacked on a modal, ever.

## 9. Technical architecture

- Client-first, like ZenGM, because it's the right call and not just the cheap one: the sim runs in a Web Worker, league state lives in IndexedDB, and the game works offline as a PWA. A free player costs us approximately nothing to serve, which is what makes free-forever viable as the acquisition strategy.
- The sim engine is a pure, deterministic, UI-agnostic TypeScript package (say `@gm/baseball-sim`): league state in, events out, no DOM, no storage, no randomness outside the injected seeded PRNG. That purity is what lets the identical engine run server-side later for multiplayer leagues, and it's what makes the calibration suite possible.
- Monorepo with a platform layer shared across the sports family: table/virtualization components, the faces engine, save-format infrastructure with versioned migrations, league scheduling primitives, the inbox framework, accounts. Sport products plug into it. The first real platform task is an extraction audit of the draftanomics franchise mode: what generalizes (probably tables, save handling, maybe scheduling) and what was sport-shaped all along.
- Save files are versioned, migratable, and exportable as JSON. Export is sacred: the player owns their league, full stop. Cloud sync is the natural paid feature precisely because local-first makes it optional.
- Performance target: a full 162-game season for a 30-team league plus minors sims in under 60 seconds on mid-range hardware, via the fast path from section 4. Sim speed is a retention feature; OOTP players structure their play sessions around how slow simming is.
- Testing: the statistical calibration suite as CI (section 4), property tests on the transaction validator (generate thousands of random transaction sequences, assert no illegal roster state is ever reachable), and golden-master tests on the engine (a known seed produces a known season, so refactors can't silently change behavior).

## 10. Business shape

Free to play, genuinely and permanently, for the full single-player game. That is the ZenGM lesson and the entire acquisition strategy: the funnel is someone bored at work who is 30 seconds from a playable league.

Paid tier: cloud saves and cross-device sync, online multiplayer leagues (the commissioner-and-friends model that keeps OOTP communities alive for decades), premium stat packs and visualizations, maybe cosmetic card frames. Nothing pay-to-win, nothing that gates the simulation itself. Community infrastructure (league export sharing, roster-mod hub, Discord) is an investment, not a cost, because long-running shared leagues are the stickiest thing in this genre.

## 11. Roadmap

Ship a real game at each phase. The graveyard of this genre is full of projects that tried to build OOTP in one invisible 18-month push.

Phase 0, platform: extraction audit of draftanomics franchise mode, the monorepo platform layer, save format, the sim-engine skeleton with the calibration harness in place before the first feature lands on it.

Phase 1, a playable core: 30-team majors-only league, PA-level sim with the batted-ball model, ratings/aging/development, amateur draft, simple contracts and free agency, standings, full stats, awards, season-over-season play. This alone is a ZenGM-class game people will happily play, and it validates the engine and the UI language.

Phase 2, the moat: full minor league system, 40-man rules, options, waivers, DFA, Rule 5, service time and arbitration, scouting fog of war, injuries, trade AI v2 with personas. This phase is what makes it a baseball GM game rather than a sports GM game with baseball stats.

Phase 3, immersion: watch mode with the 2D field, the news engine, finances and the owner, park factors fully surfaced, faces, the card renderer, manager personas.

Phase 4, the world: international signing pipeline, historical and era play, posting systems, multiplayer leagues on the server-side engine, the mod/import hub, stadium and relocation play.

## 12. Open questions

1. Extraction scope. How much of the draftanomics franchise mode is genuinely reusable platform vs. sport-shaped code that would be forced generalization? Needs a code audit before phase 0 is scoped; the answer decides how much of phase 0 exists.
2. Brand architecture. One umbrella site with sport products under it, or fully separate brands sharing invisible infrastructure? Affects accounts, domains, and cross-promotion, and it's cheaper to decide before the first standalone launch than after.
3. Multiplayer timing. Designing the engine for server-side reuse is cheap now; building multiplayer is expensive whenever it happens. Recommendation: engine purity now, multiplayer no earlier than phase 4, and let single-player league sharing (exports, screenshots, the card renderer) carry community until then.
4. Fictional-only conviction. The recommendation here is firm (fictional plus mod support), but if there's any appetite for pursuing a license or a players-association deal later, the import format should be designed for it from the start.

## 13. What the first draft missed

A second pass against how a real league year actually runs. Grouped by how much they change what gets built. The first group are things that would have bitten us in phase 1 or 2 if we hadn't named them.

### Things that change the architecture

The other 29 teams. The doc spends a section on trade AI and almost nothing on everything else an AI franchise has to do: build a 40-man, set a rotation and lineup, promote and demote prospects, decide who to DFA, bid in free agency, hand out extensions, run a rebuild-or-contend cycle, stay under its budget, protect the right players before the Rule 5 draft, non-tender the right arb cases. A league where AI teams manage themselves badly feels dead within three seasons, and the player notices long before they can say why. AI franchise management is a first-class subsystem with its own test suite (sim 50 seasons with no human, assert the AI teams' payrolls, farm depth, win distribution and roster legality all look like a real league). Difficulty settings live here, as do AI GM personas.

The calendar state machine. A baseball year is a long sequence of dated phases with different rules in each: World Series, awards, the five-day qualifying-offer window, the 40-man protection deadline, non-tender deadline, Winter Meetings, Rule 5 draft, arbitration filing and hearings, spring training with cut-down dates and opt-out clauses on minor league deals, Opening Day, the trade deadline (after which there are no trades, only waiver claims), September 1 roster expansion to 28, postseason. Plus the amateur draft mid-July and the international signing period in January. Every transaction rule is conditional on what phase it is. This needs to be an explicit, single state machine that the sim, the validator, the inbox, and the "sim to" guards all read from, and it needs to stop the player automatically before any deadline with a decision attached. It should be one of the first things built, because everything else hangs on it.

World generation. Starting a fictional league is not "generate 30 rosters." Day one has to look like a league that already exists: players with plausible ages, service time, option years used, contract states, injury histories, prior-season stats and career totals, awards already won, franchise histories, past champions, record books with names in them. Otherwise the history layer starts at zero and the first ten seasons feel like a demo. Generating a coherent fake back-history (say 30 prior seasons, summarized rather than simulated) is a real chunk of work and belongs in phase 1, not as polish.

The stats spec. "Full stats" hides a lot. WAR needs a replacement level, positional adjustments, park factors, a defensive metric, and a pitching model (RA9- or FIP-based, pick one and explain it). wRC+, OPS+, ERA+, FIP, xFIP, WPA, leverage index, plus the qualification thresholds (502 PA, 162 IP) that decide who appears on leaderboards, plus era-adjusted versions so a 1968-setting league and a 1999-setting league produce comparable value numbers. This deserves its own document before phase 1, and it has to be decided alongside the engine, because the batted-ball model determines which defensive metrics are even computable.

Rule-era configuration. The doc says "era settings" and means run environment. The rules themselves have changed constantly: universal DH, the pitch clock, shift restrictions, the three-batter minimum, the extra-innings runner, the 13-pitcher cap, the two-way player designation, mound-visit limits, roster sizes, playoff formats, the draft lottery, the pre-arbitration bonus pool. We need to pick a baseline CBA year (the current one) and treat each rule as a toggle in a ruleset object rather than a hardcoded fact, or historical play in phase 4 becomes a rewrite.

Saves that grow forever and engines that change. A hundred seasons of play-by-play in IndexedDB is a storage problem with a retention policy attached (keep box scores forever, compact play-by-play for seasons older than N into summaries). Separately: determinism is per engine version, and a league saved under version 1.3 will sim differently under 1.4. That's acceptable if it's explicit. What's not acceptable is a migration that corrupts a 60-season league. Save versioning and migration testing against a corpus of real long-running saves has to exist before there are real long-running saves.

Mobile. The ZenGM audience plays on phones, a lot. Dense sortable tables, a trade builder, and a draft board are all hard on a 390-pixel screen, and "responsive" retrofitted onto a desktop-first data UI usually means unusable. Every marquee screen needs a phone layout designed at the same time as the desktop one.

### Systems that were missing or thin

- Schedule generation. 162 games with series structure, the divisional/interleague balance, off days, travel, the All-Star break, rainouts producing doubleheaders, and separate shorter schedules per minor league level (AAA plays ~150, A-ball ~132, complex leagues ~55). Weather is a day-level input to the park model (temperature and wind affect carry) and to rainouts.
- Coaching and front office staff. A manager plus bench, pitching and hitting coaches at each affiliate, a farm director, a scouting director, medical staff, and an analytics department. Staff have contracts, get poached, and your good AAA hitting coach gets hired away as somebody's manager. Department budgets (scouting vs. development vs. analytics vs. medical) are the owner's budget made into real trade-offs. The analytics department is a second information source alongside scouting, one that gets sharper with sample size where scouts get sharper with observation, and the two disagreeing is a modern-era dilemma worth having.
- Development plans. Position changes (shortstop to second, catcher to first, starter to reliever), learning a new pitch, a swing change. Hardball Dynasty's version of this was the best in the genre. Each is a decision with a time cost and a failure chance.
- Minor league roster rules. Per-level roster limits, the domestic reserve list cap, minor league free agency and its opt-out dates, the minor league injured list, rehab assignments with their 20/30-day limits. These are the rules that make the farm a puzzle instead of a list.
- Morale, roles, and the clubhouse. Playing-time complaints, trade requests, veterans who want a role, a clubhouse that reacts to a fire sale. Keep the performance effect small and the transaction effect real: an unhappy player asks out, an agent leaks it, the news engine runs it.
- Player agents and negotiation as a conversation. Extension talks, pre-arb deals, the file-and-trial arbitration posture, and a negotiation UI that reads as a dialogue with positions and counters rather than a form with a salary field.
- Retirement, and life after. Retirement decisions modeled from age, performance, and money left on the table. Retired players become coaches, managers, scouts, broadcasters, and eventually Hall of Fame candidates. Your franchise legend managing a rival in 2052 is the kind of thing long-run leagues are for.
- Salary and revenue inflation over league time. A league in its 40th season shouldn't have 2026 salaries. The minimum salary, the CBT threshold, the dollars-per-WAR curve and revenue all drift upward on a configurable schedule. Optional CBA renegotiation events later.
- Expansion, relocation, and realignment. Custom leagues want it; long leagues want it as an event.
- In-game strategy detail the manager AI needs: double switches in non-DH leagues, defensive replacements, intentional walks, pickoffs, pitchouts, openers and bulk relievers, six-man rotations, position players pitching in blowouts. Umpire strike-zone variance as an input to the framing model.
- Suspensions and off-field events. PED suspensions with the 80/162/lifetime ladder are in scope; they're baseball. Anything darker is not, on purpose.
- Handedness, switch hitters, and how platoon splits are generated per player rather than as a league-wide constant.
- Two-way players, uniform numbers, nicknames, nationality-aware name generation and international player origin distributions.

### Product and platform gaps

- Tutorial and glossary. The whole depth pitch collapses if a new player hits "DFA" with no idea what it means. Contextual help on every rule term, a guided first season, and an in-app glossary. This is what makes layered depth actually layered.
- Scenarios, challenges, and God mode. "Take over the 105-loss team." "Win with a bottom-five payroll." ZenGM's God Mode (edit anything, achievements disabled) is one of its most-used features and costs almost nothing. Achievements give the single-player game goals the owner's goals don't.
- Trademarks. We can't ship the Yankees, the MLB logo, or "Major League Baseball." Real cities with fictional identities (the ZenGM approach) is fine. The name generator should avoid producing real active players' names. Marketing copy needs the same discipline.
- Localization. Japan, Korea, Taiwan, and Latin America are enormous baseball markets and the sim genre is underserved there. Internationalization is cheap on day one and a rewrite on day 800. Units, dates, and number formatting included.
- Accessibility. Team colors as the primary palette means colorblind-safe pairings and non-color cues everywhere. Keyboard navigation and screen-reader support on the tables, which is where most of the game is.
- Tech stack decisions that need to be made before phase 1 and made together with draftanomics: UI framework, the IndexedDB layer, the worker RPC boundary, the table and chart libraries, the design token system. These are platform-layer choices, so they're either shared or they're a fork on day one.
- Untrusted imports. League files and roster mods are user-uploaded content and need schema validation and size limits, both for security and so a bad mod fails with a message rather than a corrupted league.
- Playtesting and exploit hunting as a planned phase, not a hope. The trade AI in particular needs adversarial testers whose job is to break it, and a feedback channel to report the trade that shouldn't have gone through.
- Product analytics and the boring parts: where do new players churn (probably the offseason), autosave, confirmation on irreversible actions (a DFA is irreversible; a sim past the deadline is irreversible), payments, terms and privacy, community moderation for shared leagues, and support load.
- Multiplayer specifics, when it comes: commissioner tools, turn deadlines, trade review, async sim schedules. Deferred to phase 4 but the calendar state machine should be built knowing it'll run on a server one day.
