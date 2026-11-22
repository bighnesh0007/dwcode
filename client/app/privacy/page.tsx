import Link from "next/link";

export const metadata = { title: "Privacy · DWCode", description: "What DWCode stores about you, why, and how to have it removed." };

const UPDATED = "22 November 2026";

/** Plain-language privacy notice, written from what the code actually stores and sends. */
export default function PrivacyPage() {
  return (
    <article className="container max-w-3xl mx-auto py-10 px-4 space-y-6 text-sm leading-relaxed">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">Privacy</h1>
        <p className="text-muted-foreground">Last updated {UPDATED}</p>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">What we store</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Your account.</strong> Sign-in is handled by Clerk. We receive your user id, display name, avatar and email address from it.</li>
          <li><strong>What you do here.</strong> Your submissions (the code and its result), profile (username, bio, headline, about, links, country), follows, coins and purchases, comments, blog posts, notes, bookmarks, contest entries, team membership, learning progress (onboarding answers, quiz and mock results, review schedule) and contributions.</li>
          <li><strong>Notifications</strong> and your email preferences.</li>
          <li><strong>GitHub</strong>, only if you connect it to publish solutions: an access token, stored encrypted.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Anonymous usage data</h2>
        <p>
          To find bugs and see which pages are used, the site sends page views and browser errors. These carry no user id. URLs have their query strings removed, and messages are shortened. We use no advertising or third-party tracking.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Who else sees it</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Everyone</strong> can see your public profile, solves, leaderboard position, comments and posts.</li>
          <li><strong>Clerk</strong> runs sign-in. <strong>Razorpay</strong> processes sponsorship payments; we never see card details.</li>
          <li><strong>Google Gemini</strong> receives the code and error text when you ask the AI to explain an error, and admins&apos; prompts when generating problems.</li>
          <li><strong>Resend</strong> delivers email notifications you&apos;ve turned on.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Cookies and storage</h2>
        <p>
          We use the cookies Clerk needs to keep you signed in. Your browser also stores your theme and a few interface choices. If you install DWCode as an app, public pages you&apos;ve visited are cached on your device for offline use. Personal pages are never cached.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Your choices</h2>
        <p>
          You can edit your profile and email preferences on <Link href="/profile" className="underline">your profile</Link>. To get a copy of your data or have your account and data deleted, open an issue on the project&apos;s GitHub, or contact the maintainer listed there. We&apos;ll handle it promptly.
        </p>
      </section>
    </article>
  );
}
