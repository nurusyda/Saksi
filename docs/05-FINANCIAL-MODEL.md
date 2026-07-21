# 05 — Financial Model

All figures **illustrative**, to be pressure-tested. IDR primary; USD at
**1 USD = 18,000 IDR**. Indonesian minimum wage anchor: **UMP Jakarta ≈ Rp5.8M/mo**
(a mid Jakarta full-stack dev is ~3–4× that, ~Rp18–20M/mo).

## 1. Market sizing (TAM / SAM / SOM)

Grounded in: 64M MSMEs in Indonesia; ~63% digital (~40M); 86% of Indonesians
transact on social media; social-commerce market ~US$5.25B (2025) → ~US$22B GMV by
2028.

| Layer | Who | Estimate |
|-------|-----|----------|
| **TAM** | All digital/online sellers in Indonesia | **~40M sellers** |
| **SAM** | Off-marketplace informal social sellers (jastip, PO, fandom, IG/TikTok/WA direct-transfer) with no rating layer | **~5M sellers** |
| **SOM** | Reachable via organic go-to-market (Twitter, fandom, student, small jastip niche; no paid marketing) | **~500K sellers** |

**Target: 1% of SOM per year = ~5,000 sellers/year** (once past the solo proving
year). Trajectory: Y1 ~1,000 (solo, proving) → Y2 ~6,000 → Y3 ~11,000+.

## 2. Assumptions (change these and everything moves)

- Transactions per active seller/month: **20**
- Saksi Store: **~1.5% of the active base converts each month × Rp100k** (one-time)
- Saksi Resmi (meterai): **~0.5% of transactions attach × ~Rp15k margin** (Rp30k
  price − ~Rp15k cost); switched on ~Month 6, not at launch
- Fraud/B2B data: starts ~Month 18 (needs coverage)
- Lending referral: starts ~Month 24; ~2% of sellers borrow/month, avg loan Rp15M,
  fee ~2.5% ≈ ~Rp375k/loan
- Team: **solo Year 1**, → 2 people from ~M18, **max 2 people in Year 3** (Claude
  Max carries dev productivity). Hire only behind revenue.
- Tools: **Claude Pro ($20/mo ≈ Rp360k) in Year 1**, upgrade to **Claude Max
  ($100/mo ≈ Rp1.8M) after Year 1**. (Claude Max replaces an ~Rp18M/mo dev — the
  single highest-leverage cost decision.)

## 3. Cost structure

### 3.1 CapEx (one-time, Month 0), solo build (no meterai at launch)
| Item | IDR |
|------|-----|
| Build (founder + Claude) | 0 |
| Legal (ToS/PDP) | 2M |
| Design + domain (yr 1) | 1M |
| Buffer (~15% contingency) | 0.5M |
| Meterai float | **deferred** (not offering meterai at launch) |
| **Total** | **~Rp3.5M (~$195)** |

("Buffer" = contingency for surprises. "Meterai float" = working capital to
pre-buy e-meterai stamps from the distributor before buyers reimburse you — only
needed once meterai launches, ~2–5M.)

### 3.2 OpEx — infra bill-of-materials (specific providers & prices)
| Layer | Provider (recommended) | Price |
|-------|------------------------|-------|
| Frontend | Next.js on Vercel Hobby | Free (Pro $20/mo only if outgrown) |
| VPS/compute | DigitalOcean SGP or Biznet/IDCloudHost (Jakarta, PDP residency) | $12–24/mo (Hetzner $8 if EU latency ok) |
| Database | Postgres self-hosted on VPS for MVP; or Supabase | $0 → Supabase Pro $25/mo |
| Object storage (bukti images) | **Cloudflare R2** (zero egress) | $0.015/GB-mo, $0 egress |
| CDN / SSL / DDoS | Cloudflare free | Free |
| OCR / bukti parsing | **Gemini** (already in use) | ~Rp3/image (Gemini 2.0 Flash ~$0.00016/img). Alt: Google Vision $1.5/1k |
| Email (transactional) | Amazon SES | $0.10 / 1,000 emails |
| Auth | Supabase Auth / self-host; phone+OTP | Free (avoid SMS OTP) |
| WhatsApp | `wa.me` deep links | Free (NEVER the Business API) |
| KYC (paid tier only) | Didit / Privy / VIDA / Verihubs | ~Rp5–10k/check ⚠ watch monthly minimums |
| Domain | .com/.id | Rp500k/yr (~Rp42k/mo) |
| Monitoring | Sentry free + UptimeRobot | Free |

### 3.3 OpEx — monthly totals
**Year 1 (solo, Claude Pro):**
| Item | IDR/mo |
|------|--------|
| Infra (hosting/DB/R2/OCR/email) | ~0.6–1M |
| Claude Pro ($20) | ~0.36M |
| Domain (amortized) | ~0.04M |
| Accounting/misc | ~0.2M |
| Marketing | **0** (organic; cap 0.5M only if needed) |
| **Total (founder unpaid)** | **~Rp1.3–1.6M/mo (~$75–90)** |

Detailed infra scales roughly: ~Rp500–600k/mo at 1k–10k txns; ~Rp3.3M/mo only at
100k txns/mo. Compute is "flat then steps"; storage/OCR/email scale linearly and
stay cheap. **Avoid the two cost traps: the WhatsApp Business API and human dispute
moderation.**

## 4. COGS per paid unit
| Product | Price | COGS | Margin |
|---------|-------|------|--------|
| Saksi Store | 100k one-time | ~0 (penny-test verify) | ~100k (~100%) |
| Saksi Resmi | 30k/deal | ~12–18k (meterai + distributor + e-sign) | ~12–18k ⚠ verify vendor |
| Lending referral | — | ~0 (referral) | ~Rp375k/loan (2.5% of Rp15M) |

## 5. Projection (monthly run-rate at each milestone)

| | M6 | M12 | M18 | M24 | M36 |
|---|----|----|----|----|----|
| Active sellers | 300 | 1,000 | 3,000 | 6,000 | 12,000 |
| Transactions/mo | 6,000 | 20,000 | 60,000 | 120,000 | 240,000 |
| **Income (margin):** | | | | | |
| Saksi Store | 0.3M | 1.5M | 4.5M | 9M | 18M |
| Saksi Resmi | 0.3M | 1.5M | 4.5M | 9M | 18M |
| Fraud/B2B data | — | — | 2M | 8M | 20M |
| Lending referral | — | — | — | 3M | 45M |
| **Total margin/mo** | **0.9M** | **3M** | **11M** | **29M** | **101M** |
| − OpEx/mo | 0.6M | 1.5M | 5M | 22M | **35M (2 ppl in Y3)** |
| **= Net/mo** | ~0 | ~1.5M | ~6M | ~7M | **~66M (~$3,667)** |

Notes: through M12 "net" excludes founder salary (you don't pay yourself yet); from
~M18 your salary is inside OpEx. Year-3 OpEx uses the **2-person** plan (~Rp35M),
raising net to ~Rp66M/mo (~Rp790M/yr ≈ $44k/yr) — up from the earlier 3-person
figure.

## 6. When each revenue stream starts (the phasing)
| Stream | Starts | Why then |
|--------|--------|----------|
| Saksi Store | ~M3 | once the link-loop works |
| Saksi Resmi | ~M4–6 | once meterai integration is live |
| Fraud / B2B data | ~M18 | needs account coverage for a useful hit-rate |
| Credit / lending referral | ~M24 | needs months of verified income + a lender partner (+ maybe ICS license) |

## 7. Break-even, total investment, ROI
- **Break-even on lean costs: ~Month 10–12** (Store + meterai ≈ covers the
  ~Rp1.5M/mo solo cost; with Claude *Pro* the bar is low enough that Store-alone
  nearly clears it at ~1,000 sellers).
- **Total cash to reach break-even: ~Rp14–15M (~$800)** — CapEx ~3.5M + Year-1
  operating loss ~11M. (Excludes the founder's own living costs.)
- **Payback:** founder-coded → **under 1 month** at the modest steady scenario;
  a hired-dev CapEx (~Rp90–107M) → ~7 months.
- After ~M12 it **self-funds**; the consumer business never needs outside money.
  (Lending later may need a funded partner — separate.)

## 8. Honest caveats (read before believing the table)
1. **Two lines carry the whole model and both are unproven:** the seller base
   growing organically (everything scales off active sellers) and lending executing
   (the M24+ upside). If organic growth stalls, the table shrinks proportionally. If
   lending never happens, the ceiling is ~Rp8–24M/mo — a real but small business.
2. **Store is one-time revenue → you must keep acquiring sellers forever.** No
   subscriber cushion. The built-in viral loop (every invoice exposes a new buyer)
   is the substitute for paid marketing.
3. **Lending is a different, regulated, risky second act** — the Rp45–150M/mo
   figures are the most speculative in the model.
4. **OpEx must trail revenue** — the model stays profitable only because you hire
   behind the money (solo → 2), never ahead of it. Claude Pro→Max exists to delay
   the first dev hire.
5. **Costs are never the risk; adoption and lending-execution are.** Monthly burn
   is ~Rp1.5M for a long time — you can afford to be patient and let the network
   prove itself. Total downside to find out: ~$800 and a year.
