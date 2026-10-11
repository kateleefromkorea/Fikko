# Fikko Mobile redesign: build progress

Started 2026-10-11. Design reference: `prototype.html` in this folder (open it in a browser).
If a session stops part-way, start the next one with: "Continue the Fikko Mobile redesign from mobile/design/BUILD-PROGRESS.md".

## Decisions (from Kate)
- Core job: log anything in under 5 seconds. Same visual family as the website, native iOS feel. iPhone first.
- Keep every current feature; move or simplify, never cut.
- **No emoji.** Use the website's Fikko icon style: lucide glyphs on habit-hue tiles (`HabitIcon` in `src/components/HabitCard.tsx`).
- Teal/sky habit tones are locked (`.daily-overview`); never sage green.

## Structure
Tabs: **Today · Progress · (+) · Coach · You**
- Today: date strip, plant hero (real `FikkoPlant`, streak, rain clouds, per-habit segments), "Up next" rows with one-tap actions, "Done" fold, "Add a habit". Tap a row → that habit's full web card in a sheet.
- (+) Capture sheet: voice check-in (big lead button), meals (opens the full food window: describe, photo, barcode, search), one-tap tiles (water, mood, meds, workout, sleep, custom +1).
- Progress: the web Dashboard ("Ask coach" jumps to Coach with the question).
- Coach: segmented Ask Fikko / Recipes.
- You: profile header, garden card, Profile & settings, Community, My Fikko (pushed pages with a back button), Sign out.
- All shared dialogs become bottom sheets on the phone (`mobile.css`, `[data-slot="dialog-content"]`).

## Files
- `src/MobileApp.tsx` shell (tabs, shared day state, quick logging + toasts + plant hop, Android back button)
- `src/screens/TodayScreen.tsx`, `CoachScreen.tsx`, `YouScreen.tsx`
- `src/components/TabBar.tsx`, `CaptureSheet.tsx`, `PlantHero.tsx`, `Sheet.tsx`, `MealLogger.tsx`, `Toast.tsx`, `ScreenTitle.tsx`
- `src/lib/quickLog.ts` (one-tap logs in the same data shape as the web cards)
- `src/mobile.css`
- Removed `src/screens/HabitsScreen.tsx` (replaced by TodayScreen)

## Status (end of session 1, 2026-10-11)
- [x] Shell, tab bar, capture button, toasts, plant hop, Android back button
- [x] Today screen (hero, rows, one-tap actions, done fold, detail sheets)
- [x] Capture sheet (voice, meals, one-tap tiles)
- [x] Progress, Coach (Ask Fikko / Recipes), You (+ My Fikko, Profile & settings, Community pages)
- [x] All web dialogs render as bottom sheets; food window puts "Add food" first on the phone
- [x] Typecheck and build pass; no web (src/) files changed
- [x] Checked at 375x812 with the dev preview: `npm run dev` in mobile/, then http://localhost:5188/preview.html (sample data, no sign-in; `?empty` for a fresh day)
- [x] Emoji audit: none rendered. (`src/lib/metabolics.ts` has unused emoji fields; legacy custom habits that stored an emoji show Sparkles in mobile rows, but the web Custom habits card inside the sheet still shows the old emoji)

## Next
- [ ] Kate reviews on a real signed-in session / iOS Simulator (`npm run ios`)
- [ ] Polish: web page headers (eyebrow + big title) inside Progress / Coach duplicate the tab title; consider hiding them on the phone
- [ ] Swipe-down to dismiss sheets (currently Done, tap outside, or Escape)
- [ ] Haptics on one-tap logs (@capacitor/haptics) once on device
- [ ] Accessibility pass: VoiceOver order, Dynamic Type, contrast on frosted bars
- [ ] Commit (not committed yet; Kate to approve)
