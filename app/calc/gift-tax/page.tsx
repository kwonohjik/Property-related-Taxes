import { GiftTaxForm } from "@/components/calc/GiftTaxForm";

export const metadata = {
  title: "증여세 계산기 | 한국 부동산 세금 계산기",
  description: "증여세 자동 계산 — 관계별 공제, 10년 합산, 세액공제까지 한 번에",
};

export default function GiftTaxPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">증여세 계산기</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          증여재산 평가 → 관계별 공제 → 세액공제까지 자동 계산 (상증법 §31~§59)
        </p>
      </div>
      <GiftTaxForm />
    </div>
  );
}
