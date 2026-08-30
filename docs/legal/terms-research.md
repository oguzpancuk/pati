# Terms-of-use legal research (S8 input)

Research collected 2026-08-30 by a read-only research agent, to inform the
user-agreement work (ROADMAP improvement sprint, S8). **This is research, not
legal advice**; the open questions at the bottom need a real lawyer. Main
caveat: mevzuat.gov.tr and anayasa.gov.tr were unreachable during the session
(TLS errors), so no primary statute text was read in full — statutory content
comes from law-firm/bar commentary and search summaries, consistent across
multiple sources but not verified against the Official Gazette.

## Summary

Feeding street animals is lawful and implicitly encouraged (the duty sits
with municipalities, and volunteers are recognized), but **the 2024 amendment
(Law 7527) changed the regime for dogs** — strays are now to be collected
into shelters, not cared for in place. Treating/medicating animals is a
licensed veterinary act under Law 6343; the app should disclaim, not
encourage, medication logging. The key civil risk is TBK art. 67: someone who
"undertakes the care" of an animal can be liable for harm it causes — this is
the clause to disclaim hardest. As a UGC host, the app has no general
monitoring duty under Law 5651 but should moderate on notice.

## Evidence

**1. Law 5199 + 7332 (feeding).** 7332 (RG 14.07.2021) made municipalities
responsible: mandatory shelters (Ek Madde 1), 0.5%/0.3% budget earmark for 3
years (Geçici Madde 4), killing/torturing animals became crimes (art. 28/A, 6
months–4 years). Citizen feeding is **not prohibited anywhere**; the
implementation regulation has municipalities establish feeding points "in
cooperation with volunteer organizations". Penalties increase 50% when
violations are committed by designated caregivers/volunteers. (YT Law
commentary — read in full; **partial, secondary commentary**.)

**2. Law 7527 (2024) — major regime change.** RG 02.08.2024: ends
catch-neuter-release for dogs; strays go to shelters until adoption;
commentary says it removed the possibility of "care without ownership
relationship" for dogs; fines for releasing shelter dogs back outside. AYM
**rejected annulment in full** (May 2025). Cats are unaffected. This makes
coordinated in-place dog feeding legally murkier than in 2021–2024 — a real
open question for a lawyer. (Alomaliye, Paksoy, TVHB summaries — **partial**;
anayasa.gov.tr blocked.)

**3. Law 6343 (medication).** Non-veterinarians may not examine/treat animal
diseases where vets are available; unauthorized practice carries **6
months–2 years imprisonment plus fine**. The app should not present "gave
medication" as a normal user action. (Alomaliye and Lexpera search-level
summaries; **partial, verify article numbers with counsel**.)

**4. TBK art. 67 (the key risk).** "Whoever undertakes the care and
management of an animal, permanently or temporarily" is liable for its damage
unless due care is proven. Academic commentary (DergiPark/Konya Barosu
article, **partial**) argues mere feeding without custody (zilyetlik)
shouldn't suffice — but Yargıtay 3. HD upheld 637,156 TL against defendants
over dogs "whose care they had undertaken" that roamed free (Kırşehir case,
upheld Aug 2026; press doesn't clarify owned-vs-fed status). For truly
ownerless animals, courts route liability to municipalities/administration
(Danıştay 8. D. E.2020/7528 K.2021/1532). The doctrine is unsettled at the
margin — exactly where a "regular feeder tracked in an app" sits. **App
records could become evidence of "bakımını üstlenme".**

**5. Law 5651 (platform).** Art. 5: a yer sağlayıcı (hosting provider) has
**no duty to monitor content or investigate legality**, but must remove
unlawful content on notification and keep traffic records. Under general tort
law, the platform isn't liable for user acts absent its own fault —
moderation + clear rules are the defense. (**Partial**, search summaries.)

**App stores** (from platform-guideline knowledge, **not re-verified**):
Apple Guideline 1.2 requires UGC apps to have published terms, content
filtering, and report/block mechanisms; Apple's default EULA applies if you
provide none. Google Play's UGC policy likewise requires in-app
reporting/blocking and accessible terms. (pati already ships report/block
style moderation: content_reports + admin queue.)

## Recommended clause checklist (judgment, not legal advice)

1. **User responsibility acknowledgment** — feeding/care actions are the
   user's own; the app only records them; TBK 67 risk explicitly named
   ("bakımını üstlenen sıfatıyla doğabilecek sorumluluk kullanıcıya aittir").
2. **No veterinary advice / medication disclaimer** — health records are
   informational; treatment belongs to veterinarians (6343); users confirm
   medication entries reflect vet-directed care.
3. **Legal-compliance clause** — users must obey 5199/7527, municipal rules,
   and site owners' rights when placing drop points (no private property,
   roads, playgrounds).
4. **Prohibited conduct** — harming animals, false records, harassment,
   location abuse.
5. **Platform status** — pati is a yer sağlayıcı-style intermediary; no
   monitoring duty; notice-and-takedown channel + moderation/suspension
   rights.
6. **KVKK cross-reference** to /gizlilik; note location data sensitivity.
7. **Age** — 18+, or 13+ with limitations (Play/Apple family policies; KVKK
   consent capacity is genuinely unclear for minors — lawyer question).
8. **Report/block mechanism** clause (App Store 1.2 / Play UGC compliance).
9. **Governing law** — Turkish law, Istanbul (or owner's) courts;
   Turkish-language authoritative text.
10. **Limitation of liability + indemnity** — capped, excluding gross
    negligence (unlimited disclaimers are unenforceable under TKHK/TBK
    against consumers — lawyer must calibrate).

## Open questions for a real lawyer

- Post-7527, is facilitating _dog_ feeding points legally exposed, or only
  municipal collection duties changed? (Cats appear safe.)
- Do app feeding logs realistically create "hayvan bulunduran" status? No
  directly on-point published Yargıtay ruling found.
- Exact 6343 article numbers and whether one-off aid (wound spray, parasite
  drops) falls under "treatment".
- Whether pati must file a yer sağlayıcı notification with BTK as a
  commercial host.
