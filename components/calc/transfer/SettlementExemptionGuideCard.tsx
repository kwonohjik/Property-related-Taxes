"use client";

/**
 * SettlementExemptionGuideCard — 청산금 수령 동시신고(사례 47) 청산금분 비과세 안내 카드.
 *
 * 트리거 (권리가액 × 보유 요건 자기선언):
 *  - ≤ 기준금액 + 충족 → emerald「청산금 수령분 1세대1주택 비과세」
 *  - > 기준금액 + 충족 → amber「권리가액 기준 고가주택 안분」(§160①)
 *  - 미충족            → slate「청산금 수령분 과세」
 *
 * 🔴 L-12(2026-09-28) — 기준금액은 **청산금분 양도일**(소유권이전 고시일 다음날) 시점 값이다
 *    (종전 12억 고정). 권리가액 초과분은 이제 엔진이 **직접 안분**한다 — 종전 안내 「이 계산에
 *    포함되지 않으니 별도 산정」은 더 이상 사실이 아니다. 비과세는 그 날 현재 1세대1주택이어야 한다
 *    (부동산거래관리과-380 · 사전-2022-법규재산-1282).
 *
 * RedevelopmentBlock.tsx 800줄 정책 준수를 위해 분리.
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import {
  resolveHighValueHouseThreshold,
  formatHighValueThresholdLabel,
} from "@/lib/tax-engine/one-house/threshold";

interface Props {
  asset: AssetForm;
  effective: "yes" | "no" | null;
}

export function SettlementExemptionGuideCard({ asset, effective }: Props) {
  const rights = parseAmount(asset.redevRightsValue);
  if (rights <= 0 || effective === null || !asset.redevSettlementSaleDate) return null;
  const saleDate = new Date(asset.redevSettlementSaleDate);
  if (Number.isNaN(saleDate.getTime())) return null;

  // 엔진과 같은 시점 함수 — 청산금분 양도일의 기준금액(`settlementHighValueThreshold`와 같은 입력).
  const threshold = resolveHighValueHouseThreshold(saleDate);
  const thresholdLabel = formatHighValueThresholdLabel(threshold);
  const isUnderHighValue = rights <= threshold;
  const isEligible = effective === "yes";

  if (isUnderHighValue && isEligible) {
    return (
      <ToneCard tone="emerald" title="청산금 수령분 1세대1주택 비과세" className="mt-2 text-caption">
        <p>
          권리가액{" "}
          <span className="font-mono tabular-nums whitespace-nowrap">{rights.toLocaleString()}</span> ≤{" "}
          {thresholdLabel}(청산금분 양도일 기준) + 종전주택 보유 요건 충족 → 청산금분 양도일(소유권이전 고시일
          다음날) 현재 1세대1주택이면 청산금 수령분은 비과세로 차감되어 양도소득금액 합산에서 제외됩니다.
        </p>
        <p className="text-muted-foreground">
          근거: PDF 사례수정 2 (2)-1번 + 부동산거래관리과-380 + 사전-2022-법규재산-1282
        </p>
      </ToneCard>
    );
  }
  if (!isUnderHighValue && isEligible) {
    return (
      <ToneCard tone="amber" title="권리가액 기준 고가주택 — 청산금 수령분 안분 과세" className="mt-2 text-caption">
        <p>
          권리가액{" "}
          <span className="font-mono tabular-nums whitespace-nowrap">{rights.toLocaleString()}</span> {">"}{" "}
          {thresholdLabel}(청산금분 양도일 기준)이면 청산금 수령분은 고가주택으로 보아 기준금액 초과분만
          과세합니다(권리가액 기준 안분 — 신축주택 양도가액의 안분 비율과 따로 계산).
        </p>
        <p className="text-muted-foreground">
          근거: 서면-2016-법령해석재산-2705 · 부동산납세과-1850 (소득세법 §95③ · 시행령 §160①)
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
