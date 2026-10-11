# Fikko mobile (iOS and Android)

The phone app, wrapped for the App Store and Google Play with [Capacitor](https://capacitorjs.com).
It is a separate Vite app from the web app in `../`, built from the same phone experience the website shows on phones.

## How the two are split

| | Web app | Mobile app |
|---|---|---|
| Entry and shell | `../index.html`, `../src/main.tsx`, `../src/App.tsx` (phones: `../src/phone/PhoneApp.tsx`) | `index.html`, `src/main.tsx`, `src/MobileApp.tsx` (wraps `../src/phone/PhoneApp.tsx`) |
| Screens | `../src/components/*View.tsx`; on phones `../src/phone/screens/` | `../src/phone/screens/` |
| Styles | `../src/index.css`; on phones also `../src/phone/phone.css` | `src/mobile.css` (the web theme) plus `../src/phone/phone.css` |
| Build and config | `../vite.config.ts`, deployed to Vercel | `vite.config.ts`, `capacitor.config.ts`, `ios/`, `android/` |

**The one rule:** `mobile/` may import from `../src` (through `@/`), but nothing in `../src` imports from `mobile/`.
The phone experience in `../src/phone/` is shared by the website on phones and by this app, so a change there
reaches both. Only native-app concerns live here in `mobile/src`: Capacitor haptics (`src/lib/haptics.ts`,
plugged into `../src/phone/haptics.ts`), Android's back button (`src/MobileApp.tsx`), links that open the app
(`src/lib/authLinks.ts`) and API routing (`src/lib/api.ts`). Vercel ignores this folder (`../.vercelignore`).

`npm run dev` also serves `/preview.html`: the phone screens with sample data and no sign-in, for checking layouts.

## Commands

Run these from this folder. The web app's `node_modules` must be installed too (`npm install` in `../`), since
React, Vite and Tailwind come from there; this folder only adds Capacitor.

```bash
npm install
npm run dev        # the mobile app in a browser at http://localhost:5188 (use a phone-sized window)
npm run typecheck
npm run ios        # build, copy into ios/, open Xcode (needs Xcode)
npm run android    # build, copy into android/, open Android Studio (needs Android Studio)
```

Supabase keys come from `../.env.local`. Calls to `/api/*` go to the deployed web app
(`VITE_API_ORIGIN`, default `https://fikko-eta.vercel.app`): through the dev server's proxy in a browser, and
rewritten by `src/lib/api.ts` inside the native apps.

## Still to do before the stores

- Add `io.fikko.app://auth/callback` to Supabase → Authentication → URL Configuration → Redirect URLs
  (sign-in, confirmation and reset links return to the app through it; see `src/lib/authLinks.ts`).
- Test sign-in with Google, an email confirmation link and a password reset on a simulator or phone.
- Connecting a wearable from the app still returns to the website afterwards.
- App icons and splash screens (`npx @capacitor/assets generate`).
- Apple Health (HealthKit) plugin; Apple Developer Program, Xcode and a real iPhone to test on.
