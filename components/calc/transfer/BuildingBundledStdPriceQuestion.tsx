"use client";

/**
 * 「건물(토지 제외)」을 2001.1.1.~2005.4.29.에 상속·증여받고 토지를 따로 매수한 계산(D2) — 국세청 일괄 고시 여부 질문.
 *
 * 일반 건물의 기준시가(상속세 및 증여세법 §61①2호 — 국세청장 고시)는 2001.1.1. 이후 상속·증여분이면 이미 시행 중이라 영 §163⑨ 단서 2호가 아니다(평가액 그대로 —
 * 경계 근거는 `SEC_163_9_GENERAL_BUILDING_FIRST_NOTICE`).
 * 국세청장이 토지·건물을 일괄 고시하는 오피스텔·상업용 건물(같은 항 3호)은 첫 고시일이 지역마다 달라 「예」면 ⑧·⑫가 막는다.
 * 모름 선택지는 두지 않는다(계획서 transfer-acq-cause-mixed.plan.md §13.5). 노출 술어 `buildingBundledQuestionApplies`는 ④·⑧과 같다.
 */
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { buildingBundledQuestionApplies, buildingBundledStdPriceSent } from "@/lib/calc/transfer-land-part-cause";
import { BUILDING_BUNDLED_STD_PRICE_UNSUPPORTED_MESSAGE } from "@/lib/tax-engine/transfer-split-part-cause";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const OPTIONS = [
  { value: "no", label: "아니오 — 일반 건물(국세청 건물 기준시가 고시 대상)" },
  { value: "yes", label: "예 — 국세청이 토지·건물을 일괄 고시하는 오피스텔·상업용 건물" },
];

export function BuildingBundledStdPriceQuestion(props: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}) {
  const { asset, onChange } = props;
  if (!buildingBundledQuestionApplies(asset)) return null;
  const value = buildingBundledStdPriceSent(asset);

  return (
    <div className="space-y-1.5" data-field="buildingBundledStdPrice" data-testid="building-bundled-std-price">
      <p className="text-caption text-muted-foreground font-medium">
        국세청이 토지·건물을 일괄 고시하는 오피스텔·상업용 건물인가요?
      </p>
      <RadioCardGroup
        name={`building-bundled-std-price-${asset.assetId}`}
        tone="amber"
        layout="stack"
        options={OPTIONS}
        value={value ?? ""}
        onChange={(v) => onChange({ buildingBundledStdPrice: v as AssetForm["buildingBundledStdPrice"] })}
      />
      {value === "yes" && (
        <ToneCard tone="amber">
          <p className="text-xs text-amber-900 dark:text-amber-200" data-testid="building-bundled-std-price-unsupported">
            {BUILDING_BUNDLED_STD_PRICE_UNSUPPORTED_MESSAGE}
          </p>
        </ToneCard>
      )}
    </div>
  );
}
