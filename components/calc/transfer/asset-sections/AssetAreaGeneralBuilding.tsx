"use client";

/**
 * 일반건물(토지+건물 일괄) 면적 3필드 — ① 기본정보 전용 위젯
 *
 * ## 왜 여기로 옮겼는가 (2026-08-04)
 *
 * 종전에는 `GeneralBuildingBlock` 안(③ 취득정보)에 있어 자산유형마다 면적 입력
 * 위치가 달랐다. ① 기본정보로 올려 다른 자산유형과 같은 자리에 둔다.
 * 계획: `docs/00-pm/transfer-area-unification-all-asset-kinds.plan.md` P2.
 *
 * ## ⛔ 「건축물 바닥면적」은 주택 「정착면적」과 다른 개념이다 — 통합 금지
 *
 * `gbBuildingFootprintArea` = 「건축법 시행령」 제119조 제1항 제3호의 **바닥면적**
 * (지하층 포함 각 층 중 가장 넓은 값). 「소득세법」 제104조의3 제1항 제4호 나목
 * → 「지방세법」 제106조 제1항 제2호 → 같은 법 시행령 제101조의 부수토지 한도 곱셈 기준이다.
 *
 * 주택의 `buildingFootprintArea`(「소득세법」 제89조 제1항 제3호 「건물이 **정착**된
 * 면적」 = 1층 정착면적, 시행령 제154조 제7항 한도)와는 **다른 법령 개념**이다.
 * 근거: 대법원 2015.6.24. 2012두7073 · 대법원 1994.5.13. 93누18242 ·
 *       조심 2011지505 · 조심 2025지0451(건축면적 주장 배척).
 *
 * ## ⛔ 단일 필드를 2시점 쌍으로 확장하지 말 것
 *
 * `gbLandArea`는 취득·양도 **양쪽 기준시가의 곱셈 인자**이며 시점별 동일 가정이다
 * (`general-building-valuation.ts:506,535`). 2시점으로 나누면 환산비율이 왜곡된다.
 * anchor: `__tests__/tax-engine/transfer/area-axis-single-field-invariant.anchor.test.ts`
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

/** 이 위젯이 담당하는 자산유형인지 — 호출부 게이트와 단일 소스 */
export function isGeneralBuildingAreaAsset(asset: AssetForm): boolean {
  return asset.assetKind === "general_building";
}

export function AssetAreaGeneralBuilding({ asset, onChange }: Props) {
  // 연면적은 환산취득가 산정 참고용이라 환산 모드에서만 노출한다
  // (이전 전 `GeneralBuildingBlock`의 `isEstimated` 게이트를 그대로 옮긴 것 — 동작 변경 0).
  const isEstimated = asset.useEstimatedAcquisition;

  return (
    <ToneCard tone="sky" title="면적·규모" noDark>
      <FieldCard
        label="취득·양도 당시 토지 면적"
        unit="㎡"
        hint="등기부등본 또는 토지대장 기재 토지면적 (㎡). 취득시·양도시 기준시가 양쪽의 곱셈 인자 — 시점별 동일 가정."
      >
        <DecimalInput
          value={asset.gbLandArea}
          onChange={(v) => onChange({ gbLandArea: v })}
        />
      </FieldCard>

      {isEstimated && (
        <FieldCard
          label="건물 연면적"
          unit="㎡"
          hint="건축물대장 기재 각층 바닥면적 합계 (㎡). 환산취득가 참고용."
        >
          <DecimalInput
            value={asset.gbBuildingArea}
            onChange={(v) => onChange({ gbBuildingArea: v })}
          />
        </FieldCard>
      )}

      <FieldCard
        label="건축물 바닥면적"
        unit="㎡"
        hint="건축물대장의 각 층 바닥면적 중 **가장 넓은** 값 — 지하층도 포함합니다. 건축물대장의 '건축면적'이 아닙니다(발코니·처마 등이 달라 값이 어긋납니다). 「지방세법 시행령」 제101조 제1항 제2호 부수토지 한도의 곱셈 기준."
      >
        <DecimalInput
          value={asset.gbBuildingFootprintArea}
          onChange={(v) => onChange({ gbBuildingFootprintArea: v })}
        />
      </FieldCard>
    </ToneCard>
  );
}
