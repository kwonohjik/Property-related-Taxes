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
 * ## ⚠️ 고가 임계는 **12억 하드코딩**이다 — 일부러 그렇게 둔다
 *
 * 다른 경로는 `resolveHighValueHouseThreshold(양도일)`(6억/9억/12억)을 쓰지만, 입주권 경로는
 * P1이 **의도적으로 이월**했다(계획서 §13.3): 2021-12-07까지 금액이 시행령에 위임돼 있었는데
 * **그 위임 조항의 번호·연혁을 실독하지 못했고**, 근거 없이 낮은 기준을 소급하면 납세자에게
 * **불리한 방향으로** 틀린다. ⇒ 판정 메뉴도 계산기와 **같은 상수**를 쓴다. 여기서만 시대별
 * 기준을 적용하면 두 화면이 같은 입력에 다른 답을 낸다.
 */
import {
  HIGH_VALUE_THRESHOLD,
  oneRightHighValueBase,
  pickOneRightExemptionFacts,
  resolveOneRightExemptionClause,
  householdHoldsPresaleRight,
} from "../transfer-tax-redevelopment-transforms";
import { TRANSFER } from "../legal-codes/transfer";
import type { TransferTaxInput } from "../types/transfer.types";
import type { OneHouseJudgment } from "./types";

/** 판정 메뉴 ④가 읽는 §89①4호 결론. 금액·안분 비율은 담지 않는다(세액은 계산기의 몫). */
export type OneHouseOneRightVerdict = {
  /** 성립한 목. `null`이면 미성립 */
  clause: "ga" | "na" | null;
  /** 12억 이하 → 전액 비과세 */
  isExempt: boolean;
  /** 12억 초과 → 각 목 외의 부분 단서 + §95③ 안분(부분 비과세) */
  isPartialExempt: boolean;
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
  if (clause) {
    const overThreshold = oneRightHighValueBase(input) > HIGH_VALUE_THRESHOLD;
    return {
      clause,
      isExempt: !overThreshold,
      isPartialExempt: overThreshold,
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
  if (householdHoldsPresaleRight(input)) {
    reasons.push("가목·나목 모두 세대가 분양권을 보유하지 않을 것을 요구합니다.");
  }
  const houseCount = input.householdHousingCount;
  if (houseCount > 1) {
    reasons.push(
      `다른 주택이 ${houseCount}채입니다. 가목은 0채, 나목은 1채(그 주택 취득일부터 3년 이내 양도)여야 합니다.`,
    );
  } else if (houseCount === 1 && !facts.otherHouseAcquisitionDate) {
    reasons.push(
      "나목 판정에는 세대 보유 1주택의 취득일이 필요합니다. 입력하지 않으면 3년 요건을 판정할 수 없어 나목을 적용하지 않습니다.",
    );
  } else if (houseCount === 1) {
    reasons.push(
      "나목 — 그 1주택을 취득한 날부터 3년 이내에 입주권을 양도해야 합니다. 3년을 넘겼습니다.",
    );
  }

  return {
    clause: null,
    isExempt: false,
    isPartialExempt: false,
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
            : "1세대1입주권 비과세 — 나목(1주택 취득일부터 3년 이내 양도)",
        legalBasis: verdict.legalBasis,
      },
    ],
  };
}
