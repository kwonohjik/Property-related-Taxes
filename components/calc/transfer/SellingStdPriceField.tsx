"use client";

/**
 * 양도 주택의 **양도 당시 기준시가**(주택 공시가격) — 다주택 중과 판정용 칸(계획서 `calc-selling-house-std-price-value-region.plan.md` §5.2).
 *
 * 노출·필수는 `selling-std-price-scope.ts` 단일 leaf가 정한다(⑧·④와 같은 술어). 같은 사실을 받는 다른 칸(환산 분모·분리 주택 축 A·
 * 안분 키·의제 전 환산 분모·§164⑦ 3시점)이 화면에 있으면 호출부가 이 칸을 그리지 않는다.
 * 판정 메뉴 M1(`app/calc/one-house-exemption/steps/Step3.tsx`)과 같은 위젯·문구다.
 */
import { HousingStdPriceLookupField } from "@/components/calc/inputs/HousingStdPriceLookupField";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

export function SellingStdPriceField({
  asset,
  onChange,
  transferDate,
  required,
}: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
  required: boolean;
}) {
  return (
    <div data-testid="calc-selling-std-price">
      <HousingStdPriceLookupField
        data-field="standardPriceAtTransfer"
        label="양도 당시 기준시가 (공시가격)"
        required={required}
        hint={
          required
            ? "가액기준 지역 주택입니다 — 양도 당시 기준시가 3억원 이하면 주택 수에 넣지 않고 중과하지 않습니다(소득세법 시행령 §167의3①1호)"
            : "지역기준 지역은 주택 수와 무관합니다 — 2주택이면 1억원 이하 소형주택 배제(§167의10①9호) 판정에 씁니다"
        }
        value={asset.standardPriceAtTransfer ?? ""}
        onChange={(standardPriceAtTransfer) => onChange({ standardPriceAtTransfer })}
        jibun={asset.addressJibun || undefined}
        dong={asset.addressDong || undefined}
        ho={asset.addressHo || undefined}
        referenceDate={transferDate || undefined}
        testidPrefix="calc-selling-std-price"
      />
    </div>
  );
}
