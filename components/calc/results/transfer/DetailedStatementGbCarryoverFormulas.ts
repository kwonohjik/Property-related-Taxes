/**
 * 일반건물 카드 × 배우자등 이월과세(§97의2) — 명세서 **필요경비 칸** 산식.
 *
 * `DetailedStatementGbFormulas.buildGbExpenseFormula`가 이월과세 카드도 개산공제 분기(「취득시 토지기준시가 79,800,000 × 3% = 50,000,000」)로 떨어뜨려
 * 적힌 산식이 적힌 값을 못 만들었다 — 이월과세 A 카드의 필요경비 칸은 개산공제가 아니라 본인 양도비 + 증여자 자본적지출 + 증여세 상당액이고,
 * 비교과세(B) 카드는 #2676 이후 개산공제 없이 본인 자본적지출·양도비뿐이다. 값은 전부 엔진 echo(`carryoverTaxationDetail`)와 카드 값에서 읽고 새로 계산하지 않는다.
 *
 * 계획서 `docs/00-pm/carryover-a-gb-card-filing-acq-cell-label.plan.md` §10-6 V-2. 단건 경로의 같은 분기: `DetailedStatementFormulaBuilders.buildNecessaryExpenseFormula`(A 채택).
 * `DetailedStatementGbFormulas`가 이 파일을 import 하는 **단방향** 의존이다(순환 금지 — 포맷은 로컬에 둔다).
 */
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { capExInAcquisitionColumnOfProperty } from "./exempt-gross-gain";

const fmt = (n: number) => n.toLocaleString("ko-KR");

/**
 * @param rateLabel 개산공제율 표시(예: 「3%」) — 호출부가 엔진 echo(`estimatedDeduction.landRate`·`buildingRate`)로 만든다.
 * @returns 이월과세 카드가 아니거나(또는 산식으로 풀 수 없으면) `undefined` — 호출부가 종전 분기로 간다.
 */
export function buildGbCarryoverExpenseFormula(p: PerPropertyBreakdown, rateLabel: string): string | undefined {
  const detail = p.carryoverTaxationDetail;
  if (!detail) return undefined;

  // 비교과세(B) 채택 — 취득가액이 증여 당시 평가액(실지거래가액 의제)이라 필요경비는 본인 자본적지출(§97①2호) + 양도비(§97①3호)뿐이다.
  if (detail.adoptedScenario === "B") {
    const capEx = Math.min(p.capitalExpenditureForDisplay, p.necessaryExpense);
    const transfer = p.necessaryExpense - capEx;
    if (capEx > 0 && transfer > 0) return `자본적지출 ${fmt(capEx)} + 양도비 ${fmt(transfer)} = ${fmt(p.necessaryExpense)} (§97① 2호·3호)`;
    if (capEx > 0) return `자본적지출 ${fmt(capEx)} = ${fmt(p.necessaryExpense)} (§97① 2호)`;
    if (transfer > 0) return `양도비 ${fmt(transfer)} = ${fmt(p.necessaryExpense)} (§97① 3호)`;
    return "필요경비 없음 — 이월과세를 적용하지 않아 개산공제가 없고 본인 자본적지출·양도비도 없습니다 (§97② 1호)";
  }
  if (detail.adoptedScenario !== "A") return undefined;

  // A 채택 — 신고서 칸과 같은 분해: 필요경비 칸 = 필요경비 − 취득가액 칸으로 옮긴 본인 자본적지출(`capExInAcquisitionColumn`).
  const a = detail.scenarioA;
  const shifted = capExInAcquisitionColumnOfProperty(p);
  const cellExp = Math.max(0, p.necessaryExpense - shifted);
  const gift = a.giftTaxAddedToExpense;
  const base = Math.max(0, cellExp - gift);
  const giftTerm =
    gift > 0
      ? `증여세 상당액 ${fmt(gift)}${a.giftTaxLimitApplied ? ` (한도 ${fmt(a.giftTaxLimitCap)} = 증여세 가산 전 양도차익 적용)` : ""} — 이월과세 §97의2①3호·시행령 §163의2②`
      : undefined;
  const join = (terms: Array<string | undefined>) => {
    const t = terms.filter((x): x is string => x !== undefined);
    return t.length > 1 ? `${t.join(" + ")} = ${fmt(cellExp)}` : t[0];
  };

  // 증여자 환산 본문 — 필요경비는 증여자 취득시 기준시가 기준 개산공제다(카드 자체 기준시가가 아니다).
  if (a.necessaryExpenseIsLumpDeduction === true) {
    const lumpBase = a.lumpDeductionBase ?? a.estimatedStdPriceAtAcquisition;
    return join([
      lumpBase !== undefined
        ? `개산공제 ${fmt(base)} = 취득시 기준시가 ${fmt(lumpBase)} × ${rateLabel} — 시행령 §163⑥`
        : `개산공제 ${fmt(base)} — 시행령 §163⑥`,
      giftTerm,
    ]);
  }

  // 증여자 환산 + 단서(나목) — 칸이 「취득가액 = 환산취득가 · 필요경비 = 역산 나머지」라 구성 항목으로 가르지 못한다. 산술이 맞는 합계만 적는다.
  if (a.acquisitionWasEstimated === true) {
    return `필요경비 ${fmt(p.necessaryExpense)}${shifted > 0 ? ` − 자본적지출 ${fmt(shifted)}(취득가액 칸에 표시)` : ""} = ${fmt(cellExp)} (이월과세 §97의2① · §97② 2호 단서 적용)`;
  }

  // 증여자 실가 — 본인 양도비 + 증여자 자본적지출(§97의2①2호) + 증여세 상당액. 증여자 자본적지출은 양도일 2024-01-01 전이면 에코가 0 이다.
  const donorCapex = Math.min(a.donorCapexAddedToExpense, base);
  const transfer = base - donorCapex;
  return (
    join([
      transfer > 0 ? `양도비 등 ${fmt(transfer)} (중개수수료·법무사 비용 등) — §97① 나목` : undefined,
      donorCapex > 0 ? `증여자 자본적지출 ${fmt(donorCapex)} — 이월과세 §97의2①2호` : undefined,
      giftTerm,
    ]) ?? "필요경비 없음 — 본인 양도비·증여자 자본적지출·증여세 상당액이 없습니다"
  );
}
