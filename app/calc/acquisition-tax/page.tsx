import { AcquisitionTaxForm } from "@/components/calc/AcquisitionTaxForm";

export const metadata = {
  title: "취득세 계산기 | 한국 부동산 세금 계산기",
  description: "취득세 자동 계산 — 물건 유형별 기본세율, 다주택 중과, 생애최초 감면까지 한 번에 (지방세법 §11~§13의2)",
};

export default function AcquisitionTaxPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">취득세 계산기</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          물건 유형 · 취득 원인 → 과세표준 → 세율(선형보간·중과) → 농특세 · 지방교육세 자동 계산
        </p>
      </div>
      <AcquisitionTaxForm />
    </div>
  );
}
