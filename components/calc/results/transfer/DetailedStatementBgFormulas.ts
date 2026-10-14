/**
 * 계산결과 상세명세서 — **부담부증여 §159** 자산별 취득가액·필요경비 산식 빌더.
 *
 * `DetailedStatementGbFormulas.ts`(545줄)에서 분리했다. 그쪽의 부담부증여 분기는 종전에 **방식과 무관하게**
 * 「취득시 자산기준시가 × 채무액 / 증여재산 평가액(기준시가 모드 환산)」과 「안분 취득가액 × 율」을 적어서,
 * K-4(실지)·K-5(환산)·K-6(매매사례)·K-7(감정)에서 거짓 등식이 됐다 — 예: 환산 45,000,000 × 3% = 1,350,000이라고
 * 적었지만 실제 개산공제는 취득시 기준시가 × 채무비율 × 율 = 1,080,000(2026-10-14 계획서 Q-7).
 *
 * 원칙: **적힌 산식이 적힌 값을 만든다**(`feedback_aggregate_display_rederives_engine_value`).
 * 값은 전부 엔진 echo(`perAsset.*.{acquisitionMethod·presumedAcquisition·actualAcquisition·stdPriceAtAcquisition·
 * stdPriceAtTransfer·transferPrice·estimatedDeduction·estimatedDeductionRate}` · `giftValuation.max` · `assumedDebtAmount`)에서
 * 읽고 표시 층이 다시 계산하지 않는다. 중간 절사(floor)는 산식에 적지 않는다.
 *
 * 계획서: docs/00-pm/burdened-gift-appraisal-sales-case-acquisition.plan.md Q-7
 */

import type { TransferBurdenedGiftBreakdown } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

type BgAssetBreakdown = TransferBurdenedGiftBreakdown["perAsset"]["land"];

const fmt = (n: number): string => n.toLocaleString("ko-KR");

/** 개산공제율 표시 — 엔진 echo(§163⑥ 3/100 · 미등기 3/1000). */
const pct = (rate: number): string => `${(rate * 100).toFixed(1).replace(/\.0$/, "")}%`;

/** 입력 매매사례가액·감정가액 라벨 + 근거 조문(법령명+조항호). */
const PRESUMED_TEXT = {
  salesCase: { label: "매매사례가액", basis: "소득세법 시행령 §176의2③1호" },
  appraisal: { label: "감정가액", basis: "소득세법 시행령 §176의2③2호" },
} as const;

/** 자산별 취득가액 산식 — 방식(`perAsset.*.acquisitionMethod`)별. */
export function buildBgAcquisitionFormula(
  bg: TransferBurdenedGiftBreakdown,
  a: BgAssetBreakdown,
  acquisitionPrice: number,
): string {
  const debt = fmt(bg.assumedDebtAmount);
  const giftMax = fmt(bg.giftValuation.max);
  switch (a.acquisitionMethod) {
    case "actual":
      return `취득가액 = 실지취득가액 × 채무액 / 증여재산 평가액 (소득세법 §97①1호가목 · 시행령 §159①1호 본문)\n        = ${fmt(a.actualAcquisition ?? 0)} × ${debt} / ${giftMax}\n        = ${fmt(acquisitionPrice)}`;
    case "salesCase":
    case "appraisal": {
      const t = PRESUMED_TEXT[a.acquisitionMethod];
      return `취득가액 = ${t.label} × 채무액 / 증여재산 평가액 (소득세법 §97①1호나목 · ${t.basis})\n        = ${fmt(a.presumedAcquisition ?? 0)} × ${debt} / ${giftMax}\n        = ${fmt(acquisitionPrice)}`;
    }
    case "converted":
      // §97②2호 단서(실비 택일)가 발동하면 환산취득가액은 차감되지 않는다(취득가액 슬롯 0).
      if (bg.necessaryExpenseSwap?.chosen === "direct") {
        return `취득가액 = 0 (소득세법 §97②2호 단서 — 환산취득가액 대신 자본적지출·양도비를 필요경비로 정함)`;
      }
      return `취득가액 = 자산별 양도가액 × 취득시 기준시가 / 양도시 기준시가 (소득세법 시행령 §176의2②2호 — 환산취득가액)\n        = ${fmt(a.transferPrice)} × ${fmt(a.stdPriceAtAcquisition)} / ${fmt(a.stdPriceAtTransfer)}\n        = ${fmt(acquisitionPrice)}`;
    default:
      // standard_price(기준시가 모드 환산, 소령 §159①1호 괄호) · 방식 echo가 없는 옛 결과
      return `취득가액 = 취득시 자산기준시가 × 채무액 / 증여재산 평가액 (소령 §159①1호 단서 — 기준시가 모드 환산)\n        = ${fmt(a.stdPriceAtAcquisition)} × ${debt} / ${giftMax}\n        = ${fmt(acquisitionPrice)}`;
  }
}

/** 자산별 필요경비 산식 — 개산공제(base = 취득시 기준시가 × 채무비율) 또는 실비 안분. */
export function buildBgExpenseFormula(
  bg: TransferBurdenedGiftBreakdown,
  a: BgAssetBreakdown,
): string {
  /**
   * 율 echo가 없으면 **개산공제 경로가 아니다** — K-4(실지취득가)는 실비(자본적지출·양도비)를 채무비율로 안분한 값이
   * 이 슬롯에 들어간다(F-19). §97②2호 단서(swap)가 발동한 환산(K-5)도 같다 — 엔진이 율 echo를 남겨 두므로
   * 판정은 `necessaryExpenseSwap`으로 한다.
   */
  const swapDirect = a.acquisitionMethod === "converted" && bg.necessaryExpenseSwap?.chosen === "direct";
  if (a.estimatedDeductionRate === undefined || swapDirect) {
    return `필요경비 = 채무비율 안분 실비 (자본적지출·양도비)\n        = ${fmt(a.estimatedDeduction)}\n        ※ ${swapDirect ? "소득세법 §97②2호 단서 — 환산취득가액과 개산공제의 합계보다 실비가 커서 실비를 필요경비로 정했습니다." : "실지취득가액 경로라 §163⑥ 개산공제를 적용하지 않습니다."}`;
  }
  const rate = pct(a.estimatedDeductionRate);
  // 기준시가 모드(K-1~K-3)는 취득가액이 곧 취득시 기준시가 × 채무비율이라 종전 표기를 유지한다.
  if (a.acquisitionMethod === undefined || a.acquisitionMethod === "standard_price") {
    return `필요경비 = 안분 취득가액 × ${rate} (개산공제, 소령 §163⑥)\n        = ${fmt(a.acquisitionPrice)} × ${a.estimatedDeductionRate}\n        = ${fmt(a.estimatedDeduction)}`;
  }
  // 환산·매매사례·감정 — 취득가액이 기준시가 기반이 아니므로 base를 따로 적는다(취득시 기준시가 × 채무비율).
  const presumedNote =
    a.acquisitionMethod === "salesCase" || a.acquisitionMethod === "appraisal"
      ? `\n        ※ ${PRESUMED_TEXT[a.acquisitionMethod].label} 경로 — 필요경비는 개산공제만 인정하며 자본적지출·양도비는 공제하지 않습니다 (소득세법 §97②2호).`
      : "";
  return `필요경비 = 취득시 기준시가 × 채무액 / 증여재산 평가액 × ${rate} (개산공제, 소령 §163⑥)\n        = ${fmt(a.stdPriceAtAcquisition)} × ${fmt(bg.assumedDebtAmount)} / ${fmt(bg.giftValuation.max)} × ${a.estimatedDeductionRate}\n        = ${fmt(a.estimatedDeduction)}${presumedNote}`;
}
