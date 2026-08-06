/**
 * 양도가액 안분 basis 서열 — **감정평가가액 우선**, 없으면 기준시가.
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음. 순수 함수.
 * 계획서: `docs/02-design/features/general-building-sale-split-mode.plan.md` §12.3 · §21
 *
 * ## 조문 — 「부가가치세법 시행령」 제64조 제1항 (「소득세법 시행령」 §166⑥이 차용)
 *
 * 1호 본문: 토지·건물 기준시가가 **모두 있는 경우** → 공급계약일 현재 **기준시가** 비율 안분
 * 1호 **단서**: 「다만, **감정평가가액** … 이 있는 경우에는 **그 가액에 비례하여** 안분 계산한
 *              금액으로 한다」
 * 2호 본문: 어느 하나/모두 기준시가가 없고 감정평가가액이 있으면 → 감정평가가액 비율
 *
 * ⇒ **서열: 감정평가가액 > 기준시가.** 2호 단서(장부가액 → 기준시가 재안분)·3호(국세청장 고시)는
 *   입력 축이 없어 **범위 밖**이다(계획서 §12.3 · Q-8).
 *
 * ## 🔴 감정평가가액의 **시기 요건은 이 엔진이 판정하지 않는다** (2026-08-06 · Q-9 확정)
 *
 * 부가령 §64①1호 괄호는 「공급시기가 속하는 과세기간의 직전 과세기간 개시일부터 … 종료일까지」
 * 평가한 감정평가가액이라는 **기간 제한**을 둔다. 그러나 그 「공급시기」를 양도소득세의
 * 「양도시기」로 치환해 읽는 것은 **명문이 없는 유추**다(계획서 §19.2 — 대법원 판례는 「안분계산
 * 하는 **방법**을 준용한다는 의미」라고만 판시했고 본문은 확보하지 못했다).
 *
 * ⇒ **판정 대신 사용자 선택에 맡긴다.** 사용자가 「감정평가가액으로 안분한다」를 고르고 그 가액을
 *   입력하면 **그대로 basis로 채택**한다. 요건 충족 여부와 그 책임은 **사용자에게 있다**.
 *
 * 종전에는 유효 창을 계산해 벗어난 감정을 `out_of_window`로 배제하고 기준시가로 후퇴시켰다.
 * 그 판정은 **법령 해석을 엔진이 대신하는 것**이었고, 근거가 유추 한 겹 위에 서 있었다.
 *
 * ⚠️ **다만 「양쪽 모두 평가」는 계속 요구한다** — 이것은 법령 판단이 아니라 **산술적 필요조건**
 *    이다. 비율을 내려면 토지·건물 두 값이 있어야 한다. 한쪽만 있으면 `incomplete`로 배제하고
 *    기준시가로 안분한다(정상 경로에서는 validate가 먼저 막는다).
 *
 * ## 안분 산식
 *
 * `토지 = floor(총액 × basis토지 / (basis토지 + basis건물))` · `건물 = 총액 − 토지`(**잔액 흡수**).
 * 비율로 양쪽을 각각 계산하면 합이 총액과 어긋난다(메모리 `feedback_floor_residual_absorption`).
 * 분자가 MAX_SAFE_INTEGER를 넘을 수 있어 `safeMultiplyThenDivide`(BigInt fallback)를 쓴다.
 */
import { safeMultiplyThenDivide } from "./tax-utils";
import type { SaleSplitPair } from "./sale-split-deemed-unclear";

export type ApportionBasisKind = "appraisal" | "std_price";

/**
 * 감정평가가액을 basis로 쓰지 못한 이유 — 표시용(사용자가 왜 무시됐는지 알아야 한다).
 *
 * `incomplete` 하나뿐이다 — 시기 요건 배제(`out_of_window`)는 Q-9 확정으로 폐지했다(위 주석).
 */
export type AppraisalRejectReason = "incomplete";

export interface SaleApportionBasisInput {
  /** 총 양도가액 (원) */
  totalTransferPrice: number;
  /** 양도시 기준시가 (토지 = ㎡당 개별공시지가 × 면적) */
  stdPrice?: SaleSplitPair;
  /**
   * 양도시 감정평가가액 — 있으면 기준시가보다 **우선**한다.
   *
   * 감정일자는 받지 않는다 — 시기 요건을 엔진이 판정하지 않기로 했으므로 계산에 쓸 곳이 없다.
   * (폼은 기록·신고서 목적으로 일자를 **선택 입력**으로 유지한다.)
   */
  appraisal?: { value: SaleSplitPair };
}

export interface SaleApportionBasisResult {
  /** 채택된 basis. 둘 다 없으면 `null`(산출 불가). */
  kind: ApportionBasisKind | null;
  /** 안분값. 산출 불가면 `null` — **0으로 메우지 않는다**. */
  apportioned: SaleSplitPair | null;
  /** 감정을 배제한 이유 (배제한 경우만). */
  appraisalRejected?: AppraisalRejectReason;
}

/**
 * 🔴 **basis 종류에 따라 usability 기준이 다르다** (2026-08-06 1-C 통합 중 정정).
 *
 * 처음에는 두 basis 모두 「양쪽 다 양수」를 요구했다. 그러나 그 판정은 **엔진 통합 시 기존
 * fixture 1건을 차단**했다 — `pre-housing-disclosure.test.ts` D-11-1이 `양도시 건물 기준시가 0`
 * 으로 「토지 100% 안분」을 만들고 있었다. 두 값은 성질이 다르다:
 *
 * - **기준시가**: 고시·산정된 값이라 **0도 값일 수 있다**(예: 철거 예정 건물). 부가령 §64①1호는
 *   「기준시가가 **모두 있는 경우**」라 하는데, 0으로 **입력된 것**을 「없는 것」으로 볼 근거
 *   (예규·심판례)를 확인하지 못했다. ⇒ 종전 동작(합계 > 0이면 비율 산출)을 **보존**한다.
 *   법령 해석만으로 세액을 바꾸지 않는다(메모리 `feedback_unverified_authority_blocks_tax_change`).
 *
 * - **감정평가가액**: 「감정평가법인등이 **평가한** 가액」이므로 0은 평가 결과가 아니라
 *   **그 파트를 평가하지 않았다**는 뜻이다. ⇒ 양쪽 모두 양수를 요구한다(anchor B-7).
 */
function usableStdPrice(pair: SaleSplitPair | undefined): boolean {
  return !!pair && pair.land + pair.building > 0;
}

function usableAppraisal(pair: SaleSplitPair | undefined): boolean {
  return !!pair && pair.land > 0 && pair.building > 0;
}

/** 잔액 흡수 안분 — `토지 + 건물 = 총액` 불변식. */
function apportion(total: number, basis: SaleSplitPair): SaleSplitPair {
  const denom = basis.land + basis.building;
  const land = Math.floor(safeMultiplyThenDivide(total, basis.land, denom));
  return { land, building: total - land };
}

/**
 * basis 서열을 적용해 안분값을 산출한다.
 *
 * 감정평가가액이 **양쪽 다 입력**되면 그 비율을 쓰고, 그렇지 않으면 기준시가로 후퇴한다.
 * 배제 사유는 `appraisalRejected`로 남겨 화면이 이유를 표시하게 한다.
 */
export function resolveSaleApportionBasis(
  input: SaleApportionBasisInput,
): SaleApportionBasisResult {
  const { totalTransferPrice, stdPrice, appraisal } = input;

  let appraisalRejected: AppraisalRejectReason | undefined;

  if (appraisal) {
    if (usableAppraisal(appraisal.value)) {
      return {
        kind: "appraisal",
        apportioned: apportion(totalTransferPrice, appraisal.value),
      };
    }
    appraisalRejected = "incomplete";
  }

  if (usableStdPrice(stdPrice)) {
    return {
      kind: "std_price",
      apportioned: apportion(totalTransferPrice, stdPrice!),
      ...(appraisalRejected ? { appraisalRejected } : {}),
    };
  }

  // 어느 basis도 없다 — 안분 자체가 불가능하다. 호출부가 차단해야 한다.
  return {
    kind: null,
    apportioned: null,
    ...(appraisalRejected ? { appraisalRejected } : {}),
  };
}
