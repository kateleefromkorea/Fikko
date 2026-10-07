# Founding-member announcement copy

Draft for approval, 7 October 2026. Nothing here is published yet. Every claim matches the
Terms (`/terms.html#founding-members`) and how the app works today:

- Soft launch on **11 November 2026**, free for everyone, web app plus home-screen install, English.
- The **first 100** people who **create an account, confirm their email and finish setup** become founding members.
- Founding members get **Premium free for 12 months, starting the day paid plans launch**.
- About a month before the year ends we email them; then they choose to subscribe or stay on Free. **No card is needed, and nobody is charged without agreeing.**
- Fitbit and Pixel Watch: invite-only beta. Apple Health and Garmin: coming.

Placeholders in [brackets]. Links: sign-up is **app.fikko.io/?mode=signup**; the homepage is **www.fikko.io**.

---

## 1. Landing section (www.fikko.io)

A stronger version of the banner that's live in the pricing section now, for the top of the page
during launch week.

**Eyebrow:** Founding members · [37] of 100 places left

**Headline:** Be one of Fikko's first 100.

**Body:** Fikko is free for everyone while we launch. Sign up, finish setup, and you'll become a
founding member: Fikko Premium free for a full year once paid plans arrive. No card, no catch.

**Button:** Claim my place

**Small print under the button:** Places go in the order setup is finished. Takes about three minutes.
[Founding member terms](https://www.fikko.io/terms.html#founding-members)

When all 100 are taken, swap to:

> **All 100 founding places are taken.** Thank you. Fikko is still free for everyone while we launch. **Start free**

---

## 2. Launch email (to your waitlist, friends and family)

**Subject line, pick one:**
1. Fikko is live, and the first 100 get a free year
2. You're invited: be one of Fikko's first 100
3. Your water, meals, sleep and mood in one check-in

**Preview text:** Free while we launch. The first 100 to finish setup get Premium free for a year.

**Body:**

> Hi [first name],
>
> Today we're opening the doors to Fikko, the habit tracker we've been building at PipePiper.
>
> Fikko puts your whole day in one check-in: water, meals, activity, sleep, mood and your
> medications or supplements. Your dashboard then shows how they add up. Talk to it ("two glasses
> of water and a banana for breakfast") and it fills in your habits for you. Ask its AI coach how
> your week went. And every day you complete your habits, your own Fikko plant grows a little more.
>
> **It's free for everyone while we launch.** And the first 100 people to sign up and finish
> setup become **founding members**, with Fikko Premium free for a full year once paid plans arrive.
> No card needed.
>
> **[Claim your place →](https://app.fikko.io/?mode=signup)**
>
> It works in any browser, and on your phone you can add it to your home screen in about 30
> seconds so it opens like an app.
>
> We're a small team, so your feedback really does shape what we build next. Just reply to this
> email.
>
> Thank you for being early,
> [Your name]
> Fikko · PipePiper, Seoul

---

## 3. Founding-member welcome email (already built, sent automatically)

For review only; this is the text the app sends today (`api/email.ts`). Tell me any changes.

> **Subject:** You're Fikko founding member #[12]
>
> [Kate], you're founding member #[12] of 100. Thank you for joining Fikko this early.
>
> Fikko is free for everyone while we launch. When paid plans arrive, you'll get Fikko Premium free
> for 12 months, starting the day they launch. Nothing to do now, and we'll never charge you without
> your agreement.
>
> About a month before your free year ends, we'll email you to say when it ends and what Premium
> costs if you'd like to keep it.
>
> Questions or ideas? Just reply to this email. Founding members shape what we build next.
>
> [Open Fikko]

---

## 4. Social posts

### Instagram: launch-day carousel (5 slides) and caption

**Slide 1:** Your whole day. One check-in.
**Slide 2:** Water, meals, activity, sleep, mood and your supplements, all in one place.
**Slide 3:** Just say it: "Two glasses of water and a banana for breakfast." Fikko logs it for you.
**Slide 4:** Complete your habits and your Fikko plant grows. 🌱
**Slide 5:** Free while we launch. The first 100 to sign up get Premium free for a year. Link in bio.

**Caption:**

> Fikko is live. 🌱
>
> One daily check-in for the habits that matter: water, meals, activity, sleep, mood and your
> supplements. Talk to it, ask its AI coach about your week, and watch your own Fikko plant grow
> every day you show up.
>
> It's free for everyone while we launch, and the first 100 people to sign up and finish setup
> become founding members, with Premium free for a full year once paid plans arrive.
>
> Claim your place: link in bio.
>
> #habittracker #healthyhabits #wellness #selfcare #buildinpublic

### Threads

> Fikko is live today. 🌱
>
> It's a habit tracker that fits your whole day into one check-in: water, meals, sleep, mood,
> activity, supplements. You can just talk to it.
>
> Free while we launch, and the first 100 to finish setup get Premium free for a year.
> www.fikko.io

### X (two posts)

**Launch:**
> Fikko is live: water, meals, activity, sleep and mood in one daily check-in. Say what you did and
> it logs it for you.
>
> Free while we launch. First 100 to finish setup get Premium free for a year. 🌱
> www.fikko.io

**Mid-week (update the number):**
> [37] founding places left. Sign up, finish setup, and Fikko Premium is free for your first year
> once paid plans arrive. No card needed. www.fikko.io

### LinkedIn (founder post, from your own profile)

> Today we launched Fikko.
>
> [Why you started Fikko, in your own words, two or three sentences. For example, if it's true for
> you: tracking health across several apps and never seeing how it all connected, so you built one
> calm daily check-in that does.]
>
> What Fikko does today:
> • Logs water, meals, activity, sleep, mood and medications in one place
> • Voice check-ins: say what you did and it fills in your habits
> • An AI coach that answers from your own logs (a wellness coach, not a doctor)
> • A plant that grows every day you complete your habits
>
> We're launching free for everyone. The first 100 people to sign up and finish setup become
> founding members, with Premium free for a full year once paid plans arrive.
>
> If you try it, I'd love your honest feedback, especially what's missing.
> www.fikko.io
>
> Built by a small team at PipePiper in Seoul, for people in Australia, Singapore and beyond.

### Reddit (only where self-promotion is allowed)

Most subreddits ban promotional posts. Read each one's rules first; look for a weekly
"share your project" thread (r/SideProject, r/InternetIsBeautiful and similar). Lead with
what you built and ask for feedback rather than selling.

**Title:** I built a habit tracker that fits water, meals, sleep and mood into one daily check-in. Looking for honest feedback.

**Body:**
> Hi all. I've been building Fikko for [how long] and it went live this week.
>
> The idea: one check-in a day instead of five apps. You log water, meals, activity, sleep, mood
> and supplements, or just say it out loud and it fills them in. There's an AI coach that answers
> from your own logs, and a small plant that grows on the days you complete everything.
>
> It's free while we launch (the first 100 people who finish setup also get Premium free for a
> year when paid plans start). It runs in the browser and you can add it to your home screen.
>
> What would make you actually stick with a habit tracker? And what's the first thing that
> annoys you when you try it?
>
> www.fikko.io

---

## 5. Places-left updates

Post these as places fill. The live number is on www.fikko.io in the pricing section.

| When | Instagram story / X / Threads |
|---|---|
| 50 left | Halfway there: 50 founding places left. Sign up and finish setup to get Premium free for a year. |
| 20 left | 20 founding places left. Once they're gone, they're gone. |
| 5 left | Last 5 founding places. 🌱 |
| All taken | All 100 founding places are taken. Thank you, founding members! Fikko is still free for everyone while we launch. |

---

## Decisions for you

1. **Who signs the emails?** I've used [Your name]. The Terms name Seok Hwan Lee as owner of PipePiper.
2. **Is there a waitlist?** If not, section 2 goes to friends, family and anyone who's asked about Fikko.
3. **Emoji:** I've kept to one (🌱, the Fikko sprout). Remove it if you'd rather not use any.
4. **Hashtags:** five on Instagram, none elsewhere. Adjust for your audience.
