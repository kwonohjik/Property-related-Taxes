"use client";

import { ToneCard } from "@/components/calc/shared/ToneCard";
import { NBL } from "@/lib/tax-engine/legal-codes";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

/**
 * 임야(§168의9③7호)·목장용지(§168의10②1호) 「상속받은 … 상속개시일부터 3년이 경과하지 아니한」 — 자동 판정 안내.
 *
 * 두 요건은 자산의 취득원인·취득일(상속이면 상속개시일)이 이미 받으므로 따로 입력받지 않는다. 판정은 서버 매퍼
 * `resolveInheritanceStartDate`가 같은 두 값으로 한다(계획서 `docs/00-pm/nbl-forest-pasture-inherit-3y-cause.plan.md`).
 * 상속이 아닌 자산에는 해당이 없어 렌더하지 않는다.
 */
export function InheritanceWithin3YearsNotice({
  asset,
  landLabel,
  legalBasis,
}: {
  asset: AssetForm;
  landLabel: "임야" | "목장용지";
  legalBasis: typeof NBL.FOREST_INHERIT_3Y | typeof NBL.PASTURE_INHERIT_3Y;
}) {
  if (asset.acquisitionCause !== "inheritance") return null;
  return (
    <ToneCard tone="sky" title="상속 3년 이내 — 자동 판정">
      <p className="text-caption" data-testid="nbl-inherit-3y-notice">
        상속받은 {landLabel}입니다. 상속개시일({asset.acquisitionDate || "취득일 칸에 입력"})부터 3년이 지나지 않은 날
        양도하면 사업용으로 봅니다({legalBasis}). 취득일 칸의 상속개시일로 판정하므로 따로 입력하지 않습니다.
      </p>
    </ToneCard>
  );
}
