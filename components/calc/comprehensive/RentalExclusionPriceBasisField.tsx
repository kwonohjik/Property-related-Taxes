"use client";

/**
 * 종부령 §3① 가목 「기준 공시가격」(선택) — 그해 공시가격이 상한을 넘는 대상 유형에서만 보인다.
 * 묻는 조건은 `asksPriceBasisValue`(④ 전송과 같은 술어 · 상한은 엔진 `rentalPriceCap`).
 * 비면 엔진이 그해 공시가격으로 판정하고 불성립 사유에 안내를 붙인다(⑧ 차단 없음 — 계획서 T-03 Q-1 a·Q-2 a).
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-tax-defects-3.plan.md §2.3
 */
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { CollapsibleHintCard } from "@/components/calc/shared/CollapsibleHintCard";
import type { PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";
import { asksPriceBasisValue } from "@/lib/calc/comprehensive-rental-price-basis";

export function RentalExclusionPriceBasisField({
  property,
  registrationType,
  assessmentYear,
  onUpdate,
}: {
  property: PropertyEntry;
  registrationType: string;
  assessmentYear: string;
  onUpdate: (patch: Partial<PropertyEntry>) => void;
}) {
  if (!asksPriceBasisValue(property, registrationType, assessmentYear)) return null;
  return (
    <div className="space-y-2" data-testid="comprehensive-price-basis">
      <CurrencyInput
        label="기준 공시가격 (선택)"
        value={property.priceBasisValue ?? ""}
        onChange={(v) => onUpdate({ priceBasisValue: v })}
        hint="임대개시일 또는 처음 합산배제 신고한 해 6.1. 공시가격. 상한 이하인 쪽을 넣으세요"
        data-testid="comprehensive-price-basis-value"
      />
      <p className="text-xs text-muted-foreground">
        그해 공시가격이 가격 상한을 넘습니다. 가격 요건은 그해가 아니라 임대개시일(건설임대는 2호 이상 임대를 개시한 날) 또는
        처음 합산배제신고를 한 해 과세기준일의 공시가격으로 봅니다(종부령 §3① 가목). 비우면 그해 공시가격으로 판정합니다.
      </p>
      <CollapsibleHintCard summary="공시가격이 없던 때 · 상속 · 포괄승계">
        <ul className="list-disc space-y-1 pl-4 text-xs">
          <li>
            임대개시일에 공시가격이 없으면 지방세법 §4①단서·②에 따른 가액을 씁니다(서면-2020-부동산-4604 · 서면-2019-부동산-0290).
            신축 공동주택은 건물 시가표준액과 토지 시가표준액을 더한 금액으로 볼 수 있습니다(행정안전부 부동산세제과-2963).
          </li>
          <li>임대사업자 지위를 상속받아 계속 임대하면 피상속인의 임대개시일이 기준입니다(서면-2019-법령해석재산-1054).</li>
          <li>건설임대를 포괄승계했으면 승계인이 임대를 개시한 날이 기준입니다(서면-2022-법규재산-5687).</li>
        </ul>
      </CollapsibleHintCard>
    </div>
  );
}
