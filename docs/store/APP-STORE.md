# App Store submission — what goes where

Everything an App Store Connect record needs, in the order the form asks
for it, plus the exact sequence to run once the owner-side keys exist. The
code side is done (ROADMAP "App Store readiness", 2026-09-16); this file is
the owner's checklist. Android is parked — see the ROADMAP.

## 0. Prerequisites the owner holds

| What                                    | Where it comes from                                             | Status (2026-09-16)       |
| --------------------------------------- | --------------------------------------------------------------- | ------------------------- |
| Apple Developer Program membership      | developer.apple.com, 99 $/yıl, Individual                        | not yet — the one gate    |
| App ID `com.oguzpancuk.pati`            | Certificates, Identifiers & Profiles → Identifiers → App IDs     | after enrollment          |
| Sign in with Apple on that App ID       | the App ID's capability list                                    | after enrollment          |
| Services ID for web sign-in             | same page → Services IDs (e.g. `com.pati-app.web`)              | after enrollment          |
| Google iOS OAuth client                 | already made: `223239218396-o34…` (Info.plist + googleClientId.ts) | done                   |
| Google web OAuth client                 | Google Cloud → Credentials                                      | done (web sign-ins on Sep 4) |
| Fly secrets for Apple                   | `fly secrets set` (docs/DEPLOYMENT.md → "Apple / Google sign-in")| after the ids exist       |
| Resend DNS for `pati-app.com`           | the DKIM/SPF records Resend lists                               | **confirm** — without it registration mail does not arrive |
| A reviewer account (section 5)          | the owner registers it                                          | after Resend works        |

## 1. App Store Connect → New App

- Platform: iOS. Name: **pati**. Primary language: Turkish (tr).
- Bundle ID: `com.oguzpancuk.pati` (appears once the App ID exists).
- SKU: `pati-ios`. User access: Full.

## 2. App Information

- Subtitle (30): `Sokak hayvanlarına birlikte bakalım`
- Category: primary **Lifestyle**, secondary **Social Networking**.
- Content rights: does not contain third-party content (the basemap is
  OpenFreeMap/OpenStreetMap under ODbL, credited inside the app).
- Age rating questionnaire: none of the mature categories; **user-generated
  content: yes** (comments, photos, messages) with reporting, blocking, and
  moderation in place; unrestricted web access: no; contests, gambling: no.
  Expected rating: 4+ (the questionnaire may land on 12+ because of UGC —
  accept whatever it computes).
- Privacy Policy URL: `https://pati-app.com/gizlilik`
- License agreement: Apple's standard EULA.

## 3. Version information (1.0)

**Promotional text (170):**
`Mahallendeki kedilere ve köpeklere mama bırak, onları kaydet, sağlık
geçmişini tut. Bakım veren komşularınla birlikte rozet kazan.`

**Description (4000):**

```
pati, sokak hayvanlarına bakan insanları bir araya getirir.

• Haritada mama ve su noktaları: nereye ne zaman bırakıldığını gör, boşalan
  yerleri fark et, kendi bıraktığını fotoğrafla kaydet.
• Hayvan profilleri: mahallendeki kedi ve köpekleri fotoğrafla tanıt; tür,
  renk, belirgin özellikler ve konumla kaydet. Aynı hayvanı ikinci kez
  eklemeden önce pati benzerlerini gösterir.
• Sağlık ve aşı kayıtları: bakım verenler tedavi, kısırlaştırma ve aşı
  geçmişini birlikte tutar.
• Bakım verenler: bir hayvana bakım vermeye başla, diğer bakıcılarla o
  hayvanın sohbetinde konuş.
• Rozetler ve liderlik tablosu: mama, su, kayıt ve takip için basamaklı
  rozetler; mahallenin en çok bakım verenleri.
• Arkadaşlar ve mesajlar: bakım verdiğin komşularla birebir ve grup sohbeti.

Fotoğraflar yapay zekâ ile kontrol edilir: mama/su fotoğrafında gerçekten
mama ya da su, hayvan fotoğrafında seçilen tür görünmeli.

pati ücretsizdir. Kişisel verilerin KVKK'ya uygun olarak işlenir; hesabını
istediğin an uygulama içinden silebilirsin.
```

- Keywords (100): `sokak hayvanı,kedi,köpek,mama,besleme,hayvan,mahalle,bakım,gönüllü,patili`
- Support URL: `https://pati-app.com` · Marketing URL: `https://pati-app.com`
- Copyright: `2026 Oğuz Pançuk`
- Version: 1.0 · Build: whatever Xcode uploads (`CURRENT_PROJECT_VERSION`,
  bump it for every upload).

**Screenshots** — 6.9" (1320 × 2868) from the iPhone 17 Pro Max simulator,
in `docs/store/screenshots/`: the map over a neighbourhood in use, the
nearest-first animals list, an animal profile, a carers' conversation, and
your own profile with badges. No iPad set: `TARGETED_DEVICE_FAMILY = 1`.

> **Retake 03 before submitting.** They are shot against the local showcase
> database, which has no real animal photographs — every uploaded photo in
> it is a generated solid-colour fixture, so the profile's photo strip is
> three coloured squares. Guideline 2.3.3 asks that screenshots show the app
> in use, and a reviewer reads those squares as a broken image. Take this
> one again from a real device or a production account once there are real
> photos; the other four carry no photographs and are fine as they are.
> Everything else in the set was already made presentable: the map sits on
> a spot that actually has food and water (its sheet reads "Bu bölgede mama
> ve su var" rather than contradicting the rings behind it), the account is
> `elif.kaya@example.com` with chosen badges rather than a check-suite
> address with none, and the showcase "demo" chips were cleared from the
> rows these five frames show.

## 4. App Privacy (the questionnaire)

"Yes, we collect data." Everything below is **linked to the user**, **not
used for tracking**, purpose **App Functionality** only. The same list is
in `mobile/ios/PatiMobile/PrivacyInfo.xcprivacy`.

| Category      | Data type                | Why                                              |
| ------------- | ------------------------ | ------------------------------------------------ |
| Contact Info  | Email Address, Name      | the account                                       |
| Identifiers   | User ID                  | the account                                       |
| Location      | Precise Location         | drops are recorded where you stand; nearby lists  |
| User Content  | Photos or Videos         | care photos, animal photos, avatar                |
| User Content  | Other User Content       | comments, messages, health records                |

Not collected: contacts, health, financial, browsing/search history,
purchases, diagnostics, usage data (no analytics SDK, no crash reporter),
advertising data (the in-app "reklam" slots are the app's own promotions,
impressions counted per user for the app's function, no third party).

Third-party SDKs that process data: Google Sign-In (only when the user
picks it), Apple's own sign-in, the photo AI (Gemini) receives the photo
being checked and nothing else. No data broker, no ads network.

## 5. App Review information

- Sign-in required: **yes**. Give a reviewer account (below).
- Contact: Oğuz Pançuk, iletisim@pati-app.com, a phone number.
- **Notes to the reviewer** (paste as is):

```
pati is a community app for people who feed and care for street cats and
dogs in Türkiye. The content is Turkish.

Demo account: <e-mail> / <password> (already verified — no code is asked).

Where the content is: the demo neighbourhoods are in Türkiye. From
outside the country the map shows nothing nearby; open the "hayvanlar"
tab, which lists animals nearest-first over the whole database, or set a
location such as Kadıköy, Istanbul (40.9905, 29.0277) to see the map with
food/water rings. Tap any animal to see its profile, records and chat.

Photo checks: "Mama bıraktım" / "Su bıraktım" and "Yeni hayvan ekle" ask
for a camera photo, and a vision model checks that it shows food/water or
a cat/dog. A photo of an empty desk is refused with a Turkish reason —
that is intended. A bowl with any food in it, or a photo of a cat or dog,
passes.

Sign in with Apple and Google are offered next to the e-mail form.
Account deletion: profilim → ⚙ Ayarlar → "hesabımı sil". Reporting: the
flag on every animal profile and comment, "şikayet et" in the ⋯ menu of a
user's profile. Blocking: the same ⋯ menu → "engelle"; the list is under
Ayarlar → engellediklerim.
```

**Making the reviewer account** (production write — the owner's):

1. Register on https://pati-app.com with an address you can read (a
   `+review` alias of the owner's mailbox is fine), type the code from
   the mail. This is what proves Resend DNS is done.
2. Give it a plain name ("Deneme Hesabı") and leave it verified. Do not
   put anything on it that should survive — App Review deletes and
   re-creates things while testing.
3. If the mail does not arrive, the flag can be cleared by hand on
   production (`fly ssh console` → `psql`):
   `UPDATE users SET email_verification_pending = false WHERE email = '<address>';`

## 6. The "keys are in" sequence — run in this order

1. **Apple Developer** (once enrolled): App ID for `com.oguzpancuk.pati`
   with Sign in with Apple, enabled **as a primary App ID**. The
   server-to-server notification endpoint on that screen is optional and is
   deliberately left blank — pati implements no such endpoint, and giving
   Apple an address for one would look like we listen when we do not.

   **Done 2026-09-16**, along with the web half: Services ID
   **`com.pati-app.web`** (description `pati-web`), Sign in with Apple
   enabled, primary App ID `com.oguzpancuk.pati`, with `pati-app.com` and
   the return URL `https://pati-app.com/giris` registered under Website
   URLs. Team `5J62WM72AV`.

   **No domain association file was needed**, whatever the guides say — the
   console offered no download and the configuration works regardless. The
   `.well-known` folder is kept for whatever asks next; its README carries
   the one-request probe that proves an Apple configuration without
   touching production.

   The iOS submission would not have needed the Services ID at all:
   guideline 4.8 is about the app offering Apple sign-in beside Google, and
   the App ID alone does that. The Services ID is purely the web client's
   button.
2. **Fly secrets — done 2026-09-16**, in two steps, and both took effect on
   a machine restart with no code deploy:

   ```bash
   fly secrets set --app pati-app \
     APPLE_CLIENT_IDS="com.oguzpancuk.pati,com.pati-app.web" \
     APPLE_SERVICE_ID="com.pati-app.web" \
     APPLE_WEB_REDIRECT_URI="https://pati-app.com/giris"
   ```

   `APPLE_CLIENT_IDS` must carry **both**: a token's `aud` is the bundle id
   when iOS produced it and the Services ID when the web did, and the
   backend accepts only what is in that list. Dropping the bundle id breaks
   iOS sign-in instantly.

   Each client then draws only what it is told about, which is why the
   iOS-only first step was safe: with `APPLE_SERVICE_ID` unset the web kept
   hiding its Apple button rather than showing a half-configured one.
3. **Xcode** — open `mobile/ios/PatiMobile.xcworkspace`, target PatiMobile
   → Signing & Capabilities: tick "Automatically manage signing", pick
   the Team. Sign in with Apple is already listed (the entitlement file);
   Xcode registers the capability on the App ID if it is missing.
4. **Build numbers** — `MARKETING_VERSION` stays 1.0;
   `CURRENT_PROJECT_VERSION` goes up by one for every upload (both are
   build settings, edit them in Xcode or in `project.pbxproj`).
5. **Archive** — Product → Destination → Any iOS Device (arm64), Product →
   Archive, Distribute App → App Store Connect → Upload. Or from the
   terminal:

   ```bash
   cd mobile/ios && xcodebuild -workspace PatiMobile.xcworkspace -scheme PatiMobile -configuration Release -destination 'generic/platform=iOS' -archivePath build/PatiMobile.xcarchive archive
   ```

   then `xcodebuild -exportArchive` with an `ExportOptions.plist`
   (`method: app-store-connect`), or open the archive in Organizer.
6. **TestFlight** — install on the owner's own iPhone first. This is the
   first time the app runs on a real device and in Release: check the
   camera flow, both sign-ins end to end, a food drop, an animal
   registration, account deletion.
7. **App Store Connect** — sections 1–5 above, attach the build, submit.
   Expect one round of questions from review; the notes in section 5 are
   written to pre-empt the two likely ones (empty map outside Türkiye,
   refused photos).

## 7. Known gaps at submission (decided, not forgotten)

- No crash reporting. The first crash on a real device is invisible until
  a TestFlight tester writes in. Owner's call (ROADMAP).
- Push notifications are local only (care-alert timers); no APNs, so no
  `aps-environment` entitlement is needed.
- Android: not built, not signed for release, background-location
  permission still declared — its own wave.
