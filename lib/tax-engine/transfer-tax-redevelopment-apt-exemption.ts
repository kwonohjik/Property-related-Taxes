/**
 * §166 재개발 분기 — **완공 신축주택(subject="apt") §89①3호가목 비과세 판정** (STEP 0.65 전처리).
 *
 * `transfer-tax.ts`에서 분리했다(800줄 정책 — 2026-09-26 OH-19·OH-48 수정으로 넘칠 지점).
 * 동작은 종전 IIFE와 같고, 바뀐 것은 아래 두 곳뿐이다(각 주석의 🔴).
 *
 * 🔴 **§89①3호가목 비과세 판정 — 2026-08-25 추가 (E3-01).**
 *
 * 재개발 분기는 STEP 1(`checkExemption`)보다 **먼저** return하므로 비과세 판정을 통째로
 * 건너뛰고 있었다. 그런데 `calculateRedevelopmentTax`는 §95③ **12억 초과 안분만** 구현해
 * 두어, 1세대1주택 요건을 갖춘 완공 신축주택이 양도가액 **12억 이하**면 전액 과세되고
 * 12억을 1원 넘기면 안분으로 세액이 0에 수렴하는 **불연속**이 생겼다
 * (실측: 12억 98,241,000원 → 12억+1원 0원).
 *
 * ⚠️ **subject="apt"(완공 신축주택) 전용이다.** 조합원입주권(subject="right") 양도의
 *    비과세는 §89①**4호**이고 그 경로는 `applyOneRightExemption`이 이미 담당한다 —
 *    여기서 §89①3호를 함께 태우면 근거가 다른 두 규정이 겹친다.
 *
 * 주택수 제외 스텝을 함께 태우는 이유: §99의4·§98의9·감면주택 제외가 반영된
 * `exemptionJudgeInput`이라야 일반 주택 경로와 **같은 판정**이 나온다. steps에도 그대로
 * 쌓여 근거가 보인다(일반 경로와 동일한 additive 동작).
 */
import { runHouseCountExclusionStep } from "./transfer-tax-house-exclusion-step";
import { judgeOneHouseExemptionFromInput } from "./one-house/judge";
import { presaleRightStartDate, type ParsedRates } from "./transfer-tax-helpers";
import { resolveAptResidenceMonths } from "./redevelopment-lthd";
import type { CalculationStep, TransferTaxInput, TransferTaxResult } from "./types/transfer.types";

export type RedevHouseCountExclusion = Pick<
  TransferTaxResult,
  "new994Detail" | "unsold989Detail" | "specialHouseExclusionDetail"
>;

export function judgeRedevAptOneHouseExemption(
  redevInput: TransferTaxInput,
  steps: CalculationStep[],
  hceGeneralHouseAcquisitionDate: Date | undefined,
  parsedRates: ParsedRates,
): {
  exemptionResult: ReturnType<typeof judgeOneHouseExemptionFromInput> | undefined;
  /** STEP 0.9+0.95 산출물 — `calculateRedevelopmentTax`로 넘긴다 (D4-08). */
  houseCountExclusion: RedevHouseCountExclusion | undefined;
} {
  const redev = redevInput.redevelopment;
  if (redev?.subject !== "apt") return { exemptionResult: undefined, houseCountExclusion: undefined };
  /**
   * ⚠️ **청산금 「수령」 단독신고(사례 46 · `receiveOnlyMode`)만 제외한다.**
   *
   * 단독신고의 양도 대상은 신축주택이 아니라 **종전 부동산 일부(청산금 상당분)**이고, 그 비과세
   * 축은 「양도일 현재 신축주택」이 아니라 **「관리처분 인가일 현재 종전주택이 §89①3호가목 요건을
   * 충족했는지」**다(서면-2016-법령해석재산-2705). 그 사실은 `exemptionEligibleAtApproval`
   * 자기선언이 담고, 전용 규칙 `applySettlementExemption`(Step A.6)이 그 축으로 판정한다.
   * 여기서 양도일 기준 판정을 겹치면 근거가 다른 두 규정이 충돌한다(실측: 사례 46 — 「인가일 현재
   * 요건 미충족」 선언인데 양도일 기준으로는 충족이라 전액 비과세가 되어 안내와 계산이 어긋났다).
   *
   * 🔴 **종전에는 청산금 수령 「동시신고」(사례 47)까지 함께 제외했다** (2026-09-26 · OH-19).
   *    게이트가 `settlementDirection !== "receive"`라 `receiveOnlyMode`를 보지 않았다. 동시신고의
   *    양도 대상에는 **신축주택**(인가전 분·인가후 기존건물분)이 들어 있고, 그 부분은 일반 신축주택과
   *    같이 양도일 현재 §89①3호가목·시행령 §154① 요건으로 판정해야 한다. 판정을 건너뛰자
   *    12억 이하는 신축주택분이 전액 과세되고(실측 10억 54,351,000 · 12억 71,071,000), 12억 초과는
   *    요건 확인 없이 §95③ 안분이 걸렸다(§95③의 대상은 「제89조제1항제3호에 따라 비과세대상에서
   *    제외되는 고가주택」뿐이다). 청산금분은 여전히 `applySettlementExemption`이 인가일 축으로
   *    판정한다 — `applyAptOneHouseExemption`이 수령 방향에서는 청산금 분기를 건드리지 않는다.
   */
  if (redev.settlementDirection === "receive" && redev.receiveOnlyMode === true) {
    return { exemptionResult: undefined, houseCountExclusion: undefined };
  }
  const {
    exemptionJudgeInput,
    new994Detail,
    unsold989Detail,
    specialHouseExclusionDetail,
  } = runHouseCountExclusionStep(redevInput, steps, hceGeneralHouseAcquisitionDate);
  // 🔴 종전에는 `exemptionJudgeInput`만 꺼내고 나머지 셋을 버렸다 — 결과에 실리지 않아
  //   §99의4⑥ 3년 미보유 **추징 경고**(`clawbackWarning`)·농어촌주택 보유기간·
  //   §98의9 `dualExclusionWarning`이 통째로 사라졌다(코드리뷰 D4-08).
  //   적격 미달(isEligible=false)이면 step조차 push되지 않아 근거가 아예 안 남는다.
  //   실측: 같은 사실관계에서 §99의4가 세액을 111,228,857 → 0으로 바꾸는데 카드가 없다.
  const houseCountExclusion: RedevHouseCountExclusion = {
    new994Detail,
    unsold989Detail,
    specialHouseExclusionDetail:
      specialHouseExclusionDetail.entries.length > 0 ? specialHouseExclusionDetail : undefined,
  };
  /**
   * `checkExemption`의 유일한 자산 게이트는 `propertyType !== "housing"`이다.
   * 재개발로 **완공된 신축주택**은 소득세법 §94①1호 「건물」이자 §89①3호가목의 「주택」이므로
   * 그 게이트를 통과해야 한다. `redevelopment_apt`는 이 저장소가 §166 분기 라우팅을 위해
   * 쓰는 **내부 자산종류 태그**이지 법령상 자산 구분이 아니다.
   * ⇒ 판정 경계에서만 `housing`으로 번역한다(게이트 자체를 넓히면 §166 데이터가 없는
   *   다른 경로까지 함께 바뀌므로 이 배치의 범위를 넘는다).
   */
  /**
   * 🔑 **승계조합원 신축주택의 취득시기는 준공일이다** — 「소득세법 시행령」 §162①4호
   * 「자기가 건설한 건축물에 있어서는 **사용승인서 교부일**」(+ 사전-2019-법령해석재산-0649).
   * 원조합원(종전주택 제공)은 소유권의 연장이라 종전주택 취득일이 그대로 취득시기지만,
   * 승계조합원은 입주권을 취득한 것이라 신축주택 취득시기가 따로 정해진다.
   *
   * 엔진은 이미 이 규칙을 쓰고 있다 — `runSuccessorMember`의 보유기간·`§104②` 세율 기산
   * 모두 `completionDate`다. 비과세(§154① 보유 2년) 판정만 원래 취득일을 쓰면 **한 계산
   * 안에서 취득시기가 두 개**가 된다(실측: 사례 48 — 준공 2.5개월인데 비과세로 판정됐다).
   */
  const isSuccessor = redev.isSuccessorMember === true;
  const exemptionAcquisitionDate =
    isSuccessor && redev.completionDate ? redev.completionDate : exemptionJudgeInput.acquisitionDate;
  /**
   * 🔴 **거주월수도 표2와 같은 값이어야 한다** (2026-09-26 · OH-48 · OH-50).
   *
   * 종전에는 Step4 거주값(`residencePeriodMonths`)을 그대로 넘겨, 재개발 카드의 분리 입력
   * (§154⑧1호 통산)을 쓰는 표2와 한 계산 안에서 답이 갈렸다. 규칙과 근거는
   * `resolveAptResidenceMonths` 주석에 모았다(승계조합원은 준공 후 신축주택 거주만).
   */
  const exemptionResidenceMonths = resolveAptResidenceMonths({
    isSuccessorMember: isSuccessor,
    priorHouseResidenceMonths: redev.priorHouseResidenceMonths,
    newHouseResidenceMonths: redev.newHouseResidenceMonths,
    residencePeriodMonths: exemptionJudgeInput.residencePeriodMonths,
  });
  const exemptionResult = judgeOneHouseExemptionFromInput(
    {
      ...exemptionJudgeInput,
      propertyType: "housing",
      acquisitionDate: exemptionAcquisitionDate,
      residencePeriodMonths: exemptionResidenceMonths,
    },
    parsedRates.oneHouseSpecialRules,
    presaleRightStartDate(parsedRates),
  );
  return { exemptionResult, houseCountExclusion };
}
