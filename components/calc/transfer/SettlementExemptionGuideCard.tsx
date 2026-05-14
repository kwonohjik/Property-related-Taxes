"use client";

/**
 * SettlementExemptionGuideCard — 사례 47 settlement 비과세 차감 4분기 안내 카드.
 *
 * 트리거 4분기 (rightsValue × exemptionEligibleAtApproval):
 *  - ≤12억 + 충족   → rose tone "settlement 비과세 자동 적용"
 *  - ≤12억 + 미충족 → gray tone "비과세 요건 미충족 → settlement 과세"
 *  - >12억 + 충족   → amber tone "고가주택 → settlement 과세 (후속 PR C-F1)"
 *  - >12억 + 미충족 → gray tone "비과세 미충족 + 고가주택 → settlement 전부 과세"
 *
 * RedevelopmentBlock.tsx 800줄 정책 준수를 위해 분리.
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";

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
      <div className="rounded-md border border-rose-300 bg-rose-100/70 p-2 text-[11px] text-rose-900 mt-2">
        <p className="font-semibold">청산금 수령분 1세대1주택 비과세 자동 적용</p>
        <p className="mt-1">
          인가일 평가액 <span className="font-mono">{rights.toLocaleString()}</span> ≤ 12억 + 1세대1주택 비과세 요건 충족
          → 청산금 수령분은 12억 안분 후 비과세로 차감되어 양도소득금액 합산에서 제외됩니다.
        </p>
        <p className="mt-1 text-rose-700">근거: PDF 사례수정 2 (2)-1번 + 서면2016-법령해석재산-2705</p>
      </div>
    );
  }
  if (!isUnderHighValue && isEligible) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-100/60 p-2 text-[11px] text-amber-900 mt-2">
        <p className="font-semibold">고가주택 → 청산금 수령분 과세 적용 (후속 PR)</p>
        <p className="mt-1">
          인가일 평가액 <span className="font-mono">{rights.toLocaleString()}</span> {">"} 12억 → 청산금 수령분도 고가주택 안분 대상.
          본 PR은 평가액 ≤ 12억 케이스만 지원합니다 (후속 PR C-F1 트래킹).
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-slate-300 bg-slate-100/70 p-2 text-[11px] text-slate-700 mt-2">
      <p className="font-semibold">청산금 수령분 비과세 미적용</p>
      <p className="mt-1">
        1세대1주택 비과세 요건 미충족 → 청산금 수령분도 정상 과세됩니다.
      </p>
    </div>
  );
}
