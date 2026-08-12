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
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

/** 이 위젯이 담당하는 자산유형인지 — 호출부 게이트와 단일 소스 */
export function isGeneralBuildingAreaAsset(asset: AssetForm): boolean {
  return asset.assetKind === "general_building";
}

export function AssetAreaGeneralBuilding({ asset, onChange }: Props) {
  const isPartial = (asset.areaScenario ?? "same") === "partial";
  return (
    <ToneCard tone="sky" title="면적·규모" noDark>
      {/*
        ── 일부 양도 (O-4 · 2026-08-12) ──────────────────────────────────────
        `AssetAreaSection`의 축 A(면적 입력 방식 Select)를 쓰지 않고 여기 둔다 —
        그쪽은 `acquisitionArea`/`transferArea` **2칸**을 함께 렌더하는데 일반건물은
        아래 전용 3필드가 이미 그 역할을 하므로 같은 면적을 두 곳에서 받게 된다
        (`AssetAreaSection.tsx` 미등재 사유 주석).

        ⚠️ **취득·양도 2시점으로 나누지 않는다.** 그것이 `building`에서 `partial`을
           되돌린 이유다(PR #912 — 면적비가 단가비를 상쇄해 양도차익 0, anchor A-6).
           이 카드는 단일 필드를 유지하고 **의미만** 「양도분」으로 바꾼다:
           환산취득가 = 양도가 × (취득단가 × 면적)/(양도단가 × 면적) 이므로 면적이
           **약분**되어 어느 쪽으로 해석하든 비율이 왜곡되지 않는다.
      */}
      <ToggleCard
        variant="chip"
        tone="amber"
        title="일부 양도"
        description="취득한 토지·건물 중 일부만 양도한 경우 ON"
        checked={isPartial}
        onCheckedChange={(v) => onChange({ areaScenario: v ? "partial" : "same" })}
      />

      {isPartial && (
        <ToneCard tone="amber" noDark className="mt-2">
          <p className="text-xs text-amber-800">
            아래 면적과 「양도시·취득시 기준시가」를 <strong>양도한 부분 기준</strong>으로
            입력하세요. 양도하지 않고 남긴 부분은 포함하지 않습니다.
          </p>
          <p className="text-caption text-amber-700 mt-1">
            부수토지 한도(「소득세법」 제104조의3 제1항 제4호 나목)도 이 면적으로 판정합니다 —
            토지만 일부 양도했다면 바닥면적은 <strong>건물 전체 값 그대로</strong> 두고,
            건물도 함께 나눠 양도했다면 바닥면적도 양도분으로 넣으세요.
          </p>
          <p className="text-caption text-amber-700 mt-1">
            취득가액(실거래가)은 전체 금액이므로 <strong>③ 취득정보</strong>의 안분 계산기로
            양도분을 산출해 적용하세요. 환산취득가 모드는 위 면적·기준시가만으로 자동 계산됩니다.
          </p>
        </ToneCard>
      )}

      {/* 3필드 1행 (3열, 라벨 상단 stacked) — 모바일은 1열. CB(`AssetAreaCommercial`)와 동일 배치. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
        <FieldCard
          label={isPartial ? "양도분 토지 면적" : "취득·양도 당시 토지 면적"}
          unit="㎡"
          stacked
        >
          <DecimalInput
            value={asset.gbLandArea}
            onChange={(v) => onChange({ gbLandArea: v })}
          />
        </FieldCard>

        <FieldCard label={isPartial ? "양도분 건물 연면적" : "건물 연면적"} unit="㎡" stacked>
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
