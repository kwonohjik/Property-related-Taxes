/**
 * §89①4호 1세대1입주권 비과세 — **판정 메뉴용 결론** (P4-3b)
 *
 * 계획서 Q-7. 「판정 사실은 판정 메뉴 · 세액 산식 입력은 계산기」의 두 번째 조문이다.
 *
 * ## 🔴 §155⑳과 **방향이 반대다**
 *
 * §155⑳은 요건 미충족이면 비과세를 **끄는** 축이었다. 여기는 비과세를 **켜는** 축이다 —
 * `checkExemption`의 유일한 자산 게이트가 `propertyType !== "housing"`이라
 * (`transfer-tax-exemption.ts:197`) 입주권 양도는 §89①3호 경로에서 **항상 과세**로 나온다.
 * §89①4호는 그것과 **별개의 비과세 조문**이므로 여기서 따로 켜 준다.
 *
 * ## 🔑 규칙은 계산기와 한 벌이다
 *
 * 목 판정은 `resolveOneRightExemptionClause`, 고가 분모는 `oneRightHighValueBase` —
 * 둘 다 계산기(`applyOneRightExemption`)가 쓰는 **그 함수**다. 사실을 담아 오는 상자만
 * 화면마다 다르고(`redevelopment` / `oneRightExemptionFacts`), 규칙은 복제하지 않는다.
 *
 * ## 고가 기준금액은 양도일 연혁이다 (E-3)
 *
 * 계산기(`applyOneRightExemption`)와 **같은 leaf** `resolveOneRightHighValueThreshold(양도일)`를
 * 쓴다 — 여기서만 시대별 기준을 적용하면 두 화면이 같은 입력에 다른 답을 낸다. 연혁·근거는
 * `data/one-right-high-value-era.ts`. 미지원·확인 필요 구간은 현행 12억으로 판정하고
 * `thresholdNotice`로 알린다.
 */
import {
  oneRightHighValueBase,
  pickOneRightExemptionFacts,
  resolveOneRightExemptionClause,
  oneRightPresaleGate,
} from "../transfer-tax-redevelopment-transforms";
import { TRANSFER } from "../legal-codes/transfer";
import { REDEVELOPMENT } from "../legal-codes";
import {
  resolveOneRightHighValueThreshold,
  oneRightHighValueEraNotice,
} from "../data/one-right-high-value-era";
import {
  oneRightClauseNaYears,
  oneRightRequirementEraNotices,
} from "../data/one-right-requirement-era";
import { oneRightOtherHouseCount, resolveRightSaleMarriageMerge } from "./right-sale-marriage-merge";
import type { TransferTaxInput } from "../types/transfer.types";
import type { OneHouseJudgment } from "./types";

/** 판정 메뉴 ④가 읽는 §89①4호 결론. 금액·안분 비율은 담지 않는다(세액은 계산기의 몫). */
export type OneHouseOneRightVerdict = {
  /** 성립한 목. `null`이면 미성립 */
  clause: "ga" | "na" | null;
  /** 기준금액 이하 → 전액 비과세 */
  isExempt: boolean;
  /** 기준금액 초과 → 각 목 외의 부분 단서 + §95③ 안분(부분 비과세) */
  isPartialExempt: boolean;
  /**
   * 양도일 기준 고가 기준금액(원) — 6억·9억·12억 (E-3). 화면 문구가 리터럴을 쓰지 않게 싣는다.
   * 엔진은 항상 싣는다 — optional인 것은 이 필드가 없던 옛 이력(`resultData`)을 읽기 때문이다.
   */
  highValueThreshold?: number;
  /** 기준금액 연혁 미지원·확인 필요 구간 고지 — 성립한 경우에만 */
  thresholdNotice?: string;
  /**
   * 요건 연혁 고지(E-3 후속 — 1999년 전 미지원 · 2005년까지 1개 문언 없음 · 재건축 기준일).
   * 계산기 warnings와 같은 함수(`oneRightRequirementEraNotices`)다. 없으면 키를 싣지 않는다(옛 이력 호환).
   */
  requirementNotices?: string[];
  /** 나목 성립 시 적용한 기한(년) — 양도일 연혁 1·2·3년(E-3 후속). 가목·미성립이면 없음. */
  naYears?: number;
  /** 혼인합가(§155⑤)로 배우자 쪽 주택을 「다른 주택」에서 뺐을 때의 안내(M9). 없으면 키를 싣지 않는다. */
  marriageMergeNotice?: string;
  /** 미성립 사유 — 사용자가 어디가 모자란지 알 수 있게 전부 모은다 */
  reasons: string[];
  legalBasis: string;
};

/**
 * 입주권 양도가 아니면 `null` — 「판정할 것이 없다」이지 「미성립」이 아니다.
 *
 * @param isRightSale 양도 대상이 조합원입주권인가. route가 `propertyType`으로 판단한다.
 */
export function buildOneRightVerdict(
  input: TransferTaxInput,
  isRightSale: boolean,
): OneHouseOneRightVerdict | null {
  if (!isRightSale) return null;
  const facts = pickOneRightExemptionFacts(input);
  if (!facts) return null;

  const clause = resolveOneRightExemptionClause(facts, input);
  const highValueThreshold = resolveOneRightHighValueThreshold(input.transferDate);
  const eraNotices = oneRightRequirementEraNotices({
    transferDate: input.transferDate,
    rightApprovalDate: facts.approvalDate,
    householdRightCount: input.householdRightCount,
    eligibleAtApprovalDeclared: facts.exemptionEligibleAtApproval === true,
  });
  const requirementNotices = eraNotices.length > 0 ? { requirementNotices: eraNotices } : {};
  const marriageMerge = resolveRightSaleMarriageMerge(input);
  if (clause) {
    const overThreshold = oneRightHighValueBase(input) > highValueThreshold;
    const thresholdNotice = oneRightHighValueEraNotice(input.transferDate);
    return {
      clause,
      isExempt: !overThreshold,
      isPartialExempt: overThreshold,
      highValueThreshold,
      ...(thresholdNotice ? { thresholdNotice } : {}),
      ...requirementNotices,
      ...(clause === "na" ? { naYears: oneRightClauseNaYears(input.transferDate) ?? undefined } : {}),
      ...(marriageMerge?.status === "applies"
        ? {
            marriageMergeNotice: `혼인합가(${TRANSFER.MARRIAGE_MERGE_EXEMPT}) — 혼인한 날부터 ${marriageMerge.years}년 이내에 먼저 양도하는 입주권이라 혼인 전 배우자 쪽 주택 1채를 다른 주택에서 빼고 판정했습니다.`,
          }
        : {}),
      reasons: [],
      legalBasis: TRANSFER.ONE_RIGHT_EXEMPT,
    };
  }

  /**
   * 미성립 사유 — **판정과 같은 순서로** 다시 묻는다.
   *
   * 🔑 여기서 요건을 **판정하지 않는다**. 성립 여부는 위 `resolveOneRightExemptionClause`가
   *    이미 정했고, 이 블록은 그 결과를 사람이 읽을 말로 옮길 뿐이다. 다르게 적으면
   *    「사유는 다 채웠다는데 결론은 미성립」이 나온다.
   */
  const reasons: string[] = [];
  if (facts.exemptionEligibleAtApproval !== true) {
    reasons.push(
      "관리처분계획인가일 현재 §89①3호 가목 요건(보유 2년, 조정대상지역 취득 시 거주 2년)을 갖춘 기존주택 소유가 선언되지 않았습니다.",
    );
  }
  if (input.isOneHousehold !== true) {
    reasons.push("1세대에 해당하지 않습니다.");
  }
  if (input.householdRightCount !== 1) {
    reasons.push(
      `세대 보유 조합원입주권이 1개여야 합니다 (현재 ${input.householdRightCount ?? 0}개 — 양도 대상 포함).`,
    );
  }
  const presaleGate = oneRightPresaleGate(input, facts);
  if (presaleGate === "blocks") {
    reasons.push(
      `가목·나목 모두 세대가 분양권을 보유하지 않을 것을 요구합니다(2022.1.1. 이후 취득한 입주권에 한해 2022.1.1. 이후 취득한 분양권 — ${REDEVELOPMENT.ONE_RIGHT_PRESALE_ADDENDUM}).`,
    );
  } else if (presaleGate === "undetermined") {
    reasons.push(
      `2022.1.1. 이후 취득한 분양권이 있습니다. 양도하는 입주권의 관리처분계획인가일이 2022.1.1. 전이면 분양권 요건이 적용되지 않고(종전 규정 — ${REDEVELOPMENT.ONE_RIGHT_PRESALE_RULING}), 그 뒤면 적용됩니다 — 인가일을 입력하지 않으면 판정할 수 없어 비과세를 적용하지 않습니다.`,
    );
  }
  if (marriageMerge?.status === "fails" && marriageMerge.confirmNotice) reasons.push(marriageMerge.confirmNotice);
  const houseCount = oneRightOtherHouseCount(input);
  // 나목 기한은 양도일 연혁(1년·2년·3년) — 2005.12.31. 이전 양도분은 나목이 없다(E-3 후속).
  const naYears = oneRightClauseNaYears(input.transferDate);
  if (houseCount > 1) {
    reasons.push(
      naYears === null
        ? `다른 주택이 ${houseCount}채입니다. 2005.12.31. 이전 양도분은 양도일 현재 다른 주택이 없어야 합니다.`
        : `다른 주택이 ${houseCount}채입니다. 가목은 0채, 나목은 1채(그 주택 취득일부터 ${naYears}년 이내 양도)여야 합니다.`,
    );
  } else if (houseCount === 1 && naYears === null) {
    reasons.push(
      `2005.12.31. 이전 양도분은 양도일 현재 다른 주택이 없어야 합니다 — 1주택 보유 경로(현행 나목)는 2006.1.1. 이후 양도분부터입니다(${REDEVELOPMENT.ONE_RIGHT_DECREE_155_16}).`,
    );
  } else if (houseCount === 1 && !facts.otherHouseAcquisitionDate) {
    reasons.push(
      `나목 판정에는 세대 보유 1주택의 취득일이 필요합니다. 입력하지 않으면 ${naYears}년 요건을 판정할 수 없어 나목을 적용하지 않습니다.`,
    );
  } else if (houseCount === 1) {
    reasons.push(
      `나목 — 그 1주택을 취득한 날부터 ${naYears}년 이내에 입주권을 양도해야 합니다. ${naYears}년을 넘겼습니다.`,
    );
  }

  return {
    clause: null,
    isExempt: false,
    isPartialExempt: false,
    highValueThreshold,
    ...requirementNotices,
    reasons,
    legalBasis: TRANSFER.ONE_RIGHT_EXEMPT,
  };
}

/**
 * 판정에 §89①4호 결론을 **반영**한다.
 *
 * 🔴 성립하면 **비과세를 켠다**. `checkExemption`은 입주권을 §89①3호로 보아 과세로 돌려보내는데
 *    (`propertyType !== "housing"` 게이트), 그 결과를 그대로 두면 판정 메뉴가 §89①4호 비과세를
 *    **영원히 말하지 못한다**.
 *
 * 🔑 미성립이면 **손대지 않는다** — 이미 과세다. 여기서 다시 끄면 「왜 과세인가」의 근거가
 *    두 곳이 되어 어느 쪽이 정본인지 흐려진다.
 *
 * 🔑 새 객체를 돌려준다(입력 judgment 불변).
 */
export function applyOneRightVerdict(
  judgment: OneHouseJudgment,
  verdict: OneHouseOneRightVerdict | null,
): OneHouseJudgment {
  if (!verdict || !verdict.clause) return judgment;
  return {
    ...judgment,
    isExempt: verdict.isExempt,
    isPartialExempt: verdict.isPartialExempt,
    appliedExceptions: [
      ...judgment.appliedExceptions,
      {
        id: `one_right_89_1_4_${verdict.clause}`,
        label:
          verdict.clause === "ga"
            ? "1세대1입주권 비과세 — 가목(다른 주택·분양권 미보유)"
            : `1세대1입주권 비과세 — 나목(1주택 취득일부터 ${verdict.naYears ?? 3}년 이내 양도)`,
        legalBasis: verdict.legalBasis,
      },
    ],
  };
}
