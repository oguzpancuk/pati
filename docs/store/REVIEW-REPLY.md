# Guideline 2.1 — Information Needed (first submission, 2026-09-17)

App Review asked six things of a new developer account. Item 1 is a screen
recording the owner captures on a physical device; items 2-6 are below,
written to be pasted into Resolution Center **and** into the App Review
Information → Notes field, which is what the letter asks for.

Everything here was checked against the code and against production secrets
on 2026-09-17, not written from memory.

**The Reply box caps at 4000 characters**, and the long version below
overran it by 2315. Leave room for the credentials: the two placeholders in
item 3 are shorter than a real e-mail and password, and the corrected text is
3956 characters, so 44 remain — measure with a character count, not
`wc -m`, which counts the bytes of ©, ü and — as several each. The compressed version that actually went in is first;
the long one is kept under it because the Notes field, the next submission
and any follow-up question are all easier to answer from it.

---

## The reply, corrected (3956 characters; the box caps at 4000)

> **The version actually sent on 2026-09-17 contained one false sentence**:
> "The in-app promotional slots show only our own content." They are a
> first-party ad **server** — a banner is our row in our database, but it is
> sold to a third party, labelled "reklam", and opens their external URL. The
> project's own NOTES had already ruled that the store description must not
> claim "reklam içermez", and the App Privacy answers declare Advertising
> Data; the reply contradicted both. Corrected below. Use this version for
> the Notes field and for any future submission.

```
1. SCREEN RECORDING
Attached. One take on a physical iPhone, from a cold launch. Against your list:
- Registration: e-mail + the 6-digit code.
- Login: sign-out, then sign back in.
- Account deletion: profilim > Ayarlar > "Hesabimi sil", with the password.
- User-generated content: water left at the current location with a camera photo, becoming a public record on the map; animal profiles with photos and comments.
- Content reporting: a comment reported with a reason.
- Blocking a user: blocked from their profile, then unblocked in Ayarlar > engellediklerim.
- Paid content: none in the app.

2. PURPOSE AND AUDIENCE
pati is a free community app for people in Türkiye who feed street cats and dogs. That care is uncoordinated: neighbours feed the same animal while the next street goes without, and nobody knows if one was vaccinated or treated. pati gives a shared map of where food and water were left and when, a profile per animal with photos and health records kept by its carers, and messaging. Audience: residents who feed street animals, and small volunteer groups. Not a veterinary tool.

3. SETUP AND ACCESS
Demo account (verified, no code needed): <E-POSTA> / <SIFRE>
Turkish interface only. Apple and Google sign-in sit beside the e-mail form.
Content is location-based, so far from data the map looks empty — correct, not a failure. Open the "hayvanlar" tab, which lists animals nearest-first at any distance, or set the device location to Kadikoy, Istanbul (40.9905, 29.0277).
Where things are: harita = map; "Ekle" = add food/water/animal; hayvanlar = animal list; mesajlar = messages; profilim = settings.
Reporting: flag in an animal profile header, "sikayet et" under any comment and in a user profile's ... menu.
Blocking: ... menu on a user profile > "engelle". Blocked list: profilim > Ayarlar > engellediklerim.
Account deletion: profilim > Ayarlar > "Hesabimi sil".
Writing a comment or health record requires being one of that animal's carers — you become one via "bakim ver" on its profile, which asks for a photo of it. A non-carer sees the comments but no composer, by design: an animal's records stay with the people who look after it. Registering an animal (Ekle > Yeni hayvan) makes you its carer at once, the quickest route to the composer.
Note: leaving food/water and registering an animal require a camera photo, checked by a vision model. A photo not showing food, water or the chosen species is refused with a Turkish reason — intended anti-abuse behaviour, not a bug. A bowl with food, or a cat or dog, passes.

4. EXTERNAL SERVICES
- Fly.io (Frankfurt): hosts our backend and PostgreSQL/PostGIS database.
- Sign in with Apple, Google Sign-In: optional sign-in.
- Resend: transactional e-mail only (verification code, password reset).
- Google Gemini: vision check on one photo — food/water, the claimed species, and where the animal's face is. Not used for training.
- Cloudflare R2 (EU): photo storage.
- OpenFreeMap: map tiles, rendered on-device with MapLibre.
No payment processor, no third-party ad network or SDK, no analytics or attribution SDK, no crash reporter. Any promotional banner is served from our own backend, labelled "reklam", and links to the advertiser's own site.

5. REGIONAL DIFFERENCES
None. Nothing is gated by country and there are no purchases. Only what each user sees nearby varies, because the map and list are distance-based. Turkish interface only; availability currently Türkiye.

6. REGULATED INDUSTRY / THIRD-PARTY MATERIAL
Not regulated. No veterinary advice, diagnosis or treatment: health records are notes carers write about an animal, shown back without interpretation. No payments, donations or fundraising.
Third-party material: map data © OpenStreetMap contributors under ODbL via OpenFreeMap, credited in-app under profilim > Ayarlar. Typefaces Quicksand and Nunito under the SIL Open Font License. Other artwork was made for this app; animal photos come from users.
```

---

## The long version (reference — too long for the Reply box)

**1. Screen recording**

Attached. It is captured on an iPhone running the current iOS and begins
with a cold launch of the app. It shows, in order: registration with an
e-mail address and the 6-digit code, sign-out and sign-in, the map and the
"hayvanlar" list, adding water at the current location with a camera photo,
opening an animal profile with its photos and health records, writing a
comment (user-generated content), reporting a comment and reporting a user,
blocking a user from their profile and the list of blocked users in
settings, unblocking, and finally deleting the account from settings.

**2. Purpose and target audience**

pati is a free community app for people in Türkiye who feed and look after
street cats and dogs.

Türkiye has a large free-roaming street animal population that is cared for
informally by neighbours. That care is uncoordinated: several people feed
the same animal on the same day while the next street goes without, nobody
knows whether an animal has already been vaccinated or treated, and when a
sick animal changes hands its history is lost.

pati gives those neighbours three things. A shared map of where food and
water were actually left and when, so an empty area is visible. A profile
per animal — photos, breed and markings, vaccination and health records
kept by the people who actually care for it. And a way for those people to
reach each other about a specific animal.

The audience is ordinary residents who already feed street animals, plus
volunteers and small neighbourhood groups. It is not a veterinary tool and
not a marketplace.

**3. Setting up and accessing the main features**

Demo account, already verified so no e-mail code is requested:
`<E-POSTA>` / `<ŞİFRE>`

The interface is Turkish only. Sign in with Apple and Google are offered
beside the e-mail form; either creates an account without a code.

*Content is location-based.* On a device far from existing data the map will
look empty — that is correct behaviour, not a failure. Two ways to reach
content:

- open the **hayvanlar** tab, which lists animals nearest-first across the
  whole database regardless of distance, and tap any of them; or
- set the device location to Kadıköy, Istanbul (40.9905, 29.0277), where the
  sample neighbourhood is, and the map fills with food and water markers.

Where the features are:

| Feature | Where |
| --- | --- |
| Map of food/water points | **harita** tab |
| Leave food or water, or register an animal | the **Ekle** button on the map |
| Animal list, nearest first | **hayvanlar** tab |
| Animal profile: photos, carers, health and vaccination records, chat | tap any animal |
| Direct and group messages | **mesajlar** tab |
| Badges, level, leaderboard, own records | **profilim** tab |
| Settings, blocked users, account deletion | **profilim** → gear icon |

*Reporting (user-generated content):* the flag button in the header of every
animal profile; "şikayet et" under every comment; "şikayet et" in the ⋯ menu
of any user's profile; and a report action on individual messages.

*Blocking:* the ⋯ menu on any user's profile → "engelle". The blocked list
and the way to undo it are in **profilim → Ayarlar → engellediklerim**.

*Account deletion:* **profilim → Ayarlar → "Hesabımı sil"**. It asks for the
password again (or a fresh sign-in for Apple/Google accounts).

*One deliberate behaviour worth knowing before testing:* leaving food or
water, and registering an animal, require a photo taken with the camera in
that moment, and the photo is checked (see item 4). A photo that does not
show food, water or the animal species claimed is **refused** with a Turkish
explanation. That is the intended anti-abuse behaviour, not a bug. A bowl
with any food in it, or a photo of a cat or a dog, passes.

**4. External services used to deliver core functionality**

| Service | What it does | Data it receives |
| --- | --- | --- |
| Fly.io (Frankfurt) | hosts our own backend and its PostgreSQL/PostGIS database | all app data |
| Sign in with Apple | optional sign-in | the identity token Apple issues |
| Google Sign-In | optional sign-in | the identity token Google issues |
| Resend | transactional e-mail only: the 6-digit verification code and password reset | the recipient address and the code |
| Google Gemini | vision checks on photos: whether a care photo shows food or water, whether an animal photo shows the species claimed, and where the animal's face is so a thumbnail can be cropped | the single photo being checked |
| Cloudflare R2 (EU) | object storage for uploaded photos | the photos |
| OpenFreeMap | map tiles, rendered on the device with MapLibre | the tile coordinates being viewed |

Photos sent to Gemini are sent for that one check and are not used to train
any model. There is **no** payment processor, **no** third-party advertising
network or SDK, **no** analytics or attribution SDK, and **no** crash
reporting service in the app. The promotional slots are our own ad server: a
banner is a row in our database, served from our own backend, labelled
"reklam" on both clients, and it links to the advertiser's own website. No
third party chooses, targets or delivers it.

**5. Regional differences**

There are none. The app behaves identically in every region: no feature is
gated by country, no content differs by storefront, and there is no
region-specific pricing because the app is free and contains no purchases.

The only thing that varies is what each user sees near them, because the map
and the "nearest first" list are distance-based — in an area where nobody has
used the app yet, the map is empty and the list shows the nearest animals
however far away they are. The interface is Turkish only, and availability is
currently limited to Türkiye.

**6. Regulated industry or protected third-party material**

The app is not in a regulated industry and needs no licence.

It does not provide veterinary advice, diagnosis or treatment. The health and
vaccination records are plain notes that carers write about an animal they
look after, shown back without interpretation or recommendation; the app
never suggests a medicine, a dose or a course of action. No medicine or
service is sold. There are no payments, donations or fundraising of any kind
in the app.

Third-party material and its licences:

- Map data © OpenStreetMap contributors, under the Open Database License
  (ODbL), served as tiles by OpenFreeMap. The credit is shown inside the app
  under **profilim → Ayarlar**.
- Typefaces Quicksand and Nunito, under the SIL Open Font License.
- Everything else — icons, badge artwork, avatar illustrations, the app icon
  — was produced for this app.
- Animal photographs are taken by users with the camera inside the app.

---

## The recording (item 1) — shot list

On a physical iPhone, one take, screen recording on. Roughly four minutes.
Start from the home screen so the launch is visible.

1. **Launch** the app from the home screen, cold.
2. **Register**: "Kayıt ol", a fresh e-mail, a password; show the 6-digit
   code screen, then the code arriving and being entered.
3. **Sign out** (profilim → Ayarlar → çıkış yap) and **sign in** again with
   the demo account, so both flows are on record.
4. **Map**: show the harita tab. If nothing is nearby, say so on screen or
   move to the hayvanlar tab — the recording should not look like an empty
   app.
5. **Leave water**: Ekle → "Su bıraktım" → take a photo of a water bowl →
   show the AI check screen → confirmation.
6. **Animal profile**: open one from hayvanlar. Scroll through photos,
   carers, health records, the map of the last sighting.
7. **User-generated content**: write a comment on that animal and send it.
8. **Report**: "şikayet et" under your own comment, choose a reason, send.
   Then open a *user's* profile → ⋯ → "Şikayet et".
9. **Block**: on that same user's profile → ⋯ → "Engelle" → confirm. Show
   the button turning into "Engellendi".
10. **Blocked list**: profilim → Ayarlar → engellediklerim → "engeli kaldır".
11. **Account deletion**: profilim → Ayarlar → "Hesabımı sil" → confirm with
    the password. Use the account registered in step 2, not the demo
    account the reviewer needs.

Apple asks specifically for registration, login, account deletion,
user-generated content, and the reporting and blocking mechanisms. Steps 2,
3, 7, 8, 9 and 11 are those; the rest is the typical flow they also ask for.

---

## Second round — reply to the rejection of 1.0 (2), for build 1.0 (3)

Apple rejected 1.0 (2) on 2026-09-18 (review device: iPad Air 11-inch (M3),
iPadOS 27) under **Guideline 4 – Design** ("we were unable to scroll down")
and **Guideline 5.1.1(v)** ("does not include an option to initiate account
deletion"). Cause and fixes: `docs/NOTES.md`, 2026-09-19 and 2026-09-21.

Send only after the screen recording has been re-shot **on a physical iPhone
with build 3** — the old recording shows the old control.

What these texts claim was chosen to match what was observed, after review
caught the first draft claiming more (2026-09-21): the checks ran in the
**iPad simulator** (iPad Air 11-inch (M4), iOS 26.5, iPhone compatibility
mode) on a **Debug build of build 3's source**, not on build 3 itself and not
on a device; and the dialogs' buttons are said to stay **reachable** with the
keyboard up — in a short window the card shrinks and its body scrolls — not
"above the keyboard", which holds on a tall iPhone but was never seen in the
667 pt window for the shared `DialogBody` (no simulator run here managed to
raise the software keyboard over it). The deletion walk itself was repeated on
HEAD after the delete dialog moved onto `DialogBody`, so the dialog build 3
ships is the one that was walked.

**One check is still open, and a physical iPhone cannot make it** — its screen
is taller than the reviewer's window. Before sending, in the "pati iPad
review" simulator: I/O → Keyboard → untick "Connect Hardware Keyboard"
(⇧⌘K — not ⌘K, which is "Toggle Software Keyboard" and does nothing until a
field has focus), open profilim → ⚙ → "Hesabımı sil", tap "Şifren", and
confirm that "Hesabımı kalıcı olarak sil" can be reached with the keyboard up
(scrolling the dialog if needed); then the same for "Şikayet et" → the note
field, on a profile and on a message in a conversation — all three dialogs
share `DialogBody`. **The software keyboard must actually be on screen when
you judge this**: no keyboard covering anything is not a pass, it is the check
not having run. That is exactly what Apple's reviewer will do when typing the
password. If a button cannot be reached, fix it before sending.

### 1. Resolution Center reply (attach the recording)

```
Hello,

Thank you for the detailed report. Both issues had a single cause, and build 1.0 (3) fixes it.

Guideline 4 - Design
pati is an iPhone-only app, so on iPad it runs in iPhone compatibility mode, in a shorter window than any iPhone we had tested on. We reproduced that window in the iPad simulator (iPad Air 11-inch) and found screens that could not be scrolled in it, most importantly:
- the sign-in screen: its content was taller than the window and did not scroll, so "Kayıt ol" (register) could not be reached;
- the settings sheet (profile tab > gear icon): it did not respond to scrolling.
These scroll now, as does the e-mail verification screen, which had the same layout. We also reworked the confirmation dialogs (account deletion, reporting) so that in a short window, with the keyboard up, the dialog moves above the keyboard and its content scrolls, keeping its buttons reachable.

Guideline 5.1.1(v) - Account deletion
Account deletion has been in the app since the first submission, but it sat at the bottom of that settings sheet, which could not be scrolled in your environment, so it was unreachable. It was also styled as a small text link. In build 3 it is a full-width red button labelled "Hesabımı sil" (Delete my account), directly under the change-password form:

profilim (profile tab) > gear icon (Ayarlar) > "Hesabımı sil" > enter your password > "Hesabımı kalıcı olarak sil"

Deletion happens in the app, immediately and permanently: the name, e-mail address, avatar, password and any Apple/Google sign-in link are erased, along with friendships, blocks, the badge history and device tokens. What the person contributed to the shared record — animal and care records, photos, comments and messages — stays under the name "Silinmiş Üye" (Deleted Member) and can no longer be linked to them. Accounts that have no password (created with Apple or Google) confirm by signing in with that provider once more instead. No website, e-mail or phone call is involved.

The attached screen recording was captured on a physical iPhone and shows signing in, navigating to the deletion option, and the complete flow through to the sign-in screen. It uses a separate test account so the demo account in App Review Information stays usable for you.
```

### 2. App Review Information → Notes

Replace the account-deletion line of the existing notes with this, and attach
the same recording there too (Apple asks for it "for future submissions"):

```
Account deletion: profilim (profile tab) > gear icon (Ayarlar) > red "Hesabımı sil" button > enter the password (an account that has no password, created with Apple or Google, confirms with that provider instead) > "Hesabımı kalıcı olarak sil". Completed entirely in the app. A screen recording of the full flow on a physical iPhone is attached. Please use a newly registered account rather than the demo account to try it, since deletion is permanent.

iPad: pati is an iPhone-only app and runs on iPad in compatibility mode. The changes in build 3 were checked in that mode in the iPad simulator (iPad Air 11-inch): the sign-in screen and the settings sheet scroll, and account deletion completes through to the sign-in screen.
```

### 3. The whole Notes field, consolidated — use this instead of section 2 when space runs out

The Notes field holds 4000 characters and the 2.1 reply pasted there on
2026-09-17 already used 3956, so section 2 above cannot simply be added
(owner, 2026-09-21: "yoksa yer kalmıyor"). Do not delete the old text
wholesale: its "SETUP AND ACCESS" part is what every review pass needs. What
goes is its "1. SCREEN RECORDING", which describes the old recording and the
old label; the one-time 2.1 answers (purpose, services, regional, regulated)
are kept but compressed — the full versions remain in the Resolution Center
thread. 3403 characters, ASCII only like the text it replaces, leaving room for
the real demo credentials. Replace the ENTIRE field with:

```
1. ACCOUNT DELETION (5.1.1(v)) - SCREEN RECORDING ATTACHED
Path: profilim (profile tab) > gear icon (Ayarlar) > red "Hesabimi sil" button > enter the password > "Hesabimi kalici olarak sil". Completed entirely in the app; an account that has no password (created with Apple or Google) confirms with that provider instead. The recording is from a physical iPhone running build 3 and shows sign-in, navigation and the full flow through to the sign-in screen, with a separate test account. Please try deletion with a newly registered account, not the demo account: it is permanent.

2. IPAD (guideline 4)
pati is an iPhone-only app and runs on iPad in compatibility mode. The changes in build 3 were checked in that mode in the iPad simulator (iPad Air 11-inch): the sign-in screen and the settings sheet scroll, and account deletion completes through to the sign-in screen.

3. SETUP AND ACCESS
Demo account (verified, no code needed): <E-POSTA> / <SIFRE>
Turkish interface only. Apple and Google sign-in sit beside the e-mail form.
Content is location-based, so far from data the map looks empty - correct, not a failure. Open the "hayvanlar" tab, which lists animals nearest-first at any distance, or set the device location to Kadikoy, Istanbul (40.9905, 29.0277).
Where things are: harita = map; "Ekle" = add food/water/animal; hayvanlar = animal list; mesajlar = messages; profilim = profile and settings.
Reporting: flag in an animal profile header, "sikayet et" under any comment and in a user profile's ... menu.
Blocking: ... menu on a user profile > "engelle". Blocked list: profilim > Ayarlar > engellediklerim.
Writing a comment or health record requires being one of that animal's carers - you become one via "bakim ver" on its profile, which asks for a photo of it. A non-carer sees the comments but no composer, by design. Registering an animal (Ekle > Yeni hayvan) makes you its carer at once, the quickest route to the composer.
Leaving food/water and registering an animal require a camera photo, checked by a vision model. A photo not showing food, water or the chosen species is refused with a Turkish reason - intended anti-abuse behaviour, not a bug. A bowl with food, or a cat or dog, passes.

4. PURPOSE AND AUDIENCE
A free community app for people in Turkiye who feed street cats and dogs: a shared map of where food and water were left and when, a profile per animal with photos and health records kept by its carers, and messaging. Not a veterinary tool; no advice, diagnosis or treatment.

5. EXTERNAL SERVICES
Fly.io (Frankfurt) backend and PostgreSQL; Sign in with Apple and Google Sign-In (optional); Resend (verification and password-reset e-mail only); Google Gemini (vision check on one photo, not used for training); Cloudflare R2 (EU) photo storage; OpenFreeMap tiles rendered on-device with MapLibre. No payment processor, no third-party ad network or SDK, no analytics or crash-reporting SDK. Any promotional banner is served from our own backend, labelled "reklam", and links to the advertiser's own site.

6. REGIONAL / REGULATED / THIRD-PARTY
Nothing is gated by country; no purchases, payments, donations or fundraising. Not a regulated industry. Map data (c) OpenStreetMap contributors (ODbL) via OpenFreeMap, credited in-app under profilim > Ayarlar. Typefaces Quicksand and Nunito (SIL OFL). Other artwork was made for this app; animal photos come from users.
```
