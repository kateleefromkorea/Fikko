# Brief for Korean privacy lawyer (one fixed-fee review)

**Client:** PipePiper (개인사업자, 471-45-01158), operator of Fikko, a habit and wellness tracking web app (health-related data, optional AI features, optional Fitbit/Pixel Watch sync). Launch 2026-11-11 in Korea, Australia, Singapore and the US. Database in Singapore (Supabase); hosting and AI provider in the US.

**Request:** a fixed-fee review of the finished documents below for PIPA compliance, with tracked edits. We are not asking for drafting from scratch. Please quote a fixed fee and turnaround (needed by ~2026-10-30).

## Documents
1. `public/privacy-ko.html`: Korean privacy policy (draft, structured to the PIPC 개인정보 처리방침 작성지침)
2. `public/privacy.html`: English policy (the Korean one should match it)
3. Consent screen wording: `src/lib/consent.ts` (`CONSENT_ITEMS`, `REGION_NOTES.KR`), shown at sign-up as separate checkboxes
4. `public/terms.html`: terms of service (governing law Korea, Seoul Central District Court)
5. `docs/launch/breach-response.md`: breach notification plan

## Specific questions
1. **Consent structure:** separate consents for (a) terms + 14+, (b) personal information, (c) sensitive/health information, (d) overseas transfer (required), (e) AI processing with overseas transfer to Anthropic (optional). Is this correct under PIPA 제15, 22, 23, 28조의8? Is consent the right basis for the required transfers, or should they rely on 제28조의8 ①3호 (disclosure in the policy for contract performance)?
2. **Overseas transfer table** (privacy-ko §8): are all the required items present (항목, 국가, 일시·방법, 이전받는 자 및 연락처, 목적, 보유기간, 거부 방법·효과)?
3. **Outsourcing vs. transfer:** is listing Supabase/Vercel/Anthropic/Google as 수탁자 (§7) correct, and Google as a recipient?
4. **Age:** minimum age 14, checked by date of birth at sign-up. Sufficient?
5. **Response deadline** for access/deletion requests: the Korean draft says 10 days; the English policy says 30 days. Confirm the correct PIPA deadline, and whether the English one should be shortened for Korean users.
6. **Retention:** 30-day grace period after deletion request, then hard delete; anonymous feedback kept. Any statutory retention we're missing (e.g. 전자상거래법 when paid plans start via Paddle)?
7. **AI disclosures:** anything required for automated processing (PIPA 제37조의2 자동화된 결정)? We believe the AI makes no decisions about users.
8. **Breach plan:** confirm the notification clocks in `breach-response.md`.
9. **Translation check:** "Limited Use" (§14) and medical-advice disclaimer (§18).

## Items we need to fill in (please confirm)
- 개인정보 보호책임자 성명 in Hangul (currently "Seok Hwan Lee")
- Supabase and Vercel privacy contact emails (from their DPAs)
- Concrete backup retention period (pending Supabase check)
