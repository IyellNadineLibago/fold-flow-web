# FoldFlow – staff dashboard (Angular + Firebase)

Web dashboard for the laundry shop: new orders and digital tickets, status
tracking, reservations from the customer app, claiming and payment, daily
reports, and the price-per-kilo setting. Staff sign in with email and password.

Everything is live: it reads and writes Cloud Firestore, the same database the
customer app uses. See **SETUP.md** for Firebase setup, staff accounts and
deployment.

```bash
npm install
npm install firebase
npm start
```

- `src/app/services/data.service.ts` – all Firestore reads and writes.
- `src/app/services/auth.service.ts` – staff sign-in (`staff/{uid}` check).
- `src/app/services/models.ts` – status codes/labels shared with the app.
- `firestore.rules` – who can read and write what.
