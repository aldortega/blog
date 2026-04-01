import { notFound } from "next/navigation";

type SectionPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function SectionPage({ params }: SectionPageProps) {
  await params;
  notFound();
}
