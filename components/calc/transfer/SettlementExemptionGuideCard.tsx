"use client";

/**
 * SettlementExemptionGuideCard — 사례 47 settlement 비과세 차감 4분기 안내 카드.
 *
 * 트리거 4분기 (rightsValue × exemptionEligibleAtApproval):
 *  - ≤12억 + 충족   → emerald tone "settlement 비과세 자동 적용" (긍정·확정)
 *  - ≤12억 + 미충족 → slate tone "비과세 요건 미충족 → settlement 과세"
 *  - >12억 + 충족   → amber tone "고가주택 → settlement 과세 (후속 PR C-F1)"
 *  - >12억 + 미충족 → slate tone "비과세 미충족 + 고가주택 → settlement 전부 과세"
 *
 * RedevelopmentBlock.tsx 800줄 정책 준수를 위해 분리.
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { ToneCard } from "@/components/calc/shared/ToneCard";

interface Props {
  asset: AssetForm;
  effective: "yes" | "no" | null;
}

const HIGH_VALUE = 1_200_000_000;

export function SettlementExemptionGuideCard({ asset, effective }: Props) {
  const rights = parseAmount(asset.redevRightsValue);
  if (rights <= 0 || effective === null) return null;

  const isUnderHighValue = rights <= HIGH_VALUE;
  const isEligible = effective === "yes";

  if (isUnderHighValue && isEligible) {
    return (
      <ToneCard tone="emerald" title="청산금 수령분 1세대1주택 비과세 자동 적용" className="mt-2 text-caption">
        <p>
          인가일 평가액{" "}
          <span className="font-mono tabular-nums whitespace-nowrap">{rights.toLocaleString()}</span> ≤ 12억 +
          1세대1주택 비과세 요건 충족 → 청산금 수령분은 12억 안분 후 비과세로 차감되어 양도소득금액
          합산에서 제외됩니다.
        </p>
        <p className="text-muted-foreground">근거: PDF 사례수정 2 (2)-1번 + 서면2016-법령해석재산-2705</p>
      </ToneCard>
    );
  }
  if (!isUnderHighValue && isEligible) {
    return (
      <ToneCard tone="amber" title="고가주택 → 청산금 수령분 과세 적용 (후속 PR)" className="mt-2 text-caption">
        <p>
          인가일 평가액{" "}
          <span className="font-mono tabular-nums whitespace-nowrap">{rights.toLocaleString()}</span> {">"} 12억 →
          청산금 수령분도 고가주택 안분 대상. 본 계산기는 평가액 ≤ 12억 케이스만 지원합니다
          (후속 PR C-F1 트래킹).
        </p>
      </ToneCard>
    );
  }
  return (
    <ToneCard tone="slate" title="청산금 수령분 비과세 미적용" className="mt-2 text-caption">
      <p>1세대1주택 비과세 요건 미충족 → 청산금 수령분도 정상 과세됩니다.</p>
    </ToneCard>
  );
}
