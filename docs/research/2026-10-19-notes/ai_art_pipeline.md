# AI / procedural pipeline for consistent retro two-colour character portraits (budget ≤ $30/month)

Context for the report writer: dynasty-sim is a browser TypeScript game. D-300 in `docs/DECISIONS.md` fixes the style as a "pixel face in two colours, slightly more detailed than Doom, no dithering, no ASCII". `src/core/looks/genes.ts` already produces 0..255 genes per detail. Each detail has a variant gene plus small dx/dy shifts. The details are head, eyes, brows, nose, mouth, ears, hair (bald, grey), beard, wrinkles, two scars, bandage, headwear, jewel and eye patch. The moods come from `narrator.moods`: neutral, joy, triumph, threat, pain, loss, shame, anger. The owner (Tim) already decided that AI generates the parts once and code assembles them deterministically and offline.

Method caveat: the sandbox could not open most vendor pages directly. pixellab.ai, retrodiffusion.ai, partner.steamgames.com, the paradoxplaza forums, artstation, itch.io and community.aseprite.org failed with DNS errors. Figures for those pages come from search-engine extracts of the official pages, from GitHub READMEs (which were reachable) and from secondary aggregators. Each finding says which. Confirm every price on the official page before buying.

## Q1. Tools: pricing, limits, licensing (2026), and which ones Claude Code can drive (API / MCP)

### Takeaway
Two pixel-art tools fit the budget and have official MCP servers that work from Claude Code:
- **Retro Diffusion**: pay-per-image from about $0.01 to $0.18, no subscription, a palette-constraint input, 1-bit and portrait style categories, seed reuse and up to 9 reference images.
- **PixelLab**: $12/month for about 2,000 generations; inpainting needs the $24 tier; the terms allow commercial use but ban training other models on its outputs.

General-purpose models (OpenAI gpt-image, Google Nano Banana) are cheap per image. Their output only looks like pixel art and must be snapped to a pixel grid afterwards. Scenario, Layer and Leonardo put custom style training at or above the budget ceiling. Midjourney has no confirmed API route.

### Cited Findings
**PixelLab (pixel-art specialist; subscription)**
- Tier 1 "Pixel Apprentice" costs $12/month. Most sources give 2,000 generations/month: [Cinevva 2026 guide](https://app.cinevva.com/guides/ai-pixel-art-generators), [G2 listing](https://ai.g2.com/marketplace/tools/pixellab). One comparison says ~1,000/month and that the pool is "not strictly enforced unless abused": [Gamelabs Studio](https://gamelabstudio.co/blog/gamelabs-studio-vs-pixellab).
- Tier 2 "Pixel Artisan" is $24/month with a priority queue. Tier 3 "Pixel Architect" is $50/month with 10,000 generations: [G2](https://ai.g2.com/marketplace/tools/pixellab), [Cinevva](https://app.cinevva.com/guides/ai-pixel-art-generators). An older page lists Artisan at $30 for 3,000 and Architect at $50 for 6,000, which is probably stale: [cutout.pro](https://www.cutout.pro/learn/pixellab/). Annual billing is reported as about 25% cheaper (Cinevva).
- Maximum image size: Free 200×200, Tier 1 320×320: [Gamelabs](https://gamelabstudio.co/blog/gamelabs-studio-vs-pixellab), [flowtools](https://www.flowtools.co/pixellab).
- Inpainting:
  - "Inpaint Medium-Large (Pixpatch v2)" has a 180×180 maximum, is experimental and "requires at least Tier 2": [PixelLab docs](https://www.pixellab.ai/docs/tools/inpaint-pixpatch-v2).
  - The original Pixpatch works from 32×32 to 160×160: [PixelLab docs](https://www.pixellab.ai/docs/tools/inpaint-pixpatch).
  - The init-image "image size" parameter is deprecated: [PixelLab getting started](https://www.pixellab.ai/docs/getting-started).
- Terms of Service (last updated 2025-11-23), from search extract of the official page: [PixelLab ToS](https://www.pixellab.ai/termsofservice).
  - Users own their outputs and can use them commercially or non-commercially.
  - Outputs may not be used to train other models without written permission (§1.2, §3.3).
  - Programmatic use is allowed only through the official API.
  - The user is liable for infringement.
- The privacy policy says PixelLab may store input and generated images for debugging and quality improvement: [PixelLab privacy](https://www.pixellab.ai/privacypolicy).
- Official MCP server: [GitHub pixellab-code/pixellab-mcp](https://github.com/pixellab-code/pixellab-mcp).
  - Tools: `create_character` (4 or 8 directions), `animate_character`, `create_tileset`, `create_isometric_tile`.
  - Config: HTTP transport at `https://api.pixellab.ai/mcp` with a Bearer token.
  - It lists Claude Code as a client. It does **not** expose inpainting, style reference or portrait tools.
- A community npm wrapper exposes `generate_image_pixflux` (default 64×64; recommended 32/64/128/256). It is third-party, not official: [npm pixellab-mcp](https://npmjs.com/package/pixellab-mcp).

**Retro Diffusion (pixel-art specialist; prepaid credits, no subscription)**
- Official MCP README: [GitHub Retro-Diffusion/retro-diffusion-mcp](https://github.com/Retro-Diffusion/retro-diffusion-mcp).
  - Prepaid, pay-per-use, no subscription. Images start around $0.01; RD Fast costs about $0.015; RD Pro reaches $0.18 per image. Animations cost $0.07–0.25 and tilesets $0.10. `estimate_inference_cost` is free.
  - Sizes run "16×16 to 384×384 depending on style".
  - Up to 9 reference images. Reusing a seed keeps the composition while the prompt changes.
  - "90+ pixel art styles", including a portrait category and a 1-bit category.
  - Style tools: `create_user_style`, `update_user_style`, `delete_user_style`.
  - Edit tools include background removal and palette/colour reduction. `fix_pixel_art` is free (PNG/JPEG, 16×16 to 4 MP).
  - Claude Code setup: `claude mcp add --transport http retro-diffusion https://mcp.retrodiffusion.ai/mcp --header "Authorization: Bearer rdpk-…"`, or `/plugin install pixel-art@retro-diffusion`, which bundles a pixel-art workflow skill.
- The official site (search extract) lists RD Pro at $0.18, RD Plus at $0.06 and RD Fast at $0.03 per image: [retrodiffusion.ai](https://retrodiffusion.ai/).
- An optional `input_palette` (base64 palette image) restricts output colours to that palette. `return_pre_palette` returns the image before the palette was applied: [Glama connector listing](https://glama.ai/mcp/connectors/ai.retrodiffusion/pixel-art).
- Rate limit is 10 requests/minute per key. New accounts get free starter credits, and credits never expire: [mcpservers.org listing](https://mcpservers.org/servers/retro-diffusion/retro-diffusion-mcp).
- Local Aseprite extension: $65 full, $20 "Lite", one-time, "no subscriptions and no credits required". It runs on Windows, macOS and Linux and needs a local GPU: [itch.io astropulse](https://astropulse.itch.io/retrodiffusion).
- Output ownership: the only statement found is a reply in the itch.io comments, "Yes, you own the images generated by it", with an unclear author. Formal terms were not found: [itch.io comments](https://astropulse.itch.io/retrodiffusion/comments).

**Scenario (game-asset platform with custom model training)**
- Plans: Starter $15/month (1,500 credits, **no** custom training); Pro $45/month (5,000 credits, custom training including Flux); Max $75/month; a free tier with 50 daily credits: [Scenario pricing](https://www.scenario.com/pricing), [Scenario help](https://help.scenario.com/en/articles/pricing-plans/).
- An older help article lists other plans (for example a $150 Team plan), so pricing has changed recently: [Scenario help](https://help.scenario.com/understanding-scenarios-pricing-structure).
- Official MCP server at `https://mcp.scenario.com/mcp` that works with Claude Code. Its help pages give 17 tools in April 2026 and 60+ tools in July 2026: [Scenario help MCP](https://help.scenario.com/en/articles/getting-started-with-the-scenario-mcp-server), [Scenario docs MCP](https://docs.scenario.com/get-started/mcp/mcp).
- Scenario also documents a "Pixel Snapper" tool that fixes AI pixel grids: [Scenario help](https://help.scenario.com/en/articles/pixel-snapper-the-essentials).

**Layer.ai**
- Consumption-based pricing "from $10/month for 300 CUs", or one-time credit purchases; the two descriptions conflict: [Layer help](https://help.layer.ai/en/articles/8001329-what-s-the-pricing).
- Layer trains LoRAs on your own reference set and offers 40+ pre-trained styles: [Layer custom training](https://layer.ai/features/custom-model-training.md).
- API access is on the enterprise tier, according to a comparison site: [toolradar](https://toolradar.com/tools/layer-ai/pricing).

**Leonardo.ai**
- Tiers as of September 2026: Free (150 tokens/day, public creations), Essential $12 (8,500 tokens), Premium $30 (25,000 tokens plus relaxed generation), Ultimate $60. The API is billed separately: [eesel.ai](https://eesel.ai/blog/leonardo-ai-pricing).
- Custom model training is reported on Premium (20 models) and Ultimate (50 models). Counts differ between sources: [aiproductivity.ai](https://aiproductivity.ai/pricing/leonardo/).
- Trustpilot rating 1.9/5; the top complaint is billing after cancellation (eesel.ai).

**Midjourney**
- Basic $10, Standard $30, Pro $60, Mega $120 per month. Stealth (private) mode is only on Pro and Mega, so Basic and Standard images are public. No free tier: [krater.ai](https://krater.ai/blog/midjourney-pricing).
- Commercial rights are on all tiers. A $1M+ revenue threshold requires Pro (unverified against Midjourney's terms): [krater.ai](https://krater.ai/blog/midjourney-pricing).

**Recraft**
- Basic about $12/month, Pro $20/month. Paid plans include full commercial rights; free-tier images are public and owned by Recraft: [Recraft blog](https://www.recraft.ai/blog/best-ai-image-generation-api), [pricepertoken](https://pricepertoken.com/recraft-pricing).
- API about $0.035 per raster image and $0.08 per vector (aggregator figures). Recraft's vector output could matter for coats of arms: [pricepertoken](https://pricepertoken.com/recraft-pricing).
- An "Official" Recraft MCP server under the recraft-ai org is listed on Glama: [Glama](https://glama.ai/mcp/servers/recraft-ai/mcp-recraft-server/tree/c7a1ed664fc37dcde351f3b8f2a39585bf4544ee/src).

**OpenAI image models (API)**
- gpt-image-1 per 1024×1024 image: $0.011 low, $0.042 medium, $0.167 high: [OpenAI model page](https://developers.openai.com/api/docs/models/gpt-image-1).
- gpt-image-1.5 is about $0.009/$0.034/$0.133; gpt-image-1-mini is about $0.002/$0.008/$0.033: [OpenAI community thread](https://community.openai.com/t/gpt-image-1-5-rolling-out-in-the-api-and-chatgpt/1369443?page=3).
- One aggregator says gpt-image-1 retires on 2026-10-23 (unverified): [pricepertoken](https://pricepertoken.com/gpt-image-pricing).

**Google Gemini image models ("Nano Banana")**
- Gemini 2.5 Flash Image: $0.039 per image, $0.0195 in batch.
- Nano Banana 2: $0.045 (0.5K) to $0.151 (4K).
- Nano Banana Pro: $0.134 at 1K/2K.
- Source for all three: a third-party read of Google's pricing dated 2026-09-11: [BenchLM](https://benchlm.ai/md/media-pricing/nano-banana.md).
- Up to 20 reference images for character consistency: [Runware docs](https://runware.ai/docs/models/google-nano-banana-2/guides/character-consistency).
- Style matching from references is approximate: [GetIllustrations](https://getillustrations.com/blog/we-tried-googles-nano-banana-with-our-illustrations-heres-what-happened/).
- Grid problem: outputs are about 1024×1024 and "pixels" are not on a consistent grid (some 6 px wide, some 7 px). This holds for every Nano Banana model, so grid snapping is required: [SpriteCook Mar 2026](https://www.spritecook.ai/blog/nanobanana-pixel-art-for-games), [SpriteCook Jun 2026](https://www.spritecook.ai/blog/nano-banana-2-lite-fast-pixel-art).

**Local Stable Diffusion / Flux with LoRA (ComfyUI)**
- Flux LoRA default training settings suit a 10–20 image dataset: [stable-diffusion-art.com](https://stable-diffusion-art.com/?p=14891).
- Cloud training cost: a community Replicate LoRA trainer costs about $3.12 per run (up to 38 min on an A100 80 GB): [Replicate lucataco/ai-toolkit](https://replicate.com/lucataco/ai-toolkit). A reseller quotes about $3.20 (Replicate) and about $2.00 (fal.ai) per Flux LoRA training: [MuAPI](https://muapi.ai/vi/playground/flux-lora-trainer).
- Licensing:
  - FLUX.1 [dev] weights are non-commercial. BFL's help centre says [dev] outputs can be used commercially under its self-serve commercial licence: [BFL help](https://help.bfl.ai/articles/9272590838-self-serve-dev-license-overview-pricing).
  - Replicate says outputs can be used commercially: [Replicate flux-dev-lora](https://replicate.com/black-forest-labs/flux-dev-lora).
  - SDXL base 1.0 is under CreativeML Open RAIL++-M, which allows commercial use with use-based restrictions: [localaimaster](https://localaimaster.com/blog/local-image-model-licenses-commercial-use).
  - Sources conflict on Flux [dev] outputs.
- ComfyUI post-processing nodes:
  - PixelArt Detector downscales, reduces the palette and dithers in one pass: [ComfyUI-PixelArt-Detector](https://www.comfyonline.app/comfyui-nodes/ComfyUI-PixelArt-Detector).
  - PixelArt Processing Nodes quantise to a limited palette and scale with nearest-neighbour: [PixelArt-Processing-Nodes](https://www.comfyonline.app/comfyui-nodes/PixelArt-Processing-Nodes).
  - ComfyUI-Pixelate supports 2–256 colours with Floyd–Steinberg dithering: [ComfyUI-Pixelate](https://api.comfyonline.app/comfyui-nodes/ComfyUI-Pixelate).

**Aseprite and its MCP integrations**
- About $19.99, one-time, sold on the official site, Steam and itch.io: [gappsy](https://gappsy.com/tools/aseprite/).
- The source code is public and can be compiled for personal use, but the EULA forbids redistribution, so it is not OSS. LibreSprite is a free fork: [bioerrorlog](https://en.bioerrorlog.work/entry/aseprite-open-vs-paid-version).
- `pixel-mcp` (Go, MIT, published 2025-10-18) works through Aseprite Lua scripts. It draws pixels, lines, shapes and flood fills with palette awareness and needs Aseprite 1.3.0+: [pkg.go.dev pixel-mcp](https://pkg.go.dev/github.com/willibrandon/pixel-mcp).
- The companion `pixel-plugin` for Claude Code installs via `/plugin`: [pixel-plugin README](https://cdn.jsdelivr.net/gh/willibrandon/pixel-plugin@main/README.md).
- Other Aseprite MCP servers: [rkdfx/aseprite-mcp](https://github.com/rkdfx/aseprite-mcp) (FastMCP; pixels, shapes, fill, PNG/GIF export) and [AsepriteMCP (sakamoro)](https://mcpservers.org/ru/servers/ext-sakamoro/AsepriteMCP) (Python 3.13+).

### Inferences
- Only two tools give Claude Code a first-party MCP for pixel art under $30/month:
  - **Retro Diffusion** is pay-as-you-go. A one-time $10–20 top-up likely covers several hundred part generations at $0.01–0.06.
  - **PixelLab** costs $12/month. Pixpatch inpainting needs Tier 2 at $24/month.
  - Scenario has an MCP too, but custom training starts at $45/month.
- Retro Diffusion's `input_palette` (constraining output to a 2-colour palette) and its 1-bit style category map most directly onto D-300's "two colours, no dithering".
- Do not plan "generate with PixelLab, then train a local LoRA on those outputs". PixelLab's ToS §1.2/§3.3 forbids training models on its outputs without written permission.
- OpenAI and Gemini are fine for concept exploration and reference boards (cheap, strong at whole faces). Every output then needs a grid-snap and threshold step, so the specialist tools are lower-friction for final parts.
- Midjourney's Basic and Standard images are public, and no API route was confirmed. It is a poor fit for an automated, Claude-driven pipeline.
- Recraft's vector output plus an official MCP make it a candidate for coats of arms and icons. A code-drawn 2-colour heraldry generator is probably simpler and fully deterministic, and D-237 already says the house's code draws the arms.

### Gaps
- Official pricing pages for PixelLab and Retro Diffusion could not be fetched (sandbox DNS). PixelLab generation counts conflict (2,000 vs ~1,000 for Tier 1). Retro Diffusion per-image prices differ between the site extract ($0.03 / $0.06 / $0.18) and the README ("from ~$0.01").
- Retro Diffusion's formal licence and terms text was not found; ownership is supported only by an itch.io comment.
- The cost of `create_user_style` (Retro Diffusion custom style) was not found.
- No source confirmed whether Midjourney has an official public API in 2026.
- Civitai on-site LoRA training cost (Buzz) was not found.

## Q2. Techniques for consistency (style training, palette quantisation, fixed template, parts vs whole faces, inpainting, seeds, post-processing to e.g. 96×120 in 2 colours)

### Takeaway
Consistency comes mostly from constraints and code, not from the model:
- a fixed template (canvas, head silhouette, eye line, part slots);
- the same references, seed and style for every call;
- a hard palette constraint;
- a deterministic post-processing script that snaps to the pixel grid, thresholds to 2 colours and cuts parts into fixed slots.

General models need grid repair. Several open-source tools do it, and Retro Diffusion offers `fix_pixel_art` and palette input itself. AI keeps "the same person" poorly across many images, which argues for generating parts on a fixed base rather than whole new faces per person.

### Cited Findings
- Grid problem: general models render "pixels" of varying size (6 px vs 7 px) at about 1024 px, so outputs must be snapped to a grid before engine use. Prompts asking for "32×32" are sometimes ignored: [SpriteCook](https://www.spritecook.ai/blog/nanobanana-pixel-art-for-games).
- Grid-repair tools:
  - **unfake.js** fixes colour bleed, curved lines and imperfect grids; its demo cuts a 38,680-colour image to a 16-colour palette: [Gigazine on Unfaker](https://gigazine.net/gsc_news/en/20251202-unfaker-fix-ai-pixel-art).
  - **unfake (Python, Rust core)** adds auto scale detection and Wu quantisation: [PyPI unfake](https://pypi.org/project/unfake/).
  - **proper-pixel-art** runs edge detection, a Hough transform for grid lines, colour quantisation and a dominant colour per cell, with a CLI and Python API: [sourcepulse proper-pixel-art](https://www.sourcepulse.org/projects/13911015).
  - **Pixel Snapper** is MIT-licensed, with a CLI and WASM build: [brightcoding](https://converter.brightcoding.dev/blog/stop-wasting-hours-fixing-ai-pixel-art-use-pixel-snapper-instead).
  - A ComfyUI "Unfake Pixel Art" node also exists: [ComfyAI docs](https://comfyai.run/documentation/UnfakePixelArtNode).
- Retro Diffusion has built-in consistency controls: seed reuse keeps the composition while the prompt changes; up to 9 reference images; custom user styles from a reference image; free `fix_pixel_art`; palette/colour-reduction edit tools: [RD MCP README](https://github.com/Retro-Diffusion/retro-diffusion-mcp). Its `input_palette` constrains output colours to a supplied palette: [Glama](https://glama.ai/mcp/connectors/ai.retrodiffusion/pixel-art).
- Palette quantisation in ComfyUI: palette sizes from 2 to 256 colours with optional Floyd–Steinberg dithering: [ComfyUI-Pixelate](https://api.comfyonline.app/comfyui-nodes/ComfyUI-Pixelate).
- Style training on small sets: Flux LoRA defaults suit 10–20 images. Use varied content so the model learns the style rather than one scene, and compare checkpoints because quality plateaus early: [stable-diffusion-art.com](https://stable-diffusion-art.com/?p=14891).
- Layer trains LoRAs from a "Reference Set" of your own art: [Layer](https://layer.ai/features/custom-model-training.md).
- Identity consistency is AI's weak spot. A developer needing "the SAME PERSON, with the SAME FACE" across many images found that "AI generation doesn't do really well": [itch.io devlog](https://itch.io/devlog/665843/csp-ai-generated-players.amp).
- Nano Banana subjects distort slightly after multiple editing rounds, and 20 matching icons in one exact style were not achievable: [GetIllustrations](https://getillustrations.com/blog/we-tried-googles-nano-banana-with-our-illustrations-heres-what-happened/). One pixel-art test did get a consistent 3×3 inventory set from a single grid prompt: [SpriteCook](https://www.spritecook.ai/blog/nanobanana-pixel-art-for-games).
- Inpainting needs masks that mark regions to keep and to change. Research automates masks to swap clothing on a fixed person: [arXiv 2402.03501](https://arxiv.org/pdf/2402.03501v1). Inpainting large masked areas can give unexpected content: [leyaa.ai](https://leyaa.ai/codefly/learn/genai/part-1/genai-inpainting-and-outpainting/deep).
- PixelLab inpainting regions are 32×32 to 160×160 (Pixpatch) and up to 180×180 (Pixpatch v2, Tier 2+). A 96×120 face therefore fits inside one inpaint region: [Pixpatch](https://www.pixellab.ai/docs/tools/inpaint-pixpatch), [Pixpatch v2](https://www.pixellab.ai/docs/tools/inpaint-pixpatch-v2).
- Recolour-by-role precedent: Caves of Qud stores tiles as 3-colour masks. Black takes the object's foreground colour, white its detail colour, and transparent pixels show the background, so colour is assigned at runtime: [Qud wiki Modding:Tiles](https://wiki.cavesofqud.com/wiki/Modding:Tiles).
- Obra Dinn's guiding rule for 1-bit art was to "prioritise legibility above all else". It led to outlines on geometry and careful dithering: [PlayStation Blog](https://blog.playstation.com/archive/2019/10/17/lucas-pope-on-return-of-the-obra-dinns-art-style).

### Inferences
- Recommended order: concept at high resolution (any model) → generate at or near target size in a pixel tool with the fixed template as init/reference and a fixed seed → grid-snap (`fix_pixel_art`, unfake or proper-pixel-art) → threshold to exactly 2 colours (no dithering, per D-300) → remove orphan pixels → cut into slot rectangles → curate by hand.
- All steps after generation should be a deterministic Node/TS script in `tools/`, so the same input always gives the same part files.
- Parts vs whole faces:
  - Models draw better in context. The likely-best method is to inpaint one slot (eyes, mouth, scar region) on a **fixed base face**. Another option is to generate many whole faces on the same head template and harvest parts from the best ones into slots.
  - Generating isolated parts on blank canvases risks mismatched line weight and scale.
  - This is an inference from the inpainting and consistency findings. No devlog was found that tested it.
- 2-colour layering needs two masks per part. One is "ink" (dark pixels). The other is "knockout/fill" (light pixels that hide lower layers, e.g. hair covering the ears). Without the knockout mask, lines of lower layers show through. This is standard paper-doll practice by inference; Qud's role masks are the closest cited precedent.
- If the two colours vary per person or era (e.g. sepia vs ink-blue), store parts as role masks (Qud-style) and pick colours at runtime. Albinism and skin tone cannot be shown by hue in 2 colours. They need line/pattern cues or a per-person "paper" colour. This is a design question for Tim.
- Keep the gene → part mapping in code and data (already in `faceSpec`). AI only fills a fixed variant budget per slot, for example 12 eyes × 3 moods, 12 noses, 12 mouths × 8 moods, 10 scars, 6 pox overlays, 8 headwear per era/status. Thanks to the dx/dy genes, a small library still gives many combinations.

### Gaps
- No published, tested recipe for "AI-generated modular face parts in 2 colours at ~96×120" was found. The parts-vs-whole-face comparison is untested inference.
- No measured comparison was found of RD custom styles vs PixelLab style reference vs a self-trained LoRA for a 2-colour target.
- Whether Retro Diffusion's 1-bit styles avoid dithering by default is unknown; `list_available_styles` would show it.

## Q3. How successful games built modular portrait systems, and what worked for small teams

### Takeaway
The most relevant precedents are human-drawn layered 2D part libraries, picked by per-character genes/properties and recoloured or overlaid at runtime:
- **CK2**: base head by age plus feature layers indexed by DNA and property strings.
- **Dwarf Fortress Premium**: pixel layers for nose, eyes, scars and clothing, driven by the character description.
- **Caves of Qud**: role-masked tiles recoloured from data.

CK3's 3D DNA morphing is out of reach for this project. Small teams succeeded with strict constraints (Obra Dinn's 1-bit "legibility above all", Qud's 18-colour, 3-role tiles) and with art direction by one person. Dwarf Fortress's publisher states it uses no generative AI at any step.

### Cited Findings
**Crusader Kings II**
- Portraits come from hard-coded data plus two moddable files, `portraits.gfx` and `portrait_properties.txt`. There are 8 portrait categories (12 with children); each category has its own building blocks: [Paradox forum guide](https://forum.paradoxplaza.com/forum/threads/a-complete-guide-to-custom-portraits.590291/post-13498654).
- The base head carries age-appropriate features such as wrinkles. Upper layers overwrite its features (same guide).
- Children use one fixed image per type, which "explains why all kids look alike in CK2" (same guide).
- Layer tags pick the frame: `p4` uses character property 4 (e.g. beard), `:h` colours the layer with hair colour, `:d` indexes a DNA slot (e.g. nose): [CK2 Dev Diary 7 thread](https://admin-forum.paradoxplaza.com/forum/developer-diary/crusader-kings-ii-dev-diary-7-character-portraits-and-modding.530197/latest), [community wiki](https://cal1.lr.ggtyler.dev/r/CK2GameOfthrones/wiki/portraits).

**Crusader Kings III**
- Replaced CK2's 2D paperdoll with animated 3D. Appearance is set by DNA, with one gene per controllable facial feature.
- Genetic traits change the portrait: Beautiful raises symmetry; Ugly and Albino lower symmetry or change skin tone.
- Sources: [CK3 Dev Diary 07](https://forum.paradoxplaza.com/forum/threads/ck3-dev-diary-07-characters-portraits.1295264/), [Prima Games summary](https://primagames.com/?p=313090).
- DNA can be copied and pasted between characters, even across sex: [CK3 Dev Diary 43](https://admin-forum.paradoxplaza.com/forum/developer-diary/ck3-dev-diary-43-a-ruler-of-your-own.1441657/latest).

**Dwarf Fortress (Steam/Premium, Kitfox + Bay 12)**
- Procedural humanoid portraits built from stacked layers for nose, eyes and scars, plus clothing such as armour and masks. Made by lead pixel artist Carolyn Jong (Apr 2023 – Oct 2025, per her portfolio): [ArtStation](https://ckjong.artstation.com/projects/wrWdlX).
- Procedurally assembled portraits came with the April 2024 update. Pixel art is credited to Carolyn Jong and Neoriceisgood, working with Mayday and Ironhand: [itch.io page](https://kitfoxgames.itch.io/dwarf-fortress).
- Characters get faces "based on their character descriptions": [GameStar](https://www.gamestar.de/artikel/dwarf-fortress-wird-2024-zum-rollenspiel,3404877.html).
- Patch 53.09 (2026-01-07) updated portraits that felt "inconsistent with the tone". Kitfox stated "we do not use generative AI for Dwarf Fortress in any step of development": [Kitfox devlog 53.09](https://kitfoxgames.itch.io/dwarf-fortress/devlog/1309415/portrait-update-other-fixes-dwarf-fortress-patch-5309).
- Over 350 creature portraits by one artist (53.07, Dec 2025): [devlog 53.07](https://kitfoxgames.itch.io/dwarf-fortress/devlog/1148917/dwarf-fortress-patch-5307-whats-next-for-sieges-new-animal-portraits). Patch 53.10 added 28 aquatic portraits: [devlog 53.10](https://kitfoxgames.itch.io/dwarf-fortress/devlog/1314268/aquatic-portraits-naked-dwarf-fix-and-more-dwarf-fortress-patch-5310).

**Caves of Qud**
- 16×24 tiles from a fixed 18-colour palette. Tiles are 3-colour masks recoloured at runtime from `TileColor`/`DetailColor` in the object's blueprint: [Qud wiki Modding:Tiles](https://wiki.cavesofqud.com/wiki/Modding:Tiles), [Qud wiki Visual Style](https://wiki.cavesofqud.com/wiki/Visual_Style).

**RimWorld**
- Apparel draws in layers: Skin, Middle, Outer, Belt, Headgear, Eyes. Hair is a texture on top of the pawn, tinted by colour: [RimWorld wiki Apparel layers](https://www.rimworldwiki.com/wiki/Apparel_layers), [Steam discussion](https://steamcommunity.com/app/294100/discussions/0/4368004299241582424).

**Papers, Please (Lucas Pope, solo)**
- Each entrant is specified as much or as little as needed; unspecified attributes (including faces) are filled randomly from current rules. Scripted characters' faces change between replays while their dialogue stays.
- Pope wrote validation code that generated thousands of entrants at a time.
- Source: [Game Developer](https://www.gamedeveloper.com/design/designing-the-bleak-genius-of-i-papers-please-i-).
- Faces skew middle-aged and careworn on purpose to fit the setting: [Ashlander Analysis](https://ashlanderanalysis.substack.com/p/papers-please-a-modern-classic).

**Return of the Obra Dinn (solo, 1-bit)**
- Designing 80 unique characters in 1-bit was harder than expected; the crew was cut to 60. Pope used vintage portraits as inspiration: [Kill Screen](https://killscreen.com/articles/return-obra-dinn-update-details-challenges-1-bit-rendering/).
- He put "legibility above all else" for the style: [PlayStation Blog](https://blog.playstation.com/archive/2019/10/17/lucas-pope-on-return-of-the-obra-dinns-art-style).
- The look relies on dithering. Pope built a custom blue-noise variant to fight flicker: [Alan Zucconi](https://www.alanzucconi.com/?p=10365).

**Disco Elysium**
- Art director and lead artist Aleksander Rostov's team started as fine-art painters. Influences included Jenny Saville, Repin and Vrubel. The character-creation pipeline "changed at least three or four times": [MCV/Develop](https://www.mcvuk.com/business-news/we-knew-immediately-that-we-needed-to-make-a-game-with-a-striking-and-unique-look-to-accompany-the-writing-a-look-that-would-balance-the-mundane-with-the-unfamiliar-and-strange-the-art).
- Noclip's documentary Part 4 has a "Portraits" chapter: [RPG Codex](https://rpgcodex.net/article.php?id=12760).

**Darkest Dungeon**
- Red Hook was founded in 2013 by Chris Bourassa (art and creative direction background) and Tyler Sigman: [ModDB Red Hook](https://www.moddb.com/company/red-hook-studios/games).

**Doom status-bar face (D-300's reference)**
- The face sits in the centre of the status bar, reacts to health thresholds, turns towards incoming damage and grins on a weapon pickup: [DoomWiki Status bar face](https://doomwiki.org/wiki/Status_bar_face).
- The early HUD came from an Adrian Carmack pencil sketch: [DoomWiki HUD](https://doomwiki.org/wiki/Heads-up_display).

### Inferences
- CK2 and Dwarf Fortress already use the same architecture as dynasty-sim's `genes.ts`/`faceSpec`: gene → frame index per layer, and age → base head plus wrinkle overlay. The missing piece is the part library, not the system.
- Lessons for dynasty-sim:
  - Avoid CK2's "all children look alike" shortcut; child faces need their own gene-driven parts.
  - Obra Dinn's single governing rule ("legibility") is a model for the art bible.
  - Papers, Please's bulk validation (thousands at a time) is a model for a contact-sheet test: render 100 random people and check that the faces differ. DECISIONS already requires a similar scar-variety test.
- Doom's mugshot shows that a handful of expression/state frames is enough to feel alive. Mood should change brows, eyes and mouth before anything else.
- Every successful example used human-drawn parts. No shipped, well-known game was found that uses AI-generated modular portrait parts. The approach is unproven at scale.

### Gaps
- Exact CK2 layer list, frame counts and image sizes were not retrieved (the Paradox forum was unreachable).
- No primary source was found on the size of Darkest Dungeon's art team or its portrait process, the specifics of Disco Elysium's portrait pipeline, or Papers, Please's face-assembly technique (layers vs whole sprites).
- The pixel size of the Doom mugshot sprite was not found.
- Dwarf Fortress part counts and canvas size were not retrieved (ArtStation was unreachable).

## Q4. Alternatives to AI: asset packs, commissioning a base part library, hand-pixelling with procedural recombination — and costs

### Takeaway
Ready-made modular pixel-portrait packs exist for $0–20. They are mostly full-colour, 128×128 or larger, and some forbid any AI use. None matches a 2-colour 1700s style. Freelance pixel art runs roughly $10–50/hour, with sprite prices around $15–50 each for 16–64 px. A small base part library (~60–100 small parts) is plausibly a few hundred dollars one-time, which is above the monthly cap but could be a one-off. A hybrid fits the budget: AI finds the style and drafts the parts, then a human cleans them up or redraws them.

### Cited Findings
- **Pixelart Portrait Maker (aamatniekss):** a generator tool with 128×128 portraits, sliders and parts (ears, hair, jaws, eyes, mouths, beards). $20+, Windows. You may not redistribute or resell the tool or its images, and assets may not be used "in any AI creations or to train an AI": [itch.io](https://aamatniekss.itch.io/pixelart-portrait-maker).
- **ORMACH Modular Face:** free / pay-what-you-want layered face kit, 1200×1300 PNGs, CC-BY-4.0 (not pixel scale): [itch.io](https://ormach.itch.io/ormach-modular-face).
- **PixelPersona:** modular pixel-portrait pack (head, body, hair, clothing, eyes, noses, mouths), $4.99+, in beta: [itch.io](https://oxyoxy.itch.io/pixelpersona).
- **Pixel Faces:** 32 fixed 32×32 portraits for $1, not modular: [itch.io](https://ninjagame-dev.itch.io/pixel-faces).
- **600+ Character Portraits:** $15+, 1024×1024, not pixel scale: [itch.io](https://captaincatsparrow.itch.io/600-character-portraits-with-modular-background).
- Freelance rates:
  - A May 2025 indie job post offered $25/hour for a freelance pixel artist: [Work With Indies](https://www.workwithindies.com/careers/dreamaloid-studios-pixel-artist).
  - One shop lists $10/hour (introductory), $20–70+ per animated character and a $20 minimum: [Scythuz's Pixel Shop](https://godotforums.org/d/20363-scythuz-s-pixel-shop).
  - Other for-hire posts cite $30/hour and €50/hour including full usage rights. Attribution between the two itch posts is unverified: [itch.io for-hire thread](https://itch.io/t/4455928/for-hire-pixelart-and-animator-looking-for-paid-projectworkcommission), [itch.io post](https://itch.io/post/15260982).
- Per-sprite price sheets found via search: $15 (16×16), $25 (32×32), $35 (48×48), $50 (64×64); portrait icons $20–30 (32×32) and $30–40 (48×48), dated Sept 2024. Exact attribution to individual sheets is unverified. Example sheets: [pixelglade](https://pixelglade.net/artwork/commissions/commissions.html), [misnina](https://misnina.carrd.co).
- Pricing advice from an Aseprite forum post: price the whole process (sketch, palette, revisions), and price commercial/game use separately from personal use: [Aseprite community](https://community.aseprite.org/t/a-simple-pricing-sanity-check-for-pixel-art-commissions/28697).
- Precedent for a commissioned part library: Dwarf Fortress's layered portraits were made by paid pixel artists. Mayday and Meph were paid contractors for the tileset: [itch.io](https://kitfoxgames.itch.io/dwarf-fortress), [Game Developer via search](https://gamesbeat.com/dwarf-fortress-is-coming-to-steam-and-itch-io-so-nincompoops-like-me-can-finally-play-it/).

### Inferences
- Rough commission estimate for a 2-colour part library at ~96×120:
  - Size: ~10 slots × ~6–12 variants, plus 8 mood variants of brows, eyes and mouth, giving roughly 100–150 small parts.
  - Simple 2-colour parts are fast to draw. At $25/hour and ~10–20 min per part, the library is roughly 20–50 hours, about $500–1,250.
  - A "cleanup of AI drafts" contract (fixing line weight and consistency on parts that already exist) might be about $150–300.
  - These numbers are inference, not quotes.
- Hand-pixelling by Claude through an Aseprite MCP is possible (pixel-level drawing tools exist). The earlier code-drawn faces came out "lifeless", though, so this is best kept for fixes, not authoring.
- Asset packs are unsuitable as the main source: wrong style and resolution, and aamatniekss forbids AI use. ORMACH (CC-BY) could serve only as a layout and slot reference.

### Gaps
- No authoritative 2025–2026 survey of pixel-art commission rates was found. All rates are individual listings.
- No quote was found for a "2-colour portrait part library" specifically.

## Q5. Legal and market concerns: Steam disclosure, output licensing and copyright, player perception and backlash, mitigation

### Takeaway
- **Steam** requires disclosure of AI-generated content that ships with the game, marketing included; since January 2026 tool-only use is exempt.
- **Copyright:** purely AI-generated images are not copyrightable in the US. Human selection, arrangement and modification can be protected, so a code-assembled system plus hand-edited parts is in a better position.
- **Tool licences:** they allow commercial use but carry gotchas, e.g. PixelLab forbids training on its outputs.
- **Players:** most are negative in attitude, but few refuse to buy. The practical risks are fewer reviews and outsized backlash when AI use is hidden or found later.

### Cited Findings
- **Steamworks Content Survey** (official page via search extract): [Steamworks docs](https://partner.steamgames.com/doc/gettingstarted/contentsurvey).
  - Pre-generated AI content (made during development) must contain nothing illegal or infringing.
  - Live-generated content needs described guardrails.
- **January 2026 revision**, the first since 2024:
  - Disclosure covers AI-generated content players see, such as art, audio, narrative and marketing assets. Efficiency and code tools are exempt: [Notebookcheck](https://www.notebookcheck.net/Steam-updates-AI-disclosure-form-requiring-developers-to-report-visible-and-in-game-AI-but-not-background-tools.1206103.0.html), [VGC](https://www.videogameschronicle.com/news/valve-has-significantly-rewritten-steams-rules-for-how-developers-much-disclose-ai-use).
  - Disclosures show on the store page: [Gigazine](https://gigazine.net/gsc_news/en/20260120-steam-updates-ai-disclosure-guidelines).
- **US Copyright Office Part 2 report** (29 Jan 2025): [Jenner & Block](https://www.jenner.com/en/news-insights/client-alerts/us-copyright-office-issues-report-on-copyrightability-of-works-incorporating-ai-generated-material), [Skadden](https://skadden.com/insights/publications/2025/02/copyright-office-publishes-report).
  - Human authorship is required, so works entirely generated by AI are not copyrightable.
  - Prompts alone, even detailed ones, are not enough.
  - Human-created elements inside AI output, and creative arrangement or modification of AI elements, can be protected.
- A separate 2025 D.C. Circuit ruling is referenced; this is a secondary source: [terms.law](https://terms.law/ai-output-rights/stable-diffusion/).
- **Tool terms:**
  - PixelLab: commercial use allowed; no training other models on outputs; user liable: [PixelLab ToS](https://www.pixellab.ai/termsofservice).
  - Recraft: free-tier outputs are owned by Recraft and are public: [Recraft blog](https://www.recraft.ai/blog/best-ai-image-generation-api).
  - Midjourney: Basic and Standard images are public by default: [krater.ai](https://krater.ai/blog/midjourney-pricing).
- **Player surveys:**
  - Circana (Dec 2025): just over 25% of US players were less likely to buy, or would refuse, a game using gen-AI art, text or music, up from ~22% in March 2024. Under 10% were more interested: [Outlook Respawn](https://respawn.outlookindia.com/gaming/gaming-news/do-gamers-care-about-genai-new-data-reveals-a-silent-majority).
  - Quantic Foundry (Oct–Dec 2025, N=1,799): 85% negative toward gen-AI in games, 63% at the most negative option: [GamesMarket](https://www.gamesmarket.global/quantic-foundry-most-gamers-are-negative-about-the-use-of-gen-ai-in-video-games).
  - GameDiscoverCo (about 3,800 Steam players, 25 June – 2 July 2026): [GameDiscoverCo newsletter](https://newsletter.gamediscover.co/p/what-do-steam-fans-really-think-about), [Gamereactor](https://www.gamereactor.eu/only-8-of-steam-users-say-they-wouldnt-buy-a-game-if-it-contained-ai-1745073/).
    - 43% had no major issue with an AI disclosure, 26% were neutral, 31% negative; only 8% would refuse to buy.
    - Only 17% believe developers fully disclose AI use.
    - 44% read disclosures in detail.
  - A study of about 10,000 Steam games released Jan–Oct 2025: games with AI disclosures averaged 4 reviews in their first month vs 7 without, after controls. It does not prove avoidance, and the author was not named in the coverage: [Digital Citizen](https://www.digitalcitizen.life/steam-games-that-disclose-ai-use-may-sell-far-less-new-study-finds/).
- **Backlash cases:**
  - The Indie Game Awards revoked Clair Obscur: Expedition 33's Game of the Year and Debut awards (Dec 2025). The cause was brief AI use for placeholder textures, patched out within days, after the studio had said no gen-AI was used. The IGA says any use makes a game ineligible: [Malay Mail](https://www.malaymail.com/news/tech-gadgets/2025/12/21/indie-game-awards-rescinds-honours-from-clair-obscur-expedition-33-for-genai-use/202718).
  - Vapor World pulled AI cutscenes after Steam backlash: [Everything Edinburgh](https://everythingedinburgh.com/games/news/vapor-world-steam-ai-cutscene-backlash/).
  - 1666: Amsterdam dropped gen-AI art after backlash: [TechPowerUp](https://www.techpowerup.com/352122/1666-amsterdam-developer-drops-gen-ai-art-after-community-backlash).
  - The developer of "Hardest" is delisting it; reviews called the AI art "soulless" and "cheap": [PC Gamer](https://www.pcgamer.com/games/indie-dev-is-delisting-his-ai-game-from-steam-because-his-new-girlfriend-convinced-him-its-evil-the-game-existing-in-its-current-form-is-a-disgrace-to-all-game-makers-and-players/).
  - Postal: Bullet Paradise was cancelled over AI in promo art: [GameRant](https://gamerant.com/steam-ai-art-game-canceled-postal-bullet-paradise-explained/).
  - A PC Gamer column says "a touch of AI is all it takes to trigger backlash": [PC Gamer](https://www.pcgamer.com/gaming-industry/steam-week-in-review-a-touch-of-ai-is-all-it-takes-to-trigger-backlash-as-a-promising-new-indie-falls-afoul-of-slop-skeptics/).
- Kitfox publicly stresses that it uses no gen-AI in Dwarf Fortress, which shows "no AI" is now a marketing point in this genre: [Kitfox devlog](https://kitfoxgames.itch.io/dwarf-fortress/devlog/1309415/portrait-update-other-fixes-dwarf-fortress-patch-5309).

### Inferences
- For a browser game (itch.io or own site), no platform disclosure is required, but the reputational logic is the same. Hidden AI use discovered later (Clair Obscur) is worse than disclosed, curated use.
- If dynasty-sim ships on Steam, the parts count as "pre-generated" content and must be disclosed.
- The genre (CK-like, Dwarf Fortress-adjacent) skews towards players who value hand-made craft. The portrait is the game's only graphics (D-300), so it is highly visible.
- Mitigations:
  1. Disclose plainly ("face parts drafted with AI tools, curated and edited by hand; assembled by code").
  2. Hand-edit every shipped part and keep a provenance log (tool, prompt, seed, date, edits) in the repo.
  3. Keep the art bible public.
  4. Keep the option to replace the library with a commissioned human-drawn set later. The slot/manifest format makes parts swappable without code changes.
  5. Never use AI in marketing art without disclosure.
- Copyright: individual AI parts are likely unprotectable. Hand edits, the selection, the slot system and the code assembly likely are. This weakens protection against copycats but does not block shipping.
- Check the tool licence before choosing: PixelLab's no-training clause, and Flux [dev] licensing ambiguity for any self-trained LoRA. SDXL (OpenRAIL++) is the safer local base.

### Gaps
- The official Steamworks page text and its last-updated date could not be fetched directly. Sources disagree on enforcement (voluntary vs delistings).
- The author of the 4-vs-7-reviews study is unknown.
- No data was found on AI-art perception for browser or itch.io games, or for strategy/CK-like audiences specifically.
- The EU AI Act transparency duties for synthetic images (Art. 50) were not researched. They mainly target deepfakes and machine-readable marking by providers, so relevance is likely low.

## Q6. How a non-artist owner should define and approve a style (art bible, reference board, explicit checklist) to avoid endless "I don't like it" loops

### Takeaway
Write a short, measurable ruleset before the second asset is made. It should cover resolution, palette (hex), line weight, light direction, proportions, do/don't. Pair it with a curated reference board of "like this" and "not like this" images. Approve by choosing among side-by-side variants against a written checklist, not by open-ended reaction, and record each locked choice. Even professional teams re-did pipelines several times (Disco Elysium 3–4 times), so iteration should be bounded by process.

### Cited Findings
- A style guide is the team's "single source of truth". It covers palettes with hex codes, character examples and do/don't rules, and works as onboarding documentation "even if the new artist is just you later": [Wayline](https://www.wayline.io/blog/art-style-consistency-games-beginner-pro).
- For pixel art, a short written ruleset (about 12 lines covering resolution, palette, outlines, shading, animation timing, proportions) should be written "before drawing your second asset" to prevent drift: [Sprite-AI guide](https://www.sprite-ai.art/blog/2d-pixel-art-style-guide).
- A mood board should be "a curated selection of images that embody the feeling of your game", not a pile of pretty pictures: [Wayline](https://www.wayline.io/blog/top-earning-indie-games-consistent-art).
- Even small teams benefit from an art bible: [Room 8 Studio](https://room8studio.com/news/who-needs-an-art-bible-game-art-direction-from-indie-to-aaa).
- Schedule regular style reviews, especially after big changes: [Wayline](https://www.wayline.io/blog/art-style-consistency-games-beginner-pro).
- An art spec should list all needed graphics, the overall style, formats and naming conventions: [GameDev.net](https://gamedev.net/forums/topic/552212-creating-art-biblestyle-guide/4955332/).
- Examples of one governing rule and constraints: Obra Dinn's "legibility above all else": [PlayStation Blog](https://blog.playstation.com/archive/2019/10/17/lucas-pope-on-return-of-the-obra-dinns-art-style). Caves of Qud's fixed 18 colours and 16×24 tiles: [Qud wiki](https://wiki.cavesofqud.com/wiki/Visual_Style).
- Even a professional art-led studio iterated heavily: Disco Elysium's character pipeline "changed at least three or four times": [MCV/Develop](https://www.mcvuk.com/business-news/we-knew-immediately-that-we-needed-to-make-a-game-with-a-striking-and-unique-look-to-accompany-the-writing-a-look-that-would-balance-the-mundane-with-the-unfamiliar-and-strange-the-art).
- Dwarf Fortress revised portraits that felt "inconsistent with the tone" after release, so tone consistency is a review criterion in practice: [Kitfox devlog 53.09](https://kitfoxgames.itch.io/dwarf-fortress/devlog/1309415/portrait-update-other-fixes-dwarf-fortress-patch-5309).

### Inferences
Suggested approval protocol for Tim (it fits the repo's DECISIONS and screenshots practice):
1. **One-page art bible** in docs:
   - canvas (e.g. 96×120) and display scale (integer only);
   - two hex colours;
   - 1-px line, no dithering, no anti-aliasing;
   - fixed front-facing ¾ or full-front pose;
   - eye line, nose and mouth positions as pixel rows;
   - a light-direction rule if any;
   - what counts as "more detailed than Doom";
   - 5 "like this" refs (e.g. Doom mugshot, Papers, Please entrants, Obra Dinn faces, CK2 portraits, period woodcut or engraving portraits of c. 1700);
   - 5 "not like this" refs (e.g. anime/chibi, glossy AI painting, dithered greyscale, ASCII).
2. **Pass/fail checklist**, applied per face and per part:
   - readable at 1× on a phone;
   - the 8 moods are identifiable without captions;
   - two random people are distinguishable at thumbnail size;
   - age readable (young / adult / old);
   - scars and disease visible but not grotesque;
   - no stray single pixels;
   - line weight consistent across parts;
   - parts align at slot borders;
   - era and status readable from headwear and collar;
   - European and Arab appearances both read right, without skew (D-305 concern).
3. **Choose, don't critique.** Every review shows 3–4 variants side by side. Tim picks one or names the checklist item that fails. "I don't like it" must point to a reference or a checklist line, and if neither exists, the art bible gets amended first.
4. **Lock and time-box.** Lock decisions in order: palette → template/proportions → one hero face → one part slot at a time. Allow max 3 rounds per stage. Record each lock in DECISIONS so it is not reopened silently (matches workflow rule "береги сделанное").
5. **Contact sheets.** Approve the system, not single faces: a 10×10 sheet of random people across ages, moods and eras, generated by the game code.

### Gaps
- No authoritative source was found on approval and sign-off protocols specifically for non-artist owners. The protocol above is synthesised from general style-guide advice and the project's own practice.

## Q7. Recommended pipeline for dynasty-sim within ≤ $30/month

### Takeaway
Keep the gene-driven, code-assembled system and buy only the part library from AI. The steps:
1. Lock an art bible and a fixed template.
2. Generate part variants in context on a fixed base face with Retro Diffusion (pay-per-image, Claude Code MCP, palette constraint, seeds and references), or PixelLab Tier 1–2 ($12–24/month for 1–2 months).
3. Run a deterministic `tools/` script to grid-snap, threshold to 2 colours, cut slots, and build ink and knockout masks plus a JSON manifest.
4. Hand-fix in Aseprite ($20 once).
5. Assemble in `src/ui` from `faceSpec`.

Expected spend: roughly $20–60 one-time plus at most 1–2 months of a $12–24 subscription. An optional later commission of a human cleanup or redraw would cost a few hundred dollars one-time.

### Cited Findings
- Retro Diffusion fits Claude-driven, pay-as-you-go part generation:
  - Official remote MCP with a Claude Code install command; prepaid credits with no subscription; ~$0.01–0.18 per image; 16–384 px sizes; seed reuse; 9 references; custom styles; free `fix_pixel_art`; portrait and 1-bit style categories: [RD MCP README](https://github.com/Retro-Diffusion/retro-diffusion-mcp).
  - Palette-constrained output via `input_palette`: [Glama](https://glama.ai/mcp/connectors/ai.retrodiffusion/pixel-art).
- PixelLab fits a subscription route:
  - $12/month Tier 1 (~2,000 generations, 320×320): [G2](https://ai.g2.com/marketplace/tools/pixellab), [Gamelabs](https://gamelabstudio.co/blog/gamelabs-studio-vs-pixellab).
  - Inpainting up to 180×180 on Tier 2 ($24): [PixelLab docs](https://www.pixellab.ai/docs/tools/inpaint-pixpatch-v2).
  - Commercial use allowed: [ToS](https://www.pixellab.ai/termsofservice).
  - Official MCP exposes only character, animation and tile tools: [GitHub](https://github.com/pixellab-code/pixellab-mcp).
- Grid-snapping and quantisation tools that can run offline and are scriptable: unfake (JS/Python) [PyPI](https://pypi.org/project/unfake/); proper-pixel-art (Python CLI/API) [sourcepulse](https://www.sourcepulse.org/projects/13911015); Pixel Snapper (MIT, CLI/WASM) [brightcoding](https://converter.brightcoding.dev/blog/stop-wasting-hours-fixing-ai-pixel-art-use-pixel-snapper-instead).
- Hand-fix tools: Aseprite ~$19.99 one-time [gappsy](https://gappsy.com/tools/aseprite/); Claude-drivable via `pixel-mcp` / `pixel-plugin` [pkg.go.dev](https://pkg.go.dev/github.com/willibrandon/pixel-mcp), [pixel-plugin](https://cdn.jsdelivr.net/gh/willibrandon/pixel-plugin@main/README.md).
- Layered-part precedents: CK2's DNA/property-indexed layers [Paradox forum guide](https://forum.paradoxplaza.com/forum/threads/a-complete-guide-to-custom-portraits.590291/post-13498654); Dwarf Fortress's layered pixel portraits [ArtStation](https://ckjong.artstation.com/projects/wrWdlX); Qud's role-mask recolouring [Qud wiki](https://wiki.cavesofqud.com/wiki/Modding:Tiles).
- The concept stage can use cheap general models: gpt-image-1-mini ~$0.002–0.033 per image [OpenAI community](https://community.openai.com/t/gpt-image-1-5-rolling-out-in-the-api-and-chatgpt/1369443?page=3); Nano Banana ~$0.039 [BenchLM](https://benchlm.ai/md/media-pricing/nano-banana.md). Their output needs grid repair [SpriteCook](https://www.spritecook.ai/blog/nanobanana-pixel-art-for-games).

### Inferences
**Pipeline, step by step** (all inference built on the findings above):
0. **Art bible and template (no cost).** Tim approves the palette, canvas (e.g. 96×120), pose, proportion rows and reference board (Q6). Claude builds a template PNG: head silhouette, slot rectangles and anchors for each gene slot in `genes.ts`.
1. **Style probe (~$2–5).** Through the RD MCP, run 20–40 generations of whole faces on the template. Try different 1-bit/portrait styles with the 2-colour palette, at the same seed and with 3–9 references. Tim picks a style on a contact sheet. Optionally lock it as an RD user style.
2. **Base face (~$1–3).** Generate a neutral "base face" set: per sex, 3 age bands (child, adult, old), 2 appearance groups (European, Arab). Hand-fix them as the canonical bases.
3. **Parts in context (~$10–30).** For each slot (eyes, brows, nose, mouth, ears, hair, beard, wrinkles, scars, pox and disease marks, bandage, patch, headwear and collar by era and status, jewel), generate N variants by inpainting or regenerating only that slot on the base face, with a fixed seed per variant index. Mood-bearing slots (brows, eyes, mouth) get 8 mood frames per variant, or a reduced set mapped from the 8 moods.
   - With RD at $0.01–0.06 per image, ~500 generations cost about $5–30 (credits do not expire).
   - Alternative: one month of PixelLab Tier 2 ($24) for Pixpatch inpainting.
4. **Deterministic post-processing (no cost; Node/TS in `tools/`, or Python via unfake/proper-pixel-art run once).**
   - grid-snap → threshold to 2 colours with a fixed cutoff → remove isolated pixels → crop to the slot rectangle → derive an ink mask and a knockout mask;
   - write `parts/<slot>/<variant>[.<mood>].png`, or one atlas, plus `manifest.json` (slot, variant, anchor, mood, tags such as era/status/sex/age, provenance: tool, model/style, seed, prompt hash, date, hand-edited yes/no).
   - Runtime needs no AI and no network.
5. **Curation and hand fixes (~$20 once).** Claude renders contact sheets (100 random people from game seeds) for review against the checklist. Rejected parts are regenerated or fixed in Aseprite, by hand or through `pixel-mcp`.
6. **Runtime assembly (existing architecture).** `faceSpec` → per-slot variant + dx/dy → draw base head (by age band) → wrinkles/age overlay → features → scars/disease overlays → hair/beard (with knockout) → headwear/collar (era/status) → mood swap of brows/eyes/mouth. "Grey hair" in 2 colours becomes a sparser or outline-only hair pattern variant, not a colour.
7. **Small UI art.**
   - Coats of arms: code-drawn 2-colour heraldry (ordinaries, divisions, charges from a small AI- or hand-made charge set) is deterministic and already planned in D-237.
   - Icons: the same RD palette-locked generation at 16–32 px, then the same post-processing script.
8. **Disclosure and provenance.** Keep the manifest provenance. Add a credits/disclosure line. Keep the swap-in path open for a commissioned human redraw of the library (~$150–300 for cleanup or ~$500–1,250 for a full redraw at ~$25/hour, as estimated in Q4).

**Budget summary**
- Months 1–2: RD credits $10–30 (one-time, non-expiring) or PixelLab $12–24/month; Aseprite $20 one-time.
- Ongoing: $0/month once the library exists.
- This stays within $30/month.

**Main risks**
- AI parts may not keep a consistent line weight. Mitigation: the threshold/cleanup script plus hand fixes.
- A 2-colour palette cannot show skin tone or albinism by hue. Design decision needed.
- Audience backlash. Mitigation: disclosure, curation and the replaceable library.
- Vendor terms: PixelLab's no-training clause.

### Gaps
- No vendor was verified to produce clean 1-px-line, 2-colour, non-dithered faces at ~96×120. A paid style probe (step 1) is the cheapest way to find out and should come before committing.
- The real generations-per-acceptable-part ratio is unknown. Cost estimates assume roughly 3–5 generations per accepted part.
- How RD's `input_palette` interacts with its 1-bit styles (and whether they dither) is unknown.
