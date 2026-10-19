# Avoiding "AI slop" in an LLM-written, text-heavy procedural game (writing, mechanics, design)

> Method note for the report writer: in this session the network policy blocked direct page fetches (WebFetch and curl were refused for wikipedia.org, arxiv.org, failbettergames.com, techcrunch.com, windowscentral.com). Every finding below comes from search-engine result content (titles, snippets and the search tool's summaries of the indexed pages), not from reading the full pages. Numbers marked "verify" came only from a secondary summary. The URLs are the pages the search tool attributed each claim to.
>
> Repo context checked locally: `.claude/agents/content-writer.md` has strict format and mechanics rules (roles, checks, weights, "choice = different consequences, not words") but **no prose-style rules**: no voice description, no banned patterns, no exemplar passages, no length caps. A quick scan of the current corpus (~294 `text:`/`result:` lines in `content/events/` and `content/backstory/`) found 0 em dashes and 0 instances of "testament", "tapestry", "not just", "a reminder", "the weight of" or "couldn't help". A sample of lines reads concrete and specific (e.g. "Among the stones of a dry ditch you find a purse someone lost. There is no name inside it, only twelve crowns."). So the corpus is clean today. The risk grows with volume and batch count (see Q1 and Q6).

## 1. Tell-tale features of LLM prose (what readers notice as "AI-written")

### Takeaway
Single "AI words" (delve, tapestry) are a weak and short-lived signal. The robust tells are **structural and statistical**:
- negative parallelism ("not X but Y");
- rule-of-three lists;
- participial tails and noun-heavy phrasing;
- unnecessary exposition (explaining the feeling or the moral);
- clichés and purple prose, plus a lack of specificity;
- and, across a corpus, **homogeneity**: many pieces that are individually fine but alike.

For a storylet game the corpus-level sameness matters more than any single sentence. A player reads hundreds of events per run.

### Cited Findings
- **Wikipedia's "Signs of AI writing" guide.**
  - It is maintained by WikiProject AI Cleanup and runs to about 15,000 words. It is descriptive, not prescriptive ("observations, not rules"), and explicitly "not a ban on certain words, phrases, or punctuation"; it targets broader patterns. — [TechCrunch, 2025-11-20](https://techcrunch.com/2025/11/20/the-best-guide-to-spotting-ai-writing-comes-from-wikipedia/); [beutlerink summary](https://www.beutlerink.com/blog/how-to-spot-ai-writing)
  - Patterns named in secondary coverage:
    - negative parallelism ("not just X, it's Y");
    - rule-of-three lists;
    - filler such as "it's important to note";
    - stock wrap-ups ("In summary", "Overall");
    - vague attributions ("some critics argue").
    — [erkansaka.net mirror/discussion](https://erkansaka.net/2025/09/27/wikipedia-signs-of-ai-writing-guide/); [Fast Company SA](https://fastcompany.co.za/tech/2025-08-29-how-to-disguise-your-ai-writing-here-are-a-few-tips) (exact wording not verified against Wikipedia itself)
  - Caveat in the guide: not all text with these indicators is AI-generated, because models are trained on human writing. The patterns are *potential signs of a problem*, not the problem itself. — [TechCrunch](https://techcrunch.com/2025/11/20/the-best-guide-to-spotting-ai-writing-comes-from-wikipedia/)
- **Single-word tells are unreliable.** TechCrunch notes that for a few months people were convinced words like "delve" or "underscore" gave models away, "but the evidence is thin" as a per-text detector. — [TechCrunch](https://techcrunch.com/2025/11/20/the-best-guide-to-spotting-ai-writing-comes-from-wikipedia/)
- **Corpus-level word shift is real** (Kobak et al., *Science Advances* 2025, 11(27) eadt3813).
  - The study covered >15M PubMed abstracts from 2010 to 2024.
  - At least 13.5% of 2024 abstracts were LLM-processed, and up to 40% in some subcorpora.
  - The 2024 "excess words" were **style** words ("delves", "showcasing", "underscores", "potential", "findings", "critical"). The pandemic-era excess words were **content** words ("respiratory").
  - The authors say the effect surpassed the COVID pandemic's effect on vocabulary.
  — [arXiv 2406.07016](https://arxiv.org/abs/2406.07016v5); [Scimex summary](https://www.scimex.org/newsfeed/ai-chatbots-might-be-helping-to-write-more-than-1-in-10-biomedical-research-papers); [code](https://github.com/berenslab/llm-excess-vocab)
- **Grammar-level tells** (Reinhart et al., *PNAS* 2025, "Do LLMs write like humans? Variation in grammatical and rhetorical styles").
  - Instruction-tuned models use **present participial clauses at ~2–5× the human rate** and **nominalizations at ~1.5–2×**.
  - GPT-4o uses the agentless passive at about half the human rate.
  - The gaps persist as models scale and are larger for instruction-tuned than for base models. Instruction tuning in Llama 3 made the output more distinguishable.
  - The authors read this as training toward an "informationally dense, noun-heavy style".
  — [CMU news](https://www.cmu.edu/news/stories/archives/2025/february/is-it-human-or-is-it-ai); [arXiv 2410.16107](https://arxiv.org/html/2410.16107v2) (figures from preprint and press release; verify against PNAS)
- **What professional writers fix in LLM fiction** (Chakrabarty, Laban, Wu, "Can AI writing be salvaged?", CHI 2025; LAMP corpus).
  - Professional writers edited LLM paragraphs and converged on a 7-category taxonomy of idiosyncrasies. Categories named in the sources:
    - clichés;
    - unnecessary exposition;
    - purple prose;
    - poor sentence structure;
    - awkward word choice and phrasing;
    - lack of specificity.
  - Reported edit shares: awkward word choice/phrasing ~28%; poor sentence structure ~20%; unnecessary exposition and clichés ~17–20% each (verify).
  - The idiosyncrasies were similar across three model families. GPT-4o produced more purple prose; Llama-3.1-70B produced more unnecessary exposition.
  — [arXiv 2409.14509](https://arxiv.org/html/2409.14509v3); [alphaXiv summary](https://www.alphaxiv.org/abs/2409.14509); [Stony Brook news](https://ai.stonybrook.edu/about-us/News/can-ai-writing-be-salvaged-bridging-gap-between-machine-and-human-language)
- **Measured repetitive patterns** (Antislop: Paech, Roush, Goldfeder, Shwartz-Ziv; arXiv Oct 2025, ICLR 2026). The paper defines "slop" as repetitive phrasing characteristic of LLMs. Some slop patterns appear **>1,000× more often in LLM output than in human text**. Slop is profiled per model against human baselines. — [ICLR 2026 poster](https://iclr.cc/virtual/2026/poster/10008156); [arXiv 2510.15061](https://arxiv.org/pdf/2510.15061v1)
- **EQ-Bench "Slop Score"** treats "not X but Y" contrast patterns as a first-class tell, weighted 25%. Slop words are 60% and slop trigrams 15%. The page describes "frequency of contrast patterns like 'not just X, but Y' which are overused by AI". — [EQ-Bench Slop Score](https://eqbench.com/slop-score.html); [github sam-paech/slop-score](https://github.com/sam-paech/slop-score)
- **Homogenization across a body of work** (Doshi & Hauser, *Science Advances* 2024, eadn5290).
  - Writers who got LLM story ideas produced stories that readers rated more creative, better written and more enjoyable, with the biggest gains for less creative writers.
  - But the AI-assisted stories were **more similar to each other**: a 10.7% increase in similarity (embeddings) for writers who used one AI idea.
  - The authors call this a "social dilemma": individual gain, collective loss of novelty.
  — [PMC full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC11244532); [ScienceDaily](https://www.sciencedaily.com/releases/2024/07/240712222127.htm); [PsyPost](https://psypost.org/new-study-on-ai-assisted-creativity-reveals-an-interesting-social-dilemma)
- **Human studios also develop house clichés.** Failbetter's guideline flags "all across London" as overused and "a warning sign that you're telling, not showing". — [Failbetter, Fallen London writer guidelines part III](https://www.failbettergames.com/news/fallen-london-writer-guidelines-part-iii)
- **Players notice repetition in AI-driven games.** *Whispers from the Star* (Aug 2025, live-LLM character) drew complaints about "repetitive dialogue" and a tendency to drift from the objective, alongside praise for its human-like character. — [vaporlens summary](https://vaporlens.app/app/3730100/whispers_from_the_star); [Notebookcheck](https://www.notebookcheck.net/Steam-launch-New-interactive-fiction-game-debuts-to-Very-Positive-reviews-may-divide-gamers-over-heavy-AI-integration.1087821.0.html)

### Inferences
- **Event prompts.** The tells most relevant to short second-person event texts and third-person chronicle lines are:
  - the participial tail ("…, leaving you uneasy");
  - the moralizing or emotion-naming closer (unnecessary exposition);
  - "not X but Y" reversals;
  - triplets of adjectives or clauses;
  - generic nouns instead of specific objects (lack of specificity);
  - purple prose in "important" moments (death, birth, succession).
  These are better targets for rules and linters than word lists.
- **Hundreds of events over a 300-year run.** Here the Doshi & Hauser effect matters most: each event can pass review alone while the set converges, with the same openings, the same rhythm and the same kinds of NPC behaviour. Quality checks must run **per batch and per corpus**, not only per event.
- **Per-model profiles.** Antislop and LAMP both report that the tells are model-specific in detail but similar in kind. If the content-writer model changes (e.g. Sonnet version bumps), re-profile the corpus.
- **Today's state.** The current corpus scan shows the agents avoid the most famous tells. The next risk is subtler: repeated sentence templates (e.g. many lines built as "<scene>. {role} <does X>, then <does Y>.") and repeated colon or appositive constructions ("A bad season, a bad debt: …"). That should be measured, not assumed.

### Gaps
- Could not read the Wikipedia guide directly. Its full category list and per-model/per-period word lists (e.g. which words were typical of GPT-4 vs GPT-4o vs later models) are unverified here.
- The exact LAMP percentages and the seventh category name came only from a summary (verify in arXiv 2409.14509).
- No rigorous study was found that is specific to **game** text (event texts, barks) and that measures which tells *players* notice. The evidence is from academic, encyclopedic and fiction domains plus anecdotal player reviews.
- Contested: a third-party blog claims humans produce 0.04 contrast patterns per 1k characters vs 0.09–0.81 for LLMs. This was not verifiable against EQ-Bench.

## 2. How narrative studios set voice, and how to turn that into prompts, linters and judge checklists

### Takeaway
Studios that ship large volumes of short choice-text (Failbetter especially) rely on:
- **hard length caps per text slot**;
- a short list of **named techniques to favour and avoid**, including their own house clichés;
- **world-specific concrete rules** (e.g. "it never more than drizzles");
- **show-don't-tell plus "don't tell the player what they feel"**;
- a **"would a person say this" test** for dialogue;
- editorial consistency across writers.

Paradox-style events add **mechanical transparency**: tooltips that show effects, and triggered flavor-text variants. Almost all of these translate directly into prompt rules, YAML linters and a judge rubric.

### Cited Findings
- **Failbetter, "Fallen London writer guidelines part III"** (prose). The stated purpose is to establish consistent tone and quality and to list "techniques we've learned to favour or avoid". Rules:
  - **root descriptions ≤ 30 words, branch descriptions ≤ 20, result descriptions ≤ 100**;
  - show, don't tell; favour evocative images and incident;
  - **do not assign the player thoughts or feelings**;
  - "all across London" is overused and is a telling-not-showing warning sign;
  - **direct speech must pass the "say-this-shit test"** and is better than reported speech;
  - when exposition creeps in, put NPCs in distress.
  — [Failbetter guidelines III](https://www.failbettergames.com/news/fallen-london-writer-guidelines-part-iii); index of writer posts (including "Writing style in Fallen London" and "Points of light, pools of shadow" I–II, titles only seen): [Failbetter useful posts for writers](https://www.failbettergames.com/useful-posts-for-writers)
- **Older Failbetter guidelines** (republished 2015) include world-texture rules such as "it never more than drizzles in Fallen London". — [Mark Bernstein, May 2015](https://markbernstein.org/May15/Guidelines.html)
- **Failbetter on the job itself.** A Failbetter job posting describes the game as prose-oriented ("benefits from conventional writing skills, of the kind helpful for a short story") and "denser in choice and consequence than is usual in video games". — [workwithindies posting](https://workwithindies.com/careers/failbetter-games-writer-and-narrative-designer)
- **Storylets** (Emily Short).
  - A storylet is content + prerequisites + effects on world state. Storylets are "simple, atomic, robust, and recombinable", and a typical one is "a paragraph or two of text followed by a choice".
  - Quality-based narrative was coined by Failbetter.
  - In a QBN the player chooses the next storylet; in a salience system the system chooses.
  — [Storylets: You Want Them](https://emshort.blog/2019/11/29/storylets-you-want-them/); [Beyond Branching](https://emshort.blog/2016/04/12/beyond-branching-quality-based-and-salience-based-narrative-structures/); [Mailbag: High-Agency Narrative Systems](https://emshort.blog/2017/05/25/mailbag-high-agency-narrative-systems/)
- **Generated variety must connect to gameplay.** Emily Short (on Compton's "oatmeal"): generation unconnected to gameplay is "purely decorative", and players soon learn to look past it. — [Bowls of Oatmeal and Text Generation](https://emshort.blog/2016/09/21/bowls-of-oatmeal-and-text-generation/)
- **Paradox (Age of Wonders 4, dev diary 6, narrative events).** Events offer "meaningful choices… through trade-offs that connect game play systems which normally would not interact". They offer rewards outside the player's core strategy. Options show "a full tooltip breakdown of all the gameplay effects" before the click. — [AoW4 dev diary 6](https://www.paradoxinteractive.com/games/age-of-wonders-4/news/age-of-wonders-4-dev-diary-6)
- **Paradox (CK3 dev diary 30, event scripting).** Triggered flavor text uses a `first_valid` block that picks the first variant meeting its criteria. This lets one event be broadly applicable yet feel specific; CK2's mutually exclusive variants were cumbersome. — [CK3 DD 30](https://admin-forum.paradoxplaza.com/forum/developer-diary/crusader-kings-3-dev-diary-30-event-scripting.1397140)
- **Paradox (CK2 event-writing contest guidance).** "Take care not to write too much, as the text needs to fit inside the event window". Trait-based options are "a nice touch". — [PC Gamer](https://www.pcgamer.com/au/crusader-kings-2-the-old-gods-contest-gives-you-the-chance-to-create-an-in-game-event)
- **Obsidian (Pillars of Eternity).**
  - Lead writer Eric Fenstermaker: "we want our games to be readable. We are not looking to enter the literary canon…". He prefers "clean" over "concise", warns against walls of text, and admits "We often were not clean in the Pillars base game".
  - Carrie Patel: they wrote brief descriptions of characters' physical reactions around dialogue.
  — [GameBanshee, Fenstermaker](https://gamebanshee.com/kxqyr); [GameBanshee, Patel](https://www.gamebanshee.com/a993q)
  - Josh Sawyer: dialogue should inform and entertain; outline conversations first; give at least two options (secondary report). — [GameBanshee, Sawyer blog update](https://www.gamebanshee.com/yx3)
- **Inkle.** Inkle used "defensive logic to ensure the story gets told and makes sense regardless of how it comes about" (GDC 2017 talk summary). Jon Ingold's Develop 2023 keynote was a "manifesto for creating re-playable narratives" and covered strategies to reduce content-creation burden. — [Emily Short, GDC 2017](https://emshort.blog/2017/02/22/gdc-2017/); [Develop:Brighton keynote announcement](https://developconference.com/latest-news/inkles-jon-ingold-announced-as-first-keynote-speaker)
- **Banned lists have a ceiling.**
  - Antislop: plain token banning becomes unusable at ~2,000 banned patterns. Their backtracking sampler suppresses 8,000+ patterns while maintaining quality.
  - FTPO fine-tuning gives ~90% slop reduction while keeping GSM8K, MMLU and creative-writing scores. DPO degraded writing quality and lexical diversity.
  — [ICLR 2026 poster](https://iclr.cc/virtual/2026/poster/10008156); [code: auto-antislop](https://github.com/sam-paech/auto-antislop) (repo URL as stated in search summary)
- **EQ-Bench's contrast detector is a linter design to copy.** Stage 1 runs 10 regex patterns on normalized text, including dash forms and cross-sentence contrasts. Stage 2 runs 35 regex patterns on a POS-tagged stream (wink-pos-tagger). It is "optimised for creative writing and essays" and likely under-reports elsewhere. — [EQ-Bench Slop Score](https://eqbench.com/slop-score.html); [arXiv 2601.21169 using it](https://arxiv.org/pdf/2601.21169); offline analyzer: [SlopScoreTool](https://github.com/lemon07r/SlopScoreTool)
- **LLM-judge pitfalls.**
  - Self-preference bias: GPT-4 shows significant self-preference.
  - **LLM judges give higher scores to lower-perplexity (more "typical") text than human evaluators do, regardless of who wrote it.** — [Wataoka et al., arXiv 2410.21819](https://arxiv.org/html/2410.21819v1)
  - Position bias: swapping a close pair flips 20–40% of verdicts (practitioner blog, not a controlled study).
  - Verbosity bias: judges favour longer answers.
  - Mitigation: run both orderings and calibrate against human labels (Cohen's kappa).
  — [tianpan.co blog](https://tianpan.co/blog/2026-04-27-llm-judge-bias-audit-length-position-format); [Analytics Vidhya](https://www.analyticsvidhya.com/blog/2026/08/why-you-shouldnt-trust-llm-judges/)

### Inferences
- **Translation for dynasty-sim.** Studio practice maps onto three artifacts.
  - (a) A **style sheet in the content-writer prompt**:
    - voice;
    - per-slot word caps, e.g. Failbetter-like caps for `text`, `options[].text`, `result`;
    - "never tell the player what you feel" (the second-person `text` is exactly Failbetter's case);
    - "say-this test" for any quoted speech;
    - 5–10 world-texture rules for ~1700 (what money, roads, weather, ranks and objects are like);
    - a short list of house clichés found in our own runs.
  - (b) A **YAML linter** for mechanically checkable items: caps, contrast patterns, triplets, participial tails, em dashes, emotion words in `text`, and repeated openings.
  - (c) A **judge checklist** for the rest: specificity, telling vs showing, whether options differ in consequence, and whether the line works for both genders.
- **Keep the ban list short and pattern-based** (dozens, not thousands). Antislop's ~2,000-pattern ceiling is for sampling-time bans, but the lesson holds: long banned-word lists push the model into substitute clichés. Lint flags should go to review, not auto-reject; the Wikipedia guide says patterns are signs, not proof.
- **Don't let the judge rubber-stamp typical text.** The perplexity finding means an LLM judge without a rubric will systematically **prefer** the most typical, most "AI-sounding" candidate. A judge must score against explicit criteria and exemplars. It should be calibrated on a small human-labelled set (Tim's own approve/reject decisions), and pairwise comparisons should run in both orders.
- **Prefer conditional variants to rewrites.** The CK3 `first_valid` approach (conditional flavor variants inside one event) is a cheaper path to "specific-feeling" text than writing more events. It is worth considering in the event contract if not already present. dynasty-sim already has `{role?…}` optional fragments and grammar symbols.

### Gaps
- Could not read the full Failbetter guideline series, Inkle's or Obsidian's internal style guides. No published Obsidian or Inkle style guide was found. Paradox's own CK3 event-writing guidelines, if public, were not found.
- No found source documents a studio converting its style guide into an LLM linter or judge with measured results. The translation above is inference.

## 3. Human-in-the-loop curation models (golden exemplars → AI batch drafts → automated checks → human edit pass)

### Takeaway
The models that are publicly described are all "AI drafts many → human selects and edits", with learning from the selections: Ubisoft Ghostwriter, Compton's Spore seed whitelisting, and LAMP edit-based alignment. Published *quality results* from game studios are essentially absent. The best evidence comes from research:
- expert edits can be systematized into a taxonomy and used to train or rewrite;
- AI help raises individual quality but homogenizes a corpus.

The best-known failure (11 bit's *The Alters*) was a **missing human gate**, not bad generation.

### Cited Findings
- **Ubisoft Ghostwriter (Mar 2023, La Forge).**
  - A writer enters a character and an event or interaction type; the tool returns several variations; **the writer picks and edits**; the tool learns from accepted lines. It targets barks, the repetitive workload.
  - Ubisoft: "Ghostwriter isn't replacing the video game writer". The announcement met "great scepticism".
  - Production adoption needed an extra back-end tool (Ernestine) for creating new models.
  - No published quality or usage results were found.
  — [GameSpot](https://Gamespot.com/articles/ubisoft-is-using-an-ai-tool-for-writing-in-its-games/1100-6512552/); [80.lv](https://80.lv/articles/ubisoft-introduced-ai-tool-ghostwriter-to-generate-npc-dialogues/); [KitGuru](https://www.kitguru.net/page/276/!https:/www.kitguru.net/tech-news/mustafa-mahmoud/ubisoft-announces-ai-ghostwriter-to-save-scriptwriters-time/)
- **Curate the generator's output** (Kate Compton, Spore). For Spore's planets, Compton whitelisted the seeds tied to "good" planets and discarded unappealing ones. — [Game Developer, Practical procedural generation](https://gamedeveloper.com/design/practical-procedural-generation-for-everyone-)
- **Expert edits as the training signal** (Chakrabarty et al., CHI 2025). Professional writers' edits to LLM paragraphs produced the LAMP corpus and an idiosyncrasy taxonomy, used to study automated mitigation of the idiosyncrasies. Follow-ups: "AI-Slop to AI-Polish?" (edit-based writing rewards plus test-time computation) and StoryScope (do classifiers still detect AI fiction after editing?). Only titles and summaries were seen. — [arXiv 2409.14509](https://arxiv.org/html/2409.14509v3); [arXiv 2504.07532](https://arxiv.org/html/2504.07532v1); [StoryScope PDF](https://jenna-russell.github.io/assets/pdf/storyscope.pdf)
- **Fine-tuning on high-quality books.** "Can Good Writing Be Generative? Expert-Level AI Writing Emerges through Fine-Tuning on High-Quality Books" (arXiv 2601.18353; ACM CHI 2026). The title implies exemplar-driven quality gains; details not retrieved. — [arXiv 2601.18353](https://arxiv.org/html/2601.18353); [ACM DL](https://dl.acm.org/doi/10.1145/3772318.3791276)
- **AI ideas help weaker writers but homogenize the group** (Doshi & Hauser 2024). Any curation that judges pieces one by one will miss the collective sameness. — [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11244532)
- **Failure case: 11 bit studios, *The Alters* (June 2025).**
  - AI-generated text used as a placeholder on a background texture was left in through "an internal oversight". Players found an LLM preamble in-game; Push Square's headline quotes "Sure, Here's a Revised Version of the Text".
  - Licensed-movie subtitles were AI-translated "due to extreme time constraints", bypassing the usual translation partners. The studio said AI text was **0.3% of the game's text**, to be refined by translation firms.
  - The use had not been disclosed on Steam.
  — [Screenhub](https://www.screenhub.com.au/news/games/the-alters-ai-2671396/); [Push Square](https://www.pushsquare.com/news/2025/06/sure-heres-a-revised-version-of-the-text-the-alters-taken-to-task-for-blatant-use-of-generative-ai); [TheSixthAxis](https://www.thesixthaxis.com/2025/06/30/11-bit-studios-releases-statement-over-use-of-ai-in-the-alter-development/); [Insider Gaming](https://insider-gaming.com/the-alters-developers-address-accusations-of-generative-ai-use/)

### Inferences
- **A workable model for dynasty-sim** (owner is a designer who reads results, not code):
  1. **Golden set.** Tim writes or approves ~10–20 exemplar events and ~30 chronicle lines covering the tonal range (comic, grim, mundane, heavy). Each gets a one-line note on why it is good. They live in the repo (e.g. next to `docs/samples/chronicle-target.md`) and are quoted into every content-writer prompt.
  2. **Batch drafting with over-generation.** The agent drafts more than needed, e.g. 2 variants per scene text, and selection is cheap. This mirrors Ghostwriter and Compton's whitelist.
  3. **Automated gates.** Schema plus linter plus corpus metrics (Q6) plus a rubric judge calibrated on Tim's past approve/reject decisions.
  4. **Human pass on a sample, not all.** Tim reads a sampled chronicle and journal from a sim run (he already does this through `/run-sim`) and marks lines as "AI-sounding", "boring" or "good". Those marks feed the house-cliché list and the golden set.
  5. **Hard release gate.** No placeholder or stub text and no meta-text ("Sure, here's…", "As an AI") may enter `content/`. A grep in validate is enough; this is The Alters' lesson.
- **Track batch diversity explicitly** (Doshi & Hauser): "Does this batch look like the last batch?" should be a measured check, not a reviewer's impression.

### Gaps
- No published, quantified results were found for a game studio's AI-draft/human-edit pipeline: acceptance rate, edit distance, time saved, player-perceived quality. Ghostwriter's outcomes since 2023 are undocumented in what was found.
- Nothing was found on how many golden exemplars are optimal in prompts for style transfer in game writing.

## 4. Mechanics: why procedural/AI-assisted games feel shallow, and how to make choices meaningful and testable

### Takeaway
Shallowness comes from:
- **perceptually indistinct variety** ("10,000 bowls of oatmeal");
- **text not tied to gameplay** (decorative generation);
- **choices without real trade-offs or persistent consequences**;
- AI text standing in for agency (a talking character in a linear story).

Depth comes from trade-offs that cross systems, consequences that persist and reappear, character-driven tension (CK3 stress: acting against your nature costs you) and leaving the meaning-making to the player (apophenia). These can be audited with agent or bot runs that flag dead options, dominant strategies and low-value rewards.

### Cited Findings
- **"10,000 bowls of oatmeal"** (Kate Compton). Mathematically unique outputs that players cannot perceptually distinguish read as "a lot of oatmeal". What matters is **perceptual** uniqueness. — [Game Developer](https://gamedeveloper.com/design/practical-procedural-generation-for-everyone-); [Emily Short](https://emshort.blog/2016/09/21/bowls-of-oatmeal-and-text-generation/); a 2026 follow-up essay exists, title only seen: [Boris the Brave, "Oatmeal spice"](https://www.boristhebrave.com/2026/07/05/oatmeal-spice/)
- **Decorative generation.** Text variety not connected to gameplay is "purely decorative", and players learn to look past it. — [Emily Short](https://emshort.blog/2016/09/21/bowls-of-oatmeal-and-text-generation/)
- **Sid Meier, "Interesting Decisions" (GDC 2012; the phrase dates to 1989).** Gameplay is "a series of interesting decisions". It is easier to define what is *not* interesting: if a player always chooses the first of three choices, it is not interesting; nor is a random selection. — [Game Developer GDC 2012](https://www.gamedeveloper.com/design/gdc-2012-sid-meier-on-how-to-see-games-as-sets-of-interesting-decisions); [GDC Vault](https://gdcvault.com/play/1015756/Interesting)
- **Tynan Sylvester.**
  - "The Simulation Dream" (2013) asks whether the promise of Dwarf Fortress, Prison Architect and SimCity-style storytelling simulations is achievable, and how to rescue it.
  - In *Designing Games* he calls **apophenia** (perceiving personality and intent where there is none) key to simulation games: the simulation supplies logistics and random outcomes, the player supplies meaning, and the simulation co-authors the story.
  - He defines games as "an artificial system for generating experiences".
  — [Game Developer, The Simulation Dream](https://gamedeveloper.com/design/the-simulation-dream); [Stanford GDT, apophenia](https://gdt.stanford.edu/how-do-you-create-apophenia/); [GBGames review](https://www.gbgames.com/2014/05/07/book-review-designing-games-by-tynan-sylvester/)
- **CK3 stress** (dev diary 31, "A Stressful Situation", 2020).
  - Stress rises when the realm pushes a ruler "into actions against their nature". Higher stress brings penalties to health and fertility.
  - The intended play is not avoiding all stress but managing it with coping mechanisms; reckless play leads to a breakdown at a bad moment.
  - DD 58 tied stress closer to personality traits with trait-specific interactions.
  - Community critique: stress felt "far too mechanical and dependent on some very specific events/outcomes".
  — [CK3 DD 31](https://forum.paradoxplaza.com/forum/threads/ck3-dev-diary-31-a-stressful-situation.1399764/page-7); [CK3 DD 58](https://admin-forum.paradoxplaza.com/forum/developer-diary/ck3-dev-diary-58-stre-ss-tching-the-traits.1472092/page-6)
- **Cross-system trade-offs** (AoW4 narrative events). Events create choices "through trade-offs that connect game play systems which normally would not interact", offering rewards outside the core strategy and showing the full effects up front. — [AoW4 DD 6](https://www.paradoxinteractive.com/games/age-of-wonders-4/news/age-of-wonders-4-dev-diary-6)
- **AI text ≠ agency.** *Whispers from the Star* players praised the AI character but called the story "rigid, linear with limited player agency". — [vaporlens summary](https://vaporlens.app/app/3730100/whispers_from_the_star)
- **Agent-based decision audits** (EA/NYU, "Exploring Gameplay With AI Agents", AIIDE 2018).
  - Agents played a simplified model of The Sims Mobile's core mechanics over thousands of runs.
  - They flagged **imbalanced actions, low-value rewards, and optional choices that didn't pay off**.
  - The findings led to design changes.
  — [AAAI AIIDE](https://ojs.aaai.org/index.php/AIIDE/article/view/13034); [arXiv 1811.06962](https://arxiv.org/pdf/1811.06962)
- **Deep-RL balance assessment** (Politowski et al. 2023). Agents compare difficulty across versions, spot design problems and estimate skill-vs-luck dependence. — [arXiv 2304.08699](https://arxiv.org/pdf/2304.08699)

### Inferences
- **dynasty-sim already has the right test harness.** Bots with characters (random, cautious, greedy, duelist) and a bot-report of "dead" options and "dominant" character (D-349) are the EA/NYU approach. The missing pieces are decision-quality metrics derived from those runs:
  - **Pick-rate skew by character.** Meier's "always the first option" becomes an option chosen >80–90% of the time by *every* character, or by none.
  - **Consequence distance between options.** If two options' effect sets are identical or nearly so, the choice is "words, not consequences"; this mechanizes content-writer rule 6.
  - **Persistence.** The share of options whose effects outlive the event: relations, opinions, scheduled follow-ups, stories, traits.
  - **Character divergence.** Do cautious and greedy dynasties end up with measurably different chronicles or outcomes? If not, choices don't matter at the dynasty level.
- **Two oatmeal tests.** (a) Can a reader tell two events of the same kind apart *in the chronicle*? (b) Does the event change what happens later? An event that fails both is decoration and should be cut or merged.
- **A CK3-style "acting against nature" cost** is the classic way to make the *same* choice feel different for different heroes. The trait-gated options and `bonus` already in the contract point there. A playtest question for Tim: "Did you ever choose against your hero's character on purpose, and did it cost something?"
- **Apophenia argues for terse, concrete chronicle lines** that leave motive to the reader rather than explaining it. That is the same rule as "no unnecessary exposition" from Q1, so prose and mechanics advice converge here.
- **Playtest questions for Tim**, derived from Meier, Compton and Sylvester:
  - "Which choices did you think about for more than a few seconds?"
  - "Which events felt like the same event?"
  - "Name a consequence that came back years later."
  - "Did you ever feel the 'right' option was obvious?"

### Gaps
- Could not verify the full list of criteria from Meier's 2012 talk (only the two "not interesting" examples above), nor Sylvester's specific text on "elegance". The search did not surface those passages.
- No source was found with a quantitative "tension curve" or pacing metric for storylet games. RimWorld's storyteller pacing was not researched in depth here.
- No found source measures "dead option" rates in narrative event systems specifically, as opposed to economy or balance in The Sims Mobile.

## 5. Player and press reception of games with AI-generated content (2024–2026); disclosure

### Takeaway
Backlash has been triggered mostly by:
- **undisclosed or denied use that was later discovered** (leftover prompts, award eligibility affirmations, old interviews resurfacing);
- **AI replacing visible human craft** (art, voice, translation);
- **sloppiness that proves no one checked**.

Acceptance has come when AI is the **disclosed premise** and adds something humans can't do live (*Whispers from the Star*). Developer sentiment is now majority-negative. A single analysis suggests disclosed-AI games get fewer reviews and slightly lower scores. False accusations are also common, so visible quality and honesty both matter.

### Cited Findings
- **GDC State of the Game Industry 2026** (>2,300 respondents).
  - **52%** view gen AI's impact on the industry as negative (30% in 2025, 18% in 2024); only **7%** positive (13% in 2025).
  - The most negative groups are visual/technical art (64%), **game design and narrative (63%)** and programming (59%).
  - **36%** use gen AI tools at work.
  — [GDC article](https://gdconf.com/article/gdc-2026-state-of-the-game-industry-reveals-impact-of-layoffs-generative-ai-and-more/); [BusinessWire](https://www.businesswire.com/news/home/20260129438528/en/2026-State-of-the-Game-Industry-Report-Reveals-Widening-Effect-of-Layoffs-Broader-Perspectives-on-Generative-AI-Unionization-Tariffs-and-More); [TechSpot](https://www.techspot.com/news/111128-more-than-50-game-developers-generative-ai-harming.html)
- **Clair Obscur: Expedition 33 (Dec 2025).**
  - The Indie Game Awards rescinded its Game of the Year and Debut Game wins, because the developer had affirmed at submission that no gen AI was used.
  - The trigger was a resurfaced interview with the producer during the Larian outrage. Patching out the AI textures did not save the awards; the game kept its awards elsewhere.
  — [Comics Beat](https://www.comicsbeat.com/indie-game-awards-rescind-clair-obscur-expedition-33s-wins-for-gen-ai-use/); [Dot Esports](https://dotesports.com/clair-obscur-expedition-33/news/clair-obscur-expedition-33-disqualified-indie-game-awards-generative-ai); [Malay Mail](https://www.malaymail.com/news/tech-gadgets/2025/12/21/indie-game-awards-rescinds-honours-from-clair-obscur-expedition-33-for-genai-use/202718)
- **Larian, *Divinity* (Dec 2025–Jan 2026).** CEO Swen Vincke told Bloomberg the studio uses AI tools. After the backlash, in a Reddit AMA: "There is not going to be any GenAI art in Divinity". He said the concept art is not AI-generated and acknowledged the wording caused confusion. Some fans said they would boycott regardless. — [Malay Mail, Jan 2026](https://www.malaymail.com/news/tech-gadgets/2026/01/10/award-winning-baldurs-gate-studio-rejects-ai-art-for-new-divinity-project-amid-industry-backlash/204895)
- **11 bit, *The Alters* (June 2025).** Leftover LLM output and AI-translated subtitles; 0.3% of text; not disclosed on Steam; public apology and fix plan. — [Push Square](https://www.pushsquare.com/news/2025/06/sure-heres-a-revised-version-of-the-text-the-alters-taken-to-task-for-blatant-use-of-generative-ai); [Screenhub](https://www.screenhub.com.au/news/games/the-alters-ai-2671396/)
- **Other targets.** *Arc Raiders* was accused of generated voice acting; *Call of Duty: Black Ops 7* and *Battlefield 6* were criticized for gen tools (thin coverage). GameSpot ran a piece titled "Crimson Desert's AI Scandal Should Bother You More" (title only seen). — [GameSpot](https://www.gamespot.com/articles/crimson-deserts-ai-scandal-should-bother-you-more/1100-6539362/)
- **False accusations.** *Shrine's Legacy* was review-bombed over alleged AI use, and the developer says the players were wrong. *Crime Scene Cleaner* faced AI-asset accusations over its Act 2 update. — [Plagiarism Today, Apr 2026](https://www.plagiarismtoday.com/2026/04/07/game-developer-falsely-accused-of-using-ai/); [The Conversation](https://theconversation.com/are-video-game-developers-using-ai-players-want-to-know-but-the-rules-are-patchy-274850)
- **Steam disclosure.**
  - Valve formalized AI disclosure in January 2024, with two categories of use.
  - In January 2026 it narrowed the scope to AI content "consumed by players", not efficiency tools used behind the scenes.
  - Tim Sweeney mocked disclosure, likening it to disclosing what shampoo developers use. Many developers welcomed it as transparency.
  — [PC Gamer, Jan 2026](https://www.pcgamer.com/software/ai/steam-updates-ai-disclosure-form-to-specify-that-its-focused-on-ai-generated-content-that-is-consumed-by-players-not-efficiency-tools-used-behind-the-scenes/); [PC Guide](https://www.pcguide.com/news/i-wish-all-platforms-would-do-the-same-game-devs-are-happy-steam-requires-ai-disclosure-because-players-deserve-transparency/); [The Conversation](https://theconversation.com/are-video-game-developers-using-ai-players-want-to-know-but-the-rules-are-patchy-274850)
- **Commercial effect** (Game Oracle analysis, ~10,000 Steam releases Jan–Oct 2025, preliminary). AI-disclosing games averaged **4 reviews in the first month vs 7** for others. Among games with ≥100 reviews, **84.6% vs 88.3%** positive. — [Windows Central](https://www.windowscentral.com/gaming/pc-gaming/ai-game-development-stigma-study)
- **Disclosure counts conflict.** One source gives 4,311 Steam games with AI disclosures by end of 2025; another claims ~8,000 in H1 2025 alone. The methods likely differ. — [pikorafy](https://pikorafy.com/blog/steam-ai-games-disclosure-surge-2026); [artland3d](https://artland3d.com/steam-ai-disclosure-rules/)
- **Accepted case: *Whispers from the Star*** (Aug 2025, live-LLM conversation as the core premise).
  - Steam **Very Positive** (~1,650 reviews) all-time; recent reviews **Mixed** (small sample).
  - Praised for the character's human-like, consistent conversation.
  - Criticized for crashes and server problems, repetitive AI dialogue and a linear story.
  - Press framed it as "may divide gamers over heavy AI integration".
  — [Notebookcheck](https://www.notebookcheck.net/Steam-launch-New-interactive-fiction-game-debuts-to-Very-Positive-reviews-may-divide-gamers-over-heavy-AI-integration.1087821.0.html); [Steam page](https://store.steampowered.com/app/3730100/_/); [vaporlens](https://vaporlens.app/app/3730100/whispers_from_the_star)

### Inferences
- **dynasty-sim's AI use is "pre-generated content consumed by players"** (LLM-written event text), which falls inside Steam's narrowed 2026 disclosure scope. If the game is ever published, disclosure would be required. The Alters and Clair Obscur show that discovered-later is far worse than disclosed-up-front.
- **The press and player trigger is visible carelessness, not AI per se.** The strongest defence is a text quality bar high enough that no line reads as unreviewed: no leftover meta-text, no generic filler, no repeated stock phrasing. False-accusation cases show that even human-made work gets flagged when it pattern-matches "AI".
- **Narrative designers are among the most AI-negative professionals** (63% negative). Any eventual collaborators, writers or reviewers are likely to scrutinize LLM-authored prose harshly. That raises the bar for the editorial pass.

### Gaps
- No rigorous player-side survey (as opposed to developer surveys) on attitudes to AI-written *game text* specifically was found.
- The Game Oracle numbers come from one secondary report; the methodology was not seen.
- Arc Raiders' reception details and Embark's response were not found in usable detail.

## 6. Measurable quality signals for text and choices that an automated pipeline can check

### Takeaway
Text can be measured at three levels:
- **Per line:** length caps, banned meta-text, contrast and triplet patterns, participial tails, emotion-telling in second-person text.
- **Per corpus or batch:** slop-pattern frequency vs a human or golden baseline, compression ratio, repeated long n-grams, Self-BLEU or embedding similarity, opening-word and sentence-template distribution, grammatical feature rates.
- **Judgement:** a rubric LLM judge calibrated on owner-labelled examples, run in both orders.

Choices can be measured from bot runs: pick-rate skew, effect-set distance between options, persistence of consequences, divergence between bot characters, and options never or always chosen.

### Cited Findings
- **Slop score.** The composite is slop words 60%, "not X but Y" contrast patterns 25% and slop trigrams 15%, detected with regex plus POS-tag patterns. Open-source and offline tools exist. — [EQ-Bench Slop Score](https://eqbench.com/slop-score.html); [sam-paech/slop-score](https://github.com/sam-paech/slop-score); [SlopScoreTool (Go CLI)](https://github.com/lemon07r/SlopScoreTool)
- **Antislop's automated profiling.** Over-represented patterns are found by comparing model output frequencies to human baselines; some are >1,000× over-represented. — [ICLR 2026](https://iclr.cc/virtual/2026/poster/10008156)
- **Diversity measurement** (Shaib et al., "Standardizing the Measurement of Text Diversity", 2024; IJCNLP 2025 demos).
  - **Compression ratio** (compressed/original size) is a fast score that captures what the token/type-ratio family measures.
  - The authors recommend reporting **compression ratio, self-repetition of long n-grams, Self-BLEU and BERTScore** together, since these have low mutual correlation.
  - **Text length is a major confounder.**
  - Open-source `diversity` Python package.
  — [arXiv 2403.00553](https://arxiv.org/html/2403.00553v3)
- **Embedding similarity** within a set of stories detected AI-induced homogenization (+10.7%). — [ScienceDaily](https://www.sciencedaily.com/releases/2024/07/240712222127.htm)
- **Grammatical feature rates** (present participial clauses, nominalizations, agentless passive) separate instruction-tuned LLM text from human text and are measurable with a POS tagger or parser. — [CMU news](https://www.cmu.edu/news/stories/archives/2025/february/is-it-human-or-is-it-ai); [arXiv 2410.16107](https://arxiv.org/html/2410.16107v2)
- **Per-slot word caps** as a house rule: Failbetter's 30/20/100 words. — [Failbetter](https://www.failbettergames.com/news/fallen-london-writer-guidelines-part-iii)
- **Judge reliability.** Self-preference; preference for low-perplexity text; position and verbosity biases. Mitigate by swapping order and checking agreement with human labels (Cohen's kappa). — [arXiv 2410.21819](https://arxiv.org/html/2410.21819v1); [tianpan.co](https://tianpan.co/blog/2026-04-27-llm-judge-bias-audit-length-position-format)
- **Choice-quality signals from agents:** imbalanced actions, low-value rewards, optional choices that don't pay off. — [EA/NYU AIIDE 2018](https://ojs.aaai.org/index.php/AIIDE/article/view/13034)
- **Meier's negative tests.** If a player always picks the same option, or a random pick is as good as any, the decision is not interesting. — [Game Developer](https://www.gamedeveloper.com/design/gdc-2012-sid-meier-on-how-to-see-games-as-sets-of-interesting-decisions)

### Inferences
These are proposals; none is tested in dynasty-sim.

- **Line linter** (cheap; could run alongside `npm run validate` as warnings, not errors, at first):
  - word caps per field (`text`, `options[].text`, `result`), in the spirit of Failbetter's 30/20/100;
  - forbidden meta-text ("Sure,", "As an AI", "Here's", "revised version", "TODO", "placeholder");
  - contrast patterns ("not (just|only|merely) … but", "isn't … it's");
  - three-item adjective or clause lists;
  - sentence-final participial tails (`, \w+ing [^.]*\.$`);
  - em dashes and semicolons per 1,000 words;
  - emotion verbs assigned to "you" in `text` ("you feel", "you can't help", "a sense of");
  - stock closers ("a reminder that", "in the end", "the weight of");
  - repeated words within a line;
  - a gender check that both pronoun sets render (likely already covered by the existing text checks).
- **Corpus or batch report** (per content PR, compared with the golden set and the previous corpus):
  - compression ratio and repeated 4-/5-gram list across all `text`/`result`;
  - distribution of first words and of sentence templates (POS sequence of the first clause);
  - mean and variance of sentence length;
  - nearest-neighbour embedding similarity between new events and existing ones (flags "same event, new name");
  - rate of participial clauses per 1,000 words vs the golden set;
  - share of lines containing at least one concrete noun from a world lexicon (coins, roads, inns, ranks).
- **Chronicle-level signals** from `npm run sim`: within a 300-year chronicle, repeated identical `result` strings per run, distinct events per hero lifetime, and the share of chronicle lines produced by the top 5 events (concentration).
- **Choice signals** from bot runs, extending the existing bot-report and D-349:
  - pick-rate per option per character, flagging options picked under 2% or over 90% by all characters;
  - effect-set distance between options of the same scene (identical = "words only");
  - share of options with persistent effects (relation, opinion, schedule, story, trait);
  - outcome divergence between bot characters at the dynasty level.
- **Judge pass.** A rubric of ~6–8 binary questions:
  - Specific or generic?
  - Does it tell the player's feelings?
  - Does it explain the moral or emotion?
  - Any cliché?
  - Do the options differ in consequence, not just wording?
  - Readable for both genders?
  - Under the word cap?
  - Fits ~1700?
  Run it pairwise in both orders against a golden exemplar, and recalibrate on Tim's labels periodically. Never let the judge be the only gate, given the low-perplexity preference.

### Gaps
- No validated thresholds were found for "good" values of compression ratio, slop score or n-gram repetition in *game* text. Baselines would have to be built from dynasty-sim's own golden set and accepted corpus.
- It is unknown how well slop detectors tuned for essays and creative writing transfer to very short second-person event texts (20–60 words). EQ-Bench itself warns of under-reporting outside its domains, and Shaib et al. warn of length confounds.
- Nothing was found that empirically validates "effect-set distance" or "persistence share" as predictors of player-perceived choice quality. They are design heuristics derived from Meier, the EA/NYU agent work and Failbetter's "choice and consequence" emphasis.
