import { serverApiOrNull } from "@/lib/serverApi";
import { JsonLd, SITE_URL } from "@/components/JsonLd";

interface Post {
  title: string;
  slug: string;
  content: string;
  authorName?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Wraps the (client-rendered) post with structured data fetched on the server. */
export default async function BlogPostLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await serverApiOrNull<Post>(`/api/v1/blog/${encodeURIComponent(slug)}`, { asUser: false }).catch(() => null);
  return (
    <>
      {post && (
        <JsonLd data={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.title,
          url: `${SITE_URL}/blog/${post.slug}`,
          description: post.content.replace(/[#*_`>[\]()-]/g, "").slice(0, 200),
          ...(post.authorName ? { author: { "@type": "Person", name: post.authorName } } : {}),
          ...(post.createdAt ? { datePublished: post.createdAt } : {}),
          ...(post.updatedAt ? { dateModified: post.updatedAt } : {}),
        }} />
      )}
      {children}
    </>
  );
}
