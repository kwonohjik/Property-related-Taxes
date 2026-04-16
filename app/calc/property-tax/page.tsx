import { PropertyTaxForm } from "@/components/calc/PropertyTaxForm";

export const metadata = {
  title: "재산세 계산기",
  description:
    "재산세 자동 계산 — 주택·토지·건축물 세율, 1세대1주택 특례(0.05%·0.1%·0.35%), 세부담 상한, 도시지역분·지방교육세 합산 (지방세법 §111~§122)",
  openGraph: {
    title: "재산세 계산기",
    description:
      "재산세 자동 계산 — 주택·토지·건축물 세율, 1세대1주택 특례(0.05%·0.1%·0.35%), 세부담 상한, 도시지역분·지방교육세 합산 (지방세법 §111~§122)",
    type: "website",
  },
};

export default function PropertyTaxPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <PropertyTaxForm />
    </div>
  );
}
