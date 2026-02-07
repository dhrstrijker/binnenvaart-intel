import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { getVesselById, getSimilarVessels } from "@/lib/vessels";
import { SITE_URL, buildVesselTitle, buildVesselDescription } from "@/lib/seo";
import { sourceLabel } from "@/lib/sources";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import VesselPageContent from "@/components/VesselPageContent";
import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const vessel = await getVesselById(id);

  if (!vessel) {
    return { title: "Schip niet gevonden" };
  }

  if (vessel.canonical_vessel_id) {
    return {};
  }

  const title = buildVesselTitle(vessel);
  const description = buildVesselDescription(vessel);
  const url = `${SITE_URL}/schepen/${vessel.id}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      images: vessel.image_url ? [{ url: vessel.image_url }] : undefined,
      locale: "nl_NL",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: vessel.image_url ? [vessel.image_url] : undefined,
    },
    alternates: {
      canonical: url,
    },
  };
}

export default async function VesselPage({ params }: PageProps) {
  const { id } = await params;
  const vessel = await getVesselById(id);

  if (!vessel) {
    notFound();
  }

  if (vessel.canonical_vessel_id) {
    permanentRedirect(`/schepen/${vessel.canonical_vessel_id}`);
  }

  const similarVessels = await getSimilarVessels(vessel, 6);

  const title = buildVesselTitle(vessel);
  const description = buildVesselDescription(vessel);

  // JSON-LD structured data
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: vessel.name,
    description,
    ...(vessel.image_url && { image: vessel.image_url }),
    offers: {
      "@type": "Offer",
      ...(vessel.price !== null && { price: vessel.price, priceCurrency: "EUR" }),
      availability: vessel.status === "removed"
        ? "https://schema.org/SoldOut"
        : "https://schema.org/InStock",
      seller: {
        "@type": "Organization",
        name: sourceLabel(vessel.source),
      },
    },
    additionalProperty: [
      ...(vessel.type ? [{ "@type": "PropertyValue", name: "Type", value: vessel.type }] : []),
      ...(vessel.length_m ? [{ "@type": "PropertyValue", name: "Lengte", value: `${vessel.length_m}m` }] : []),
      ...(vessel.width_m ? [{ "@type": "PropertyValue", name: "Breedte", value: `${vessel.width_m}m` }] : []),
      ...(vessel.build_year ? [{ "@type": "PropertyValue", name: "Bouwjaar", value: String(vessel.build_year) }] : []),
      ...(vessel.tonnage ? [{ "@type": "PropertyValue", name: "Tonnage", value: `${vessel.tonnage}t` }] : []),
    ],
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex items-center gap-1.5 text-sm text-slate-500">
            <li>
              <Link href="/" className="hover:text-cyan-600 transition-colors">
                Dashboard
              </Link>
            </li>
            <li>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </li>
            <li className="font-medium text-slate-900" aria-current="page">
              {vessel.name}
            </li>
          </ol>
        </nav>

        <VesselPageContent vessel={vessel} similarVessels={similarVessels} />
      </main>

      <Footer />
    </div>
  );
}
