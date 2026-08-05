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
 * ## 연면적의 `useEstimatedAcquisition` 게이트는 제거했다 (2026-08-05)
 *
 * 종전에는 환산취득가 모드에서만 노출했으나 **실거래가 모드에서도 연면적을 쓴다** —
 * 항상 표시되는 「양도시 기준시가」의 건물 기준시가 계산기가 이 값을 prefill로 받는다
 * (`GeneralBuildingBlock.tsx:266`). 칸이 없으면 prefill이 늘 비어 사용자가 모달 안에서
 * 같은 값을 다시 쳤다. 그 이중 입력을 없애려 상시 노출로 바꾸고, 반대로 **모달 쪽
 * 연면적 입력 칸을 숨겼다**(`hideFloorAreaInput`).
 * 계획: `docs/02-design/features/general-building-area-row-always-visible.plan.md`
 * anchor: `__tests__/components/area-card-row-layout.anchor.test.tsx`
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
  return (
    <ToneCard tone="sky" title="면적·규모" noDark>
      {/* 3필드 1행 (3열, 라벨 상단 stacked) — 모바일은 1열. CB(`AssetAreaCommercial`)와 동일 배치. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FieldCard label="취득·양도 당시 토지 면적" unit="㎡" stacked>
          <DecimalInput
            value={asset.gbLandArea}
            onChange={(v) => onChange({ gbLandArea: v })}
          />
        </FieldCard>

        <FieldCard label="건물 연면적" unit="㎡" stacked>
          <DecimalInput
            value={asset.gbBuildingArea}
            onChange={(v) => onChange({ gbBuildingArea: v })}
          />
        </FieldCard>

        <FieldCard label="건축물 바닥면적" unit="㎡" stacked>
          <DecimalInput
            value={asset.gbBuildingFootprintArea}
            onChange={(v) => onChange({ gbBuildingFootprintArea: v })}
          />
        </FieldCard>
      </div>
    </ToneCard>
  );
}
