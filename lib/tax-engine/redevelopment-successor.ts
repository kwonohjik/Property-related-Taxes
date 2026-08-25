/**
 * 재개발/재건축 양도소득세 — 승계조합원 분기 (사례 48)
 *
 * 관리처분계획인가일 이후 입주권을 상속·증여·매매로 승계 취득한 자가 신축APT 양도 시
 * §166 인가전·인가후 안분 산식을 우회하고 단순 차감 산식을 적용한다.
 *
 * 산식:
 *   양도차익 = transferPrice − rightsValue − postApprovalExpenses
 *   보유기간 = completionDate ~ transferDate  (사용검사필증 교부일 기산)
 *   LTHD    = 표1 (3년 미만 0, 3년차 6%, 매년 +2%, 15년+ 30% 캡)
 *
 * 결과 구조:
 *   preApproval = 0 fill (안분 우회)
 *   postApprovalExistingHouse = primary
 *   settlement = 0 fill (settlement 미지원 — validate 차단)
 *
 * 법령 근거:
 *  - 사전-2019-법령해석재산-0649 (2020.02.11.) ★ 직접
 *  - 소법 시행령 §162①4호 (자가건설 의제 — 사용승인서 교부일)
 *  - 소법 §95② 단서 (입주권 LTHD 0 — 신축APT 양도 시 부동산 보유기간 적용)
 *
 * Pre-Do 환류 (2026-05-14): PDF 양도코리아 양도소득금액 계산명세서 자산종류 = "일반주택(3)".
 * 인가전·인가후 안분 미표시 — 단순 housing 양도와 동치 처리.
 */

import { calculateHoldingPeriod } from "./tax-utils";
import { applyLthdToGain, computeLthdRateSplit } from "./redevelopment-lthd";
import { TaxRateNotFoundError } from "./tax-errors";
import type {
  RedevelopmentBranchDetail,
  RedevelopmentResult,
} from "./types/transfer-redevelopment.types";
import type { RedevelopmentOrchestratorInput } from "./redevelopment";

/**
 * 승계조합원 분기 — 단순 차감 산식 + 준공일 기산 LTHD/세율.
 */
export function runSuccessorMember(
  input: RedevelopmentOrchestratorInput,
): RedevelopmentResult {
  const { redevelopment, transferDate, transferPrice } = input;

  // validate 보장 — completionDate 필수, settlementDirection !== "receive"|"pay" 차단.
  // 방어적 fallback: completionDate 부재 시 acquisitionDate (실제로는 validate 차단됨).
  const completionDate = redevelopment.completionDate ?? input.acquisitionDate;

  // 사례 48 — 승계조합원 취득가액은 자산 카드의 통합 acquisitionPrice(=actualAcquisitionPrice) 우선 사용.
  // 상속·증여·매매 어느 취득원인이든 자산 카드의 검증된 acquisitionPrice 도출 경로를 활용.
  // fallback: redevelopment.rightsValue (legacy test 직접 호출 경로 호환).
  // ★ 모순 해소 — "권리가액(§166④, 인가일 평가액)" 슬롯에 "취득시점 평가액"을 강제 매핑하던 이중 입력 제거.
  /**
   * 🔴 **`??` → `> 0` 판정으로 교체 (2026-08-25 — E2-01).**
   *
   * `??`는 nullish 연산자라 **0을 그대로 통과**시킨다. 그런데 화면 경로에서는 두 소스가 모두
   * 0으로 도달할 수 있었다:
   *   · `RedevelopmentBlockCards`의 승계조합원 토글 핸들러가 `redevRightsValue: ""`를 **강제로 비우고**
   *   · `RedevelopmentBlock`이 §166 ⑤「인가전 분 종전 부동산 취득가액」 섹션을 승계 모드에서 숨기며
   *   · 그 자리를 대신한다고 안내하는 상단 자산 카드 취득가액은 `CompanionAcqPurchaseBlock`이
   *     `assetKind === "redevelopment_apt"`이면 렌더하지 않았다 (**두 안내 카드가 서로를 가리키는 순환**)
   * ⇒ 취득원인 **매매**에는 취득가액 입력 경로가 어디에도 없어 `acquisitionPrice = 0`이 전송됐고,
   *   `??`가 0을 통과시켜 **양도가액 전액이 양도차익**이 됐다(실측 산출세액 315,000,000원 과대).
   *
   * 「소득세법」 §97①1호는 취득가액을 **가목 실지거래가액** 아니면 **나목 매매사례가액·감정가액·
   * 환산취득가액**으로 정한다 — 0은 어느 쪽도 아니다. 그래서 0은 「취득가액 0원」이 아니라
   * **「미입력」**으로 읽고, 확인 가능한 소스가 하나도 없으면 **계산을 중단**한다.
   * 조용히 숫자를 만들어 내면 화면에는 아무 경고 없이 세액만 3억 넘게 부풀어 오른다.
   *
   * 정상 경로에서는 도달하지 않는 상태다 — ⑧ `validateRedevelopmentAsset`과 ⑫ Zod refine이
   * 먼저 막는다(같은 배치에서 함께 추가). 이 throw는 그 두 관문이 뚫렸을 때 울리는 **트립와이어**이며,
   * 형제 엔진 `redevelopment-land-contribution.ts`가 §166③ 분모 부재에 대해 이미 쓰는 방식과 같다.
   */
  const successorAcquisitionPrice =
    (input.actualAcquisitionPrice ?? 0) > 0
      ? input.actualAcquisitionPrice!
      : redevelopment.rightsValue > 0
        ? redevelopment.rightsValue
        : (() => {
            throw new TaxRateNotFoundError(
              "승계조합원 신축주택 취득가액을 확인할 수 없습니다 — " +
                "자산 카드의 취득가액(실지거래가액) 또는 §166④1호 평가액 중 하나가 필요합니다. " +
                "(소득세법 §97①1호 · 시행령 §162①4호)",
            );
          })();
  const postApprovalExpenses = redevelopment.postApprovalExpenses ?? 0;

  // ─ Step 1: 단순 차감 양도차익 ─
  const gain = transferPrice - successorAcquisitionPrice - postApprovalExpenses;

  // ─ Step 2: 보유기간 = 준공일 ~ 양도일 ─
  const holdingPeriod = calculateHoldingPeriod(completionDate, transferDate);
  const holdingMonths = holdingPeriod.years * 12 + holdingPeriod.months;
  const holdingDays = holdingPeriod.days;

  /**
   * ─ Step 3: LTHD ─ §95② 표1/표2 (시행령 §159의4)
   *
   * 🔴 2026-08-25 정정(E1-08 — **세액 변경**): 종전에는 이 파일이 **표1 전용 함수를 자체 정의**해
   *    `isOneHouseSingle`·거주월수를 한 번도 읽지 않았다. 그런데 이 파일 헤더는 이 분기를
   *    「단순 housing 양도와 **동치** 처리」라고 선언하고, **상위 오케스트레이터는 같은 입력을
   *    1세대1주택으로 인정해 §95③ 12억 안분을 발동**시킨다 — 한 계산 안에서 1세대1주택 여부가
   *    두 개의 답을 가졌고, 방향은 납세자에게 불리했다(표1 0.22 vs 표2 0.80).
   *
   *    §95②의 「조합원으로부터 취득한 것은 제외한다」 괄호는 **§94①2호가목 조합원입주권**에 붙은
   *    것이다. 승계조합원이 **준공 후 신축주택**을 양도하면 그 자산은 §94①**1호**(건물)이므로
   *    그 괄호가 걸리지 않는다 — 표 판단은 §159의4 축(양도일 현재 1주택 + 거주 2년)을 그대로 탄다.
   *
   * ⚠️ 거주월수는 **신축주택 거주월수**(`newHouseResidenceMonths`)다 — 이 분기의 보유기간이
   *    **준공일 기산**(시행령 §162①4호)이라 그 구간 안의 거주만 §159의4의 「보유기간 중 거주기간」에
   *    해당한다. 종전주택 거주월수(`priorHouseResidenceMonths`)는 승계 전 타인의 거주라 무관하다.
   */
  const successorResidenceMonths = redevelopment.newHouseResidenceMonths ?? 0;
  const lthdSplit = computeLthdRateSplit(
    holdingPeriod.years,
    input.isOneHouseSingle ?? false,
    Math.floor(successorResidenceMonths / 12),
  );
  const lthdRate = lthdSplit.total;
  const lthdAmount = gain > 0 && lthdRate > 0 ? applyLthdToGain(gain, lthdRate) : 0;

  // ─ Step 4: 세율 라벨 (보유기간 기준 — UI/anchor 검증용) ─
  const totalMonthsForRate = holdingPeriod.years * 12 + holdingPeriod.months;
  const rateLabel: NonNullable<
    RedevelopmentResult["successorMemberDetail"]
  >["rateLabel"] =
    totalMonthsForRate < 12
      ? "1년 미만 70% (§104①3호 주택 본문)"
      : totalMonthsForRate < 24
        ? "1년 이상 2년 미만 60% (§104①2호 주택)"
        : "기본누진세율 (§55·§104①1호)";

  // ─ Step 5: RedevelopmentBranchDetail 3분기 (preApproval·settlement = 0 fill) ─
  const zeroBranch: RedevelopmentBranchDetail = {
    apportionedTransfer: 0,
    apportionedAcquisition: 0,
    gain: 0,
    holdingMonths: 0,
    holdingDays: 0,
    lthd: 0,
    lthdRate: 0,
    branchAcqDate: completionDate,
    branchTransferDate: transferDate,
    expenses: 0,
    lthdHoldingPart: 0,
    lthdResidencePart: 0,
  };

  const postApprovalExistingHouse: RedevelopmentBranchDetail = {
    apportionedTransfer: transferPrice,
    // ★ P8 — 결과 카드 표시값과 실제 차감값 일치 (successorAcquisitionPrice 단일 출처)
    apportionedAcquisition: successorAcquisitionPrice,
    gain,
    holdingMonths,
    holdingDays,
    lthd: lthdAmount,
    lthdRate,
    branchAcqDate: completionDate, // ★ 보유기간 기산일 = 준공일
    branchTransferDate: transferDate,
    expenses: postApprovalExpenses,
    lthdHoldingPart: lthdAmount, // 표1 단독 — 거주분 0
    lthdResidencePart: 0,
  };

  // ─ Step 6: 합계 ─
  const totalLthd = lthdAmount;
  const taxableIncome = Math.max(0, gain - totalLthd);

  return {
    preApproval: { ...zeroBranch },
    postApprovalExistingHouse,
    settlement: { ...zeroBranch },
    total: {
      gain,
      lthd: totalLthd,
      taxableIncome,
    },
    salePriceTotal: undefined, // 분양가 개념 미적용
    receiveOnlyMode: undefined,
    valuationMeta: {
      method: "successor_member_decree_162_1_4",
      numerator: undefined,
      denominator: undefined,
      rationale:
        "사전-2019-법령해석재산-0649 (승계조합원) + 시행령 §162①4호 (자가건설 의제)",
    },
    estimatedLumpDeduction: undefined,
    successorMemberApplied: true,
    successorMemberDetail: {
      applied: true,
      completionDate,
      holdingDaysFromCompletion:
        holdingPeriod.years * 365 + holdingPeriod.months * 30 + holdingPeriod.days, // approx
      shortTermRateApplied: totalMonthsForRate < 24,
      rateLabel,
    },
  };
}
