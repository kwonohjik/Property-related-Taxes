"use client";

/**
 * 판정 메뉴 — 비주택 → 주택 용도변경 (「소득세법 시행령」 §154⑤ 단서 · 거주요건 기준일)
 *
 * 계산기(`NonHousingConversionSection`)와 **같은 필드**(`hasNonHousingConversion`·`residentialUseStartDate`)·
 * **같은 술어**(`isUsageConversionActive`)·**같은 검증 leaf**(`validateUsageConversion`)를 쓴다. 위젯만 따로 둔 이유:
 * 계산기 패널은 §95⑤ 장기보유특별공제 분해 미리보기와 겸용주택 배타 안내를 함께 그리는데, 판정 메뉴에는
 * 세액 축도 겸용주택 토글도 없다.
 *
 * 이 날짜가 판정에 쓰이는 곳(엔진 `transfer-tax-exemption-holding.ts`):
 *   - 보유기간 기산 — 2024.2.29. 이후 양도분(대통령령 제34265호 · `CONVERSION_EXEMPTION_CUTOFF`)
 *   - 거주요건의 조정대상지역 판정 시점 — 주택으로 사용한 날(서면-2020-부동산-5098)
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DateInput } from "@/components/ui/date-input";

export function UsageConversionField({
  asset,
  onChange,
}: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}) {
  return (
    <ToggleCard
      data-testid="one-house-usage-conversion"
      checked={asset.hasNonHousingConversion === true}
      onCheckedChange={(on) => onChange({ hasNonHousingConversion: on })}
      title="건물 전체를 주택으로 용도변경"
      description="오피스텔·근린생활시설 등 주택이 아닌 건물을 취득해 건물 전부를 주거용으로 사용하거나 주택으로 용도변경한 경우 — 2024.2.29. 이후 양도분은 보유기간을 주거용 사용일부터 세고, 거주요건의 조정대상지역 여부도 그 날 기준으로 봅니다"
      tone="violet"
      lawRefs={[{ legalBasis: "소득세법 시행령 §154⑤", label: "영 §154⑤" }]}
    >
      <FieldCard
        label="사실상 주거용 사용 개시일"
        hint="사실상 주거용으로 사용한 날. 불분명하면 건축물대장상 용도변경일을 입력하세요. 취득일 이후, 양도일 이전이어야 합니다."
      >
        <DateInput
          data-testid="one-house-usage-conversion-date"
          value={asset.residentialUseStartDate ?? ""}
          onChange={(residentialUseStartDate) => onChange({ residentialUseStartDate })}
        />
      </FieldCard>
    </ToggleCard>
  );
}
