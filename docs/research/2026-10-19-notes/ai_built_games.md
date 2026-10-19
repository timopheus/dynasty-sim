# Games built primarily with AI coding agents (2025–2026): what shipped, what worked, and the process behind it

*Method note: in this session, direct page fetching (WebFetch/curl) was blocked by the egress proxy (403 / DNS failure). So every finding below comes from search-engine extracts of the cited pages (about 20 searches), not from full-page reads. Quotes may be lightly paraphrased by the search tool. Numbers labelled "creator-reported" were not independently verified. Dates are relative to 2026-10-19.*

## 1. Which notable games were built mostly with AI coding agents? Reception, sales/players, genre, art approach

### Takeaway
By late 2026 the visible "AI-agent-built" games are mostly **small browser games, jam entries and a few cheap Steam titles**. The best-received ones combine 100% AI-written code with heavy human direction. Examples are the Vibe Jam 2026 winner (capybara delivery, $25k prize) and a Telegram text RPG with a few hundred players. Games marketed *as* "100% AI" (Codex Mortis) got mixed-to-negative reception, and most AI-agent Steam releases have near-zero reviews. The single big financial outlier, fly.pieter.com (2025), is widely attributed to its creator's existing audience, not to the game.

### Cited Findings
**Successes (by reception or measurable traction)**
- **"A Game About Capybaras Delivering Food" (leocooout), 1st place, Cursor Vibe Jam 2026, $25,000.** It is a browser game (Three.js) with single-player and multiplayer modes: you are a capybara delivery driver in Rio, buy items at a minimart and deliver them. Levels praised its polish, retro PlayStation-style graphics and AI-generated soundtrack — [levelsio on X](https://x.com/levelsio/status/2067437528320512144?lang=en); [winners post](https://x.com/levelsio/status/2067364066193203333); [Admix](https://admix.software/blog/ai-game-won-25k-vibejam-2026)
  - Creator: an iOS developer with about 9 years of experience (**not** a non-programmer). The game took about 15 days. He reports **100% AI-written code, about 27,000 lines, 188 commits**, mostly Claude Code on Opus 4.7 — [Admix](https://admix.software/blog/ai-game-won-25k-vibejam-2026); [AIBase](https://news.aibase.com/news/29583); [oldhouseinhoghollow](https://oldhouseinhoghollow.com/industry/20260714-9). These numbers are creator-reported: "a creator-reported measure, not an independent code provenance report" — [whatisgm](https://whatisgm.com/blogs/ai/the-capybara-game-is-a-better-ai-case-study-than-the-one-prompt-myth). Admix notes the $25k is a prize, not game revenue — [Admix](https://admix.software/blog/ai-game-won-25k-vibejam-2026)
  - Art and audio: textures from GPT Images-2 and Grok, 3D models from Tripo3d, audio from Suno and ElevenLabs — [Admix](https://admix.software/blog/ai-game-won-25k-vibejam-2026)
  - Jam scale: about 945 games by 938 builders, $52k in prizes. The rules required **≥90% of code written by AI** — [JamVault archive](https://jamvault.org/); [Digg summary](https://digg.com/tech/g7b26kp1). 2nd place: Fanto's Mega-Mart; 3rd place: WenWare; "Most Polished": Tiny Skies; "Most Atmospheric": Eyrie — [levelsio on X](https://x.com/levelsio/status/2067364066193203333). Levels' post title frames the 2026 games as "getting close to real production quality" — [levels.io](https://levels.io/vibe-jam-2026-winners-quality) (full text not retrieved)
- **Zapaleni.** A Ukrainian text RPG inside a Telegram bot, based on Slavic folklore, with a co-op RPG loop. It was built by **a game-studio PM who "cannot code"** and "wrote zero lines of code". The prototype took "two evenings"; the game was live after six weeks. The creator reports 53,302 expedition runs over 14 days and 471 total players (creator's own dashboard, unverified). Post published around late July 2026 — [RetroStyle Games blog](https://retrostylegames.com/blog/claude-code-game-dev-case-study/)
- **Meet Claude (Farniente Lab), Steam, free, released 13 Mar 2026.** A short satirical narrative adventure about an AI houseguest that slowly takes over daily life: 1–2 hours, multiple endings. The developer says writing, code, art, music and deployment were all made with generative AI, "primarily Claude" — [Steam](https://store.steampowered.com/app/4437280/). Aggregators show about 96% positive of 25 reviews ([gg.deals](https://gg.deals/game/meet-claude/)) or 100% of 20 ([nodal.gg](https://nodal.gg/game/meet-claude-4437280)), likely different snapshots. No press reviews found.
- **fly.pieter.com (Pieter Levels), browser flight MMO, Feb 2025 (older than 2026).** Built with Cursor plus Grok/Claude; the prototype reportedly took about 3 hours. Levels reported **$87k MRR (~$1M ARR) in 17 days and 320,000 players**, monetised through in-game ad slots, blimps and a $29.99 F-16 — [Levels on X](https://x.com/levelsio/status/1899596115210891751); [levels.io](https://levels.io/fly-pieter-com-vibecoded-flight-simulator); [builtwithagents](https://www.builtwithagents.ai/strategy/vibe-coded-flight-sim-1m-arr-17-days). The later trajectory is disputed: one source says revenue fell to "$0/m" per his mid-2026 X bio ([Promptway](https://promptway.com/blog/pieter-levels-flight-sim-to-zero)); another claims $70–90k MRR a year on ([KODiQ](https://kodiq.ai/article/ai-news-2026-05-19-pieter-levels-flight-sim-1m-arr-17-days/)). KODiQ argues it was "the conversion of a 10-year audience asset", not a viral launch.

**Middling or no traction**
- **Catvivors (Yotta Content LTD), Steam Early Access, 13 Mar 2026, about $4.49–4.99.** A roguelite auto-battler built with Claude Code as the main assistant — [Steam](https://store.steampowered.com/app/4450240/Catvivors/); [dev's Medium](https://pchojecki.medium.com/ai-helped-me-solo-dev-a-game-on-steam-f84a2425be10). The Steam page showed **no user reviews**, Metacritic has none, and no sales were disclosed — [gg.deals](https://gg.deals/game/catvivors/); [Metacritic](https://www.metacritic.com/game/catvivors/). The developer concludes AI "still requires a human driver" (same Medium post).
- **Spell Cascade (yurukusa), browser roguelike in Godot 4.3.** Made by a self-described non-engineer ("can't write code. Not a single line"), with 235 commits and "216 iterations" — [itch.io](https://yurukusa.itch.io/spell-cascade); [devlog](https://yurukusa.itch.io/spell-cascade/devlog/1430567/why-i-keep-coming-back-to-spell-cascade-216-iterations-and-counting). The creator reports "52 views, 2 DL" on itch.io — [dev.to](https://dev.to/yurukusa/i-ran-a-5-agent-game-studio-with-claude-code-teams-2lpk). A secondary survey reports a 30-day ledger on Claude Max ($200/month): 5 games shipped, 50k+ lines, 1,079 sessions, **$4.99 revenue** — [Medium survey](https://chierhu.medium.com/claude-code-for-game-development-7a88fcd19992) (not verified against the original).

**Flops and negative reception**
- **Codex Mortis**, a Vampire Survivors-like marketed as the "world's first fully playable game created 100% through AI" — [Hitmarker](https://hitmarker.net/news/vampire-survivors-like-codex-mortis-claims-it-is-the-worlds-first-fully-playable-game-created-100-through-ai-1598722)
  - The demo drew "nearly unanimous rejection", with players calling it "garbage generated by machines" ([Xataka](https://www.xataka.com/videojuegos/primer-videojuego-hecho-integramente-ia-llega-a-steam-rechazo-jugadores-ha-sido-casi-unanime)).
  - First Steam reviews of the full release (around 27 Mar 2026) were "mixed". The complaints were the UI, overall low quality and "muddy" AI art; one reviewer said "for neural slop, it's pretty cool" ([iXBT](https://ixbt.games/en/news/2026/03/27/v-steam-vysla-pervaia-igra-polnostiu-sozdannaia-ii-nekotorye-geimery-poxvalili-neiroslop.html)).
  - GameStar: it is still "a functioning video game with the usual genre mechanics" ([GameStar](https://www.gamestar.de/artikel/codex-mortis-erstes-100-ki-generierte-spiel-auf-steam,3444910,seite2.html)).
- A Steam developer who publicly champions vibe coding (Matt Workman, who works for a generative-AI company) has the following record — [TheGamer](https://www.thegamer.com/dev-of-abandoned-mostly-negative-steam-flop-wants-more-vibe-coded-games/):
  - One title stuck in Early Access for 8 years.
  - Cine Tracer 2 rated "Mostly Negative".
  - Cam Op Simulator peaked at **10 concurrent players**.

**Catalogues for further browsing**
- Community lists of AI-built games: [awesome-ai-built-games](https://github.com/lappemic/awesome-ai-built-games), [vibegameslist (Claude Code)](https://vibegameslist.com/tools/claude-code), [vibecodedapps.dev](https://vibecodedapps.dev/games/).
- itch.io has a dedicated "AI-assisted code" tag — [itch.io](https://itch.io/games/ai-code/tag-text-based).

### Inferences
- Measured success clusters around (a) jams and prizes, (b) free games with an existing distribution channel (Levels' audience, Telegram groups), and (c) tiny narrative or novelty titles. I found **no paid, AI-agent-built Steam game with clearly verified strong sales** in 2025–2026.
- "100% AI" as a *marketing* angle seems to hurt (Codex Mortis). "100% AI code" as a *process* fact, behind strong human direction, wins (Capybara). The visible flaw players punish is generic AI **art and UI**, not AI code.
- Several well-documented cases come from experienced programmers (Capybara, Levels). Non-programmer cases (Zapaleni, yurukusa) show real shipping ability but small audiences.

### Gaps
- No verified sales or revenue for any Claude-Code-built Steam game. Catvivors and Meet Claude review counts are too small to judge.
- Could not read full texts (proxy block). Levels' "production quality" post, the Catvivors Medium post and the Slate piece ["We used Claude Code to vibe-code a video game. The result was weird."](https://slate.com/technology/2026/04/ai-vibe-coding-video-game.html) were not retrieved.
- An Anthropic "Code with Claude" London session exists on building a murder-mystery game business with Claude ([claude.com](https://claude.com/code-with-claude/session/ldn-ext-from-idea-to-income-how-i-built-an-ai-powered-murder-mystery-game-business-with-claude)), but its content was not retrieved.
- Vibe Jam 2025 results (older) were not researched.

## 2. What workflows did the successful creators describe?

### Takeaway
Creators who shipped well describe a **plan → small scoped change → human plays it → accept/reject** loop:
- a planning step before every feature;
- 2–3 parallel sessions on separate code areas;
- fresh context per feature;
- the human spends most time playing and validating, not prompting.

Simulated players and agent-built internal tools (analytics, test fights, editors) are a recurring differentiator. Fully autonomous loops were deliberately avoided.

### Cited Findings
- **Capybara (Vibe Jam winner):**
  - The human "decid[ed] and test[ed]" while Claude researched, planned and generated code. "I spent most of my time brainstorming, planning, and playing rather than generating code."
  - He ran **2–3 Claude Code sessions at once, each on a different part of the code to avoid conflicts**.
  - He **avoided `/loop`** because the project needed manual validation, and worked "in many small iterations and validated each one myself."
  - Source: [Leo's Medium](https://leocoout.medium.com/how-i-made-25k-in-15-days-with-a-game-built-entirely-by-claude-code-94b3b817f0ce) (per search extract).
- Capybara workflow per analysts: "a planning step before each feature" plus parallel sessions — [Admix](https://admix.software/blog/ai-game-won-25k-vibejam-2026). whatisgm summarises the lessons as:
  - "parallel, scoped coding sessions";
  - "clean context for new features";
  - "a long-running debugging thread";
  - "AI-generated internal tools for human-operated polish".

  Human-owned decisions were "concept selection, prompts, planning, map assembly, playtesting, tuning, camera placement and acceptance decisions" — [whatisgm](https://whatisgm.com/blogs/ai/the-capybara-game-is-a-better-ai-case-study-than-the-one-prompt-myth)
- **Zapaleni (non-programmer PM).** The PM owned design and final calls. Claude Code wrote all the code, **deployed over SSH, built the analytics and "reads them with me"**, and **ran large numbers of test fights to propose class rebalances** — [RetroStyle Games](https://retrostylegames.com/blog/claude-code-game-dev-case-study/)
- **yurukusa (non-engineer).** The loop: Claude Code reads the codebase, writes GDScript and scenes, runs automated tests; then the human plays and gives feedback, and the cycle repeats — [itch.io devlog](https://yurukusa.itch.io/azure-flame-dungeon/devlog/1385242/how-this-game-was-built-entirely-by-ai-and-what-that-actually-means). They also experimented with a "5-agent game studio" using Claude Code Teams — [dev.to](https://dev.to/yurukusa/i-ran-a-5-agent-game-studio-with-claude-code-teams-2lpk)
- **Torch Passers of SPLORR!!**, a dynasty jam game (Oct 2026). Claude Code wrote code, tests, game text and tooling; the developer "made the design calls and decided what shipped". **Four play policies × 1,000 seeds each of simulated players found a balance problem they would otherwise have missed.** A test pins that the words differ at every rung of the "handoff-drift" system — [itch.io devlog](https://thegrumpygamedev.itch.io/torch-passers-of-splorr/devlog/1712353/torch-passers-of-splorr-devlog-1-a-dynasty-in-a-day)
- **Headless simulation pattern.** One HN developer separated rendering from game logic and ran **millions of simulated games headless**, adjusting AI parameters between runs. The AI there is scripted, not an LLM — [HN "Letting AI play my game"](https://news.ycombinator.com/item?id=47947525)
- **Agent-as-playtester tooling:**
  - "Game Forge", a Claude Code kit for browser games. A headless bot plays the build and takes screenshots; a `/playtest` command lets Claude read the screenshots and fix what's broken (functional/visual, not balance) — [GitHub](https://github.com/npmiaman/game-forge)
  - Browser-Use "Vibetest" MCP runs browser agents against a site to find UI bugs — [Glama](https://glama.ai/mcp/servers/@browser-use/vibetest-use)
- **Art and audio pipelines (3D/visual games):** Capybara used GPT Images-2, Grok, Tripo3d, Suno and ElevenLabs — [Admix](https://admix.software/blog/ai-game-won-25k-vibejam-2026). Meet Claude used generative AI for art and music as well — [Steam](https://store.steampowered.com/app/4437280/)

### Inferences
- The practices that recur in successful cases map onto replicable rules:
  1. Plan each feature before coding.
  2. Keep each session scoped to one code area.
  3. The human validates every small iteration by *playing*, not by reading code.
  4. Ask the agent to build *tools for the human*: analytics, simulators, editors.
  5. Use simulated players with several strategies over many seeds for balance.
- dynasty-sim already does 1, 2 and 5: ROADMAP tasks per module, bots with characters and metric gates. The missing piece most often credited is **the human's own frequent play sessions** and agent-built analytics the designer reads together with the agent.

### Gaps
- No source quantified a "human playtesting cadence" (e.g., external testers per week) for these projects.
- No detailed public CLAUDE.md or design-doc examples from these specific games were retrieved.

## 3. How did non-programmers/designers steer the AI?

### Takeaway
Non-programmers who shipped steered by **owning vision, design decisions and acceptance**. They judged builds and data (analytics, simulated fights), not code. Several insist the reverse split (AI decides, human executes) fails. Commentators frame the bottleneck as moving "from implementation toward taste, systems judgement and validation."

### Cited Findings
- Zapaleni's author: the human supplies the vision and AI handles execution, "and the reverse does not work." The PM owned design and final calls, and read analytics together with Claude — [RetroStyle Games](https://retrostylegames.com/blog/claude-code-game-dev-case-study/)
- whatisgm on the Capybara game: "AI is moving the bottleneck in creative software from implementation toward taste, systems judgement and validation." Concept selection, playtesting, tuning and **acceptance decisions** remained human — [whatisgm](https://whatisgm.com/blogs/ai/the-capybara-game-is-a-better-ai-case-study-than-the-one-prompt-myth). Admix: "not a one-prompt miracle" — [Admix](https://admix.software/blog/ai-game-won-25k-vibejam-2026)
- Torch Passers developer: "made the design calls and decided what ships" while Claude Code wrote code, tests, text and tooling — [itch.io devlog](https://thegrumpygamedev.itch.io/torch-passers-of-splorr/devlog/1712353/torch-passers-of-splorr-devlog-1-a-dynasty-in-a-day)
- Catvivors developer: AI "drastically lower[s] the barrier to entry for solo developers" but "still requires a human driver" — [Medium](https://pchojecki.medium.com/ai-helped-me-solo-dev-a-game-on-steam-f84a2425be10)
- Agents add unrequested scope. In a same-prompt comparison, Claude added **eight weapons when three were requested** (though it was rated the best of three tools) — [XDA](https://www.xda-developers.com/asked-claude-code-codex-and-antigravity-to-build-the-same-game/). In a roguelike weekend experiment, the agent itself decided that each race and class would have different starting stats — [Barret Blake](https://barretblake.dev/posts/development/2026/03/ai-roguelike/)

### Inferences
- "Acceptance by playing" plus "design decisions stay human" is the common thread. Explicit acceptance criteria per feature and a ban on unrequested scope look like the right guard, given documented agent scope inflation.
- I found no source describing a specific technique against "I don't like it — redo" loops. The closest documented practice is small validated iterations plus a planning step before each feature (Capybara). This implies vague dissatisfaction should be converted into a concrete criterion before re-prompting.

### Gaps
- No first-hand designer account explicitly describing how they avoided redo loops or wrote acceptance criteria.
- Did not find designer-turned-developer talks (GDC 2026, YouTube) in search results.

## 4. Common failure modes, and what prevented them

### Takeaway
Reported failures:
- **"green tests, broken game"**: the agent commits on passing tests while the build doesn't load;
- context and cost blow-ups;
- scope inflation;
- generic AI art and UI that players label "slop";
- **zero discovery or audience** in a flooded market;
- abandoned projects.

The documented countermeasures are human play-validation of every iteration, tests on the shipped build (not just logic), simulated-player sweeps, and a distribution channel planned before launch.

### Cited Findings
- **False green.** "An agent would make a change, run the tests, see green checkmarks, commit, and move on, even when the game was broken" — yurukusa via [Medium survey](https://chierhu.medium.com/claude-code-for-game-development-7a88fcd19992). A concrete case: a web build failed to load the main game script due to a GDScript type-inference parse error that the passing tests did not catch — same survey and [yurukusa devlog](https://yurukusa.itch.io/azure-flame-dungeon/devlog/1385242/how-this-game-was-built-entirely-by-ai-and-what-that-actually-means)
- **Token and context costs.** Context rebuilding after compaction was the largest sink, about 30% of total usage — [dev.to](https://dev.to/yurukusa/the-token-per-dollar-math-running-claude-max-for-30-days-2k1o). The 30-day Claude Max ($200) run produced $4.99 revenue — [Medium survey](https://chierhu.medium.com/claude-code-for-game-development-7a88fcd19992)
- **Opaque assets.** For Unreal projects, binary `.uasset` files are opaque to the agent — [Medium survey](https://chierhu.medium.com/claude-code-for-game-development-7a88fcd19992) (per search extract)
- **Scope inflation:** see the XDA example (8 weapons instead of 3) — [XDA](https://www.xda-developers.com/asked-claude-code-codex-and-antigravity-to-build-the-same-game/)
- **Generic content and "slop" perception.** Codex Mortis criticism centred on "muddy" AI art and UI — [iXBT](https://ixbt.games/en/news/2026/03/27/v-steam-vysla-pervaia-igra-polnostiu-sozdannaia-ii-nekotorye-geimery-poxvalili-neiroslop.html); [Xataka](https://www.xataka.com/videojuegos/primer-videojuego-hecho-integramente-ia-llega-a-steam-rechazo-jugadores-ha-sido-casi-unanime)
- **Market flood and discoverability:**
  - Kotaku: 2026 had already passed 2025's total of Steam releases, with about 24,000 projected by year-end (a projection). The $100 listing fee "is clearly failing to deter low-effort releases", and new-release lists can't filter out AI-disclosed games — [Kotaku](https://kotaku.com/steam-valve-slop-ai-genai-vibe-coding-pc-game-releases-2000746749)
  - PC Gamer (per search extract): games with AI disclosures are "nearly half" of weekly Steam releases, and predominantly gen-AI games are "all but invisible" to discovery algorithms, especially look-alike incrementals — [PC Gamer](https://www.pcgamer.com/games/fps/the-next-game-by-the-creators-of-steins-gate-is-an-entirely-vibe-coded-fps-slopfest/)
  - Analyst Mat Piscatella warns good games "will be cloned and buried" — [Tech4Gamers](https://tech4gamers.com/ai-vibe-coding-steam-games/)
- **Abandonment:**
  - Many Claude-Code-driven recompilation/port projects "are left unfinished" (anecdotal, opinion piece) — [A Secret Area](https://asecretarea.com/2026/08/10/ai-vibe-coded-game-projects-suck/)
  - Workman's abandoned Early Access titles — [TheGamer](https://www.thegamer.com/dev-of-abandoned-mostly-negative-steam-flop-wants-more-vibe-coded-games/)
- **Audience, not building, is the bottleneck.** "AI removes the barrier between an idea and a product, but not the one between a product and an audience." Zapaleni's growth came from social mechanics and Telegram's zero-install, already-present players — [RetroStyle Games](https://retrostylegames.com/blog/claude-code-game-dev-case-study/). fly.pieter.com's success is attributed to a 10-year audience — [KODiQ](https://kodiq.ai/article/ai-news-2026-05-19-pieter-levels-flight-sim-1m-arr-17-days/)
- **Balance bugs** were caught only by simulated players (4 policies × 1,000 seeds) — [Torch Passers devlog](https://thegrumpygamedev.itch.io/torch-passers-of-splorr/devlog/1712353/torch-passers-of-splorr-devlog-1-a-dynasty-in-a-day)

### Inferences
- For dynasty-sim, the "false green" failure is the most transferable risk. CI checks typecheck, tests, sim and build, but (per CLAUDE.md) not that the **built browser page actually loads and plays**. A headless-browser smoke test of `dist/`, Game Forge-style, would close the exact gap yurukusa hit.
- Architecture rot was not prominently reported in the retrieved cases. That may be because most are short-lived jam projects. dynasty-sim's long horizon (multi-stage ROADMAP, module ownership, invariants) is unusual among documented AI-built games.
- For a text game, the "AI slop" risk shifts from art to **prose**: generic, samey event text. Torch Passers' test asserting textual variation is one concrete guard.

### Gaps
- No systematic data on abandonment rates of AI-built games on itch.io or Steam.
- Burnout among non-programmer AI-game creators was not documented in the retrieved sources.
- No source detailed architecture rot or regressions in a long-running (>6 months) AI-built game.

## 5. Experiences with text-heavy, simulation/strategy, roguelike or narrative games

### Takeaway
The closest analogues to a CK3-like text dynasty sim are:
- **Torch Passers of SPLORR!!**, a Claude-Code-built dynasty loop over 8 generations, jam scale;
- **Zapaleni**, a text RPG built by a non-programmer that went live with real players;
- **Meet Claude**, a short AI-made narrative game with positive Steam reviews.

Text and sim games suit agent workflows: logic is testable headlessly, simulated players work well, and art is less of a bottleneck. No full-scale AI-built dynasty or strategy game with traction was found.

### Cited Findings
- **Torch Passers of SPLORR!!** (The Grumpy GameDev, AI Browser Game Jam 5, theme "TORCH", Oct 2026). A dynasty loop across **eight generations**, listed as interactive fiction. Claude Code wrote code, tests, game text and tooling. It has a "handoff-drift" system with a test pinning that the words differ at each rung. Simulated players (4 policies × 1,000 seeds) found a balance problem — [itch.io devlog](https://thegrumpygamedev.itch.io/torch-passers-of-splorr/devlog/1712353/torch-passers-of-splorr-devlog-1-a-dynasty-in-a-day)
- **Zapaleni**: a text RPG in a Telegram bot. The non-programmer PM went live in 6 weeks. Claude Code ran test fights for class rebalancing. 471 players and 53,302 runs in 14 days (creator-reported) — [RetroStyle Games](https://retrostylegames.com/blog/claude-code-game-dev-case-study/)
- **Meet Claude**: a free narrative adventure with multiple endings, writing and code made "primarily" with Claude; about 96–100% positive of 20–25 Steam reviews — [Steam](https://store.steampowered.com/app/4437280/); [gg.deals](https://gg.deals/game/meet-claude/)
- **Dungeons & Dynasties**: a text-based management sim at 1.0, listed under itch.io's AI-assisted code tag (tooling not confirmed as Claude Code) — [itch.io devlog](https://bretticus82.itch.io/dungeons-dynasties/devlog/1553011/10-released). itch.io's "AI-assisted code + Text based" listing also includes **Dynasty Chronicles**, a bloodline sim over generated history (tooling and devlog not confirmed) — [itch.io](https://itch.io/games/ai-code/tag-text-based)
- **Star Dynasties**: a text-based procedural narrative strategy game, but Unity, 2018–2021, **not** AI-built. It is useful only as a genre reference — [itch.io](https://gpawley.itch.io/star-dynasties)
- **Roguelikes:**
  - Spell Cascade (non-engineer, Godot, 235 commits, minimal downloads) — [itch.io](https://yurukusa.itch.io/spell-cascade)
  - Gloomstep Dungeon, a weekend experiment — [Barret Blake](https://barretblake.dev/posts/development/2026/03/ai-roguelike/)
  - "Vestiges", a solo 2D roguelite strategy game with narrative and a card minigame, launch planned around Aug 2026 — [HN Ask HN July 2026](https://news.ycombinator.com/item?id=48884984)
  - A wego board strategy game built "using coding agents" — same thread.
- **Telegram as a text-game channel:** "zero installs and players who are already there" — [RetroStyle Games](https://retrostylegames.com/blog/claude-code-game-dev-case-study/)

### Inferences
- dynasty-sim's architecture is closer to the most rigorous documented practice (Torch Passers) than to typical vibe-coded projects:
  - headless core;
  - seeded determinism;
  - bots with play styles;
  - metric gates over seeds 1–10.
- Torch Passers suggests two cheap additions:
  - assert *text variety* across generations;
  - run several bot policies over many seeds specifically to find dominant strategies (dynasty-sim's bot-report already does a version of this).
- Text-heavy games avoid the main criticism that sank Codex Mortis (AI art). But they are judged on writing quality, so human editorial control of event text is where "taste" lives.

### Gaps
- No AI-built CK3-like or long-form dynasty strategy game with a real audience was found.
- No r/roguelikedev or r/ClaudeAI threads were retrieved, because search returned blogs and itch.io pages instead.

## 6. Browser vs Steam distribution: Steam AI disclosure rules, web-to-desktop wrappers, what solo devs chose

### Takeaway
- **Steam disclosure.** Since Valve's January 2026 revision, **using coding assistants such as Claude Code does not need to be disclosed**. The survey covers AI-generated *content that ships with the game or its marketing and is consumed by players*: art, text, audio, plus "live-generated" content.
- **Path for web games.** The common route is free browser or itch.io release first, then an Electron wrap for Steam (Vampire Survivors did exactly this with Phaser + Electron).
- **Electron vs Tauri.** Electron with steamworks.js is the easiest Steam integration for JS/TS. Tauri gives far smaller builds but needs a Rust Steam bridge, and Linux packaging is harder.
- **Market.** Steam is flooded with AI-disclosed games, so distribution and audience planning matter more than the build.

### Cited Findings
**Steam AI disclosure (Jan 2026 revision)**
- Valve revised the Steamworks content survey around 16–17 Jan 2026. Reports give 16, 17 and 19 Jan. Simon Carless (GameDiscoverCo) spotted it — [Outlook Respawn](https://respawn.outlookindia.com/gaming/gaming-news/valve-clarifies-steam-ai-policy-focus-shifts-to-content-consumed); [Tech-Insider](https://tech-insider.org/steam-ai-disclosure-2026); [Notebookcheck](https://www.notebookcheck.net/Steam-updates-AI-disclosure-form-requiring-developers-to-report-visible-and-in-game-AI-but-not-background-tools.1206103.0.html); [Gigazine](https://gigazine.net/gsc_news/en/20260120-steam-updates-ai-disclosure-guidelines)
- The new wording, per GamingOnLinux: "Efficiency gains through the use of these tools is not the focus of this section." The form is about "the use of AI in creating content that ships with your game, and is consumed by players." Secondary sources quote slightly different wordings — [GamingOnLinux](https://www.gamingonlinux.com/2026/01/valve-tweak-steam-ai-disclosure-form-for-developers-to-clarify-its-for-content-consumed-by-players/comment_id=288710); [Legal Moves Law Firm](https://legalmoveslawfirm.com/steam-ai-policy/)
- Explicitly exempt: coding assistants, bug-checking software and office tools — [Outlook Respawn](https://respawn.outlookindia.com/gaming/gaming-news/valve-clarifies-steam-ai-policy-focus-shifts-to-content-consumed). GitHub Copilot-style tools are named as exempt — [Legal Moves](https://legalmoveslawfirm.com/steam-ai-policy/)
- Still disclosed: AI-generated content "from marketing and concept assets to in-game content that players interact with". Live-generated AI content is a separate category. The developer must prevent illegal or inappropriate output, and players can report through the Steam Overlay — [Outlook Respawn](https://respawn.outlookindia.com/gaming/gaming-news/valve-clarifies-steam-ai-policy-focus-shifts-to-content-consumed); [Legal Moves](https://legalmoveslawfirm.com/steam-ai-policy/)
- Critics: Tim Sweeney called Steam's AI disclosure tags "irresponsible" ([Let's Data Science](https://letsdatascience.com/news/epic-ceo-criticizes-valve-steam-ai-disclosures-06e02306)); another outlet says the change "opens a massive gap" ([In Game News](https://ingamenews.com/2026/01/valve-just-quietly-lowered-bar-for-ai.html)). No primary Valve page was retrieved; wording comes from secondary reporting.
- Market context: the $100 Steam Direct fee is not deterring low-effort releases, AI-disclosed games can't be filtered out of new-release lists ([Kotaku](https://kotaku.com/steam-valve-slop-ai-genai-vibe-coding-pc-game-releases-2000746749)), and AI-disclosed games are about half of weekly releases ([PC Gamer](https://www.pcgamer.com/games/fps/the-next-game-by-the-creators-of-steins-gate-is-an-entirely-vibe-coded-fps-slopfest/), per search extract).

**Web-to-desktop wrappers**
- **Vampire Survivors** is the canonical web-first-to-Steam success (pre-AI, older):
  - It launched free as an HTML5 browser game on itch.io on 31 Mar 2021 ([Wikipedia](https://en.wikipedia.org/wiki/Vampire_Survivors)).
  - Steam builds were **Phaser 3 packaged with Electron** for Windows and Mac ([Kartones blog](https://blog.kartones.net/post/vampire-survivors-cheats/); [HN](https://news.ycombinator.com/item?id=47001165)).
  - It moved to Unity from v1.6 ([Wikipedia](https://en.wikipedia.org/wiki/Vampire_Survivors)); 1.0 shipped on Win/Mac on 20 Oct 2022 ([PCGamingWiki](https://www.pcgamingwiki.com/wiki/Vampire_Survivors)).
- **steamworks.js**: an MIT-licensed Steamworks implementation for HTML/JS/Node apps with Electron and NW.js support. It covers achievements, cloud saves and Workshop, and has an Electron overlay helper — [Summer Engine guide](https://www.summerengine.com/make-great-games/threejs-game-on-steam)
- **Tauri vs Electron, first-hand:**
  - One JS-game developer called Tauri a "deal breaker" because steamworks.js needs a Node backend and Tauri requires Rust for anything beyond its JS API — [JSLegendDev](https://jslegenddev.substack.com/p/the-struggle-of-wrapping-a-javascript).
  - Another solo developer shipped a browser pixel game to Steam on Tauri by writing "a thin wrapper around the excellent steamworks-rs crate". The release build was about 9 MB. They would "have started in Tauri eighteen months ago instead of detouring through Electron" — [pixelartcode.uk](https://pixelartcode.uk/posts/porting-pixel-game-to-steam-with-tauri).
  - An HN developer shipping Tauri on Win/Mac had to fall back to Electron for Steam Linux after "an entire weekend in library hell" with the Steam runtime "sniper" SDK — [HN](https://news.ycombinator.com/item?id=46087456).
- **Why browser first:** zero-install reach (Zapaleni's Telegram choice) — [RetroStyle Games](https://retrostylegames.com/blog/claude-code-game-dev-case-study/). Jam visibility (Vibe Jam: about 945 browser entries) — [JamVault](https://jamvault.org/). The most-lucrative AI-built game (fly.pieter.com) stayed browser-only with ads and in-game purchases — [levels.io](https://levels.io/fly-pieter-com-vibecoded-flight-simulator)

### Inferences
- For dynasty-sim, Claude Code-written *code* needs no Steam disclosure.
  - However, **event text, names or chronicle templates written by the content-writer agent are content consumed by players**. They would likely need disclosure as pre-generated AI content. This is my inference from the survey's scope; check the live Steamworks form before release.
  - The disclosure label may carry a discovery or reputation cost, given the PC Gamer and Kotaku context. Heavy human editing of text is both a quality and a positioning lever.
- A non-programmer with a TS/DOM game should prefer **Electron + steamworks.js** for an eventual Steam build. It needs no Rust, has documented Steam overlay and achievements support, and works on Linux.
  - Tauri's size advantage matters little for a text game, and its Steam bridge needs Rust maintenance (which Claude could write, but that adds an untested layer).
- The documented path of least risk: browser and itch.io release first to build an audience and gather playtest feedback, Steam wrap later. That matches Vampire Survivors and the 2026 "audience is the bottleneck" lesson.

### Gaps
- Primary Valve Steamworks documentation text was not retrieved (proxy block). Exact current wording should be checked on partner.steamgames.com before release.
- No 2025–2026 first-hand account of an AI-agent-built TS/DOM game shipped to Steam via Electron with sales data.
- Itch.io's own AI-disclosure rules (it has an "AI-assisted code" tag, and reportedly an AI-generated content disclosure) were not researched in detail.
