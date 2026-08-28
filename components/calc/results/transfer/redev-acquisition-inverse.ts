/**
 * 재개발/재건축 합계 취득가액 역산 — 신고서 양식·계산명세서 **공용 leaf**(무의존).
 *
 * ## 왜 역산인가
 *
 * §166은 파트가 **단계별 의제**다 — 인가전 양도가액 = 권리가액 의제, 인가후 = 분양가 안분.
 * 같은 경제적 가치가 인가전의 「양도가액」이자 인가후의 「취득가액」으로 재등장하므로
 * **파트 합 ≠ 실제 양도가액이 설계상 정상**이다. 따라서 합계 취득가액은 파트를 더해서 얻을 수 없고,
 * 자기일관식에서 역산한다:
 *
 *     합계 취득가액 = 합계 양도가액 − 합계 필요경비 − 합계 양도차익
 *
 * 이러면 `양도가 = 취득가 + 필요경비 + 차익`이 **자동 보장**된다
 * (memory `feedback_redev_filing_form_acquisition_inverse`).
 *
 * ## 왜 공용 leaf인가
 *
 * 종전에는 신고서가 이 산식을 **인라인으로** 갖고, 계산명세서는 **파트 합**(`sumAcq`)을 썼다.
 * 그 결과 두 카드가 같은 화면에서 취득가액을 다르게 표시했다(C44 실측: 292,781,500 vs 512,000,000).
 * 산식을 한 곳에 두고 **양쪽이 같은 인자로 호출**해 재드리프트를 막는다.
 *
 * ⚠️ 인자까지 같아야 한다 — 술어만 공유하고 인자가 다르면 같은 병이 재발한다
 * (memory `feedback_shared_predicate_argument_parity`). 실측에서 명세서가 `estimatedLumpDeduction`을,
 * 신고서가 분기 `expenses` 합을 쓰고 있었고 그것이 3건에서 어긋났다.
 */

import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";

type RedevDetail = NonNullable<TransferTaxResult["redevelopmentDetail"]>;

export interface RedevBranchTotals {
  /** 분기별 필요경비 합 */
  expenses: number;
  /**
   * 분기별 **전체 양도차익**(12억 안분 前) 합.
   *
   * 🔴 종전에는 `branch.gain`(안분 **後** 과세대상)을 더했다. 그러면 역산 취득가액이
   *   「양도가액 − 경비 − **과세대상**」이 되어, 신고서가 바로 위에 그린 「전체 양도차익」 행
   *   (`gainBeforeAllocation` 합)과 **비과세 양도차익만큼** 어긋났다 — 사용자가 표를 위에서
   *   아래로 검산하면 맞지 않는다(결과탭 코드리뷰 #010 #024).
   *
   *   실측(재개발APT·1세대1주택 20억): 취득가액 1,317,112,601 → **292,781,500**.
   *   후자는 납세자의 실제 취득원가(실가 200,000,000 + 납부청산금 92,781,500)와 정확히 같다.
   *
   * 안분이 없는 케이스는 `gainBeforeAllocation === gain`이라 값이 바뀌지 않는다.
   */
  gain: number;
}

/**
 * 재개발 분기 합계 — 신고서·명세서 공용 단일 소스.
 *
 * 승계조합원(`successorMemberApplied`)은 §166 안분을 우회해 **인가후 분만** 신고하므로
 * 인가전·청산금 분을 더하지 않는다(사례 48).
 *
 * ⚠️ **실측상 이 분기는 no-op이다** — 엔진이 승계 시 인가전·청산금을 이미 0으로 강제하기 때문에
 * 「인가후 분만」과 「전체 합」이 같은 값이 된다(M-3 뮤테이션에 anchor가 울리지 않았다).
 * 그래도 **엔진 계약에 기대지 않고 명시적으로 남긴다** — 계약이 바뀌면 여기가 방어선이 된다.
 * 그 계약 자체는 anchor A-9가 고정한다.
 */
export function redevBranchTotals(detail: RedevDetail): RedevBranchTotals {
  /** 신고서 「전체 양도차익」 행과 **같은 인자** — 12억 안분 전 값이 있으면 그것. */
  const grossOf = (b: RedevDetail["preApproval"]) => b.gainBeforeAllocation ?? b.gain;

  if (detail.successorMemberApplied === true) {
    return {
      expenses: detail.postApprovalExistingHouse.expenses ?? 0,
      gain: grossOf(detail.postApprovalExistingHouse),
    };
  }
  return {
    expenses:
      (detail.preApproval.expenses ?? 0) +
      (detail.postApprovalExistingHouse.expenses ?? 0) +
      (detail.settlement.expenses ?? 0),
    gain:
      grossOf(detail.preApproval) +
      grossOf(detail.postApprovalExistingHouse) +
      grossOf(detail.settlement),
  };
}

/**
 * **신고 단위 합계 3값** — 양도가액·필요경비·전체 양도차익과 그로부터 역산한 취득가액.
 *
 * 신고서 양식·계산명세서·사이드바 **세 곳**이 각각 `redevBranchTotals` + `inverseRedevAcquisition`을
 * 조립하고 있었다. 산식은 같아도 **인자(양도가액)를 각자 정하면** 같은 병이 재발하므로
 * (memory `feedback_shared_predicate_argument_parity`) 조립까지 여기서 한다.
 *
 * @param baseTransferPrice 폼·엔진이 정한 본 자산의 양도가액. 청산금 수령 동시신고면
 *   엔진 echo(`settlementSeparateConsideration`)를 더해 신고 단위 대가로 만든다.
 */
export function redevFilingTotals(
  detail: RedevDetail,
  baseTransferPrice: number,
): { transferPrice: number; expenses: number; gain: number; acquisition: number } {
  const totals = redevBranchTotals(detail);
  const transferPrice = baseTransferPrice + (detail.settlementSeparateConsideration ?? 0);
  return {
    transferPrice,
    expenses: totals.expenses,
    gain: totals.gain,
    acquisition: inverseRedevAcquisition({
      totalTransferPrice: transferPrice,
      totalExpenses: totals.expenses,
      totalGain: totals.gain,
    }),
  };
}

/**
 * 합계 취득가액 = 합계 양도가액 − 합계 필요경비 − 합계 양도차익.
 *
 * 산식만 담는다 — 어떤 값을 넣을지는 호출부가 `redevBranchTotals`로 정한다.
 */
export function inverseRedevAcquisition(args: {
  totalTransferPrice: number;
  totalExpenses: number;
  totalGain: number;
}): number {
  return args.totalTransferPrice - args.totalExpenses - args.totalGain;
}
