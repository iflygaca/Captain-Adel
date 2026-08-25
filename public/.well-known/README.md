# `.well-known/` — Apple Pay domain association

Apple Pay (offered by the Moyasar checkout widget, `methods: [... 'applepay' ...]`)
requires this domain to host Apple's **domain-association file** so Apple can
verify that `captadel.com` is authorised to present the Apple Pay sheet.

> [!NOTE]
> **The file is already here** — `apple-developer-merchantid-domain-association` (9,122 bytes) is
> committed. The steps below are for re-provisioning it (a new domain, or a merchant re-issue),
> not first-time setup.

## What to place here

1. In the **Moyasar dashboard** → Apple Pay, register the production domain
   (`captadel.com`). Moyasar provisions the merchant with Apple and gives you the
   verification file.
2. Download that file — it is named exactly, with **no extension**:

   ```
   apple-developer-merchantid-domain-association
   ```

3. Drop it in this directory (`public/.well-known/`) and deploy. It is **not a
   secret** — it is a public verification token tied to the domain — so it is
   fine to commit.

## How it is served

`src/server.js` mounts `public/.well-known/` with `dotfiles: 'allow'` (the
default static handler skips dotfile directories) and returns the extensionless
file as `text/plain`. After deploy, verify:

```
curl -i https://captadel.com/.well-known/apple-developer-merchantid-domain-association
# → 200, Content-Type: text/plain, body == the file Moyasar gave you
```

Then complete Apple Pay verification from the Moyasar dashboard and test a live
Apple Pay payment in Safari (iOS/macOS). Until the file is present the URL 404s
and Apple Pay validation fails — everything else (card, STC Pay) still works.
