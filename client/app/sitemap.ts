import { type MetadataRoute } from 'next';
import { serverApi } from '@/lib/serverApi';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dwcode.vercel.app';
  
  try {
    // Public data: never vary the sitemap by visitor.
    const problems = await serverApi<{ slug: string; createdAt?: string }[]>('/api/v1/problems', { asUser: false });

    const problemUrls = problems.map((problem) => ({
      url: `${baseUrl}/problems/${problem.slug}`,
      lastModified: problem.createdAt ? new Date(problem.createdAt) : new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));

    const staticRoutes = [
      '',
      '/problems',
      '/contests',
      '/leaderboard',
      '/playground',
      '/store',
      '/blog',
      '/sign-in',
      '/sign-up'
    ].map((route) => ({
      url: `${baseUrl}${route}`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 1,
    }));

    return [...staticRoutes, ...problemUrls];
  } catch (error) {
    console.error("Error generating sitemap:", error);
    // Return at least static routes if the API is unreachable
    const staticRoutes = [
      '',
      '/problems',
      '/contests',
      '/leaderboard',
      '/playground',
      '/store',
      '/blog'
    ].map((route) => ({
      url: `${baseUrl}${route}`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 1,
    }));
    return staticRoutes;
  }
}
