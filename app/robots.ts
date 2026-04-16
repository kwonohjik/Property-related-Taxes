import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://korean-tax-calc.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/history", "/result/", "/auth/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
