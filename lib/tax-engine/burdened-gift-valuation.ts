/**
 * 부담부증여 — **평가·비율 헬퍼** (상증법 §60~§66 · 소령 §159 · §163⑥).
 *
 * `burdened-gift-apportionment.ts` 800줄 정책 분리(2026-08-07 W-6). **로직 무변경 이전**이다.
 * 오케스트레이터(`buildBurdenedGiftBreakdown`)가 쓰는 순수 계산만 모았다.
 *
 * ⚠️ 기존 import 경로 호환을 위해 `burdened-gift-apportionment.ts`가 전부 **재수출**한다
 *    (메모리 `feedback_800line_split_export_preservation`).
 */

import {
  ANNUAL_RENT_CAPITALIZATION_RATE_AFTER_2009_04_23,
  REGISTERED_ESTIMATED_DEDUCTION_RATE,
  UNREGISTERED_ESTIMATED_DEDUCTION_RATE,
} from "./legal-codes/burdened-gift";
import {
  safeMultiplyThenDivide,
  applyRate,
  applyRatio,
  computeEstimatedDeduction,
} from "./tax-utils";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import type {
  BurdenedGiftInfo,
  TransferBurdenedGiftBreakdown,
} from "./types/transfer-burdened-gift.types";

// ============================================================
// 공유지분 스케일 (소령 §159 — A·C는 증여 대상 재산의 값)
// ============================================================

/**
 * 공유지분 부담부증여 — **시스템이 물건 전체(100%)로 들고 있는 평가액**을 지분분으로 축소.
 *
 * ## 왜 필요한가
 *
 * 소령 §159①(KoreanLaw 실측 mst=286211): `취득가액 = A × B/C` · `양도가액 = A × B/C`.
 * **A(§97①1호 가액 / 상증법 §60~66 평가액)와 C(증여가액)는 모두 "증여 대상 재산"의 값**이므로
 * 증여 대상이 1/2 지분이면 A·C 모두 지분분이다. **B(채무액)만 절대금액**이다.
 *
 * A와 C가 함께 축소되면 산식은 **스케일 불변**이라 결과가 같다 — 이것이 지분 미인지 상태에서도
 * 대부분 정답이 나오던 이유다. 상쇄가 깨지는 지점은 **C = max(보충적, 담보, 임대)** 의
 * 담보·임대 항이 **절대금액**이라 지분에 따라 줄지 않는다는 것이다. C가 채무액으로 결정되면
 * A만 100% 스케일로 남아 약분되지 않고 **취득가액 과대 → 과소과세**가 된다.
 *
 * ## 스케일하지 않는 것
 *
 * `lendingDepositTotal`·`mortgageDebtAmount`·`annualRentTotal`·`mortgageSetAmount`는
 * **사용자가 해당 지분의 인수분을 입력**한다. 엔진이 물건 전체 채무를 ×ratio로 쪼개면
 * **자동 안분 fallback**이 되어 정책 위반이다(`feedback_no_silent_apportion_fallback`).
 * 인수채무는 계약으로 정해지는 금액이지 지분율로 파생되는 값이 아니다.
 *
 * `capitalExpenditure`·`transferExpense`도 제외 — `transfer-tax-api.ts`에서 **이미**
 * `applyRatio` 적용되어 도달한다(이중 적용 금지).
 *
 * ## 절사
 *
 * 성분별 **독립 floor**(`applyRatio` = `Math.floor(v × ratio)`). 잔액 흡수는 PR #845에서
 * 논파되어 규약에서 제외됐다(소득세법 §100② "각각 구분하여 기장"). 재도입 금지.
 */
/**
 * 조합원입주권 평가 3항의 지분 축소 — **잔액 흡수**로 합을 보존한다.
 *
 * 🔴 세 항을 각각 `floor`하면 합이 `floor(총액 × 지분율)`보다 최대 2원 작아진다. 그런데
 *    평가액 총액은 `buildingStdPriceAtTransfer`가 따로 `floor(총액 × 지분율)`로 줄어들므로,
 *    ⑧의 자기일관 검사(3항 합 == building std)가 **지분 자산에서만** 깨진다.
 *
 * ⇒ 앞 두 항을 floor하고 **마지막 항(프리미엄)이 잔액을 흡수**한다
 *   (`feedback_floor_residual_absorption` — 별도 floor 금지).
 */
function scaleRightValuation(
  rv: NonNullable<BurdenedGiftInfo["rightValuation"]>,
  ownershipRatio: number,
): NonNullable<BurdenedGiftInfo["rightValuation"]> {
  const total = rv.memberRightsValue + rv.paidInstallments + rv.premium;
  const scaledTotal = applyRatio(total, ownershipRatio);
  const memberRightsValue = applyRatio(rv.memberRightsValue, ownershipRatio);
  const paidInstallments = applyRatio(rv.paidInstallments, ownershipRatio);
  return {
    memberRightsValue,
    paidInstallments,
    premium: scaledTotal - memberRightsValue - paidInstallments,
  };
}

export function scaleBurdenedGiftInfo(
  info: BurdenedGiftInfo,
  ownershipRatio?: number,
): BurdenedGiftInfo {
  if (ownershipRatio === undefined || ownershipRatio >= 1 || ownershipRatio <= 0) return info;
  const s = (v: number | undefined) => (v === undefined ? undefined : applyRatio(v, ownershipRatio));
  return {
    ...info,
    // 기준시가 4 (양도·취득 × 토지·건물)
    landStdPriceAtTransfer: applyRatio(info.landStdPriceAtTransfer, ownershipRatio),
    buildingStdPriceAtTransfer: applyRatio(info.buildingStdPriceAtTransfer, ownershipRatio),
    landStdPriceAtAcquisition: applyRatio(info.landStdPriceAtAcquisition, ownershipRatio),
    buildingStdPriceAtAcquisition: applyRatio(info.buildingStdPriceAtAcquisition, ownershipRatio),
    // 증여세 평가용 건물 기준시가 (상증법 §61 층별 가감율)
    giftBuildingStdPriceAtTransfer: s(info.giftBuildingStdPriceAtTransfer),
    // 시가 모드 2
    marketValueAtTransfer: s(info.marketValueAtTransfer),
    marketValueAtAcquisition: s(info.marketValueAtAcquisition),
    // K-4 실지취득가액 3
    actualLandAcquisitionPrice: s(info.actualLandAcquisitionPrice),
    actualBuildingAcquisitionPrice: s(info.actualBuildingAcquisitionPrice),
    actualAcquisitionTotal: s(info.actualAcquisitionTotal),
    // K-6/K-7 매매사례가액·감정가액 3
    presumedLandAcquisitionPrice: s(info.presumedLandAcquisitionPrice),
    presumedBuildingAcquisitionPrice: s(info.presumedBuildingAcquisitionPrice),
    presumedAcquisitionTotal: s(info.presumedAcquisitionTotal),
    // K-7 × 증축 — 증축한 부분의 감정가액(가산세 base). 같은 물건 전체 값이라 같은 비율로 줄인다.
    presumedExtensionAppraisalValue: s(info.presumedExtensionAppraisalValue),
    /**
     * 조합원입주권 평가 3항 — 평가액 총액이 `buildingStdPriceAtTransfer`에 실리므로
     * **같은 비율로 함께 줄여야** 자기일관 검사(3항 합 == building std)가 성립한다.
     *
     * 🔴 이 함수는 스케일 대상을 **명시 열거**하고 나머지는 `...info`로 통과시킨다 —
     *    신규 금액 필드를 여기 넣지 않으면 지분 부담부증여에서 그 필드만 100% 값으로 남는다.
     */
    ...(info.rightValuation ? { rightValuation: scaleRightValuation(info.rightValuation, ownershipRatio) } : {}),
  };
}

// ============================================================
// 지분 부담부증여 — 12억 고가주택 판정 가액 (소령 §156①)
// ============================================================

/**
 * 시가 평가(상증법 §60②)인데 담보채권액 평가(§66)가 시가보다 커서 증여가액 C가 담보평가가 된 경우의 안내 (1h-G1-2 · 결정 #23 하위 2).
 *
 * 「소득세법 시행령」 §159①1호 괄호는 양도가액을 「상속세 및 증여세법」 제66조 등에 따라 기준시가로 산정한 경우 취득가액도 기준시가로
 * 산정하도록 한다. §66 담보평가가 이긴 경우를 다룬 해석례는 확인되지 못해, 괄호 문언대로(취득가액 = 취득시 기준시가 × 채무비율) 계산하고
 * 확인 필요로 알린다 — 현행 기본값(기준시가 모드)이 이 경우에 내던 결과와 같다.
 */
export const MARKET_COLLATERAL_STANDARD_ACQUISITION_NOTICE =
  "증여재산을 시가(상속세 및 증여세법 §60)로 평가했으나 담보채권액 평가(같은 법 §66)가 시가보다 커서 증여가액이 그 금액이 되었습니다. " +
  "소득세법 시행령 §159①1호 괄호(양도가액을 같은 법 제66조에 따라 기준시가로 산정한 경우 취득가액도 기준시가로 산정)에 따라 " +
  "취득가액을 취득시 기준시가로 산정했습니다. 이 경우를 다룬 해석례는 확인되지 않아 확인이 필요합니다.";

/**
 * §159①1호 괄호에 그 평가 조문이 열거된 개정의 시행일 — 이 날 전 양도에는 괄호에 그 조문이 없었다.
 *
 * | 개정 | 괄호 열거 | 적용 |
 * |---|---|---|
 * | 2015.2.3.(대통령령 제26067호) | 상증법 §61①② | 부칙 제2조② 시행 이후 최초로 양도하는 분부터 |
 * | 2020.2.11.(대통령령 제30395호) | + §61⑤ | 부칙 제2조② 시행 이후 양도하는 분부터 |
 * | 2023.2.28.(대통령령 제33267호) | + §66 | 부칙에 이 조문의 적용례·경과조치 없음 → 시행일 |
 *
 * 2015.2.3. 전(2015.1.1. 시행본)의 괄호는 조문 열거 없이 「양도가액을 기준시가에 따라 산정한 경우」였다 — 담보·임대 평가가 그에 드는지는
 * 문언만으로 정해지지 않아 그 구간은 「열거되지 않았다」고 단정하지 않는다.
 *
 * 엔진은 현행 문언대로 계산하고 알리기만 한다(사용자 결정 2026-10-22 — 계획서 `burdened-gift-residuals-o9-o11.plan.md` §4).
 */
export const BG_PAREN_ENUMERATED_FROM = new Date("2015-02-03");
export const BG_PAREN_RENTAL_61_5_FROM = new Date("2020-02-11");
export const BG_PAREN_MORTGAGE_66_FROM = new Date("2023-02-28");

/**
 * 취득가액을 기준시가로 강제했는데 양도일(증여일) 당시 괄호에 그 평가 조문이 없었던 경우의 확인 필요 안내. 해당 없으면 `undefined`.
 * 판정 축은 괄호가 말하는 「양도가액을 무엇으로 산정했는가」 — 양도세 축 `sangjeungbeopValuation.selectedMode`다.
 * 증여세 축(`giftValuation` — 건물 층별 가감율)은 승자가 갈릴 수 있으므로 문구도 「양도가액」으로 쓴다.
 */
export function bgParenthesisEraNotice(
  acquisitionMethodUsed: string,
  selectedMode: "supplementary" | "mortgage" | "rental",
  transferDate: Date,
): string | undefined {
  if (acquisitionMethodUsed !== "standard_price") return undefined;
  const era =
    selectedMode === "mortgage" && transferDate < BG_PAREN_MORTGAGE_66_FROM
      ? { valuation: "담보채권액 평가(「상속세 및 증여세법」 제66조)", amended: "2023.2.28." }
      : selectedMode === "rental" && transferDate < BG_PAREN_RENTAL_61_5_FROM
        ? { valuation: "임대료 환산 평가(「상속세 및 증여세법」 제61조 제5항)", amended: "2020.2.11." }
        : undefined;
  if (!era) return undefined;
  const head = `양도가액(「소득세법 시행령」 제159조 제1항 제2호)을 ${era.valuation}로 산정했습니다. `;
  const tail = "이 계산은 현행 문언대로 취득가액을 취득시 기준시가로 산정했으므로 확인이 필요합니다";
  if (transferDate < BG_PAREN_ENUMERATED_FROM) {
    return (
      head +
      "양도일(증여일) 당시 같은 조 제1항 제1호 괄호는 조문을 열거하지 않고 「양도가액을 기준시가에 따라 산정한 경우」라고만 규정해(2015.2.3. 개정으로 조문 열거), " +
      `이 평가가 그에 드는지 문언만으로는 정해지지 않습니다. ${tail}.`
    );
  }
  return (
    head +
    `양도일(증여일) 당시 같은 조 제1항 제1호 괄호에는 이 평가가 열거되어 있지 않았습니다(${era.amended} 개정으로 추가). ${tail} — ` +
    "그 당시 문언대로라면 취득가액은 「소득세법」 제97조 제1항 제1호에 따른 가액입니다."
  );
}

/**
 * 지분 부담부증여의 12억 고가주택 판정 가액 = **지분 증여가액 ÷ 지분율** (1h-G1-14 · 결정 #28 A).
 *
 * 「소득세법 시행령」 §156①은 1주택의 일부가 타인 소유인 경우 「실지거래가액 합계액에 양도하는 부분(타인 소유부분을
 * 포함한다)의 면적이 전체 주택면적에서 차지하는 비율을 나누어 계산한 금액」으로 고가주택을 판정한다. 부담부증여에서 그
 * 가액은 증여가액(§159①의 C)이므로 **지분 증여가액 ÷ 지분율**이다 — 법령이 산식을 명시하므로 `no_silent_apportion_fallback`의
 * 「법령이 산식을 명시할 때」 예외에 든다(자동 안분이 아니다).
 *
 * | 지분 증여가액(C)의 승자 | 판정 가액 |
 * |---|---|
 * | 보충적평가(기준시가·시가) | 물건 전체 보충적평가액 그대로 — 100% 입력값을 쓰므로 부동소수 나눗셈을 거치지 않는다(종전과 같다) |
 * | 담보(§66)·임대(§61⑤) | C ÷ 지분율 (종전에는 물건 전체 보충적평가액이라 담보가 이기는 지분이 더 낮게 판정됐다) |
 *
 * (현행 시행령 MST 290841 §156① 원문 확인. 조문의 «면적 비율»을 지분율로 읽는 것은 통상의 독법이며 문언 그대로는 아니다.)
 *
 * 축 B(지분 분할 취득)는 ④가 채무 4필드를 지분율만큼 미리 줄여 실으므로 카드 C ÷ 지분율이 **물건 전체 증여가액**이 된다 —
 * 단건 100%와 같은 판정이 된다(국심2007서2099 「이전방식에 관계없이 1주택의 전체가액」).
 *
 * 몫이 정수가 아니면 **올림**한다 — 「12억원을 초과」 판정이라 12억 + 0.4가 12억으로 내려가면 안 된다(몫 간격은 1/지분율 > 1이라
 * 올림이 다른 정수 문턱을 넘지 않는다). 1e-6을 빼고 올리는 것은 세액 절사가 아니라 부동소수 나눗셈 잡음 제거다
 * (예: 700,000,000 ÷ 0.7 = 1,000,000,000.0000001 이 1,000,000,001 로 올라가지 않게).
 */
export function fractionalHighValueDenominator(args: {
  selectedMode: "supplementary" | "mortgage" | "rental";
  /** 지분 증여가액 C (`sangjeungbeopValuation.max`, 지분 축소 후) */
  max: number;
  /** 물건 전체(100%) 보충적평가액 */
  wholePropertySupplementary: number;
  /** 0 < r < 1 */
  ownershipRatio: number;
}): number {
  if (args.selectedMode === "supplementary") return args.wholePropertySupplementary;
  return Math.ceil(args.max / args.ownershipRatio - 1e-6);
}

// ============================================================
// 상증법 §60~§66 Max 평가 산정
// ============================================================

/**
 * 담보평가의 (근)저당 항 — 상증령 §63①3호 + §63② 전단.
 *
 * - **§63①3호**: 근저당권이 설정된 재산의 가액 = "평가기준일 현재 당해 재산이 담보하는 **채권액**".
 *   즉 원칙은 **설정액(채권최고액)이 아니라 실제 채권액**이다.
 * - **§63② 전단**: 채권최고액이 담보채권액보다 **적은** 경우에만 채권최고액으로 한다.
 *   ⇒ 두 조항의 결합은 `min(채권최고액, 채권액)` — 담보로 잡힌 금액의 상한이 최고액이라는 취지.
 *
 * ⚠️ **구법 드리프트 주의**(2026-07-28 정정): 구 상속세법 시행령 §5의2 3호는 근저당을
 * **채권최고액**으로 평가하도록 규정했고, 그 시기의 조세심판례(국심1997부0752 등 1989~1997년)가
 * 다수 검색된다. 현행 상증령 §63①3호는 **채권액**으로 개정돼 있으므로 그 심판례를 현행 근거로
 * 인용하면 안 된다. 종전 구현은 `mortgageSetAmount ?? mortgageDebtAmount`로 **설정액을 무조건
 * 우선**해 구법 규칙을 적용했다 — 설정액이 통상 채권액의 120%이므로 증여가액 C가 과대평가되고,
 * §159의 채무비율 B/C가 작아져 취득가액이 줄고 **양도차익이 과대**해지는(납세자 불리) 방향이었다.
 * (memory `feedback_no_unfavorable_application_without_legal_basis`)
 *
 * @param info 보증금·차입금·설정액 입력.
 * @returns 임대보증금 + min(채권최고액, 담보채권액).
 *          합산 구조의 근거는 §63② 후단 — "동일한 재산이 다수의 채권(전세금채권과 임차보증금채권을
 *          포함한다)의 담보로 되어 있는 경우에는 그 재산이 담보하는 채권액의 **합계액**으로 한다".
 */
export function computeMortgageValuation(info: BurdenedGiftInfo): number {
  const securedClaim =
    info.mortgageSetAmount === undefined
      ? info.mortgageDebtAmount
      : Math.min(info.mortgageSetAmount, info.mortgageDebtAmount);
  return info.lendingDepositTotal + securedClaim;
}

/**
 * 상증법 §60~§66 증여재산 평가 Max 산정.
 *
 * @param landStdPriceAtTransfer  양도시 토지 기준시가 (개별공시지가 × 면적). 시가 모드에서도 입력 가능 (보충적 비교용).
 * @param buildingStdPriceAtTransfer 양도시 건물 기준시가 합계.
 * @param info BurdenedGiftInfo (보증금·임대료·차입금·시가 입력).
 *
 * @returns supplementary/mortgage/rental + selectedMode + max.
 */
export function computeSangjeungbeopValuation(
  landStdPriceAtTransfer: number,
  buildingStdPriceAtTransfer: number,
  info: BurdenedGiftInfo,
): TransferBurdenedGiftBreakdown["sangjeungbeopValuation"] {
  // ① 보충적평가 (상증법 §61): 자산별 기준시가 합계.
  // 시가 모드에서는 marketValueAtTransfer로 대체 (상증법 §60②~④).
  const supplementary =
    info.valuationMode === "sangjeungbeop_market"
      ? (info.marketValueAtTransfer ?? 0)
      : landStdPriceAtTransfer + buildingStdPriceAtTransfer;

  // ② 담보평가 (상증법 §66 · 상증령 §63):
  //   = 임대보증금 + min(채권최고액, 담보채권액). 상세 근거는 computeMortgageValuation 주석.
  const mortgage = computeMortgageValuation(info);

  // ③ 임대평가 (상증법 §61⑤·시행령 §50⑦):
  //   = 임대보증금 + (연간 임대료 / 12%)  [2009.4.23. 이후 시행분]
  //   safeMultiplyThenDivide 사용: annualRent × 1 ÷ 0.12 == annualRent / 0.12. 부동소수 회피.
  const rentalCapitalized =
    info.annualRentTotal === 0
      ? 0
      : Math.floor(info.annualRentTotal / ANNUAL_RENT_CAPITALIZATION_RATE_AFTER_2009_04_23);
  const rental = info.lendingDepositTotal + rentalCapitalized;

  // Max 채택
  //   시가 모드(상증법 §60② 시가로 평가한 경우)는 «시가와 담보평가(§66) 중 큰 값»이다 — 임대료 환산가액(§61⑤)은 §61①~④의
  //   보충적 평가액과만 비교하므로 시가가 있으면 넣지 않는다(1h-G1-2 · 결정 #23 하위 1). 증여세 평가(`applyCollateralFloor`)도
  //   보충적 평가(standard_price)에서만 임대 환산을 쓴다. 종전에는 시가 평가에도 임대 환산이 끼어 증여가액이 증여세 평가와 갈렸다.
  //   `rental` 값 자체는 평가 명세 표시를 위해 그대로 산출한다(채택만 하지 않는다).
  const rentalEligible = info.valuationMode !== "sangjeungbeop_market";
  let selectedMode: "supplementary" | "mortgage" | "rental" = "supplementary";
  let max = supplementary;
  if (mortgage > max) {
    max = mortgage;
    selectedMode = "mortgage";
  }
  if (rentalEligible && rental > max) {
    max = rental;
    selectedMode = "rental";
  }

  return { supplementary, mortgage, rental, selectedMode, max };
}

// ============================================================
// 취득가액 기준시가 강제(§159①1호 A 괄호) 판정 — 단건·겸용 공용
// ============================================================

/**
 * §159①1호 **A괄호 발동 판정** — 취득가액을 취득시 기준시가로 강제하는가. `buildBurdenedGiftBreakdown`(단건)에서
 * 무변경 추출했다 — 겸용주택(`mixed-use-burdened-gift-prepare.ts`)이 같은 판정을 쓰도록 단일 소스로 둔다. 순수(throw 없음).
 *
 * | 상황 | 괄호 |
 * |---|---|
 * | 기준시가 모드 · 입주권 | 미발동(§61③) |
 * | 기준시가 모드 · 그 외 | 발동 |
 * | 시가 모드 · 담보(§66) 승 · 입주권 아님 | 발동(`collateralForcedStdInMarketMode`) |
 * | 시가 모드 그 밖 | 미발동 |
 */
export function resolveBgAcquisitionBasis(
  info: BurdenedGiftInfo,
  selectedMode: "supplementary" | "mortgage" | "rental",
): {
  isRightToMoveIn: boolean;
  isStandardMode: boolean;
  collateralForcedStdInMarketMode: boolean;
  /** 괄호가 발동하는가 = 취득가액을 취득시 기준시가로 강제하는가. */
  acqStdPriceForced: boolean;
} {
  const isRightToMoveIn = info.rightValuation !== undefined;
  const isStandardMode = info.valuationMode === "sangjeungbeop_standard";
  const collateralForcedStdInMarketMode =
    info.valuationMode === "sangjeungbeop_market" && selectedMode === "mortgage" && !isRightToMoveIn;
  return {
    isRightToMoveIn,
    isStandardMode,
    collateralForcedStdInMarketMode,
    acqStdPriceForced: (isStandardMode && !isRightToMoveIn) || collateralForcedStdInMarketMode,
  };
}

/**
 * 의제취득일(1985.1.1.) 전 상속·증여 자산 × 부담부증여 — §159①1호 A의 경로를 STEP 0.45(상속 취득가액 의제)가 미리 알아야 한다
 * (계획서 `inheritance-pre-deemed-clause-b-revisit.plan.md` §18 · 사용자 결정 Q-24·Q-25).
 *
 * · 괄호 발동(기준시가 평가) → 취득가액 = 의제취득일 기준시가 × B/C (Q-25 — 3자 max 없음)
 * · 미발동(시가 평가) → max(①,②,③)를 **안분 전 전체 금액**으로 고른 뒤 × B/C (Q-24 · 국심2007서2099).
 *   ③(영 §176조의2④)의 양도가액은 증여가액 C다 — 국심2007서2099가 「증여재산가액」으로 환산한 뒤 채무비율을 곱했다.
 *
 * `buildBurdenedGiftBreakdown`과 **같은 함수**(지분 축소·증여세 평가 축·괄호 판정)로 정한다 — 비교에 쓴 C와 안분에 쓰는 C가 같다.
 */
export function burdenedGiftPreDeemedBasis(
  info: BurdenedGiftInfo,
  ownershipRatio?: number,
): { giftValue: number; acqStdPriceForced: boolean } {
  const scaled = scaleBurdenedGiftInfo(info, ownershipRatio);
  const transferAxis = computeSangjeungbeopValuation(scaled.landStdPriceAtTransfer, scaled.buildingStdPriceAtTransfer, scaled);
  const giftAxis = computeSangjeungbeopValuation(
    scaled.landStdPriceAtTransfer,
    scaled.giftBuildingStdPriceAtTransfer ?? scaled.buildingStdPriceAtTransfer,
    scaled,
  );
  return {
    giftValue: giftAxis.max,
    acqStdPriceForced: resolveBgAcquisitionBasis(scaled, transferAxis.selectedMode).acqStdPriceForced,
  };
}

/**
 * 시가 평가인데 §159①1호 A의 원천이 없으면 막는다 — 산정방식도, 의제취득일 전 3자 max(`preDeemed`)도, legacy 취득시 시가도 없고
 * 괄호(기준시가 강제)도 발동하지 않으면 `buildBurdenedGiftBreakdown`의 legacy 분기가 취득가액 0으로 떨어진다(막히지 않는 오답 —
 * 계획서 `inheritance-pre-deemed-bg-pr7b.plan.md` B-1: 재개발·일반건물 body에 의제취득일 전 상속 입력만 싣고 산정방식을 빼면 그랬다).
 * API에서는 ⑫ `refineBurdenedGiftInputs`가 먼저 막는다 — 이 함수는 엔진을 직접 부르는 경우의 방어다. 단건 STEP 0.48만 부른다
 * (일반건물 route는 파트별 3자 max가 같은 방어를 따로 한다 — `burdened-gift-part-pre-deemed.ts` `BG_PART_METHOD_REQUIRED_MESSAGE`. 묶음 결과의 물건 전체 재계산
 * `transfer-tax-aggregate-burdened-gift.ts`는 표시용이다).
 */
export function assertBgMarketAcquisitionSource(info: BurdenedGiftInfo, ownershipRatio: number | undefined, hasPreDeemed: boolean): void {
  if (info.valuationMode !== "sangjeungbeop_market" || info.acquisitionMethod || hasPreDeemed) return;
  // 조합원입주권은 산정방식과 무관하게 K-4(실지취득가액)다 — `buildBurdenedGiftBreakdown` STEP 4.
  if (info.marketValueAtAcquisition !== undefined || info.rightValuation !== undefined) return;
  if (burdenedGiftPreDeemedBasis(info, ownershipRatio).acqStdPriceForced) return;
  throw new TaxCalculationError(
    TaxErrorCode.INVALID_INPUT,
    "[burdened_gift] 상속세 및 증여세법상 시가로 평가한 부담부증여는 취득가액 산정방식(실지취득가액·매매사례가액·감정가액·환산취득가액)이 필요합니다 " +
      "(「소득세법」 제100조 제1항 · 같은 법 시행령 제159조 제1항 제1호).",
  );
}

/**
 * 의제취득일 전 자산의 취득시 기준시가 슬롯을 **의제취득일 기준시가**(물건 전체)로 바꾼다 (Q-25 · 부칙 법률 제4803호 §8 · 영 §164④~⑦).
 * 슬롯은 양도시 기준시가가 실린 쪽을 따른다 — 토지는 토지 슬롯, 주택·건물(단일 공시가격)은 건물 슬롯(④ 관행). 둘 다면 양도시 비율로 나눈다.
 */
export function withDeemedAcquisitionStd(info: BurdenedGiftInfo, stdAtDeemed: number): BurdenedGiftInfo {
  const land = info.landStdPriceAtTransfer;
  const building = info.buildingStdPriceAtTransfer;
  const landPart =
    building === 0 ? stdAtDeemed : land === 0 ? 0 : safeMultiplyThenDivide(stdAtDeemed, land, land + building);
  return { ...info, landStdPriceAtAcquisition: landPart, buildingStdPriceAtAcquisition: stdAtDeemed - landPart };
}

// ============================================================
// 채무비율 산정 (소령 §159 — B / C)
// ============================================================

/**
 * 채무비율 = 인수채무 / 증여가액 = (임대보증금 + 담보차입금) / Max 평가액.
 *
 * @returns { assumedDebtAmount, debtRatio }
 */
export function computeDebtRatio(
  info: BurdenedGiftInfo,
  sangjeungbeopMax: number,
): { assumedDebtAmount: number; debtRatio: number } {
  // 컴패니언(다른 물건) 함께 부담부증여 — §159①의 B는 **신고 단위**이므로 ④가
  // Bᵢ = B × Aᵢ/ΣA로 재배분한 값을 싣는다. 평가(A)는 원 입력 채무로 이미 확정됐고
  // 여기서만 B를 갈아끼우므로 자기참조가 없다. 상세: 타입 주석 `assumedDebtOverride`.
  const assumedDebtAmount =
    info.assumedDebtOverride ?? info.lendingDepositTotal + info.mortgageDebtAmount;
  if (sangjeungbeopMax === 0) {
    return { assumedDebtAmount, debtRatio: 0 };
  }
  // 부동소수 비율 — anchor에서는 toBeCloseTo로 비교. 자산별 안분은 safeMultiplyThenDivide로 정수 보존.
  const debtRatio = assumedDebtAmount / sangjeungbeopMax;
  return { assumedDebtAmount, debtRatio };
}

// ============================================================
// 자산별 양도가액 안분 (소령 §159 ① 2호)
// ============================================================

/**
 * 자산별 양도가액 = 자산별 평가가액 × 채무비율.
 *
 * 정수 보존을 위해 안분식은 safeMultiplyThenDivide(평가가액, 채무액, max) 사용 —
 * 부동소수 곱셈 회피.
 */
export function apportionTransferPrice(
  assetSangjeungbeopValue: number,
  assumedDebtAmount: number,
  sangjeungbeopMax: number,
): number {
  return safeMultiplyThenDivide(assetSangjeungbeopValue, assumedDebtAmount, sangjeungbeopMax);
}

// ============================================================
// 자산별 취득가액 안분 (소령 §159 ① 1호)
// ============================================================

/**
 * 기준시가 모드에서 자산별 취득가액 = 취득시 자산 기준시가 × 채무비율.
 *
 * 소령 §159 ① 1호 A 괄호: 양도가액을 상증법 §61①·②·⑤·§66에 따라 기준시가로 산정한 경우
 * → 취득가액도 기준시가로 산정.
 *
 * 시가 모드(sangjeungbeop_market)에서는 별도 산식 — 사용자가 marketValueAtAcquisition을 총액으로 입력하므로
 * 자산별 분리 필요 시 v2에서 별도 anchor (Phase 1은 토지·건물 합계만으로 처리하고
 * 자산별 비율은 양도시 시가 비율을 그대로 사용).
 */
export function apportionAcquisitionPrice(
  assetStdPriceAtAcquisition: number,
  assumedDebtAmount: number,
  sangjeungbeopMax: number,
): number {
  return safeMultiplyThenDivide(assetStdPriceAtAcquisition, assumedDebtAmount, sangjeungbeopMax);
}

// ============================================================
// 자산별 개산공제 (소령 §163 ⑥)
// ============================================================

/**
 * 안분된 **취득당시 기준시가** × 개산공제율 (소령 §163⑥1호·2호가목).
 *   등기: 3% · 미등기양도자산(§104③): 0.3% (단서 "미등기 3/1000"). (H-25)
 *
 * 계산 본체는 `tax-utils.ts`의 `computeEstimatedDeduction` 단일 소스에 위임한다 —
 * 같은 §163⑥ 개념 함수가 둘이면 드리프트한다(feedback_ui_engine_dual_truth_avoidance).
 * 부담부증여 경로는 지분 미인지(경로 전체가 그렇다)이므로 `ownershipRatio`를 넘기지 않는다.
 *
 * ⚠️ 종전 파라미터명 `assetAcquisitionPrice`는 **오칭**이었다 — 실제 base는 취득가액이 아니라
 *    §159 채무비율로 안분된 **기준시가**다(호출부 `landStdApportioned` 참조).
 */
export function estimatedDeductionForBurdenedGift(
  standardPriceApportioned: number,
  isUnregistered = false,
): number {
  const rate = isUnregistered
    ? UNREGISTERED_ESTIMATED_DEDUCTION_RATE
    : REGISTERED_ESTIMATED_DEDUCTION_RATE;
  return computeEstimatedDeduction(standardPriceApportioned, rate);
}
