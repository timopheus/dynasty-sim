# Design process of systemic / emergent-narrative strategy and simulation games (CK3, RimWorld, Dwarf Fortress, Failbetter, Emily Short, King of Dragon Pass, Wildermyth, Caves of Qud, Norland) — what a solo designer of a text dynasty sim can use

_Method note for the report writer: in this session WebFetch failed with DNS errors on every host (emshort.blog, gdconf.com, gamedeveloper.com, if50.substack.com). Every finding below comes from search-engine result summaries of the cited pages, not from reading them in full. Short quotes are as the search tool returned them. Where a summary did not clearly say which page a claim came from, the claim is marked "(attribution uncertain)". Primary sources that should be read in full before anything is quoted verbatim are listed in each Gaps section._

## 1. How do these teams define and protect the core experience (pillars, "the player's story", core loop, experience goals), and how do they decide what NOT to build?

### Takeaway
The acclaimed teams start from a short written vision of the *experience* ("story generator", "characters and their unfolding stories", "go deep rather than wide") and judge every feature against it. They cut deliberately: leave gaps for the player's imagination, don't simulate what players will project anyway (feelings, intent), and carry over only the systems that serve the vision.

### Cited Findings
- **CK3 vision (Dev Diary #0 "The Vision", 24 Oct 2019).** Paradox called CK3 "an evolution, not a revolution". Instead of trying to do full justice to the less appreciated systems, they decided to "go deep rather than wide" — [Paradox forum, CK3 Dev Diary #0](https://forum.paradoxplaza.com/forum/threads/ck3-dev-diary-0-the-vision.1265472/page-22); date from [CK3 Wiki, Developer diaries](https://productionwiki-ck3.paradoxwikis.com/index.php?title=Developer_diaries).
- Game director Henrik Fåhraeus named four principal design goals for CK3. Every design decision was influenced by CK2, but not every CK2 system was carried over — [Shacknews](https://www.shacknews.com/article/114966/crusader-kings-3-director-shares-vision-of-game-depth-in-new-dev-diary). The four goals themselves were not in the search results (see Gaps).
- The CK3 Art Focus diary (#28) says Fåhraeus' vision has "a big focus on characters and storytelling, as well as approachability and player freedom". It names a "role-playing" pillar: "to give life to the characters and their unfolding stories". This is the art team's pillar list derived from that vision — [CK3 Dev Diary #28, Art Focus](https://forum.paradoxplaza.com/forum/developer-diary/ckiii-dev-diary-28-art-focus.1393627/page-11).
- **RimWorld (GDC 2017, "RimWorld: Contrarian, Ridiculous, and Impossible Game Design Methods").** Tynan Sylvester covered:
  - framing RimWorld as a *story generator* rather than a game, and how that framing produced new mechanisms;
  - deliberately leaving out features so that players fill the gaps with story elements that are not actually there;
  - "making better decisions by not planning";
  - shipping without many seemingly critical features, using a method for choosing which features actually matter.
  
  Sources: [GDC Vault session page](https://gdcvault.com/play/1024232/-RimWorld-Contrarian-Ridiculous-and); [GDC news preview](https://gdconf.com/news/gdc-youll-see-rimworld-devs-succeeded-everything-wrong). Sylvester credits Dwarf Fortress's ability to create stories, not its graphics, as the inspiration — same sources.
- **"The Simulation Dream" (Sylvester, 2013).**
  - Simulation games depend on *apophenia*, the tendency to see meaningful patterns in random data.
  - The simulation does not need to model feelings or intent, because players supply them.
  - The game is a *co-author* of the story: it handles logistics and random outcomes, and the player adds meaning and pathos.
  - Hinting beats exhaustive modelling.
  - Situations need human stakes (life/death, alone/together), or the result feels emotionally hollow.
  
  Sources: [tynansylvester.com](https://tynansylvester.com/2013/06/the-simulation-dream/); repost on [Game Developer](https://www.gamedeveloper.com/design/the-simulation-dream). A critique questions how broadly he applies "apophenia": [Paul Gestwicki's notes](http://paulgestwicki.blogspot.com/2025/08/notes-from-tynan-sylvesters-designing.html).
- Sylvester's book *Designing Games* (O'Reilly 2013) is organised around emergence, compulsion, elegance and iteration. It defines elegance roughly as maximising emotional power and variety of play experiences while minimising the burden on players and the team — [Google Books listing](https://books.google.com/books/about/Designing_Games.html?id=sckajE19pFAC); [Goodreads](https://www.goodreads.com/book/show/34866324-designing-games) (this wording comes from listings and summaries, not the book text).
- At NDC 26 (2026), Sylvester called himself a "system crafter" rather than a storyteller: he builds systems that trigger events and lets stories emerge from player choices — [Gamemeca coverage](https://www.gamemeca.com/en/view.php?gid=1776645).
- **Dwarf Fortress.**
  - Development starts from stories: short stories are written first, then an engine is built in which such stories could happen. Tarn Adams still finds that approach inspiring. (The search summary said "his partner"; the Adams brothers Tarn and Zach co-develop the game.) — [Game Developer Q&A with Tarn Adams](https://www.gamedeveloper.com/design/q-a-dissecting-the-development-of-i-dwarf-fortress-i-with-creator-tarn-adams).
  - Division of authority: the player is the fortress's "official will", while dwarves keep enough autonomy to become characters in their own stories. That autonomy is a major source of emergent narrative — same Q&A.
  - Early principle: create actors with motivations "and let them go" — [Gamasutra/Game Developer 2008 interview](https://www.gamedeveloper.com/design/interview-the-making-of-dwarf-fortress).
  - Adams has described the game as a kind of writing prompt, with the player's imagination doing much of the storytelling — [Cartlidge 2024, Games and Culture](https://journals.sagepub.com/doi/full/10.1177/15554120231162418).
- **Wildermyth.**
  - Nate Austin: "the hero building aspect is what we focus on" — [Turn Based Lovers interview](https://turnbasedlovers.com/10-turns-interview/with-wildermyth-developer/).
  - The team considered procedural chapter structures and procedural villains but never got past the concept phase, because a story has to build toward one destination. (Attribution uncertain; reported as "a separate interview", possibly [this Goodreads-hosted dev interview](https://www.goodreads.com/author_blog_posts/19162356-game-dev-interview-wildermyth).)
- **Norland (Long Jaunt, CK-inspired medieval colony sim).**
  - Designer Dmitry Glaznev: dozens of semi-autonomous characters from different social classes, in a city with a monetary economy, politics and religion, is "a significant challenge for game design. We had to rethink many traditional gameplay systems". Knowledge is open and book-based rather than a tech tree — [indie-games.eu interview](https://www.indie-games.eu/interview-dmitry-glaznev-norland/).
  - In early access the team removed the characters' "needs" tab entirely and refocused on "desires" — a pillar-level cut — [PC Gamer](https://www.pcgamer.com/games/strategy/medieval-colony-sim-norland-is-getting-a-damn-big-update-that-completely-overhauls-the-games-mechanics-were-rolling-out-some-radical-changes-to-the-core-gameplay/).

### Inferences
- Across the sources, the "core experience" is defined as **the story the player will retell**, not as a feature list. CK3 has "characters and their unfolding stories", RimWorld has the "story generator", and Dwarf Fortress has "stories first, then the engine". For dynasty-sim, a practical step is a one-page experience document. It would hold 3–5 pillars written as player-facing sentences, plus 2–3 example "stories we want the chronicle to produce" written as prose before the systems (the Dwarf Fortress method). Every ROADMAP task would then name which pillar it serves.
- "Deep rather than wide" and "leave gaps for apophenia" give an explicit rule for deciding what not to build. Before a new system, ask whether players would project this anyway if we only hinted at it (an opinion line, a trait, a chronicle line). If so, hint; don't simulate.
- Writing pillars and experience goals needs human judgment (Tim). Agents can draft candidates, check each ROADMAP item against the pillars, and flag drift. Tim must choose the pillars and arbitrate the cuts.
- Local observation: a grep of `docs/` for "pillar/столп" found no explicit pillar list. GDD.md already has anti-repetition rules (cooldowns, `once`), and ROADMAP/DECISIONS have metric corridors. The missing piece is a short, stable statement of *experience* goals for judging new features.

### Gaps
- The exact four CK3 design goals from Dev Diary #0 weren't in any summary. Read the [DD#0 thread](https://forum.paradoxplaza.com/forum/threads/ck3-dev-diary-0-the-vision.1265472/) directly.
- Sylvester's specific feature-selection method from the GDC 2017 talk is behind the GDC Vault login. Not recovered.
- No source found on how Bay 12, A Sharp or Freehold formally record pillars (e.g. as written documents).

## 2. Prototyping and vertical-slice practice: when to prototype on paper or spreadsheets, and how to test fun before content volume

### Takeaway
Narrative-system designers prototype the content *structure* cheaply (index cards for storylets, pitches before writing). Systemic sim designers rely on running the simulation, because emergent behaviour "is nearly impossible to predict until you run it". The shared practice is small, fast experiments that resolve uncertainty before mass content.

### Cited Findings
- Emily Short suggests testing a storylet design on index cards that hold storylet content and quality rules, before building tooling — [Emily Short, "Storylets: You Want Them" (2019)](https://emshort.blog/2019/11/29/storylets-you-want-them/) (surfaced via [emshort.blog category page](https://emshort.blog/category/if-languages)).
- Tarn Adams: emergent behaviour is nearly impossible to predict until you run it. One structural change (adding Z-levels) reshaped the whole game — [PC Gamer interview](https://www.pcgamer.com/dwarf-fortress-creator-tarn-adams-talks-about-simulating-the-most-complex-magic-system-ever/).
- Third-party reviews say *Designing Games* borrows from Eric Ries's *The Lean Startup*: design is a series of experiments that resolve uncertainty at each step, worked in tight iterations with good feedback loops — [GBGames review](https://www.gbgames.com/2014/05/07/book-review-designing-games-by-tynan-sylvester/); [Gestwicki notes](http://paulgestwicki.blogspot.com/2025/08/notes-from-tynan-sylvesters-designing.html) (attribution between the two uncertain).
- Sylvester's GDC 2017 talk argues for "making better decisions by not planning" despite pressure to plan — [GDC Vault](https://gdcvault.com/play/1024232/-RimWorld-Contrarian-Ridiculous-and).
- **Failbetter pipeline.**
  - All new Fallen London content begins as a *pitch*: "a succinct summary of the scope and direction of the piece", posted to the team's Content channel on Slack.
  - "Midflight checks" are used partly to judge pacing, whether a story is too grindy, and other potential issues.
  
  Source: [Fallen London Writer Guidelines, Part I](https://www.failbettergames.com/news/fallen-london-writer-guidelines-part-i).
- Wildermyth iterated on a weak sub-system mid-development. Character "hooks" were conceived as story-role oriented rather than plot oriented, were less impactful than intended, and could conflict with personalities. Showing three history lines as one block was "a big improvement" — [Nate Austin, GDC 2022 slides](https://media.gdcvault.com/GDC+2022/Speaker+Slides/GettingPlayersEmotionally_Austin_Nate.pdf).

### Inferences
- For a text dynasty sim, the cheapest fun test is: one system plus 5–10 storylets, run headless for 300 years, then read the chronicle. Is a retellable story there? dynasty-sim already has the tools (`npm run sim`, `/run-sim` summary). So the "vertical slice" for each new mechanic can be "one mechanic + minimum content + a sample chronicle read by Tim", before content volume.
- Paper or index-card prototyping translates directly. An agent can write a storylet set as a table (prerequisites, effects, qualities touched) for Tim to check *before* YAML is written. This catches dead ends and grinds early, as Failbetter's pitch and midflight checks do.
- Judging whether a sample chronicle is *interesting* needs a human. Agents can run sims, summarise, and count repetitions, but cannot certify fun.

### Gaps
- No primary source found describing Paradox's internal prototyping (paper or spreadsheet) for CK3 systems.
- No source found on whether Ludeon or Bay 12 use spreadsheets for prototyping. Tynan's "not planning" method is not described in detail in the accessible summaries.

## 3. Playtesting: cadence, who plays, what is measured, how feedback is structured to avoid drift; telemetry, simulation runs and bot players for balancing

### Takeaway
The best-documented principle is from Sylvester: playtests should yield *experiences*, not *suggestions*. Each playtest is a story, and you keep testing until you see past individual stories to the underlying systems. Automated or bot playtesting is well suited to balance and progression but does not measure fun, and score-maximising bots under-explore optional mechanics. Public sources say little about Paradox's or Ludeon's internal cadence.

### Cited Findings
- *Designing Games* (via notes):
  - Playtesting should yield experiences rather than suggestions.
  - Each playtest is effectively a story, and you must keep testing until you can see past those stories to the underlying systems.
  - Example: a theatre shooter level so open that players were shot the moment they peeked out from cover — found only through playtesting.
  
  Source: [Gestwicki notes on Designing Games](http://paulgestwicki.blogspot.com/2025/08/notes-from-tynan-sylvesters-designing.html).
- Automated playtesting reduces the cost of repetitive human testing. It measures balance and progression, not whether a game is fun. Agent-recommended balance changes should be A/B tested with a small human cohort before full rollout — [theneuralbase guide](https://theneuralbase.com/ai-for-gaming/learn/beginner/playtesting-automation/) (low-authority source; treat as practitioner opinion).
- Agents tend to optimise single metrics like win rate rather than the overall player experience. A score-maximising agent may keep following a safe route and never use optional mechanics or unusual action sequences — [Winning Isn't Everything (EA SEED), arXiv 1903.10545](https://arxiv.org/pdf/1903.10545); [AI for Games in the Foundation Model Era, arXiv 2609.16679](https://arxiv.org/pdf/2609.16679) (which survey made which point is uncertain).
- Academic work exists on predicting human engagement and difficulty from AI-player runs — [Predicting Game Engagement and Difficulty Using AI Players, arXiv 2107.12061](https://arxiv.org/pdf/2107.12061).
- Paradox: no official public source on observer-mode or AI balance tests was found. One forum thread only speculates that Paradox has automation-usage data — [Paradox forum thread](https://forum.paradoxplaza.com/forum/threads/automation-is-a-bandaid-solution-to-paradoxs-most-major-issue.1904352/).
- Paradox adjusts systems in response to post-release play. CK3 Dev Diary #58 ("Stre(ss)tching the traits", Azure patch) retuned trait interactions: Shy no longer generates Stress when launching a Personal Scheme, and Stubborn lets characters retry a failed scheme by taking stress instead of waiting out the cooldown — [CK3 Dev Diary #58](https://forum.paradoxplaza.com/forum/developer-diary/ck3-dev-diary-58-stre-ss-tching-the-traits.1472092/page-3).
- Failbetter's structured review is the "midflight check" on pacing and grind — [Writer Guidelines Part I](https://www.failbettergames.com/news/fallen-london-writer-guidelines-part-i).
- Norland reworked core gameplay through large early-access updates. It removed needs in favour of desires, then added politics and a new economy — [PC Gamer, March update](https://www.pcgamer.com/games/strategy/medieval-colony-sim-norland-is-getting-a-damn-big-update-that-completely-overhauls-the-games-mechanics-were-rolling-out-some-radical-changes-to-the-core-gameplay/); [PC Gamer, summer update](https://www.pcgamer.com/games/sim/norlands-big-summer-update-is-even-larger-than-marchs-damn-big-update-introducing-a-politics-system-a-new-economy-and-more-authentically-medieval-buildings-to-the-crusader-kings-inspired-colony-sim/).

### Inferences
- **Sylvester's rule against design drift.** Collect *what happened* (the chronicle, what the player did and felt), not *what to change*. For dynasty-sim, each playtest report should be structured as: (1) the story as the player tells it; (2) moments of boredom or confusion with timestamps; (3) only then, ideas, which go to IDEAS.md and are not acted on directly. This matches the existing rule that a thought is not an order.
- **Bots and metric corridors fit balance and degenerate-strategy detection.** The project already has character bots (cautious, greedy, duelist), a "dead options / dominant character" report, and CI corridors such as the 25–50 median chronicle lines per head of house (CLAUDE.md, D-203, D-345, D-349). The literature warns of two blind spots. Bots won't exercise unusual choices, and corridors can't certify fun. So pair them with regular human reads of sample chronicles.
- **Cadence that fits a solo designer.** On every PR: automated corridors (agents). Per stage: Tim plays one full generation and reads 2–3 seeded chronicles, reporting experiences only. Per milestone: a small external playtest (2–5 people), using the same experience-first form.
- **Human judgment needed:** whether a story is interesting or memorable, tone, and whether a cut damages the fantasy. **Agent-delegable:** sim runs, repetition counts, dead-option detection, corridor checks, and summarising tester reports into "experience" vs "suggestion" buckets.

### Gaps
- No primary source found on CK3's internal playtest cadence, its tester composition, or whether it uses automated AI-vs-AI runs (observer mode) for balance.
- No primary source found on RimWorld's early-access feedback process (the Ludeon blog and Steam posts were not reached).
- No figures found on how many testers or sessions such teams use per milestone.

## 4. Emergent narrative craft: avoiding repetitive events (pools, cooldowns, weighting, storylet qualities, salience, callbacks), how CK3 events and traits create stories, and Sylvester's "story generator" principles

### Takeaway
Six techniques recur across these teams:
- Modular storylets gated and changed by a small number of state variables ("qualities").
- Events fired from hooks or pulses into **weighted pools**, with explicit **cooldowns** that stand in for off-screen repetition.
- **Casting**: filling event roles from the existing cast with scoring, so the same text reads differently depending on who fills it.
- **Pacing directors** that follow a tension curve.
- Retroactive rationalisation of random events into coherent history.
- Perceptual differentiation: each piece must feel different from the last, not merely be different.

### Cited Findings
- **Storylet definition.** A storylet bundles a piece of content, conditions deciding when it can play, and the changes to world state that follow. Other systems call them events or snippets — atomic, robust, recombinable. The idea underlies StoryNexus and Short's Threaded Conversation — [Emily Short, "Storylets: You Want Them"](https://emshort.blog/2019/11/29/storylets-you-want-them/).
- **Quality-based narrative ("Beyond Branching", 2016).**
  - Failbetter coined "quality-based narrative" and later dropped the name, because it seemed to imply other narrative types lack quality.
  - A storylet is typically a paragraph or two of text followed by a choice; each option is a "branch".
  - Qualities are numeric variables that go up and down: inventory, skills and story progress.
  - The model imposes no strict order on branch points; players explore whichever storylets are open.
  - StoryNexus implements QBN, and Varytale used a hybrid form.
  
  Source: [Emily Short, "Beyond Branching: Quality-Based and Salience-Based Narrative Structures"](https://emshort.blog/2016/04/12/beyond-branching-quality-based-and-salience-based-narrative-structures/). A 2010 talk by Alexis Kennedy framed this as combining player freedom with narrative — [gamerboom write-up](https://gamerboom.com/archives/27052).
- Yarn Spinner's "storylets and saliency" primer bases its terminology on Emily Short (2019) and Kreminski & Wardrip-Fruin (2018) — [Yarn Spinner docs](https://docs.yarnspinner.dev/write-yarn-scripts/advanced-scripting/storylets-and-saliency-a-primer).
- **Failbetter, Writer Guidelines Part II (content design)** — [Part II](https://www.failbettergames.com/news/fallen-london-writer-guidelines-part-ii):
  - Use as few qualities as possible: extra qualities complicate the economy, cause bugs, and clutter the UI.
  - Two qualities is often the *minimum* for engaging interactive structure; with one you get a simplistic chain or a grind.
  - Hold rewards back until the end of a content strand.
  - Add in-content reminders, because people play in spurts.
- **Failbetter, "New Narrative Structures"** — [Failbetter](https://www.failbettergames.com/news/new-narrative-structures):
  - The *carousel* pattern uses a timing quality. Each storylet in a chunk raises it, locking some content and opening other content, and any final storylet resets the counter to zero.
  - A simple storylet may need one progress quality at a set level; an ambitious one may need three or four.
- **CK3 event firing (Dev Diary #30, "Event Scripting").**
  - CK3 fires events entirely through *on_actions*: code hooks tied to game actions or regular pulses.
  - An on_action can fire an event every time, or pick from a *weighted list* of potential events, where weight multipliers still apply.
  - The developers said the older probability-based approach (CK2-style mean-time-to-happen) made it difficult to govern how often an event spawns.
  
  Source: [CK3 Dev Diary #30](https://forum.paradoxplaza.com/forum/developer-diary/crusader-kings-3-dev-diary-30-event-scripting.1397140/).
- **CK3 stress and cooldowns (Dev Diary #31, "A Stressful Situation").**
  - Asked why the Rakish brothel decision has a three-year cooldown, a content designer said the trait implies more frequent visits, but events for it every other day would be annoying.
  - Each coping mechanism also gives a flat stress loss representing "minor forms of indulgence during your day-to-day life" — an abstraction of the off-screen part.
  - Mental Breaks are special events that occur when Stress overwhelms a character.
  
  Source: [CK3 Dev Diary #31 thread](https://forum.paradoxplaza.com/forum/developer-diary/ck3-dev-diary-31-a-stressful-situation.1399764/page-12).
- **CK3 event format limits (Dev Diary #75).** A character event can fit about three paragraphs of copy and 3–4 options before it "starts to look a little naff". Court events were added as a looser, longer, opt-in format: the player always opts in, so they never pop up unexpectedly — [CK3 Dev Diary #75](https://admin-forum.paradoxplaza.com/forum/developer-diary/crusader-kings-3-dev-diary-75-in-the-event-of-court-events.1492792).
- **RimWorld AI storytellers.**
  - Sylvester (2013) described Cassandra as trying to keep the player on a pre-defined tension curve; Randy is random and Phoebe is friendly — [Ludeon blog](https://ludeon.com/blog/2013/09/title-screen-update/).
  - In 2016 he framed the options as catering to different players, with Cassandra for those wanting "a steady, kind of classic challenge curve" — [Breitbart interview](https://www.breitbart.com/tech/2016/10/13/rimworld-developer-tynan-sylvester-dont-listen-to-what-people-say-watch-what-they-do-to-find-developers-to-trust/).
  - The community wiki describes Cassandra as pushing with dangerous events, giving breathing room, then pushing again — [RimWorld Wiki, AI Storytellers](https://rimworldwiki.com/wiki/AI_Storytellers).
  - A Steam user argues the challenge scales with colony wealth rather than time — [Steam thread](https://steamcommunity.com/app/294100/discussions/0/1629663905429419160) (unverified player reading of the code).
- **Wildermyth casting ("plays").**
  - Each event is a play with a cast. Each role has requirements and scoring functions, roles are filled in order, and the game picks randomly among the plays that fit.
  - Actors bring their identity and personality to the role ("splits", dynamic writing), so the same event reads differently with different heroes.
  - Heroes "talk like themselves" most of the time, and all of it is written by hand.
  
  Source: [Nate Austin, GDC 2022 slides](https://media.gdcvault.com/GDC+2022/Speaker+Slides/GettingPlayersEmotionally_Austin_Nate.pdf).
- **Caves of Qud history generation.** Coherent biographies of five "sultans" are generated with a state machine and a replacement grammar. The system reverses cause and effect: it generates historical events first and rationalises them afterwards — [Grinblat & Bucklew, FDG 2017 (PDF)](https://www.freeholdgames.com/papers/Generation_of_mythic_biographies_in_Cavesofqud.pdf); [Semantic Scholar entry](https://www.semanticscholar.org/paper/Subverting-historical-cause-&-effect:-generation-of-Grinblat-Bucklew/e73a3bcd1eca39a2de7add8940d6f36d15175d21).
- **Kate Compton's "10,000 bowls of oatmeal".**
  - She can generate thousands of bowls that differ in every oat's placement, yet the viewer sees "a lot of oatmeal".
  - "Perceptual uniqueness is the real metric."
  - "Perceptual differentiation" — the feeling that this piece is not identical to the last — is an easier bar that is often enough.
  
  Source: [Kate Compton, "So you want to build a generator…" (2016)](https://galaxykate0.tumblr.com/post/139774965871/so-you-want-to-build-a-generator); [PDF version](http://www.galaxykate.com/buildagenerator-kcompton.pdf).
- **Sylvester's apophenia principles** (hint rather than model, human stakes, game as co-author) — [The Simulation Dream](https://tynansylvester.com/2013/06/the-simulation-dream/).
- **Dwarf Fortress:** autonomous actors with motivations are the main narrative source — [Game Developer Q&A](https://www.gamedeveloper.com/design/q-a-dissecting-the-development-of-i-dwarf-fortress-i-with-creator-tarn-adams). A Stanford piece describes the design as emergent narrative and procedural culture with only some scripted events — [Stanford DHS interview](https://dhs.stanford.edu/algorithmic-literacy/an-interview-with-tarn-adams/) (older repost).

### Inferences
- dynasty-sim already has most of these mechanisms (per CLAUDE.md, ROADMAP and DECISIONS):
  - storylets with conditions and roles, and event roles filled from the hero's circle (`fillRoles`, close to Wildermyth's casting);
  - `cooldown_days` and `once: life|game` (the CK3-style cooldown);
  - weighted decks and a narrator with tension that blocks heavy events (close to Cassandra);
  - stories with deadlines and story weight (Failbetter-style progress qualities).
  
  The craft gap is less about mechanisms than about **content-design discipline**. Three missing pieces:
  - Failbetter's "≥2 qualities per arc, or it's a chain or grind" rule and the carousel pattern for repeatable content.
  - Compton's perceptual-differentiation test: does a repeated event *read* differently? Role-dependent text and grammar variants help here.
  - Callbacks to history: the Caves of Qud technique of rationalising past random events into chronicle lines ("as his grandfather did…").
- **CK3 cooldowns stand in for off-screen activity.** The lesson for event writers: a trait's habitual behaviour should mostly be a passive modifier, with a storylet only for the rare notable instance. This is a concrete guideline agents can apply when writing content.
- **The CK3 format cap** (~3 paragraphs, 3–4 options) and the Failbetter word caps (30/20/100) are directly reusable as validator-checkable limits. Agents can enforce them in `validate`.
- **Human judgment is needed** for the "notable instance" call, tone, and whether a callback feels earned. **Agents can** detect repetition (same event or near-identical lines per lifetime, n-gram overlap in chronicles) and report it as a metric.

### Gaps
- The full "Beyond Branching" and "Storylets: You Want Them" texts weren't read (fetch failed). Specifics on *salience-based* selection (Elan Ruskin's Valve dynamic dialogue, "most specific matching rule wins") and *waypoint* narratives couldn't be verified this session. Read both posts before citing details.
- No public numbers found on CK3's event weights, pulse frequency or per-event cooldown distribution. These live in game script files (`events/`, `common/on_action/`) and are not in the dev-diary summaries.
- No source found on how King of Dragon Pass / Six Ages select scenes or prevent repeats (beyond scene counts in section 5).
- No source found on Ultima Ratio Regum's or Lords and Villeins' narrative techniques (searches didn't surface them).

## 5. Content scaling: how many events or traits are needed for variety, writing guidelines, and editorial passes for event text

### Takeaway
Hand-written variety at acclaimed scale is large: King of Dragon Pass had ~600 scenes and ~450,000 words. Failbetter manages volume through strict length caps, a pitch → midflight check → editorial pipeline, quality parsimony, and a living story bible (131 pages in 2017). Wildermyth and CK3 multiply perceived variety by casting different characters and traits into the same text, rather than writing more events.

### Cited Findings
- **King of Dragon Pass scale.** Nearly 600 interactive scenes (2012 port note). Update 2.2 added 48 scenes and 4 illustrations. A scene writer recalled the scene writing came to about 450,000 words — (attribution uncertain between [IF50, "1999: King of Dragon Pass"](https://if50.substack.com/p/1999-king-of-dragon-pass) and [TouchArcade](https://toucharcade.com/?p=168829)). For Dunham's own account, see the [interview in Loading… journal (2016)](https://loading.journals.publicknowledgeproject.org/index.php/loading/article/view/166).
- **Failbetter length caps** (Writer Guidelines Part III): root (storylet) descriptions ≤30 words, branch descriptions ≤20, result descriptions ≤100 — [Part III](https://www.failbettergames.com/news/fallen-london-writer-guidelines-part-iii).
- **Failbetter pipeline** (Part I): pitch → midflight checks on pacing and grind — [Part I](https://www.failbettergames.com/news/fallen-london-writer-guidelines-part-i).
- **Failbetter quality parsimony and reward placement** (Part II) — [Part II](https://www.failbettergames.com/news/fallen-london-writer-guidelines-part-ii).
- Failbetter keeps a living document of every event and arc, 131 pages long in 2017 (narrative director Chris Gardiner) — [Engadget](https://www.engadget.com/2017-05-27-fallen-london-gothic-horror-game-interview-writing.html).
- Failbetter writers also design mechanics. For one theatre storyline, the writer designed a small mini-game so players could build trust with the stage manager — [Inverse](https://www.inverse.com/article/28228-failbetter-games-interview-sunless-skies).
- CK3: a character event holds ~3 paragraphs and 3–4 options. Longer content got a separate opt-in format (court events) — [CK3 Dev Diary #75](https://admin-forum.paradoxplaza.com/forum/developer-diary/crusader-kings-3-dev-diary-75-in-the-event-of-court-events.1492792).
- Wildermyth: personality-dependent lines are all hand-written, which is the cost of making procedural heroes feel authored — [GDC 2022 slides](https://media.gdcvault.com/GDC+2022/Speaker+Slides/GettingPlayersEmotionally_Austin_Nate.pdf).
- Compton: perceptual differentiation, not raw count, is the bar — [Compton 2016](https://galaxykate0.tumblr.com/post/139774965871/so-you-want-to-build-a-generator).

### Inferences
- There is no published "magic number" of events. The better practice is to **measure** variety rather than target a count:
  - unique events seen per head-of-house lifetime;
  - share of repeats;
  - distinct chronicle-line templates per 100 years.
  
  Raise content where these metrics fail. dynasty-sim's ROADMAP already does this for chronicle lines per head of house (corridor 25–50), and that approach generalises.
- **Editorial pipeline that fits AI agents:**
  1. A pitch (1–3 sentences: scope, which pillar, which qualities) approved by Tim.
  2. An agent drafts in batches against a style guide: word caps, pronoun and placeholder rules, "a trait's habit is a modifier; a storylet is the notable instance".
  3. Automated checks: validator caps, repetition metrics.
  4. A midflight sim-and-read check.
  5. Tim's final read of a small sample for tone.
  
  The style-guide content (voice, period flavour for 1700) needs Tim's judgment once; after that agents can enforce it.
- A living "story bible" (index of arcs, recurring characters and the qualities each arc uses) prevents collisions as content grows. In dynasty-sim this could be generated automatically from `content/` by a tool, rather than hand-maintained.

### Gaps
- No source found on CK3's total event count or traits-per-character design rationale (CK3 caps personality traits at a small number; not verified this session).
- No Sunless Sea postmortem or Failbetter editing-pass details beyond the guideline posts.
- No figures for Six Ages scene counts or writing volume were found.

## 6. Balancing complex interacting systems: spreadsheets, Monte Carlo, metric corridors

### Takeaway
Public sources show the *tools* only indirectly: CK3 replaced mean-time-to-happen probabilities with hook-driven weighted lists to *govern frequency*, and retunes trait interactions in patches. Pacing directors (Cassandra) shape difficulty over time. There is little public detail on spreadsheets or Monte Carlo at these studios. Research on automated playtesting supports running many simulated games for balance, with known blind spots.

### Cited Findings
- CK3 moved from probability-based firing (hard to govern frequency) to on_action hooks with weighted lists and weight multipliers — [CK3 Dev Diary #30](https://forum.paradoxplaza.com/forum/developer-diary/crusader-kings-3-dev-diary-30-event-scripting.1397140/).
- CK3 retunes trait-mechanic interactions after release, e.g. Shy and Stubborn vs schemes and stress — [CK3 Dev Diary #58](https://forum.paradoxplaza.com/forum/developer-diary/ck3-dev-diary-58-stre-ss-tching-the-traits.1472092/page-3).
- RimWorld's Cassandra keeps the player on a pre-defined tension curve — [Ludeon blog 2013](https://ludeon.com/blog/2013/09/title-screen-update/). The community claims challenge scales with colony wealth — [Steam thread](https://steamcommunity.com/app/294100/discussions/0/1629663905429419160) (unverified).
- Automated or agent playtesting measures balance and progression, not fun — [theneuralbase](https://theneuralbase.com/ai-for-gaming/learn/beginner/playtesting-automation/) (low authority). Agents optimise narrow metrics and under-explore — [arXiv 1903.10545](https://arxiv.org/pdf/1903.10545).
- *Designing Games* defines "elegance" as maximising emotional power and variety while minimising burden on players and the team, which also argues against adding balancing parameters — [Google Books](https://books.google.com/books/about/Designing_Games.html?id=sckajE19pFAC).
- Failbetter: extra qualities "complicate the economy" and cause bugs — [Part II](https://www.failbettergames.com/news/fallen-london-writer-guidelines-part-ii).

### Inferences
- dynasty-sim's existing practice is ahead of what these studios publish: seeded Monte Carlo runs (`--runs 10`), median/min/max metrics, CI corridors that fail the build or only report, and bot characters with dead-option and dominant-strategy reports. What the sources add:
  - **Frequency governance by design.** Prefer "hook + weighted pool + cooldown" over raw daily probabilities; CK3 changed for exactly this reason.
  - **Parameter parsimony.** Each new quality or number is a balance and bug cost (Failbetter, elegance).
  - **Bots are biased.** Add a deliberately "curious" bot that picks rarely chosen options, so content isn't only tested on safe paths. Keep human reads for experience.
  - **Pacing as a curve, not a constant.** A tension or "drama curve" metric per generation (heavy events per decade, quiet stretches), checked against a target shape.
- **Agent-delegable:** writing the corridor checks, running sweeps, producing compare tables. **Human judgment:** choosing the target corridors and curve shape (what *feels* right), and deciding when a "dominant" strategy is acceptable flavour rather than a bug.

### Gaps
- No public source found on Paradox, Ludeon, Bay 12 or Failbetter using spreadsheets or Monte Carlo for balance. Absence of evidence, not evidence of absence.
- No source on CK3's AI-vs-AI observer runs for balance.

## 7. Production model for a solo or small team: milestones (prototype → vertical slice → alpha → beta → early access), documentation (GDD vs one-page designs), decision logs

### Takeaway
The successful small-team examples lean on short public vision statements and incremental public development:
- CK3's public Dev Diary #0 at the start.
- RimWorld's Kickstarter and long early access, with "not planning" and shipping without "critical" features.
- Norland's early access with radical core reworks.

Failbetter's pitch/midflight/bible pipeline is the clearest documented content-production process. King of Dragon Pass is a cautionary tale about cost and timeline: three years, $500k, 8,000 boxed copies.

### Cited Findings
- CK3 published "The Vision" (Dev Diary #0) on 24 Oct 2019, followed by a "Game Vision" video (13 Nov 2019) and a long run of numbered dev diaries — [CK3 Wiki, Developer diaries](https://productionwiki-ck3.paradoxwikis.com/index.php?title=Developer_diaries).
- RimWorld was crowdfunded on Kickstarter (2013) — [Kickstarter page](https://www.kickstarter.com/projects/tynansylvester/rimworld/description?comment=Q29tbWVudC00NTU1Nzk5). Sylvester's later GDC talk advocates "not planning" and shipping without features that seem critical — [GDC Vault](https://gdcvault.com/play/1024232/-RimWorld-Contrarian-Ridiculous-and).
- King of Dragon Pass was begun in 1996 (Newton-era origins), cost $500,000, and sold only 8,000 boxed copies. It found its audience more than a decade later — [Wikipedia, King of Dragon Pass](https://en.wikipedia.org/wiki/King_of_Dragon_Pass); [IF50](https://if50.substack.com/p/1999-king-of-dragon-pass).
- Norland launched in early access with publisher Hooded Horse, delayed to July "taking a lesson from Manor Lords". It then shipped large core-reworking updates, one issued in two halves — [PC Gamer, delay](https://www.pcgamer.com/games/strategy/taking-a-lesson-from-manor-lords-hooded-horse-delays-norland-to-july/); [PC Gamer, summer update](https://www.pcgamer.com/games/sim/norlands-big-summer-update-is-even-larger-than-marchs-damn-big-update-introducing-a-politics-system-a-new-economy-and-more-authentically-medieval-buildings-to-the-crusader-kings-inspired-colony-sim/).
- Failbetter's production documents: pitch per piece, midflight checks, length caps, quality-design rules, and a 131-page living bible — [Part I](https://www.failbettergames.com/news/fallen-london-writer-guidelines-part-i); [Part II](https://www.failbettergames.com/news/fallen-london-writer-guidelines-part-ii); [Part III](https://www.failbettergames.com/news/fallen-london-writer-guidelines-part-iii); [Engadget](https://www.engadget.com/2017-05-27-fallen-london-gothic-horror-game-interview-writing.html).
- Reviews describe *Designing Games* as framing development like a Lean Startup: staged experiments, test, analyse — [GBGames review](https://www.gbgames.com/2014/05/07/book-review-designing-games-by-tynan-sylvester/); [Google Books](https://books.google.com/books/about/Designing_Games.html?id=sckajE19pFAC).
- Dwarf Fortress: the "stories first" method serves as the design document — short prose stories define the target, then the engine is built toward them — [Game Developer Q&A](https://www.gamedeveloper.com/design/q-a-dissecting-the-development-of-i-dwarf-fortress-i-with-creator-tarn-adams).

### Inferences
- **Document set for dynasty-sim.** It already has GDD, ROADMAP, DECISIONS (decision log), STATUS, CHANGELOG and IDEAS, which is more formal than most indie examples. The sources suggest adding two lightweight artefacts rather than more GDD:
  - A **one-page vision / experience goals** sheet (CK3 DD#0 style), stable across stages.
  - **"Target stories"**: a handful of short prose chronicles Tim wants the game to be able to produce (Dwarf Fortress style). Each stage plan states which target story it brings closer, and the stage ends with a sim chronicle compared against it.
- **Milestones for a solo designer directing agents:**
  - **Prototype** — headless sim, one system, minimum content, chronicle read.
  - **Vertical slice** — one generation playable in the browser with the full loop: event → choice → consequence → succession.
  - **Alpha** — all pillar systems present at low content.
  - **Content beta** — content volume driven by variety metrics.
  - **Optional public early access**, gathering *experience* reports.
  
  The KoDP history warns against scaling content volume before the loop is proven. Norland shows early access can absorb core reworks, but at a cost.
- **Delegable to agents:** maintaining the decision log, running gates, drafting pitches and content, summarising playtests. **Human-only (Tim):** vision and pillars, target stories, accepting or cutting features, tone, and final "is it boring?" calls.

### Gaps
- No public source found on Bay 12's, Ludeon's or A Sharp's internal milestone definitions or documentation format (GDD vs one-pagers).
- Six Ages development process, Ultima Ratio Regum's dev blog and Lords and Villeins weren't covered by any search result. These sources remain unresearched.
- Several primary sources should be read in full before quoting, since fetch failed this session:
  - the Paradox CK3 dev diaries #0, #30, #31, #75 (full text);
  - Sylvester's GDC 2017 talk (GDC Vault, login-gated);
  - Emily Short's two posts;
  - Failbetter guideline posts I–III;
  - Nate Austin's GDC 2022 slides;
  - the Caves of Qud FDG paper;
  - the Dunham interview in *Loading…*.
