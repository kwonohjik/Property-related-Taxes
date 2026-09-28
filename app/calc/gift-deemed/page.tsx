import { ProfessionalClientGate } from "@/components/calc/ProfessionalClientGate";
import { DeemedGiftCalculator } from "@/components/calc/deemed-gift/DeemedGiftCalculator";
import { GIFT_DEEMED_SCOPE } from "@/lib/calc/gift-deemed-type-meta";
import { GIFT_DEEMED_SCOPE_LAW } from "@/lib/calc/gift-deemed-type-meta";

const DESCRIPTION = `${GIFT_DEEMED_SCOPE} (${GIFT_DEEMED_SCOPE_LAW})`;

export const metadata = {
  title: "증여로 보는 경우 — 증여이익 계산기",
  description: DESCRIPTION,
  openGraph: {
    title: "증여로 보는 경우 — 증여이익 계산기",
    description: DESCRIPTION,
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
            {GIFT_DEEMED_SCOPE} — 증여재산가액 산정 → 증여세 계산 연결 ({GIFT_DEEMED_SCOPE_LAW})
          </p>
        </div>
        <DeemedGiftCalculator />
      </div>
    </ProfessionalClientGate>
  );
}
