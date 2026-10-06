# The Sheema Edit Community — Firebase Spark setup

This Community is intentionally designed to work on Firebase's no-cost Spark plan with no billing account attached.

## Keep it hard-$0

- Keep the Firebase project on **Spark**.
- Do **not** link a Google Cloud billing account.
- Use **Firebase Authentication (Email/Password)** and **Cloud Firestore** only for the first release.
- Do not add Cloud Functions, Cloud Storage uploads, phone auth, or other features that may require billing.
- The public site continues to be hosted by GitHub Pages.

## 1. Create the Firebase project

1. Open Firebase Console.
2. Create a project named **The Sheema Edit**.
3. Keep the project on the **Spark** plan.
4. Google Analytics is optional and not required for Community.

## 2. Register the web app

Register a Web app named **The Sheema Edit Community**.

Copy the Firebase web config into:

`/assets/js/community-config.js`

Only these fields are required by the current Community code:

- apiKey
- authDomain
- projectId
- appId

Firebase web config values are public identifiers, not server secrets.

## 3. Turn on member login

Firebase Console → Authentication → Sign-in method:

Enable **Email/Password**.

The Community sends a verification email after signup and only verified members can enter the member feed.

## 4. Create Firestore

Create one **Cloud Firestore** database using the Standard edition / free quota.

Start in production mode.

## 5. Publish security rules

Copy the full contents of:

`/community/firestore.rules`

into Firestore → Rules and publish them.

The rules enforce:

- verified member access
- members can only create content as themselves
- members can edit/delete their own content
- post owners can clean up comments under their own post
- reports are private to admins
- banned users cannot participate
- only admins can manage events/resources
- admin status is not writable by ordinary members

## 6. Make Sheema the first admin

1. Create Sheema's account through the live Community signup.
2. Verify the email address.
3. In Firebase Console → Authentication → Users, copy that user's UID.
4. In Firestore create collection `admins`.
5. Create a document whose document ID is exactly that UID.
6. Add a field such as `role: "owner"`.

Firestore Console writes are administrative and are not blocked by client security rules.

## Collections used

- `profiles`
- `posts`
- `posts/{postId}/comments`
- `posts/{postId}/reactions`
- `reports`
- `admins`
- `bans`
- `events`
- `resources`

## Points

The free first version uses simple participation points:

- Post: +5
- Comment: +2

Levels:

1. New Here
2. Regular — 10+
3. Community Friend — 25+
4. Village Builder — 50+
5. Day One Energy — 100+

Reactions do not add points in the first release so the leaderboard does not encourage reaction farming.

## Current free-first design choices

- No image uploads yet, so Cloud Storage is not required.
- No Cloud Functions.
- No paid moderation service.
- No SMS or phone authentication.
- Feed is capped to the 25 newest member posts per live view to reduce Firestore reads.
- Hearts are checked only for visible posts and cached for the current browser session.

