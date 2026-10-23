/**
 * 이월과세 × 증여자 신축·증축 §114조의2 가산세 — **표시 문구 정본** (순수 함수).
 *
 * 결과 카드(`CarryoverComparisonCard`)·상세명세서·신고서·PDF·경고(`result.warnings`)가 **같은 문장**을 쓰도록 한곳에 둔다.
 * 값은 전부 엔진 echo(`CarryoverTaxationDetail.donorBuiltPenalty`)이고 여기서 새로 계산하지 않는다(표시 드리프트 방지).
 * 한국어 풀어쓰기 — 변수 약어·`floor()` 금지(`components/calc/CLAUDE.md`). 유불리·절감 표현을 쓰지 않는다.
 *
 * 계획서: docs/00-pm/carryover-donor-built-114-2.plan.md §7
 */
import { TRANSFER } from "./legal-codes";
import type { DonorBuiltPenaltyEcho } from "./types/transfer-carryover.types";
import type { DonorBuiltEchoEntry } from "./gb-result-donor-built-echoes";

const won = (n: number): string => n.toLocaleString("ko-KR");
const typeLabel = (e: DonorBuiltPenaltyEcho): string => (e.buildingType === "extension" ? "증축" : "신축");
const dateLabel = (e: DonorBuiltPenaltyEcho): string => (e.buildingType === "extension" ? "증축 완공일" : "신축 취득일");

/** 이월과세를 적용하지 않아 가산세가 붙지 않은 경우의 중립 안내 — 사용자 확정 문구(2026-10-22). */
export const DONOR_BUILT_NOT_APPLIED_CARRYOVER_NOTICE =
  `이월과세를 적용하지 않아 수증자 취득가액을 증여 당시 평가액(실지거래가액)으로 계산했고, 증여자 신축분 ${TRANSFER.BUILDING_PENALTY} 가산세는 붙지 않았습니다.`;

/** 부담부증여 K-7(감정가액) — base 가 감정가액이다. §114조의2 조문 제목은 «감정가액 또는 환산취득가액 적용에 따른 가산세». 환산·자산 전체·분리 이월과세는 위 기존 문구. */
export const DONOR_BUILT_OUTSIDE_WINDOW_APPRAISAL_NOTICE =
  `증여자가 신축·증축한 건물로 입력했지만 ${TRANSFER.BUILDING_PENALTY} 요건(신축·증축일부터 5년 이내 양도 · 감정가액 적용 시행일(2020.1.1.) 이후 양도 · 증축은 바닥면적 85㎡ 초과)을 충족하지 않아 가산세는 붙지 않았습니다.`;

/** A 채택인데 §114조의2 요건(5년 이내·환산 시행일 이후·증축은 85㎡ 초과)을 채우지 못한 경우 */
export const DONOR_BUILT_OUTSIDE_WINDOW_NOTICE =
  `증여자가 신축·증축한 건물로 입력했지만 ${TRANSFER.BUILDING_PENALTY} 요건(신축·증축일부터 5년 이내 양도 · 환산취득가액 적용 시행일 이후 양도 · 증축은 바닥면적 85㎡ 초과)을 충족하지 않아 가산세는 붙지 않았습니다.`;

/** 가산세를 적용한 경우의 고지 — 「적용했다 + 정면 해석례 미확보」(사용자 확정 Q-5). */
export const DONOR_BUILT_APPLIED_NOTICE =
  `증여자가 신축·증축한 건물에 ${TRANSFER.BUILDING_PENALTY} 환산취득가액 가산세를 적용했습니다(증여자 신축·증축일 기산, 증여자 기준 환산취득가액의 건물분 5%, 증축은 증축 부분). 증여자 신축분에 대한 정면 해석례는 확인하지 못했습니다 — 확인 필요.`;

/** 부담부증여 K-7(감정가액) 적용 고지 — 「적용했다 + 정면 해석례 미확보」(Q-5)의 감정가액판. */
export const DONOR_BUILT_APPLIED_APPRAISAL_NOTICE =
  `증여자가 신축·증축한 건물에 ${TRANSFER.BUILDING_PENALTY} 감정가액 가산세를 적용했습니다(증여자 신축·증축일 기산, 당초 증여자 기준 감정가액의 건물분 5%, 증축은 증축한 부분의 감정가액). 증여자 신축분에 대한 정면 해석례는 확인하지 못했습니다 — 확인 필요.`;

/**
 * 토지·건물 분리 이월과세(P6)에서 건물 파트의 증여자 취득가액을 환산취득가액으로 계산했는데 «증여자 신축·증축» 정보가 없는 경우 —
 * 가산세를 붙이지 않았다는 사실과 입력 경로를 알린다(침묵 금지). 증여자 신축분 정면 해석례는 확인하지 못했다.
 */
export const DONOR_BUILT_SPLIT_UNDECLARED_NOTICE =
  `건물 파트의 증여자 취득가액을 환산취득가액으로 계산했습니다. 증여자가 그 건물을 신축·증축한 뒤 5년 이내에 양도하는 경우 ${TRANSFER.BUILDING_PENALTY} 환산취득가액 가산세 대상일 수 있으나, «증여자 신축·증축» 정보가 입력되지 않아 가산세는 붙이지 않았습니다. 증여자 신축분에 대한 정면 해석례는 확인하지 못했습니다 — 확인 필요.`;

/** (부담부증여) A 채택이지만 가산세 기준액(채무비율 안분 후 건물분 환산취득가액·감정가액)이 0원이라 가산세가 붙지 않은 경우 — 당초 증여자 건물 값이 0 */
export const DONOR_BUILT_ZERO_BASE_NOTICE =
  `증여자가 신축·증축한 건물로 입력했지만 가산세 기준액(채무비율 안분 후 건물분 환산취득가액·감정가액)이 0원이라 ${TRANSFER.BUILDING_PENALTY} 가산세는 붙지 않았습니다 — 당초 증여자의 건물 취득 당시 기준시가·감정가액을 확인하세요.`;

export interface DonorBuiltPenaltyView {
  applied: boolean;
  /** 카드 제목 */
  title: string;
  /** 요건·기산 설명 한 줄 */
  windowLine?: string;
  /** 산식 줄들 — 앞에서부터 순서대로 읽는다 */
  formulaLines: string[];
  /** 안내·고지 (경고 목록에도 같은 문장이 들어간다) */
  notice: string;
}

/** echo → 표시. `undefined`(donorBuilt 미입력)면 undefined. */
export function donorBuiltPenaltyView(e: DonorBuiltPenaltyEcho | undefined): DonorBuiltPenaltyView | undefined {
  if (!e) return undefined;
  // 산정방식 — 부담부증여 K-7 만 감정가액이다(그 밖은 환산취득가액). 제목·고지·경고·4뷰가 이 한 곳을 읽는다.
  const appraisal = e.burdenedGift?.method === "appraisal";
  const title = `증여자 ${typeLabel(e)} 건물 ${appraisal ? "감정가액" : "환산취득가액"} 가산세 (${TRANSFER.BUILDING_PENALTY})`;
  if (!e.applied) {
    return {
      applied: false,
      title,
      formulaLines: [],
      notice:
        e.notAppliedReason === "outside_penalty_window"
          ? appraisal
            ? DONOR_BUILT_OUTSIDE_WINDOW_APPRAISAL_NOTICE
            : DONOR_BUILT_OUTSIDE_WINDOW_NOTICE
          : e.notAppliedReason === "zero_base"
            ? DONOR_BUILT_ZERO_BASE_NOTICE
            : DONOR_BUILT_NOT_APPLIED_CARRYOVER_NOTICE,
    };
  }
  const lines: string[] = [];
  const f = e.formula;
  if (e.burdenedGift) {
    // 부담부증여(§159) — base 는 채무비율 안분 **후** 건물분(기존 본인 신축 K-5/K-7 과 같은 규칙). 증축이면 증축 부분.
    const ext = e.buildingType === "extension";
    const what = e.burdenedGift.method === "appraisal" ? (ext ? "증축한 부분의 감정가액" : "건물 감정가액") : ext ? "증축 부분 환산취득가액" : "건물 환산취득가액";
    lines.push(`가산세 기준액 = 당초 증여자 ${what} 중 채무비율 안분 후 금액 ${won(e.base!)}`);
  } else if (e.housingSplit && f) {
    // `× (분자) ÷ (분모)` — 결과뷰는 `FormulaText`가 분수로 그린다(괄호 피연산자 규약, 평문 매체 PDF는 그대로 읽힌다)
    lines.push(
      `건물분 환산취득가액 ${won(e.base!)} = 건물분 양도가액 ${won(f.multiplicand)} × (${e.buildingType === "extension" ? "증축 완공 당시 증축 부분 기준시가" : "취득 당시 건물분 기준시가"} ${won(f.numerator)}) ÷ (양도 당시 건물분 기준시가 ${won(f.denominator)})`,
    );
    lines.push(
      "건물분 기준시가는 주택공시가격을 토지 기준시가와 건물 기준시가의 비율로 나눈 값입니다 — 토지분은 가산세 대상에서 제외합니다 (소득세법 §99①1호, 시행령 §166⑥).",
    );
  } else if (f) {
    lines.push(
      `증축 부분 환산취득가액 ${won(e.base!)} = 양도가액 ${won(f.multiplicand)} × (증축 완공 당시 증축 부분 기준시가 ${won(f.numerator)}) ÷ (양도 당시 기준시가 ${won(f.denominator)})`,
    );
  } else {
    lines.push(`가산세 기준액 = 증여자 환산취득가액 ${won(e.base!)} (건물)`);
  }
  lines.push(`가산세 ${won(e.penalty!)} = ${won(e.base!)} × 5%`);
  return {
    applied: true,
    title,
    windowLine: `증여자 ${dateLabel(e)} ${e.constructionDate}부터 5년이 되는 날(${e.fifthAnniversary})까지 양도하는 경우입니다.`,
    formulaLines: lines,
    notice: appraisal ? DONOR_BUILT_APPLIED_APPRAISAL_NOTICE : DONOR_BUILT_APPLIED_NOTICE,
  };
}

/**
 * 결과에서 증여자 신축·증축 가산세 echo 를 읽는 **단일 지점** — 자산 전체 이월과세(`carryoverTaxationDetail`)와 토지·건물 분리 이월과세 건물 파트
 * (`splitDetail.building.carryover`, PR-3)가 둘 다 같은 `DonorBuiltPenaltyEcho`를 낸다. 두 경로는 상호배제라 둘 중 하나만 존재한다.
 * 결과 4뷰가 각자 경로를 읽으면 한쪽 뷰만 분리 경로를 놓친다(표시 드리프트).
 */
export function resultDonorBuiltEcho(
  r:
    | {
        carryoverTaxationDetail?: { donorBuiltPenalty?: DonorBuiltPenaltyEcho };
        splitDetail?: { building?: { carryover?: { donorBuiltPenalty?: DonorBuiltPenaltyEcho } } };
      }
    | undefined,
): DonorBuiltPenaltyEcho | undefined {
  return r?.carryoverTaxationDetail?.donorBuiltPenalty ?? r?.splitDetail?.building?.carryover?.donorBuiltPenalty;
}

/**
 * 결과 4뷰가 읽는 **카드별 echo 목록** — 집계 어댑터 result(`donorBuiltPenaltyEchoes`, PR-5a)면 그 목록(자산 라벨 포함),
 * 단건 result 면 위 `resultDonorBuiltEcho` 하나를 라벨 없이 담는다. 집계는 한 화면에 echo 가 여러 장일 수 있다(지분 분할 · 다건).
 */
export function resultDonorBuiltEchoes(
  r:
    | (Parameters<typeof resultDonorBuiltEcho>[0] & { donorBuiltPenaltyEchoes?: DonorBuiltEchoEntry[] })
    | undefined,
): Array<{ label?: string; echo: DonorBuiltPenaltyEcho }> {
  if (r?.donorBuiltPenaltyEchoes) return r.donorBuiltPenaltyEchoes;
  const single = resultDonorBuiltEcho(r);
  return single ? [{ echo: single }] : [];
}

/** `result.warnings` 에 넣는 문장 — 입력이 없으면 undefined */
export function donorBuiltPenaltyNotice(e: DonorBuiltPenaltyEcho | undefined): string | undefined {
  return donorBuiltPenaltyView(e)?.notice;
}

/** 신고서 «가산세액» 칸 각주 — 적용된 경우만 */
export function donorBuiltPenaltyFilingNote(e: DonorBuiltPenaltyEcho | undefined): string | undefined {
  const v = donorBuiltPenaltyView(e);
  if (!v?.applied) return undefined;
  const basis = e!.burdenedGift?.method === "appraisal" ? "채무비율 안분 후 건물 감정가액" : e!.burdenedGift ? "채무비율 안분 후 건물 환산취득가액" : "건물분 환산취득가액";
  return `${TRANSFER.BUILDING_PENALTY} 증여자 ${typeLabel(e!)} 건물 가산세 ${won(e!.penalty!)} (= ${basis} ${won(e!.base!)} × 5%)`;
}
