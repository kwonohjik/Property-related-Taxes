/**
 * 다건 양도소득세 계산 API 호출
 * MultiTransferFormData → POST /api/calc/transfer/multi → AggregateTransferResult
 *
 * 건별 payload 변환(`buildPropertyPayload`)은 `multi-transfer-property-payload.ts`로 옮겼다(800줄 정책) — 소비처가 많아 여기서 다시 내보낸다.
 */

import { parseAmount } from "@/lib/calc/number-parse";
import type { MultiTransferFormData, PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { CrossLossExternalAsset } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { computeAutoPriorPaid } from "@/lib/calc/multi-prior-filed";
import { ruralSurtaxAmountPayload } from "./transfer-unpaid-tax-mode";
import { buildPropertyPayload } from "./multi-transfer-property-payload";

export { buildPropertyPayload };

/**
 * §133 5년 이력 — 다건 top-level 합성.
 *
 * 인별(동일 납세자) 이력이지만 다건 자산 편집은 단건 마법사(Step5)를 재사용하므로
 * 각 건의 form.priorReductionUsage에 분산 입력될 수 있다. 동일 항목(연도·유형·금액)이
 * 여러 건에 중복 입력된 경우는 같은 이력의 재입력으로 보고 1건으로 dedup하여 합성한다.
 */
export function mergePriorReductionUsage(
  properties: PropertyItem[],
): { year: number; type: string; amount: number }[] {
  const seen = new Set<string>();
  const merged: { year: number; type: string; amount: number }[] = [];
  for (const p of properties) {
    for (const r of p.form.priorReductionUsage ?? []) {
      const key = `${r.year}:${r.type}:${r.amount}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ year: r.year, type: r.type, amount: r.amount });
    }
  }
  return merged;
}

export async function callMultiTransferTaxAPI(
  multiForm: MultiTransferFormData,
  properties: PropertyItem[],
  /**
   * 🔴 **크로스 §102② 통산 주입** — 부동산 ↔ 기타자산 합산 화면 전용(계획서 §5.2 축 3).
   * 폼에 두지 않는 이유는 주식 쪽과 같다 — 사용자 입력이 아니라 **상대 엔진의 계산 결과**다.
   */
  opts: { crossLossOffsetExternal?: CrossLossExternalAsset[] } = {},
): Promise<AggregateTransferResult> {
  const propertiesPayload = properties.map((p) => ({
    propertyId: p.propertyId,
    propertyLabel: p.propertyLabel,
    ...buildPropertyPayload(p.form, Boolean(multiForm.amendmentMode)),
  }));

  // 확정신고 기납부세액 정산 (§111③) — 미편집 시 신고일 필터 자동 파생(computeAutoPriorPaid),
  // 사용자 편집(priorPaidTaxEdited) 시 입력값 우선. 엔진 입력 = 필터값 → settlement·신고서 정합.
  const autoPriorPaid = computeAutoPriorPaid(properties);
  const priorPaidTax = multiForm.priorPaidTaxEdited
    ? parseAmount(multiForm.priorPaidTax ?? "0")
    : autoPriorPaid.national;
  // 🔴 지방소득세는 **자기 플래그**를 본다(H5) — 공유하면 한쪽 편집이 다른 쪽 자동값을 0으로 만든다.
  const priorPaidLocalTax = multiForm.priorPaidLocalTaxEdited
    ? parseAmount(multiForm.priorPaidLocalTax ?? "0")
    : autoPriorPaid.local;

  const body: Record<string, unknown> = {
    taxYear: multiForm.taxYear,
    properties: propertiesPayload,
    annualBasicDeductionUsed: parseAmount(multiForm.annualBasicDeductionUsed),
    basicDeductionAllocation: multiForm.basicDeductionAllocation,
    priorPaidTax,
    priorPaidLocalTax,
    // ⑬ §133 5년 누적 한도 — 인별 이력 (TypeScript 미감지 영역, 누락 시 침묵 stripping)
    priorReductionUsage: mergePriorReductionUsage(properties),
    // ⑬ 크로스 §102② 외부 행 — 같은 미감지 영역. 누락 시 통산이 **세액에 닿지 않는다**.
    ...(opts.crossLossOffsetExternal && opts.crossLossOffsetExternal.length > 0
      ? { crossLossOffsetExternal: opts.crossLossOffsetExternal }
      : {}),
    // [B3] 신고서 단위 수정신고·경정청구 — 단건 payload(transfer-tax-api.ts:528)와 동형.
    ...(multiForm.amendmentMode
      ? {
          amendment: {
            correctionKind: multiForm.correctionKind,
            originalDeterminedTax: parseAmount(multiForm.originalDeterminedTax),
            // NH-39 — 당초 농특세(단건 ④와 같은 leaf)
            ...ruralSurtaxAmountPayload("originalRuralSurtax", multiForm.originalRuralSurtax),
            // [F6] 경정청구(refund)는 가산세 없음 → 플래그 강제 false(stale 누출 차단)
            applyUnderReportingPenalty:
              multiForm.correctionKind === "refund_claim" ? false : multiForm.applyUnderReportingPenalty,
            underReportingReason: multiForm.underReportingReason,
            underReductionMode: multiForm.underReductionMode,
            ...(multiForm.statutoryFilingDeadline
              ? { statutoryFilingDeadline: multiForm.statutoryFilingDeadline }
              : {}),
            ...(multiForm.amendedFilingDate ? { amendedFilingDate: multiForm.amendedFilingDate } : {}),
            priorAssessmentNotified: multiForm.priorAssessmentNotified,
            applyLatePaymentPenalty:
              multiForm.correctionKind === "refund_claim" ? false : multiForm.applyLatePaymentPenalty,
            ...(multiForm.amendedPaymentDate ? { amendedPaymentDate: multiForm.amendedPaymentDate } : {}),
            ...(multiForm.correctionKind === "refund_claim"
              ? { claimReasonType: multiForm.claimReasonType }
              : {}),
            ...(multiForm.posteriorEventDate ? { posteriorEventDate: multiForm.posteriorEventDate } : {}),
          },
        }
      : {}),
  };

  const res = await fetch("/api/calc/transfer/multi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) {
    const errPayload = json?.error;
    const baseMsg = errPayload?.message ?? "계산 중 오류가 발생했습니다.";
    const fieldErrors = errPayload?.fieldErrors as
      | Record<string, string[]>
      | undefined;
    if (fieldErrors && Object.keys(fieldErrors).length > 0) {
      const details = Object.entries(fieldErrors)
        .map(([path, msgs]) => `• ${humanizeFieldPath(path)}: ${msgs.join(", ")}`)
        .join("\n");
      throw new Error(`${baseMsg}\n${details}`);
    }
    throw new Error(baseMsg);
  }
  return json.data as AggregateTransferResult;
}

/** Zod 필드 경로(영문) → 사용자 친화 한글 경로 변환 */
function humanizeFieldPath(path: string): string {
  const labels: Record<string, string> = {
    properties: "양도 건",
    transferPrice: "양도가액",
    acquisitionPrice: "취득가액",
    transferDate: "양도일",
    acquisitionDate: "취득일",
    expenses: "필요경비",
    propertyType: "자산 종류",
    standardPriceAtAcquisition: "취득시 기준시가",
    standardPriceAtTransfer: "양도시 기준시가",
    sellingHouseStdPriceAtTransfer: "양도 주택 양도 당시 기준시가",
    useEstimatedAcquisition: "환산취득가 사용",
    householdHousingCount: "세대 주택 수",
    residencePeriodMonths: "거주기간",
    isRegulatedArea: "조정대상지역(양도시)",
    wasRegulatedAtAcquisition: "조정대상지역(취득시)",
    isOneHousehold: "1세대 여부",
    isUnregistered: "미등기 여부",
    isNonBusinessLand: "비사업용 토지",
    reductions: "감면",
    taxYear: "과세연도",
    annualBasicDeductionUsed: "연간 기사용 기본공제",
    basicDeductionAllocation: "기본공제 배분",
    filingPenaltyDetails: "신고 가산세",
    delayedPaymentDetails: "납부지연",
  };
  return path
    .split(".")
    .map((seg) => {
      if (/^\d+$/.test(seg)) return `${parseInt(seg, 10) + 1}번`;
      return labels[seg] ?? seg;
    })
    .join(" · ");
}
