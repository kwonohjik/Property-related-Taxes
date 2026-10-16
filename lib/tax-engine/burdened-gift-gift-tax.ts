/**
 * 부담부증여 — **수증자 증여세 요약** (Phase 2 · calcGiftTax 호출).
 *
 * `buildBurdenedGiftBreakdown`(`burdened-gift-apportionment.ts`)의 STEP 7을 **무변경 추출**한 함수다 — 겸용주택 부담부증여
 * (`mixed-use-burdened-gift.ts`)가 같은 증여세 계산을 두 벌로 쓰지 않도록 단일 소스로 만들었다(PR-1, 800줄 정책 겸).
 * 증여세 = 무상이전분(C − B)에 대해 수증자가 납부. 양도자(증여자)와 별도 납세의무자.
 * 증여일은 양도일(= `giftDate`)이며 `giftDate`가 없거나 무상이전분이 0 이하면 `undefined`.
 */
import { format } from "date-fns";
import { calcGiftTax } from "./gift-tax";
import type {
  BurdenedGiftInfo,
  TransferBurdenedGiftBreakdown,
} from "./types/transfer-burdened-gift.types";

export function buildBurdenedGiftGiftTax(params: {
  /** 지분 축소가 끝난 info(단건) 또는 겸용 info */
  info: BurdenedGiftInfo;
  giftDate?: Date;
  /** 증여재산 총 평가액 C */
  giftValuationMax: number;
  /** 인수 채무 B */
  assumedDebtAmount: number;
  /** C − B */
  gratuitousPortion: number;
}): TransferBurdenedGiftBreakdown["giftTax"] {
  const { info, giftDate, giftValuationMax, assumedDebtAmount, gratuitousPortion } = params;
  if (!(giftDate && gratuitousPortion > 0)) return undefined;

  const donorRelation = info.donorRelation ?? "lineal_descendant";
  // G-M9 수정: toISOString()은 UTC 변환으로 KST 자정 → 전날로 롤백.
  // date-fns format()은 로컬 시간 기준 포맷 → 로컬 날짜 보존.
  const giftDateStr = format(giftDate, "yyyy-MM-dd");
  // Phase A: donor 매핑 (DonorRelation → GiftDonorRelation)
  //   donorRelation은 수증자 관점, donor는 증여자 관점.
  //   부담부증여 일반 시나리오: 증여자가 부모인 경우 "father" (단순화, 양친 구분 후속 PR).
  //   isGenerationSkip=true 면 donor=grandparent.
  // 수증자 관점 DonorRelation → 증여자 관점 GiftDonorRelation (deriveDonorRelation의 역).
  //   증여자가 직계존속(수증자 기준 lineal_ascendant_*) → "father"(그룹 A 대표).
  //   수증자가 직계비속(donorRelation === lineal_descendant) → "lineal_descendant"(그룹 D).
  const giftDonor: import("./types/inheritance-gift.types").GiftDonorRelation =
    info.isGenerationSkip
      ? "grandparent"
      : donorRelation === "spouse"
        ? "spouse"
        : donorRelation === "other_relative"
          ? "other_relative"
          : donorRelation === "lineal_ascendant_adult" ||
              donorRelation === "lineal_ascendant_minor"
            ? "father"
            : "lineal_descendant";
  const giftResult = calcGiftTax({
    giftDate: giftDateStr,
    donorRelation,
    donor: giftDonor,
    /**
     * 증여재산을 **총 평가액(C)** 으로 넣고 인수채무(B)를 §47① 차감 항목으로 넘긴다.
     *
     * ⚠️ 종전에는 `marketValue: gratuitousPortion`(= C − B)을 넣고 채무를 전달하지 않았다.
     * 과세가액 ㉔는 같게 나오지만 **별지 제10호서식의 의미가 틀린다** — ⑰ 증여재산가액에
     * 이미 채무를 뺀 값이 들어가고 ㉒ 채무액이 0으로 표시됐다(2026-08-12 사용자 지적).
     * 상증법 §47①은 "증여재산가액에서 수증자가 인수한 채무를 뺀 금액"이므로 두 값이
     * 서식에 각각 드러나야 한다. 과세가액·세액은 이 변경으로 달라지지 않는다.
     */
    giftItems: [
      {
        id: "burdened-gift",
        category: "real_estate_building",
        name: "부담부증여 증여재산",
        marketValue: giftValuationMax, // C = §60~§66 Max 평가액 (gratuitousPortion = C − B)
        assumedDebtForGift: assumedDebtAmount, // B
      },
    ],
    // Phase 3 후속: 10년 이내 사전증여 합산 (상증법 §47②·§58)
    // Phase A: priorGift.donor를 현재 증여자 그룹과 동일하게 매핑 — 별도 입력 없으면
    //          현재 donor와 동일 그룹 가정 (legacy 호환).
    // PR3: computedTax·giftTaxBase를 전달해야 aggregatePriorGiftsForGift가 §58 Phase A
    //      안분 한도(floor(금번 산출세액 × 직전 과세표준 / 합산 과세표준))를 산출한다.
    //      미전달(undefined) 시 priorAggregation 0 → §58 미적용(공제 누락) — validation에서 입력 강제.
    // LOW — donor 강제 매핑 확인 결과:
    // BurdenedGiftInfo.priorGiftsWithin10Years 입력 모델에 donor 필드가 없으므로
    // 구조적으로 단일 증여자(현재 부담부증여 증여자)만 허용하는 설계.
    // 모든 prior를 현재 giftDonor 그룹으로 매핑하는 것이 설계 의도와 일치.
    // 다른 그룹 prior 표현이 필요하면 BurdenedGiftInfo에 donor 필드 추가 후 v2에서 확장.
    priorGiftsWithin10Years: (info.priorGiftsWithin10Years ?? []).map((p) => ({
      giftDate: p.giftDate,
      isHeir: false, // 증여세 §47 합산에서는 isHeir 무관 (상속세 §13 전용 필드)
      giftAmount: p.giftAmount,
      giftTaxPaid: p.giftTaxPaid,
      donor: giftDonor, // 단일 증여자 설계 — 입력모델(BurdenedGiftInfo)에 donor 필드 없음
      computedTax: p.computedTax,  // §58① 증여 당시 산출세액 (한도 분자·공제 대상)
      giftTaxBase: p.giftTaxBase,  // §58 한도 분자 = 가산 증여재산 과세표준
    })),
    isGenerationSkip: info.isGenerationSkip ?? false,
    isMinorDonee: info.isMinorDonee ?? false,
    deductionInput: {
      donorRelation,
    },
    creditInput: {
      isFiledOnTime: info.isFiledOnTime ?? true,
    },
  });
  return {
    grossGiftValue: giftResult.grossGiftValue,
    deduction: giftResult.totalDeduction,
    taxBase: giftResult.taxBase,
    computedTax: giftResult.computedTax,
    filingCredit: giftResult.creditDetail.filingCredit,
    // §58 기납부세액공제 — calcGiftTaxCredits 결과의 giftTaxCredit(= priorPaidCredit) (PR3)
    priorGiftCredit: giftResult.creditDetail.giftTaxCredit,
    finalTax: giftResult.finalTax,
    donorRelation,
    // 별지 제10호서식 행 — 재계산 없이 그대로 전달(양도세 결과탭 서식이 이 배열만 읽는다).
    besshi10Rows: giftResult.besshi10Rows,
  };
}
