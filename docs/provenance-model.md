# The Round Table provenance model

Status: **proposal, not yet implemented.** Board sign-off wanted before any
article or catalog entry is migrated.

## The problem this solves

Today a device entry states every fact in the same voice. From
`data/device-catalog.json`, the Arizer Solo 2:

```
"Battery Life": "Approximately 3+ hours of continuous use (among the best in its class)"
```

Three different kinds of statement are fused into one string:

- *approximately 3+ hours* — nobody recorded whether this is Arizer's number
  or a forum member's stopwatch.
- *of continuous use* — a test condition, and not one Arizer publishes.
- *among the best in its class* — an editorial opinion, presented as a spec.

A reader cannot tell which part to trust, and neither can we. The only
provenance we carry is `source_threads`, which is attached to the whole device,
not to any particular claim. It tells you the article was built from those
threads. It cannot tell you which thread supports which number.

This is the credibility problem. It gets worse, not better, as we add content,
which is why it should be fixed before we write 31 new articles and before we
bring in a single line from Discord.

## The model

Every published claim carries one **tier**. Tiers are not a quality ranking —
a community observation is not a worse fact than a spec, it is a different
*kind* of fact — and they never silently convert into one another.

| Tier | Means | Minimum evidence to publish |
|---|---|---|
| `manufacturer` | The maker says so. | A link to the maker's own page, manual, or spec sheet. Archive it. |
| `verified` | We or a named reviewer measured it, or two independent sources agree. | Two independent sources, or one first-hand measurement with the method stated. |
| `community` | A pattern many owners report. | Three or more independent reports, each individually citable. |
| `experience` | One person's account. | The account, attributed as that person's. |
| `editorial` | The Round Table's own judgement or comparison. | Named author. Must be separable from the facts it rests on. |
| `unverified` | Widely repeated, never sourced. | Nothing — but it must be labelled, and it must never appear unlabelled. |

Rules:

1. **A claim's tier can be raised only by new evidence**, never by an editor
   deciding it "reads better" as a fact.
2. **Unknown is a publishable answer.** An absent field is better than an
   invented one. Do not fill a gap with a plausible number.
3. **Disagreement is preserved.** When two sources conflict, publish both with
   their tiers and say they conflict. Do not pick the tidier one.
4. **Editorial never hides inside a spec.** "Among the best in its class" is an
   `editorial` claim and belongs outside the specifications table.

## Shape

Per claim, not per device:

```json
{
  "field": "battery_life",
  "value": "3+ hours continuous use",
  "tier": "community",
  "as_of": "2026-09-29",
  "sources": [
    { "url": "https://...", "title": "...", "accessed": "2026-09-29" }
  ],
  "note": "Reported by multiple owners; Arizer publishes no runtime figure."
}
```

`as_of` matters as much as `sources`. A 2017 spec that nobody has rechecked is
a different object from one confirmed this month, and the reader deserves to
see which they are looking at.

## Migration, in the order it should happen

1. Agree the tiers on this page.
2. Extend `tools/build_catalog.py` to carry a claim record per field, defaulting
   every existing value to `unverified` — **honest, and uncomfortable, which is
   the point.** It reflects what we can actually defend today.
3. Re-tier upward device by device as sources are found. Highest-traffic devices
   first, once GA4 read access exists to tell us which those are.
4. Surface the tier in the article template so the reader sees it.
5. Only then write the 31 stub articles, natively tiered.

Doing this after the stubs are written means rewriting the stubs.

## What this does not cover

Discord. Nothing from the Discord server enters this model until the community
has been asked — see `docs/discord-knowledge-consent-request.md`. Consent is a
separate question from provenance, and a prior one.
