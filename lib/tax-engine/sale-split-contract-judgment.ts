/**
 * 공유지분 §100③ — **계약서 금액(100%)으로 판정**하고 결론만 지분에 적용한다.
 *
 * Layer 2 (Pure Engine). 계획서: `docs/00-pm/sale-split-100-3-share-scale-judgment.plan.md` (Q-1 a · Q-2 a).
 *
 * ## 왜
 *
 * 「소득세법」 §100③은 「구분 기장한 가액이 … 안분계산한 가액과 **100분의 30 이상** 차이」 — 비율 판정이다.
 * 구분 기장 가액과 안분 가액에 같은 지분율을 곱해도 비율은 변하지 않으므로 지분율은 결론에 영향이 없어야 한다.
 *
 * 그런데 종전에는 계약서 구분 기재(100%)를 지분율로 **버림**한 값과, 지분 양도가액에서 **따로 버림**된 안분 가액을
 * 비교했다. 정수 판정식(`|구분 − 안분| × 100 ≥ 안분 × 30`)이라 30% 근처에서 결론이 뒤집혔다 —
 * 계약서가 정확히 30% 차이여도 1/3 지분은 「30% 미만」이 됐다(실측: 15억 중 건물 6.5억 vs 안분 5억).
 * 지분 분할(축 B)에서는 같은 계약서의 지분끼리 결론이 달랐다.
 *
 * ## 무엇을 바꾸지 않는가 (Q-2 a)
 *
 * **적용 가액은 지금의 지분 몫 값 그대로**다 — 불분명이면 지분 안분 가액(= 안분 모드와 같은 값), 아니면 지분 구분 기재.
 * 결론이 종전과 같은 사례(경계 밖 전부)는 세액이 원 단위까지 그대로다. 판정 규칙(`judgeDeemedUnclearSplit`)은 다시 구현하지 않는다.
 */
import { judgeDeemedUnclearSplit } from "./sale-split-deemed-unclear";
import type { DeemedUnclearDetail, SaleSplitExemption, SaleSplitPair } from "./sale-split-deemed-unclear";
import type { Sec100_3Era } from "./data/sec100-3-split-era";
import type { SaleSplitJudgmentDetail } from "./types/transfer-split-gain.types";

/** 계약서(물건 전체 100%) 구분 기재 — 지분 몫으로 줄이기 전 값. 한쪽만 기재했으면 반대쪽은 계약 총액에서 도출한 값이다. */
export interface SaleSplitContract extends SaleSplitPair {
  /** 0 < r < 1 — 결과 화면 「지분 x% 적용 가액」 행 표시용. 판정에는 쓰지 않는다. */
  ownershipRatio: number;
}

/**
 * 계약서 구분 기재(100%)를 만든다 — 한쪽만 기재했으면 계약 총액으로 반대쪽을 정한다.
 * 계약 총액을 모르는데 한쪽만 기재했으면 `undefined`(종전 지분 판정으로 후퇴 — 함께 양도 안분 모드 지분 주 자산 등).
 */
export function saleSplitContractOf(
  land: number | undefined,
  building: number | undefined,
  contractTotal: number | undefined,
  ownershipRatio: number,
): SaleSplitContract | undefined {
  if (land != null && building != null) return { land, building, ownershipRatio };
  if (contractTotal == null || (land == null && building == null)) return undefined;
  return land != null
    ? { land, building: contractTotal - land, ownershipRatio }
    : { land: contractTotal - building!, building: building!, ownershipRatio };
}

export interface ContractJudgmentResult {
  deemedUnclear: boolean;
  /** 지분에 실제로 적용할 가액 — 불분명이면 지분 안분 가액, 아니면 지분 구분 기재. */
  shareApplied: SaleSplitPair;
  /** 계약서(100%) 판정 — 결과 화면 판정 표가 그대로 읽는다(Q-3 a). */
  contract: { declared: SaleSplitPair; apportioned: SaleSplitPair | null; applied: SaleSplitPair };
  detail: DeemedUnclearDetail;
}

export function judgeSaleSplitByContract(input: {
  contract: SaleSplitContract;
  /** 계약 총액(= 구분 기재 합)을 지분 경로와 **같은 basis 함수**로 안분한 값. `era === "none"`이면 `null` 허용. */
  contractApportioned: SaleSplitPair | null;
  shareDeclared: SaleSplitPair;
  shareApportioned: SaleSplitPair;
  era: Sec100_3Era;
  exemption?: SaleSplitExemption;
}): ContractJudgmentResult {
  const declared = { land: input.contract.land, building: input.contract.building };
  const judged = judgeDeemedUnclearSplit({
    declared,
    apportioned: input.contractApportioned,
    era: input.era,
    ...(input.exemption ? { exemption: input.exemption } : {}),
  });
  return {
    deemedUnclear: judged.deemedUnclear,
    shareApplied: judged.deemedUnclear ? { ...input.shareApportioned } : { ...input.shareDeclared },
    contract: { declared, apportioned: input.contractApportioned, applied: judged.applied },
    detail: judged.detail,
  };
}

/** 결과 화면 판정 표 echo — 계약서(100%) 표 + 「지분 x% 적용 가액」 행(Q-3 a). 일반건물 2-way·증축 3-way가 같이 쓴다. */
export function contractJudgmentDetail(
  c: ContractJudgmentResult,
  ownershipRatio: number,
  basis: Pick<SaleSplitJudgmentDetail, "basisKind" | "appraisalRejected">,
): SaleSplitJudgmentDetail {
  return {
    deemedUnclear: c.deemedUnclear,
    declared: c.contract.declared,
    ...(c.contract.apportioned ? { apportioned: c.contract.apportioned } : {}),
    applied: c.contract.applied,
    ...basis,
    ...c.detail,
    share: { ownershipRatio, applied: c.shareApplied },
  };
}
