"use client";

/**
 * AssetLocationBlock — 「자산 소재」 국내/국외 라디오 (양도세 마법사 1단계 최상단 · 폼 전역)
 *
 * 모드 토글은 영향받는 입력 **직전**에 둔다 — 「판정 불러오기」·자산 카드·조정지역 질문은 국내 전용이라 국외를 고르면 마운트되지 않는다.
 * 계획서 `transfer-foreign-realestate.ui.plan.md` §3.1. 숨은 쪽 입력은 지우지 않는다(D-4) — 다시 고르면 그대로 돌아온다.
 * 단건 마법사와 다건(`/multi`) 편집 화면에 모두 보인다(사용자 결정 C-1).
 */
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { MULTI_FOREIGN_UNSUPPORTED_MESSAGE } from "@/lib/calc/transfer-foreign-messages";

export const ASSET_LOCATION_OPTIONS = [
  { value: "domestic", label: "국내 부동산", description: "국내에 있는 주택·토지·건물 등 (소득세법 §94·§104)" },
  { value: "foreign", label: "국외 부동산", description: "5년 이상 국내 거주자의 국외 토지·건물 양도 (소득세법 §118의2~§118의8)" },
] as const;

type AssetLocation = (typeof ASSET_LOCATION_OPTIONS)[number]["value"];

export function AssetLocationBlock({
  value,
  onChange,
  embeddedInMulti = false,
}: {
  value: AssetLocation;
  onChange: (v: AssetLocation) => void;
  /** 연간 합산(`/multi`) 편집 화면 안이면 국외 선택 시 차단 안내를 이 자리에서 보인다(사용자 결정 D-M) */
  embeddedInMulti?: boolean;
}) {
  return (
    <div data-testid="asset-location-block" className="mb-4">
      <ToneCard tone="rose" title="자산 소재">
        <RadioCardGroup
          name="assetLocation"
          tone="rose"
          columns={2}
          value={value}
          onChange={onChange}
          options={ASSET_LOCATION_OPTIONS.map((o) => ({ value: o.value, label: o.label, description: o.description, testId: `asset-location-${o.value}` }))}
          aria-label="자산 소재"
          data-field="assetLocation"
        />
      </ToneCard>
      {embeddedInMulti && value === "foreign" && (
        <div className="mt-2" data-testid="multi-foreign-notice">
          <ToneCard tone="amber" title="연간 합산(다건) 안내">
            <p className="text-xs leading-relaxed">{MULTI_FOREIGN_UNSUPPORTED_MESSAGE}</p>
          </ToneCard>
        </div>
      )}
    </div>
  );
}
