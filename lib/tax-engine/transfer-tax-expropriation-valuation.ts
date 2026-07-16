/**
 * 공익수용 환산취득가액 — 양도당시 기준시가 차감 특례 (**소득세법 시행령 §164⑨ 1호**)
 *
 * 취득가 불명(환산) 자산이 협의매수·수용된 경우, 환산 분모(양도당시 기준시가)를
 * min[기준시가 ㎡당, 보상 ㎡당가액, 보상산정 기초 기준시가] × 면적 으로 낮춘다(취득가액↑·차익↓).
 *
 * §164⑨ 원문은 "차액을 차감"이나 전개하면 min[]과 동치다:
 *   m = min(보상액, 보상기초),  m < A 이면 A − (A − m) = m,  m ≥ A 이면 차감 없음
 *   ∴ 양도당시 기준시가 = min(A, 보상액, 보상기초)
 *
 * ⚠️ **근거 정정(2026-07-16)**: 종전 주석은 이 특례를 "집행기준 99-164-12"로 인용하고 **토지 전용**
 *    이라 단정했으나, 둘 다 사실이 아니다.
 *    - 집행기준은 국세청 **행정규칙**이고, 법령 근거는 **시행령 §164⑨**이다(MST 286211 원문 확인).
 *    - §164⑨은 법 §99①1호 **"가목부터 라목까지"** — 토지(가)·건물(나)·오피스텔/상업용 건물(다)·
 *      주택(라) **전부**가 대상이다. 하위 행정규칙이 시행령의 범위를 축소할 수 없다.
 *    ⇒ 이 함수는 **자산 종류를 판정한다**(게이트 5조건 중 1) — `expropriation-scope.ts` 단일 소스 위임.
 *      UI·validate도 같은 파일의 진입점을 쓴다(3층 명시, 계획 Q4·Q7).
 *
 * ⚠️ **§164⑨ 2호(공매·강제경매·저당권실행 경매 → min[기준시가, 공매·경락가액]) 미구현** — 계획 P4.
 *
 * 순수 함수 — 게이트 미충족 시 null(현행 총액 유지, 회귀0).
 * 계획: docs/02-design/features/expropriation-valuation-164-9-scope-expansion.plan.md
 */

import type { TransferTaxInput } from "./types/transfer.types";
import {
  isExprValuationEligiblePropertyType,
  EXPR_VALUATION_MIN_TRANSFER_DATE,
} from "./expropriation-scope";

/** 산출근거 — Map 금지(JSON 소실), Record로 노출 */
export interface ExpropriationValuationDetail {
  /** 원/㎡ 3후보 */
  perSqmCandidates: { standard: number; compensation: number; basis: number };
  /** 적용값 = min(3) */
  chosenPerSqm: number;
  /** 양도 면적 (㎡) */
  area: number;
  /** 환산 분모(총액) = chosenPerSqm × area (floor) */
  denominator: number;
}

export interface ExpropriationValuationParams {
  /**
   * 자산 종류 — §164⑨은 법 §99①1호 **가목~라목**만 대상(§99①2호 권리는 제외).
   * 판정은 `expropriation-scope.ts` 단일 소스 위임.
   *
   * ⚠️ **필수(optional 아님)** — optional로 두면 신규 호출부가 빠뜨려도 tsc가 못 잡고
   *    게이트가 조용히 부적격 처리해 **특례가 소리 없이 죽는다**. 이 특례는 이미
   *    "호출부가 1곳뿐이라 5개 경로가 우회"한 전례가 있다(계획 §3-0) — 같은 실수를 타입으로 막는다.
   */
  propertyType: TransferTaxInput["propertyType"];
  useEstimatedAcquisition?: boolean;
  transferCause?: "general" | "public_expropriation";
  transferDate: Date;
  /** 양도시 기준시가 (원/㎡) */
  standardPricePerSqmAtTransfer?: number;
  /** 양도 면적 (㎡) */
  transferArea?: number;
  /** 보상가액 (원/㎡) */
  compensationPerSqm?: number;
  /** 보상산정 기초 기준시가 (원/㎡) */
  compensationBasisStdPrice?: number;
}

/**
 * 특례 적용 하한 — 양도(수용) 시점 기준.
 *
 * ⚠️ **근거 정정(2026-07-16)**: 종전 주석은 이 날짜를 "집행기준 99-164-12 시행 기준일"이라 했으나
 *    집행기준은 국세청 **행정규칙**이고, 법령 근거는 시행령 §164⑨이다. 종전 근거 표기는 폐기한다.
 *
 * **이 날짜를 유지하는 이유 (보수적 선택)**:
 *   이 모듈이 구현한 **3후보 min[]**은 §164⑨의 **현행 문언**(1호 "보상액과 보상액 산정의 기초가 되는
 *   기준시가 **중 적은 금액**" = 2후보 + 기준시가 자신)에 대응한다. **과거 시점 문언은 확인하지 못했다**
 *   (아래 ⚠️). 확인되지 않은 구법에 현행 3후보 모델을 적용하는 것은 위험하므로, **현행 문언이 확실히
 *   적용되는 구간으로 한정**한다.
 *
 * ⇒ 2009.02.04 이전 양도분은 **미지원**이다 — 이는 "특례가 없다"는 판단이 **아니라** "구법 문언을
 *   확인하지 못해 지원하지 않는다"는 뜻이다(정합이 아니라 **알려진 갭**). 계획 §11-X3(별건).
 *
 * ⚠️ **미검증 (추정 금지 — 확인되면 이 주석을 갱신할 것)**:
 *   1. **이 날짜 자체의 법령 근거** — §164⑨의 신설·개정 시점을 법제처 원문으로 **확인하지 못했다**.
 *      과거 시점 조회(`efYd`)·연혁 MST 조회가 모두 NOT_FOUND다.
 *   2. **부칙 적용례** — "이 영 시행 후 최초로 양도하는 분부터" 등 문언 미확보. 양도일 기준 게이트가
 *      자연스러운 해석이나 **원문 미검증**이다.
 *   3. **과거 시점 문언의 대상·후보 구조** — 미확인.
 *
 * ✅ **원문 확인됨**: 현행 §164⑨(법제처 MST 286211) — 대상은 법 §99①1호 **"가목부터 라목까지"**
 *    (토지·건물·오피스텔/상업용 건물·주택 **전부**), 1호 수용(3후보 min[]), 2호 공매·경락(미구현 — 계획 P4).
 */
const MIN_TRANSFER_DATE = new Date(EXPR_VALUATION_MIN_TRANSFER_DATE);

export function applyExpropriationValuation(
  p: ExpropriationValuationParams,
): { denominator: number; detail: ExpropriationValuationDetail } | null {
  const perSqm = p.standardPricePerSqmAtTransfer ?? 0;
  const comp = p.compensationPerSqm ?? 0;
  const basis = p.compensationBasisStdPrice ?? 0;
  const area = p.transferArea ?? 0;

  // 게이트 (5조건 AND) — 미충족 시 null(현행 총액 유지)
  // ⚠️ 자산종류 축은 UI·validate와 **동일 소스**(expropriation-scope.ts)를 쓴다 — 여기서
  //    목록을 재구현하면 3층 드리프트가 재발한다(계획 Q4·Q7).
  if (
    !isExprValuationEligiblePropertyType(p.propertyType) ||
    !p.useEstimatedAcquisition ||
    p.transferCause !== "public_expropriation" ||
    p.transferDate < MIN_TRANSFER_DATE ||
    perSqm <= 0 ||
    comp <= 0 ||
    basis <= 0 ||
    area <= 0
  ) {
    return null;
  }

  const chosenPerSqm = Math.min(perSqm, comp, basis);
  // 면적 반올림 UI 일치(feedback_area_rounding_consistency) 후 곱, floor
  const area2 = parseFloat(area.toFixed(2));
  const denominator = Math.floor(chosenPerSqm * area2);

  return {
    denominator,
    detail: {
      perSqmCandidates: { standard: perSqm, compensation: comp, basis },
      chosenPerSqm,
      area: area2,
      denominator,
    },
  };
}
