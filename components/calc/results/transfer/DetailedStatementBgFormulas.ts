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
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

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

/**
 * 자산별 필요경비 산식 — 개산공제(base = 취득시 기준시가 × 채무비율) 또는 실비 안분.
 *
 * 파트 슬롯(`estimatedDeduction`)은 이월과세 증여세 상당액 산입분(`carryoverGiftTax.landApplied`·`buildingApplied`, 법 §97의2①3호)을 포함한다.
 * 산식은 그 산입분을 뗀 순액으로 적고, 뒤에 「+ 증여세 상당액 … = 슬롯」을 이어 적는다 — 적힌 산식이 적힌 값을 만든다
 * (계획서 `bg-gb-carryover-statement-expense-formula.plan.md` Q-1 a · Q-2 a). 산입분이 없으면 종전 문구 그대로다.
 */
export function buildBgExpenseFormula(
  bg: TransferBurdenedGiftBreakdown,
  a: BgAssetBreakdown,
): string {
  const cgt = bg.carryoverGiftTax;
  // 어느 파트인지는 객체 동일성으로 안다 — 호출처(`cardBg`가 고른 breakdown의 `perAsset.land`/`building`)가 그대로 넘긴다.
  const part = cgt ? (a === bg.perAsset.land ? cgt.landApplied ?? 0 : a === bg.perAsset.building ? cgt.buildingApplied ?? 0 : 0) : 0;
  if (part <= 0) return expenseFormulaOf(bg, a, a.estimatedDeduction, "");
  const addition = `\n        + 증여세 상당액 ${fmt(part)} — 이월과세 §97의2①3호·시행령 §163의2②\n        = ${fmt(a.estimatedDeduction)}`;
  return expenseFormulaOf(bg, a, a.estimatedDeduction - part, addition);
}

/** `amount`는 산식이 만드는 값(산입분을 뗀 순액), `addition`은 값 줄 바로 뒤에 붙는 산입 줄. */
function expenseFormulaOf(bg: TransferBurdenedGiftBreakdown, a: BgAssetBreakdown, amount: number, addition: string): string {
  /**
   * 율 echo가 없으면 **개산공제 경로가 아니다** — K-4(실지취득가)는 실비(자본적지출·양도비)를 채무비율로 안분한 값이
   * 이 슬롯에 들어간다(F-19). §97②2호 단서(swap)가 발동한 환산(K-5)도 같다 — 엔진이 율 echo를 남겨 두므로
   * 판정은 `necessaryExpenseSwap`으로 한다.
   */
  const swapDirect = a.acquisitionMethod === "converted" && bg.necessaryExpenseSwap?.chosen === "direct";
  if (a.estimatedDeductionRate === undefined || swapDirect) {
    return `필요경비 = 채무비율 안분 실비 (자본적지출·양도비)\n        = ${fmt(amount)}${addition}\n        ※ ${swapDirect ? "소득세법 §97②2호 단서 — 환산취득가액과 개산공제의 합계보다 실비가 커서 실비를 필요경비로 정했습니다." : "실지취득가액 경로라 §163⑥ 개산공제를 적용하지 않습니다."}`;
  }
  const rate = pct(a.estimatedDeductionRate);
  // 기준시가 모드(K-1~K-3)는 취득가액이 곧 취득시 기준시가 × 채무비율이라 종전 표기를 유지한다.
  if (a.acquisitionMethod === undefined || a.acquisitionMethod === "standard_price") {
    return `필요경비 = 안분 취득가액 × ${rate} (개산공제, 소령 §163⑥)\n        = ${fmt(a.acquisitionPrice)} × ${a.estimatedDeductionRate}\n        = ${fmt(amount)}${addition}`;
  }
  // 환산·매매사례·감정 — 취득가액이 기준시가 기반이 아니므로 base를 따로 적는다(취득시 기준시가 × 채무비율).
  const presumedNote =
    a.acquisitionMethod === "salesCase" || a.acquisitionMethod === "appraisal"
      ? `\n        ※ ${PRESUMED_TEXT[a.acquisitionMethod].label} 경로 — 필요경비는 개산공제만 인정하며 자본적지출·양도비는 공제하지 않습니다 (소득세법 §97②2호).`
      : "";
  return `필요경비 = 취득시 기준시가 × 채무액 / 증여재산 평가액 × ${rate} (개산공제, 소령 §163⑥)\n        = ${fmt(a.stdPriceAtAcquisition)} × ${fmt(bg.assumedDebtAmount)} / ${fmt(bg.giftValuation.max)} × ${a.estimatedDeductionRate}\n        = ${fmt(amount)}${addition}${presumedNote}`;
}

// ── 단건(비집계) 결과 — 명세서·신고서 양식 공용 ─────────────────────────────────

/** 단건 부담부증여 표시값 — 엔진 슬롯(`perAsset.*`)의 합. 역산이 아니라 echo다. */
export interface BgSingleDisplay {
  breakdown: TransferBurdenedGiftBreakdown;
  /** 양도가액 = 자산별 양도가액 합 (= 인수 채무액). 폼 `contractTotalPrice`는 부담부증여에서 빈 칸이 정상이라 읽지 않는다. */
  transferPrice: number;
  /** 취득가액 슬롯 합 — §97②2호 단서(swap) 발동 시 0이다(`양도가액 − 취득가액 − 필요경비 = 양도차익` 항등식이 성립하는 값). */
  acquisition: number;
  /** 필요경비 슬롯 합 — 개산공제 또는 실비 안분. */
  expenses: number;
  parts: { label: string; a: BgAssetBreakdown }[];
}

/**
 * 단건 부담부증여 결과의 표시값. 해당하지 않으면 undefined — 호출부는 종전 경로를 그대로 탄다.
 *
 * 제외(종전 경로 유지): 이월과세(필요경비 줄만 `resolveBgCarryoverSingleDisplay`) · 재개발 · 겸용 · 토지·건물 별개 취득. 이 조합들은 취득가액·필요경비가 §159 슬롯과 다른 축으로
 * 정해지므로 슬롯 합을 그대로 표시하면 항등식이 깨질 수 있다(미검증 — 별건). 집계(일반건물·다건)는 호출부가 aggregate로 이미 가른다.
 */
export function resolveBgSingleDisplay(result: TransferTaxResult): BgSingleDisplay | undefined {
  if (result.carryoverTaxationDetail) return undefined;
  return bgSingleDisplayOf(result);
}

/**
 * 이월과세 단건 부담부증여의 표시값 — 필요경비 줄 전용(계획서 `bg-single-carryover-statement-expense-label.plan.md`).
 * 이월과세가 아닌 단건과 같은 슬롯 echo를 읽는다. 채택 시나리오(A·B)의 `transferBurdenedGiftBreakdown`이 결과에 실려 있다.
 * 양도가액·취득가액 줄은 이 함수를 쓰지 않는다(별건) — 이월과세 전용 문구가 따로 있다.
 */
export function resolveBgCarryoverSingleDisplay(result: TransferTaxResult): BgSingleDisplay | undefined {
  if (!result.carryoverTaxationDetail) return undefined;
  return bgSingleDisplayOf(result);
}

function bgSingleDisplayOf(result: TransferTaxResult): BgSingleDisplay | undefined {
  const bg = result.transferBurdenedGiftBreakdown;
  if (!bg || result.redevelopmentDetail || result.mixedUseDetail || result.splitDetail) {
    return undefined;
  }
  const all = [
    { label: "토지", a: bg.perAsset.land },
    { label: "건물", a: bg.perAsset.building },
  ];
  // 값이 있는 파트만 — 토지 자산은 건물 슬롯이, 주택·건물 자산은 토지 슬롯이 0이다.
  const parts = all.filter(
    ({ a }) => a.sangjeungbeopValue > 0 || a.transferPrice > 0 || a.acquisitionPrice > 0 || a.estimatedDeduction > 0,
  );
  const sum = (pick: (a: BgAssetBreakdown) => number) => all.reduce((n, { a }) => n + pick(a), 0);
  return {
    breakdown: bg,
    transferPrice: sum((a) => a.transferPrice),
    acquisition: sum((a) => a.acquisitionPrice),
    expenses: sum((a) => a.estimatedDeduction),
    parts,
  };
}

/** 파트가 둘이면 「토지 」·「건물 」 접두를 붙여 이어 쓴다 — 한 파트면 접두 없이(자산 하나의 산식이다). */
function joinParts(d: BgSingleDisplay, build: (a: BgAssetBreakdown) => string): string {
  return d.parts.length > 1
    ? d.parts.map(({ label, a }) => `${label} ${build(a)}`).join("\n")
    : d.parts.map(({ a }) => build(a)).join("\n");
}

/** 단건 취득가액 산식 — 자산별 산식(`buildBgAcquisitionFormula`)을 재사용한다(산식 단일 소스). */
export function buildBgSingleAcquisitionFormula(d: BgSingleDisplay): string {
  return joinParts(d, (a) => buildBgAcquisitionFormula(d.breakdown, a, a.acquisitionPrice));
}

/** 단건 필요경비 산식 — 자산별 산식(`buildBgExpenseFormula`)을 재사용한다. */
export function buildBgSingleExpenseFormula(d: BgSingleDisplay): string {
  return joinParts(d, (a) => buildBgExpenseFormula(d.breakdown, a));
}

/** §97②2호 단서(swap) 발동 시 취득가액 칸 고지 — 차감하지 않은 환산취득가액을 밝힌다. 미발동이면 undefined. */
export function bgSwapAcquisitionNote(d: BgSingleDisplay): string | undefined {
  if (d.breakdown.necessaryExpenseSwap?.chosen !== "direct") return undefined;
  const before = d.breakdown.convertedAcquisitionBeforeSwap;
  return `「소득세법」 §97②2호 단서 — 환산취득가액 ${fmt((before?.land ?? 0) + (before?.building ?? 0))}을 차감하지 않고 자본적지출·양도비를 필요경비로 적용`;
}
