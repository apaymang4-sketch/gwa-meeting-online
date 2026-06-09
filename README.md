# GWA Meeting Online

MVP teleconference berbasis React, Firebase, dan Jitsi Meet Embed.

## Fitur

- Login dan register user dengan Firebase Authentication Email/Password
- Buat room meeting
- Join room pakai kode atau link undangan
- Video dan audio via Jitsi Meet
- Mute/unmute mic
- On/off kamera
- Share screen
- Chat sederhana per room via Firestore
- Keluar room dan logout

## Setup

1. Install dependency:

   ```bash
   npm install
   ```

2. Buat project di Firebase Console.

3. Aktifkan Authentication dengan provider Email/Password.

4. Aktifkan Cloud Firestore.

5. Salin `.env.example` menjadi `.env`, lalu isi config Firebase Web App.

6. Jalankan aplikasi:

   ```bash
   npm run dev
   ```

## Firestore Collections

- `rooms`
  - `code`
  - `name`
  - `hostUid`
  - `hostName`
  - `createdAt`

- `rooms/{roomId}/messages`
  - `text`
  - `uid`
  - `displayName`
  - `createdAt`

## Contoh Firestore Rules

Rules ini cukup untuk MVP internal: hanya user login yang bisa membaca/membuat room dan chat.

```txt
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /rooms/{roomId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null
        && request.resource.data.hostUid == request.auth.uid
        && request.resource.data.code is string
        && request.resource.data.name is string;
      allow update, delete: if false;

      match /messages/{messageId} {
        allow read: if request.auth != null;
        allow create: if request.auth != null
          && request.resource.data.uid == request.auth.uid
          && request.resource.data.text is string
          && request.resource.data.text.size() > 0
          && request.resource.data.text.size() <= 1000;
        allow update, delete: if false;
      }
    }
  }
}
```

## Catatan

Jitsi memakai domain publik `meet.jit.si`. Untuk produksi serius, pertimbangkan Jitsi self-hosted atau JaaS agar nama room, akses peserta, dan branding lebih terkontrol.
