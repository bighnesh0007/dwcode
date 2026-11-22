import Link from "next/link";

export const metadata = { title: "Terms · DWCode", description: "The rules for using DWCode." };

const UPDATED = "22 November 2026";

export default function TermsPage() {
  return (
    <article className="container max-w-3xl mx-auto py-10 px-4 space-y-6 text-sm leading-relaxed">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">Terms of use</h1>
        <p className="text-muted-foreground">Last updated {UPDATED}</p>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Using DWCode</h2>
        <p>DWCode is a free place to practise DataWeave. Use it for learning, and be decent to other people here.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">What you post</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>You keep the rights to code, posts, comments and contributions you write. You let DWCode show them on the site and, for approved contributions, publish them as problems or practice questions.</li>
          <li>Only post what you have the right to share. Certification questions must be your own; never copy real exam questions.</li>
          <li>No spam, harassment, malware or attempts to break or overload the service, including the compiler.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Moderation</h2>
        <p>Admins may hide content or suspend accounts that break these rules. A suspended account can still read but can&apos;t post, submit or buy.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Coins and the store</h2>
        <p>Coins and store items have no cash value and can&apos;t be exchanged for money. Prices and items may change.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">No warranty</h2>
        <p>
          DWCode is provided as is. Practice questions are original study material, not the real MuleSoft exam, and passing them doesn&apos;t guarantee you&apos;ll pass the real one. DWCode is not affiliated with MuleSoft or Salesforce.
        </p>
      </section>

      <p>See also the <Link href="/privacy" className="underline">privacy notice</Link>.</p>
    </article>
  );
}
