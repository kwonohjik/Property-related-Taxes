import { InheritanceTaxForm } from "@/components/calc/InheritanceTaxForm";

export const metadata = {
  title: "상속세 계산기 | 한국 부동산 세금 계산기",
  description: "상속세 자동 계산 — 상속재산 평가, 공제, 세액공제까지 한 번에",
};

export default function InheritanceTaxPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">상속세 계산기</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          상속재산 평가 → 각종 공제 → 세액공제까지 자동 계산 (상증법 §11~§30)
        </p>
      </div>
      <InheritanceTaxForm />
    </div>
  );
}
