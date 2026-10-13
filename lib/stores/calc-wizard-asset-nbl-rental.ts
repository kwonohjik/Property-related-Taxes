/**
 * 장기임대주택(§167의3①2호)·감면대상장기임대주택(①3호) 선언 묶음 타입 — 명부 행·양도 주택 공유.
 * calc-wizard-asset-nbl.ts 800줄 정책에 따라 분리 (2026-10-13). 기존 import 경로는 nbl이 re-export해 그대로 유효하다.
 */
import type { HouseEntry } from "./calc-wizard-asset-nbl";

/**
 * §167의3①2호 장기임대주택 선언 묶음 — **명부 행과 양도 주택이 공유**한다.
 *
 * ## 왜 공유하는가 — 9목 전부가 「양도하는 그 주택」에도 성립한다
 *
 * 법문(실독 2026-09-22 · MST 286211)은 2호의 가~자목 어디에도 「임대주택 **외의** 주택을
 * 양도하는 경우」라는 제한을 두지 않는다. 오히려 그 반대다:
 *   · **사목** = 「등록 말소 이후 1년 이내 **양도하는** 주택」 — 문언 자체가 양도 주택이다.
 *   · **라목** = 「해당 주택을 **양도하는** 거주자는 … 미분양주택 확인서 사본 … 제출해야 한다」.
 *
 * ⇒ 「양도 주택에는 일부 목만 쓰인다」는 추정은 **법문으로 반증됐다**. 목을 골라낼 수 없으므로
 *   명부 행의 매트릭스를 그대로 공유한다 — 복제하면 두 진실이 된다.
 *
 * 🔑 `Partial`인 이유: 명부 행은 `isLongTermRental`·`isApartment`가 필수지만, 양도 주택은
 *   이 묶음 자체가 `sellingHouseExclusion.longTermRental`로 **선택적**이다(미선언 = 장기임대 아님).
 *   `HouseEntry`는 이 타입에 구조적으로 대입되므로 매트릭스 위젯을 양쪽이 함께 쓴다.
 */
export type RentalDeclaration = Partial<
  Pick<
    HouseEntry,
    // 공통 — 아파트 여부는 아·자목 일괄 제외 / 가·마목 2020.7.11 이후 등록 제외의 판정 입력이다
    | "isLongTermRental"
    | "isApartment"
    // legacy 등록 경로 (rentalType 미선택 시)
    | "isRegisteredRental"
    | "rentalRegistrationDate"
    | "businessRegistrationDate"
    | "rentalPeriodYears"
    | "rentalCancelledDate"
    | "rentalCancellationReason"
    // 9유형 매트릭스 (가~자목)
    | "rentalType"
    | "rentIncreaseUnder5Pct"
    | "rentIncreaseContractDate"
    | "isNationalSizeHousing"
    | "hasMinimum2Units"
    | "hasMinimum5UnitsInCity"
    | "rentalLandArea"
    | "rentalTotalFloorArea"
    | "isConvertedToSale"
    | "firstSaleContractDate"
    | "acquisitionOfficialPrice"
    | "rentalStartOfficialPrice"
    | "hasHalfDutyPeriodMet"
    | "isSoldWithin1YearOfCancellation"
    | "rentalCancellationDate"
    | "saMokBaseArticle"
    | "isExcluded918Rule"
    | "isExcludedAfter20200711Apt"
    | "isExcludedShortToLongChange"
    | "hasContractDepositProof"
    // §167의3⑪ 기한 연장 사실 (아파트 가·나·라·마목)
    | "rentalAptDeadlineExtension"
  >
>;

/** 3호 후단 등록 유형 — 종전 민특법 §2 5호(장기일반)·6호(단기)·그 외. 미입력(undefined) = 모름. */
export type TaxIncentiveRentalRegistrationType = "long_term_general" | "short_term" | "other";

/**
 * §167의3⑪ 기한 연장 사실 — 엔진 `AptTransferDeadlineExtension`의 폼 문자열판(YYYY-MM-DD).
 *
 * 🔑 3-state(`status`): undefined = 「모름」(기한 2027.12.31. + 확인 필요 고지) · "none" = 「연장 사유 없음」 확인(기한 2027.12.31. 확정) ·
 *    "has" = 「연장 사유 있음」(아래 날짜). 「있음」을 고른 뒤 날짜가 비어 있어도 그 선택이 유지되도록 모드를
 *    데이터에서 파생하지 않는다(빈 값 자기-소멸 방지). #1914 이전 저장분(status 없음 + 날짜)은 「있음」으로 읽는다
 *    — 해석은 `aptDeadlineExtensionStatus` 한 곳(⑤·④·⑧ 공용).
 */
export interface AptDeadlineExtensionForm {
  status?: "none" | "has";
  /** ⑪1호 — 임대의무기간 2027.1.1 이후 종료 주택의 등록말소일 */
  dutyPeriodEndCancellationDate?: string;
  /** ⑪2호 — 2027.1.1 이후 조정대상지역 신규 지정 공고일 */
  newRegulatedAreaAnnouncementDate?: string;
  /** ⑪3호 — 재건축·재개발·소규모정비 이전고시일 */
  relocationAnnouncementDate?: string;
  /** ⑪3호 — 그 사업의 인가 또는 지정일. 비어 있으면 모름(3호 불성립 — 결론을 가를 때 확인 필요 고지) */
  relocationAuthorizationDate?: string;
  /** ⑪3호 — 양도일 현재 이전고시 전(이전고시일과 상호 배타 — ⑤ onChange가 정리) */
  relocationNotYetAnnounced?: boolean;
  /**
   * ⑪3호 단서 — 협의·수용재결·매도청구소송에 따른 양도. undefined = 모름(구 저장분 포함) · false 아니오 · true 예.
   * 3호 사업 사실이 있을 때만 화면에 나오고 전송된다(`aptDeadlineRelocationFactPresent`).
   */
  relocationExpropriationTransfer?: boolean;
}

/**
 * 소령 §167의3①3호 「감면대상장기임대주택」 선언 — **명부 행과 양도 주택이 공유**한다.
 *
 * 법문(MST 290841 실독): 「「조세특례제한법」 제97조ㆍ제97조의2 및 제98조에 따라 양도소득세가 감면되는
 * 임대주택으로서 5년 이상 임대한 국민주택」 + 후단(아파트 민간매입 장기일반·단기 → ⑪ 기한까지 양도).
 *
 * 🔑 후단 4사실은 **3-state**다 — 미입력(undefined)은 「모른다」이고 엔진이 불리 적용(후단 대상으로 보고 ⑪ 기한 적용 +
 *    결론이 갈리면 확인 필요 고지)한다(사용자 결정 2026-10-04 · `isTaxIncentiveRentalAptDeadlinePending`). false로 채우지 말 것.
 * 🔑 명부 행은 `rentalPeriodYears`·`isNationalSizeHousing`·`isApartment`를 2호와 같은 칸으로 쓰고,
 *    양도 주택은 그 세 칸을 `sellingHouseExclusion.taxIncentiveRental` 묶음에 둔다(2호 선언과의 공유는
 *    `lib/calc/tax-incentive-rental-scope.ts`가 정한다).
 */
export type TaxIncentiveRentalFacts = Partial<
  Pick<
    HouseEntry,
    | "isTaxIncentiveRental"
    | "isTaxIncentiveRentalPurchase"
    | "taxIncentiveRentalRegistrationType"
    | "isUrbanLifeHousingApartment"
    | "taxIncentiveRentalAptDeadlineExtension"
    | "rentalPeriodYears"
    | "isNationalSizeHousing"
    | "isApartment"
  >
>;
