"use client";

/**
 * SettlementExemptionGuideCard — 사례 47 settlement 비과세 차감 4분기 안내 카드.
 *
 * 트리거 4분기 (rightsValue × exemptionEligibleAtApproval):
 *  - ≤12억 + 충족   → emerald tone "settlement 비과세 자동 적용" (긍정·확정)
 *  - ≤12억 + 미충족 → slate tone "비과세 요건 미충족 → settlement 과세"
 *  - >12억 + 충족   → amber tone "고가주택 → 청산금 수령분은 이 계산에 미포함 (별도 산정)"
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
    // 🔴 저장소 내부의 PR·트래킹 ID를 사용자 화면에 노출하지 않는다(R17 ·
    //    `feedback_no_internal_id_in_result`). 남길 것은 「무엇이 이 계산에 포함되지
    //    않았는가」와 「그래서 무엇을 해야 하는가」다.
    return (
      <ToneCard tone="amber" title="고가주택 → 청산금 수령분은 이 계산에 포함되지 않습니다" className="mt-2 text-caption">
        <p>
          인가일 평가액{" "}
          <span className="font-mono tabular-nums whitespace-nowrap">{rights.toLocaleString()}</span> {">"} 12억이면
          청산금 수령분도 고가주택 안분 대상입니다. 이 계산기는 평가액 12억 이하 사안만 산정하므로,
          해당 부분은 <strong>별도 산정해 신고</strong>하세요.
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
