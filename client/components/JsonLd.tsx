/** Structured data for search engines. `<` is escaped so no string can close the script tag. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://dwcode.vercel.app").replace(/\/+$/, "");
