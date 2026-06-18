import { ProfessionalClientGate } from "@/components/calc/ProfessionalClientGate";
import { DeemedGiftCalculator } from "@/components/calc/deemed-gift/DeemedGiftCalculator";

export const metadata = {
  title: "증여로 보는 경우 — 증여이익 계산기",
  description:
    "보험금·저가양수·고가양도·채무면제·부동산무상사용·금전무상대출 증여의제 (상증법 §34·§35·§36·§37·§41의4)",
  openGraph: {
    title: "증여로 보는 경우 — 증여이익 계산기",
    description:
      "보험금·저가양수·고가양도·채무면제·부동산무상사용·금전무상대출 증여의제 (상증법 §34·§35·§36·§37·§41의4)",
    type: "website",
  },
};

export default function GiftDeemedPage() {
  return (
    <ProfessionalClientGate>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">증여로 보는 경우 — 증여이익 계산기</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            보험금·저가양수·채무면제·무상사용·무상대출 등 증여의제 가액 산정 → 증여세 계산 연결 (상증법 §34·§35·§36·§37·§41의4)
          </p>
        </div>
        <DeemedGiftCalculator />
      </div>
    </ProfessionalClientGate>
  );
}
