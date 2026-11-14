"use client";

/**
 * 장기임대주택 「증여로 받았나요?」(S-4) — 명부 행·양도 주택 공용. 말소된 등록이 있을 때만 보인다(`rentalGiftDonorInScope`).
 *
 * 별도세대에서 증여받기 전에 증여자의 등록이 말소됐으면 수증자 세대에는 등록한 거주자가 없어 장기임대주택으로 보지 않는다
 * (소령 §167의3①2호 · 엔진 `isSeparateHouseholdGiftOfCancelledRental`). 동일세대원 증여는 종전대로 판정한다.
 */
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { rentalGiftDonorInScope } from "@/lib/calc/rental-gift-donor-scope";
import type { RentalDeclaration } from "@/lib/stores/calc-wizard-asset-nbl";

type Answer = "none" | "same" | "separate";

export function RentalGiftDonorHouseholdField({
  decl,
  onChange,
  testIdPrefix,
}: {
  decl: RentalDeclaration;
  onChange: (v: Answer) => void;
  testIdPrefix: string;
}) {
  if (!rentalGiftDonorInScope(decl)) return null;
  return (
    <div className="space-y-1">
      <label className="block text-caption text-muted-foreground font-medium">이 주택을 증여로 받았나요?</label>
      <RadioCardGroup
        name={testIdPrefix}
        data-testid={testIdPrefix}
        tone="violet"
        layout="inline"
        options={[
          { value: "none", label: "아니오", testId: `${testIdPrefix}-none` },
          { value: "same", label: "동일세대원에게서", testId: `${testIdPrefix}-same` },
          { value: "separate", label: "별도세대에게서", testId: `${testIdPrefix}-separate` },
        ]}
        value={decl.rentalGiftDonorHousehold ?? ""}
        onChange={onChange}
      />
      <p className="text-caption text-muted-foreground">
        별도세대에서 증여받기 전에 증여자의 임대사업자 등록이 말소됐다면 장기임대주택으로 보지 않습니다 — 이 주택을 등록한
        거주자가 받은 사람의 세대에 없기 때문입니다(소령 §167의3①2호 · 별도세대 증여를 직접 다룬 해석은 확인하지 못했습니다,
        확인 필요). 동일세대원에게 증여받았다면 증여자의 등록·말소 사실을 그대로 적습니다(기획재정부 재산세제과-1591).
      </p>
    </div>
  );
}
