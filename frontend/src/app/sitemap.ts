import type { MetadataRoute } from "next";
import { getAllVesselIds } from "@/lib/vessels";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: "https://navisio.nl",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: "https://navisio.nl/analytics",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: "https://navisio.nl/pricing",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  const vessels = await getAllVesselIds();

  const vesselPages: MetadataRoute.Sitemap = vessels.map((v) => ({
    url: `https://navisio.nl/schepen/${v.id}`,
    lastModified: new Date(v.updated_at),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticPages, ...vesselPages];
}
