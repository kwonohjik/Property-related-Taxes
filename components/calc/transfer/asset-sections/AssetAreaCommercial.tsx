"use client";

/**
 * 상업용건물·오피스텔 면적 3필드 — ① 기본정보 전용 위젯
 *
 * ## 왜 여기로 옮겼는가 (2026-08-04)
 *
 * 종전에는 **같은 3필드를 두 컴포넌트가 각각** 렌더했다:
 *   `CommercialBuildingBlock.tsx`            (`acquisitionCause !== "inheritance"`)
 *   `CommercialInheritanceStdPriceSection.tsx` (`acquisitionCause === "inheritance"`)
 * 두 카드는 상호배타 게이트라 화면상 중복은 없었지만, 같은 입력이 취득원인에 따라
 * 다른 위치에 나타나 사용자가 면적을 어디서 넣는지 예측할 수 없었다.
 *
 * ① 기본정보로 올려 **취득원인과 무관하게 한 자리**로 만든다.
 * 계획: `docs/00-pm/transfer-area-unification-all-asset-kinds.plan.md` P2.
 *
 * ## ⛔ 필드를 2시점 쌍으로 확장하지 말 것
 *
 * `cbLandArea`는 **단일 필드**다. 엔진이 취득·최초공시·양도 **3시점 단가**에 **같은
 * 면적**을 곱하므로(`commercial-building-valuation.ts:245,249,258`) 환산 산식에서
 * 면적이 약분되고 비율은 단가비만 반영한다. 2시점으로 나누면 B-4 왜곡이 재발한다.
 * anchor: `__tests__/tax-engine/transfer/area-axis-single-field-invariant.anchor.test.ts`
 */

import { useMemo } from "react";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { cn } from "@/lib/utils";
import { AssetFootprintField } from "./AssetFootprintField";
import { showFootprintArea } from "./AssetFootprintField";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

/** 이 위젯이 담당하는 자산유형인지 — 호출부 게이트와 단일 소스 */
export function isCommercialAreaAsset(asset: AssetForm): boolean {
  return asset.assetKind === "commercial_building";
}

export function AssetAreaCommercial({ asset, onChange }: Props) {
  // 연면적 = 전용 + 공유 (`commercial-building-valuation.ts:196` floorAreaTotal)
  const totalFloorArea = useMemo(() => {
    const excl = parseFloat(asset.cbExclusiveArea || "0");
    const shared = parseFloat(asset.cbSharedArea || "0");
    if (!excl && !shared) return null;
    return (excl || 0) + (shared || 0);
  }, [asset.cbExclusiveArea, asset.cbSharedArea]);

  return (
    <ToneCard tone="sky" title="면적 정보 (㎡)" noDark>
      {/* 3필드 1행 (3열, 라벨 상단 stacked) — 모바일은 1열 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FieldCard label="전용면적" unit="㎡" stacked>
          <DecimalInput
            value={asset.cbExclusiveArea}
            onChange={(v) => onChange({ cbExclusiveArea: v })}
            placeholder="전용면적 입력"
          />
        </FieldCard>
        <FieldCard label="공유면적" unit="㎡" stacked>
          <DecimalInput
            value={asset.cbSharedArea}
            onChange={(v) => onChange({ cbSharedArea: v })}
            placeholder="공유면적 입력"
          />
        </FieldCard>
        <FieldCard label="대지면적" unit="㎡" stacked>
          <DecimalInput
            value={asset.cbLandArea}
            onChange={(v) => onChange({ cbLandArea: v })}
            placeholder="대지면적 입력"
          />
        </FieldCard>
      </div>
      {/* 연면적(자동계산) · 건물 바닥면적(축 C) — 둘 다 있으면 한 행 */}
      <div
        className={cn(
          totalFloorArea !== null &&
            showFootprintArea(asset) &&
            "grid grid-cols-1 sm:grid-cols-2 gap-3 items-start"
        )}
      >
        {/* 라벨·값 2단 구조를 우측 축 C와 맞춘다 — 라벨끼리·입력칸끼리 같은 높이에 온다.
            (`py-2 text-sm` = `DecimalInput`의 입력 높이) */}
        {totalFloorArea !== null && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              연면적 (전용+공유, ㎡)
            </label>
            <div className="rounded-md border border-sky-200 bg-sky-100/60 px-3 py-2 text-sm font-semibold text-sky-800">
              {totalFloorArea.toLocaleString()} ㎡
            </div>
          </div>
        )}
        {/* 축 C는 `AssetAreaSection`이 아니라 여기서 렌더한다 — 면적 입력을 한 카드로 모은다. */}
        {showFootprintArea(asset) && (
          <AssetFootprintField asset={asset} onChange={onChange} />
        )}
      </div>
    </ToneCard>
  );
}
