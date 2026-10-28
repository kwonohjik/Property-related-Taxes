/**
 * 이월과세 × 당초 증여 때 인수한 채무 부분(매입분) — **표시 문장 정본** (순수 함수).
 *
 * 결과 카드(`CarryoverComparisonCard`)와 이후의 다른 결과 면이 **같은 문장**을 쓰도록 한곳에 둔다.
 * 값은 전부 엔진 echo(`CarryoverScenarioADetail.purchasedPartSplit`)이고 여기서 새로 계산하지 않는다(표시 드리프트 방지).
 * 한국어 풀어쓰기 — 변수 약어·`floor()` 금지, 산식의 숫자마다 변수명 라벨, 중간 산술 결과(몫 %)는 표시하지 않는다(`components/calc/CLAUDE.md`).
 * 유불리·절감 표현을 쓰지 않는다. 「증여분」·「매입분」은 계획서 §0 사용자 결정 어휘이므로 제목에 괄호 정의를 붙인다.
 *
 * 설계서: docs/02-design/features/carryover-gift-debt-purchased-part.ui.design.md §7
 */
import type { CarryoverPieceEcho, CarryoverPurchasedPartSplit } from "./types/transfer-carryover.types";

const won = (n: number): string => n.toLocaleString("ko-KR");

/**
 * 방법 고지 — 비율·취득가액·취득일은 법령에 정한 방법이 없고 사용자 결정이다(계획서 §1 마지막 줄).
 * 다른 사용자 결정 계산과 같은 규약(「정면 해석례 미확보 — 확인 필요」 · `DONOR_BUILT_APPLIED_NOTICE`)을 따른다.
 */
export const CARRYOVER_PURCHASED_PART_METHOD_NOTICE =
  "채무 인수 부분의 몫·취득가액·취득일은 법령에 정해져 있지 않아 다음 방법으로 계산했습니다 — 몫: 인수한 채무 ÷ 증여 당시 평가액, 취득가액: 인수한 채무, 취득일: 증여 등기접수일. 이 방법에 대한 해석례는 확인하지 못했습니다 — 확인 필요.";

/**
 * 결과 고지 — 채무 처리가 세 상태 중 어느 것인지 **엔진 echo 하나**로 가른다(폼 입력에서 유도하면 이력·재열람에서 어긋난다).
 *  - T0 `none`: 채무 없음(고지 없음).
 *  - T1 `split`: 시나리오 A로 증여분·매입분으로 나누어 계산했다(E1·E2, A 채택).
 *  - T2 `numerator_only`: 채무가 있으나 나누지 않고 증여세 상당액 안분의 분자에서만 뺐다(E3 주택 분리 파트 · 일반건물 부담부증여 E4는 echo가 없어 PR-3).
 * 유불리·절감 표현을 쓰지 않는다.
 */
export type CarryoverDebtTreatment = { kind: "none" } | { kind: "split"; line: string } | { kind: "numerator_only"; line: string };

/** T1 — 인쇄·PDF·상세명세서용 한 줄. */
export function carryoverPurchasedPartLine(s: CarryoverPurchasedPartSplit): string {
  return `당초 증여 때 인수한 채무(${won(s.debtAmount)})는 양도로 보는 부분(매입분)으로 나누어 계산했습니다 — 증여분은 당초 증여자의 취득가액·취득일, 매입분은 인수한 채무·증여 등기접수일 기준입니다.`;
}

/** T2 — 인수채무를 분자에서만 뺀 입력의 한 문장. `label`(토지·건물)은 파트별로 알릴 때만 붙인다. */
export function carryoverNumeratorOnlyLine(debtAmount: number, label?: string): string {
  return `${label ? `${label}: ` : ""}당초 증여 때 인수한 채무(${won(debtAmount)})는 증여세 상당액 안분의 분자(증여 당시 평가액 − 인수한 채무)에서만 뺐습니다. 채무 인수 부분을 증여분과 나누어 계산하지는 않았습니다.`;
}

/** 부모 카드의 이월과세 detail(echo) → 고지 상태. 조각은 A 채택일 때만 세액에 반영된다(B 채택이면 `none`). */
export function carryoverDebtTreatment(
  detail: { adoptedScenario?: "A" | "B"; scenarioA?: { purchasedPartSplit?: CarryoverPurchasedPartSplit } } | undefined,
): CarryoverDebtTreatment {
  const split = detail?.scenarioA?.purchasedPartSplit;
  return split && detail?.adoptedScenario === "A" ? { kind: "split", line: carryoverPurchasedPartLine(split) } : { kind: "none" };
}

export type PurchasedPartRowKey = "transfer-price" | "acquisition-price" | "acquisition-date" | "holding-years" | "rate" | "transfer-gain";

export interface PurchasedPartRow {
  key: PurchasedPartRowKey;
  /** 「양도가액 [양도가액 × 증여분 몫]」 — 괄호는 그 값의 산정 근거 */
  label: string;
  value: string;
}

export interface PurchasedPartPieceView {
  /** 블록 제목 */
  title: string;
  rows: PurchasedPartRow[];
}

/** 산식 한 줄 — `lead` 뒤에 분수(있으면)와 `= result`를 이어 그린다. */
export interface PurchasedPartFormulaLine {
  lead: string;
  frac?: { top: string; bottom: string };
  result: string;
}

export interface PurchasedPartView {
  /** 증여분 — 채무가 증여 당시 평가액과 같으면(증여받은 부분 없음) null */
  gift: PurchasedPartPieceView | null;
  /** gift가 null일 때의 한 줄 안내 */
  giftNone: string | null;
  purchased: PurchasedPartPieceView;
  formulaLines: PurchasedPartFormulaLine[];
  notice: string;
}

/** 단기 보유(2년 미만) 조각만 세율 구분을 보인다 — 매입분 취득일이 증여일이라 세율이 갈릴 수 있는 근거(계획서 §2). */
const rateRow = (p: CarryoverPieceEcho): PurchasedPartRow[] =>
  p.holdingPeriodYears < 2
    ? [{ key: "rate", label: "세율 구분 [보유기간 2년 미만]", value: `단기 보유 세율 ${Math.round(p.appliedRate * 10000) / 100}%` }]
    : [];

function pieceView(kind: "gift" | "purchased", p: CarryoverPieceEcho, wholeSale: boolean): PurchasedPartPieceView {
  const g = kind === "gift";
  return {
    title: g ? "증여분 (당초 증여자 기준)" : "매입분 (채무 인수 부분)",
    rows: [
      {
        key: "transfer-price",
        label: g ? "양도가액 [양도가액 × 증여분 몫]" : wholeSale ? "양도가액 [양도가액 전액]" : "양도가액 [양도가액 − 증여분 양도가액]",
        value: won(p.transferPrice),
      },
      { key: "acquisition-price", label: g ? "취득가액 [당초 증여자 취득가 × 증여분 몫]" : "취득가액 [당초 증여 때 인수한 채무]", value: won(p.acquisitionPrice) },
      { key: "acquisition-date", label: g ? "취득일 [당초 증여자 취득일]" : "취득일 [증여 등기접수일]", value: p.acquisitionDate },
      { key: "holding-years", label: g ? "보유기간 [당초 증여자 기산]" : "보유기간 [증여 등기접수일 기산]", value: `${p.holdingPeriodYears}년` },
      ...rateRow(p),
      { key: "transfer-gain", label: "양도차익", value: won(p.transferGain) },
    ],
  };
}

/** echo → 표시. 값은 echo 그대로이고 새로 계산하지 않는다. */
export function carryoverPurchasedPartView(s: CarryoverPurchasedPartSplit): PurchasedPartView {
  const topText = `증여 당시 평가액 ${won(s.giftValuation)} − 인수한 채무 ${won(s.debtAmount)}`;
  const bottomText = `증여 당시 평가액 ${won(s.giftValuation)}`;
  const gift = s.gift;
  const lines: PurchasedPartFormulaLine[] = gift
    ? [
        { lead: `증여분 양도가액 = 양도가액 ${won(s.transferPrice)} ×`, frac: { top: topText, bottom: bottomText }, result: won(gift.transferPrice) },
        { lead: `증여분 취득가액 = 당초 증여자 취득가액 ${won(s.donorAcquisitionPrice)} ×`, frac: { top: topText, bottom: bottomText }, result: won(gift.acquisitionPrice) },
        { lead: `매입분 양도가액 = 양도가액 ${won(s.transferPrice)} − 증여분 양도가액 ${won(gift.transferPrice)}`, result: won(s.purchased.transferPrice) },
      ]
    : [];
  return {
    gift: gift ? pieceView("gift", gift, false) : null,
    giftNone: gift ? null : `증여분 없음 — 인수한 채무 ${won(s.debtAmount)}가 증여 당시 평가액 ${won(s.giftValuation)}과 같아 양도가액 전액이 매입분입니다`,
    purchased: pieceView("purchased", s.purchased, !gift),
    formulaLines: lines,
    notice: CARRYOVER_PURCHASED_PART_METHOD_NOTICE,
  };
}

/**
 * 상세명세서 «자산별» 산식 — 조각 카드(증여분·매입분)의 양도가액·취득가액. 카드 값이 조각 후 값이라 조각 전 카드(환산·안분 산식)의 산식을 그대로 붙이면 등식이 거짓이 된다
 * (실측: 증여분 양도가액 375,000,000 옆에 「1,000,000,000 × 200,000,000 / 400,000,000」). 값·산식은 전부 echo(`purchasedPartSplit`)에서 읽고 새로 계산하지 않는다.
 * 나눗셈 피연산자는 괄호로 감싼다(`renderFormula`가 분수로 바꾸는 규약).
 */
export function purchasedPartPieceFormula(
  properties: ReadonlyArray<{ propertyId: string; carryoverTaxationDetail?: { adoptedScenario?: "A" | "B"; scenarioA?: { purchasedPartSplit?: CarryoverPurchasedPartSplit } } }>,
  propertyId: string,
  kind: "transfer" | "acquisition",
): string | undefined {
  for (const p of properties) {
    const d = p.carryoverTaxationDetail;
    const s = d?.scenarioA?.purchasedPartSplit;
    if (!s || d?.adoptedScenario !== "A") continue;
    const share = `(증여 당시 평가액 ${won(s.giftValuation)} − 인수한 채무 ${won(s.debtAmount)}) ÷ (증여 당시 평가액 ${won(s.giftValuation)})`;
    if (s.gift && s.gift.propertyId === propertyId)
      return kind === "transfer"
        ? `증여분 양도가액 = 양도가액 ${won(s.transferPrice)} × ${share} = ${won(s.gift.transferPrice)}`
        : `증여분 취득가액 = 당초 증여자 취득가액 ${won(s.donorAcquisitionPrice)} × ${share} = ${won(s.gift.acquisitionPrice)}`;
    if (s.purchased.propertyId === propertyId)
      return kind === "transfer"
        ? s.gift
          ? `매입분 양도가액 = 양도가액 ${won(s.transferPrice)} − 증여분 양도가액 ${won(s.gift.transferPrice)} = ${won(s.purchased.transferPrice)}`
          : `매입분 양도가액 = 양도가액 전액 ${won(s.transferPrice)} (인수한 채무가 증여 당시 평가액과 같아 증여분 없음)`
        : `매입분 취득가액 = 당초 증여 때 인수한 채무 ${won(s.debtAmount)} (취득일 = 증여 등기접수일 ${s.purchased.acquisitionDate})`;
  }
  return undefined;
}
