import { GiftTaxForm } from "@/components/calc/GiftTaxForm";

export const metadata = {
  title: "증여세 계산기",
  description:
    "증여세 자동 계산 — 관계별 증여재산공제(배우자 6억·직계존속 5천만), 세대생략 할증(30%), 10년 합산 (상증법 §53~§58)",
  openGraph: {
    title: "증여세 계산기",
    description:
      "증여세 자동 계산 — 관계별 증여재산공제(배우자 6억·직계존속 5천만), 세대생략 할증(30%), 10년 합산 (상증법 §53~§58)",
    type: "website",
  },
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
