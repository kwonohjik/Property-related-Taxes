/**
 * 일체 주택 **본인 신축** × 「소득세법」 §114조의2 가산세(건물분) — **표시 문구 정본** (순수 함수).
 *
 * 결과 카드(`SelfBuiltPenaltyCard`)·상세명세서·신고서·PDF가 **같은 문장**을 쓰도록 한곳에 둔다.
 * 값은 전부 엔진 echo(`TransferTaxResult.selfBuiltHousingPenalty`)이고 여기서 새로 계산하지 않는다(표시 드리프트 방지).
 * 한국어 풀어쓰기 — 변수 약어·`floor()` 금지(`components/calc/CLAUDE.md`). 유불리·절감 표현을 쓰지 않는다.
 *
 * 증여자 신축 문장 정본(`transfer-tax-carryover-donor-display.ts`)을 일반화하지 않고 따로 둔다(Q-13) —
 * 증여자/본인 분기 문구가 갈라지는 지점이 많고, 일반화하면 이월과세 4뷰의 회귀 면적이 커진다.
 *
 * 계획서: docs/00-pm/self-built-housing-building-base-114-2.plan.md §7.9 · Q-7 · Q-8 · Q-13
 */
import { TRANSFER } from "./legal-codes";
import type { SelfBuiltEchoEntry, SelfBuiltHousingPenaltyEcho } from "./types/transfer-self-built-housing.types";

const won = (n: number): string => n.toLocaleString("ko-KR");

/** 정면 해석례 미확보 고지 — Q-7 초안 B. 「적용했다」는 사용자 확정 해석이라 유지하고 미확보 사실만 덧붙인다. */
const UNCONFIRMED = "일체 주택의 건물분만 기준으로 하는 정면 해석례는 확인하지 못했습니다 — 확인 필요.";

const NOTICE_HEAD = `본인이 신축한 일체 주택(토지와 건물을 함께 공시한 개별주택가격·공동주택가격)은 ${TRANSFER.BUILDING_PENALTY} 「해당 건물」의 `;

type Basis = "estimated" | "appraisal_direct" | "appraisal_apportioned";
const basisOf = (e: SelfBuiltHousingPenaltyEcho): Basis =>
  e.method === "estimated" ? "estimated" : e.appraisal?.mode === "apportioned" ? "appraisal_apportioned" : "appraisal_direct";

/** 가산세 기준액의 이름 — 신고서 각주·집계 산식·카드 제목이 같은 말을 쓴다 */
const BASIS_LABEL: Record<Basis, string> = {
  estimated: "건물분 환산취득가액",
  appraisal_direct: "건물 감정가액",
  appraisal_apportioned: "건물분 감정가액",
};

const NOTICE: Record<Basis, string> = {
  estimated: `${NOTICE_HEAD}환산취득가액을 가산세 기준으로 보아 건물분만 적용했습니다(토지분 제외). 건물분은 주택공시가격을 토지 기준시가와 건물 기준시가의 비율로 나누어 구했습니다. ${UNCONFIRMED}`,
  appraisal_direct: `${NOTICE_HEAD}감정가액을 가산세 기준으로 보아 감정평가서에 구분 표시된 건물 감정가액만 적용했습니다(토지분 제외). ${UNCONFIRMED}`,
  appraisal_apportioned: `${NOTICE_HEAD}감정가액을 가산세 기준으로 보아 건물분만 적용했습니다(토지분 제외). 감정평가서에 토지와 건물의 가액이 구분 표시되지 않아 감정가액 총액을 취득 당시 토지 기준시가와 건물 기준시가의 비율로 나누어 구했습니다. ${UNCONFIRMED}`,
};

export interface SelfBuiltPenaltyView {
  /** 카드 제목 */
  title: string;
  /** 요건·기산 설명 한 줄 */
  windowLine: string;
  /** 산식 줄들 — 앞에서부터 순서대로 읽는다. 마지막 줄이 가산세 산식이다 */
  formulaLines: string[];
  /** 고지 — 「적용했다 + 정면 해석례 미확보 — 확인 필요」 */
  notice: string;
}

/** echo → 표시. `undefined`(이 축이 base 를 정하지 않음)면 undefined. echo 는 적용됐을 때만 실린다. */
export function selfBuiltPenaltyView(e: SelfBuiltHousingPenaltyEcho | undefined): SelfBuiltPenaltyView | undefined {
  if (!e) return undefined;
  const basis = basisOf(e);
  const lines: string[] = [];
  if (basis === "estimated") {
    const f = e.formula;
    const h = e.housingSplit;
    if (f && h) {
      // `× (분자) ÷ (분모)` — 결과뷰는 `FormulaText`가 분수로 그린다(괄호 피연산자 규약, 평문 매체 PDF는 그대로 읽힌다)
      lines.push(
        `${BASIS_LABEL.estimated} ${won(e.base)} = 건물분 양도가액 ${won(f.multiplicand)} × (취득 당시 건물분 기준시가 ${won(f.numerator)}) ÷ (양도 당시 건물분 기준시가 ${won(f.denominator)})`,
      );
      lines.push(`취득 당시 주택공시가격 ${won(h.acquisitionHousing)} = 토지분 ${won(h.acquisitionLand)} + 건물분 ${won(h.acquisitionBuilding)}`);
      lines.push(`양도 당시 주택공시가격 ${won(h.transferHousing)} = 토지분 ${won(h.transferLand)} + 건물분 ${won(h.transferBuilding)}`);
      lines.push("건물분 기준시가는 주택공시가격을 토지 기준시가와 건물 기준시가의 비율로 나눈 값입니다 — 토지분은 가산세 대상에서 제외합니다 (소득세법 §99①1호, 시행령 §166⑥).");
    } else {
      lines.push(`가산세 기준액 = ${BASIS_LABEL.estimated} ${won(e.base)}`);
    }
  } else if (basis === "appraisal_apportioned" && e.appraisal) {
    const a = e.appraisal;
    lines.push(
      `${BASIS_LABEL.appraisal_apportioned} ${won(e.base)} = 감정가액 총액 ${won(a.totalAppraisal ?? 0)} × (취득 당시 건물 기준시가 ${won(a.buildingStdPriceAtAcquisition ?? 0)}) ÷ (취득 당시 토지 기준시가 ${won(a.landStdPriceAtAcquisition ?? 0)} + 건물 기준시가 ${won(a.buildingStdPriceAtAcquisition ?? 0)})`,
    );
    lines.push("감정평가서에 토지와 건물의 가액이 구분 표시되지 않아 감정가액 총액을 취득 당시 토지 기준시가와 건물 기준시가의 비율로 나눈 값입니다 — 토지분은 가산세 대상에서 제외합니다 (소득세법 §100②, 시행령 §166⑥의 안분 체계).");
  } else {
    lines.push(`${BASIS_LABEL[basis]} ${won(e.base)} (감정평가서에 구분 표시된 건물 감정가액 — 토지분을 안분하지 않습니다)`);
  }
  lines.push(`가산세 ${won(e.penalty)} = ${won(e.base)} × 5%`);
  return {
    title: `본인 신축 건물 ${e.method === "estimated" ? "환산취득가액" : "감정가액"} 가산세 (${TRANSFER.BUILDING_PENALTY})`,
    windowLine: `신축 취득일 ${e.constructionDate}부터 5년이 되는 날(${e.fifthAnniversary})까지 양도하는 경우입니다.`,
    formulaLines: lines,
    notice: NOTICE[basis],
  };
}

/** 집계·상세명세서 자산별 줄 — 「가산세 N (건물분 환산취득가액 B × 5%)」의 괄호 안 */
export function selfBuiltPenaltyBasisFormula(e: SelfBuiltHousingPenaltyEcho | undefined): string | undefined {
  return e ? `${BASIS_LABEL[basisOf(e)]} ${won(e.base)} × 5%` : undefined;
}

/** 신고서 «가산세액» 칸 각주 — 값은 echo 그대로, 한 문장 */
export function selfBuiltPenaltyFilingNote(e: SelfBuiltHousingPenaltyEcho | undefined): string | undefined {
  if (!e) return undefined;
  const head = `${TRANSFER.BUILDING_PENALTY} 본인 신축 건물 가산세 ${won(e.penalty)} (= ${BASIS_LABEL[basisOf(e)]} ${won(e.base)} × 5%)`;
  const f = e.formula;
  if (e.method === "estimated" && f) {
    return `${head} · 건물분 양도가액 ${won(f.multiplicand)} × (취득 당시 건물분 기준시가 ${won(f.numerator)}) ÷ (양도 당시 건물분 기준시가 ${won(f.denominator)})`;
  }
  return head;
}

/**
 * 결과 4뷰가 읽는 **카드별 echo 목록** — 집계 어댑터 result(`selfBuiltPenaltyEchoes`)면 그 목록(자산 라벨 포함),
 * 단건·건별 result 면 `selfBuiltHousingPenalty` 하나를 라벨 없이 담는다. 4뷰가 각자 경로를 읽으면 한쪽 뷰만 놓친다(표시 드리프트).
 */
export function resultSelfBuiltEchoes(
  r: { selfBuiltHousingPenalty?: SelfBuiltHousingPenaltyEcho; selfBuiltPenaltyEchoes?: SelfBuiltEchoEntry[] } | undefined,
): Array<{ label?: string; echo: SelfBuiltHousingPenaltyEcho }> {
  if (r?.selfBuiltPenaltyEchoes) return r.selfBuiltPenaltyEchoes;
  return r?.selfBuiltHousingPenalty ? [{ echo: r.selfBuiltHousingPenalty }] : [];
}

/** 집계(함께 양도·다건) 어댑터가 카드(자산)별 echo 를 모으는 **단일 수집 지점** */
export function selfBuiltResultEchoes(
  properties: ReadonlyArray<{ propertyId: string; propertyLabel?: string; selfBuiltHousingPenalty?: SelfBuiltHousingPenaltyEcho }>,
): SelfBuiltEchoEntry[] {
  return properties.flatMap((p) => (p.selfBuiltHousingPenalty ? [{ label: p.propertyLabel ?? p.propertyId, echo: p.selfBuiltHousingPenalty }] : []));
}
