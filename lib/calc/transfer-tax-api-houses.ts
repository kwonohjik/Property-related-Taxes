/**
 * transfer-tax-api-houses.ts — 세대 보유 주택 목록 API 페이로드 빌더 (④⑬)
 *
 * transfer-tax-api.ts 800줄 정책 초과로 분리 (2026-06-16).
 * houses 인라인 map + 장기임대 9유형 매트릭스 18필드 게이트를 담당.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { HouseEntry, RentalDeclaration } from "@/lib/stores/calc-wizard-asset-nbl";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { isHousingLike } from "./transfer-tax-api-helpers";
import { deriveHouseRegionFromCode } from "./house-region";

/**
 * ④⑬ 양도 주택의 §167의3①2호 장기임대 선언 → `houseSchema` 필드.
 *
 * 명부 행 매핑(아래 `otherHouses`)과 **같은 규약**이다: 등록 경로는 `isLongTermRental`이 켜진
 * 때만, 9유형 매트릭스는 `rentalType`까지 고른 때만 싣는다. 미선언이면 `isLongTermRental: false`
 * 하나만 나가 종전과 동일하다(⑫ `isLongTermRental`은 필수 boolean이다).
 *
 * ⚠️ `acquisitionOfficialPrice`는 여기서 내보내지 않는다 — §167의10①3호(부득이)와 칸이 겹쳐
 *   호출부가 한 번에 결정한다(`sellingRentalAcquisitionPrice`).
 */
export function buildSellingRentalPayload(ltr: RentalDeclaration | undefined): object {
  if (!ltr?.isLongTermRental) return { isLongTermRental: false, isApartment: false };
  return {
    isLongTermRental: true,
    isApartment: ltr.isApartment ?? false,
    isRegisteredRental: ltr.isRegisteredRental,
    rentalRegistrationDate: ltr.rentalRegistrationDate || undefined,
    businessRegistrationDate: ltr.businessRegistrationDate || undefined,
    rentalPeriodYears: ltr.rentalPeriodYears ? parseFloat(ltr.rentalPeriodYears) : undefined,
    rentalCancelledDate: ltr.rentalCancelledDate || undefined,
    ...(ltr.rentalType
      ? {
          rentalType: ltr.rentalType,
          rentIncreaseUnder5Pct: ltr.rentIncreaseUnder5Pct,
          isNationalSizeHousing: ltr.isNationalSizeHousing,
          hasMinimum2Units: ltr.hasMinimum2Units,
          hasMinimum5UnitsInCity: ltr.hasMinimum5UnitsInCity,
          rentalLandArea: ltr.rentalLandArea ? parseFloat(ltr.rentalLandArea) : undefined,
          rentalTotalFloorArea: ltr.rentalTotalFloorArea
            ? parseFloat(ltr.rentalTotalFloorArea)
            : undefined,
          isConvertedToSale: ltr.isConvertedToSale,
          firstSaleContractDate: ltr.firstSaleContractDate || undefined,
          rentalStartOfficialPrice: ltr.rentalStartOfficialPrice
            ? parseInt(ltr.rentalStartOfficialPrice)
            : undefined,
          hasHalfDutyPeriodMet: ltr.hasHalfDutyPeriodMet,
          isSoldWithin1YearOfCancellation: ltr.isSoldWithin1YearOfCancellation,
          rentalCancellationDate: ltr.rentalCancellationDate || undefined,
          saMokBaseArticle: ltr.saMokBaseArticle,
          isExcluded918Rule: ltr.isExcluded918Rule,
          isExcludedAfter20200711Apt: ltr.isExcludedAfter20200711Apt,
          isExcludedShortToLongChange: ltr.isExcludedShortToLongChange,
          hasContractDepositProof: ltr.hasContractDepositProof,
        }
      : {}),
  };
}

/** 장기임대 나·라목의 「취득 당시 기준시가」 — 부득이 3호와 칸을 겸하므로 분리했다. */
export function sellingRentalAcquisitionPrice(ltr: RentalDeclaration | undefined): number | undefined {
  if (!ltr?.isLongTermRental || !ltr.acquisitionOfficialPrice) return undefined;
  return parseInt(ltr.acquisitionOfficialPrice);
}

/**
 * 양도주택(selling) + 보유주택 목록 → Zod houseSchema 배열 페이로드 빌드.
 * isLongTermRental=true && rentalType 설정 시에만 9유형 18필드를 게이트.
 * sellingExclusion: 양도 주택 3주택+ 전용 배제 특례(저당권·사원주택·문화재·어린이집 등) — selling 객체에 주입.
 */
export function buildHousesPayload(
  primary: AssetForm,
  houses: HouseEntry[],
  presaleRightsCount: number,
  sellingExclusion?: TransferFormData["sellingHouseExclusion"],
): object[] | undefined {
  const hasMultiHouseEntries = houses.length > 0 || presaleRightsCount > 0;
  if (!isHousingLike(primary.assetKind) || !hasMultiHouseEntries) return undefined;

  const se = sellingExclusion;
  const sellingHouse = {
    id: "selling",
    // 양도 물건 regionCode에서 자동 파생 (수동 선택 폐지) — regionCode 우선·미입력 시 REGION 기본
    region: deriveHouseRegionFromCode(primary.regionCode),
    // ④⑬ 법정동코드 — 제공 시 엔진 isRegulatedByBjdCode() 정밀 판정, 미제공 시 boolean fallback
    regionCode: primary.regionCode || undefined,
    acquisitionDate: primary.acquisitionDate,
    officialPrice: parseAmount(primary.standardPriceAtTransfer) || 0,
    /**
     * ④⑬ §167의3①**7호** — 양도 주택 **자신**이 5년 내 상속주택이면 중과 대상에서 빠진다.
     *
     * 🔴 종전에는 `false` **하드코딩**이었다. 엔진은 D16(2026-09-18)부터 양도 주택에도 이 호를
     *    적용하는데(`multi-house-surcharge-exclusion.ts:461`), 어댑터가 사실을 싣지 않아 그 분기가
     *    **잠들어 있었다**. D16 anchor(A4·B9)는 `HouseInfo`를 직접 만드는 **엔진 leaf**라 이 배선을
     *    증명하지 못한다([[feedback_library_anchor_does_not_prove_component_uses_it]]).
     *    실측 −212,575,000(3주택) · −157,850,000(2주택) — **과다 과세** 방향이었다.
     *
     * 🔑 비과세 축은 **건드리지 않는다** — 상속주택 주택 수 제외
     *    (`transfer-inheritance-exclusion.ts:72`)와 §89② 판정(`transfer-tax-89-2-exclusion.ts:449`)은
     *    둘 다 `h.id !== sellingHouseId`로 양도 행을 **명시 제외**한다. 주택 수도 그대로다
     *    (7호는 §167의3① 본문 괄호의 불산입 대상이 아니다 — D16).
     */
    isInherited: primary.acquisitionCause === "inheritance",
    /**
     * 기산일 fallback — **상속 자산의 취득시기가 곧 상속개시일**이다.
     *
     * 법문(실독 2026-09-22 · MST 286211) 영 §162①5호: 「**상속** 또는 증여에 의하여 취득한
     * 자산에 대하여는 그 **상속이 개시된 날** 또는 증여를 받은 날」.
     *
     * ⑧ validate는 `inheritanceDate`를 필수로 요구하지 않는다. fallback이 없으면 취득일만 적은
     * 사용자는 `isInherited: true`인데 기산일이 없어 7호가 **조용히 죽는다**(엔진은 둘 다 있어야
     * 판정한다 — `multi-house-surcharge-count.ts:442`).
     */
    inheritedDate:
      primary.acquisitionCause === "inheritance"
        ? primary.inheritanceDate || primary.acquisitionDate || undefined
        : undefined,
    // §155② 단서·순위 게이트 — 명부 행과 **같은 술어**(`passesHouseholdGate`·`passesRankingGate`).
    // 동일세대 사실은 §154⑧3호 칸을 그대로 쓴다(두 조문이 같은 질문 — 필드 주석의 실독 근거).
    decedentSameHouseholdAtInheritance:
      primary.acquisitionCause === "inheritance"
        ? primary.decedentSameHouseholdBeforeInheritance
        : undefined,
    parentalCareMergeInheritedHouse:
      primary.acquisitionCause === "inheritance" && primary.decedentSameHouseholdBeforeInheritance
        ? primary.parentalCareMergeInheritedHouse
        : undefined,
    isRankingDisqualifiedInheritedHouse:
      primary.acquisitionCause === "inheritance"
        ? primary.isRankingDisqualifiedInheritedHouse
        : undefined,
    /**
     * ④⑬ §167의3①**2호** — 양도 주택 **자신**이 등록 장기임대주택이면 중과 대상에서 빠진다.
     *
     * 🔴 종전에는 `false` **하드코딩**이었다. 엔진은 양도 주택에도 2호를 적용하는데
     *    (`multi-house-surcharge-exclusion.ts` `isSurchargeExemptRental(sellingHouse, …)`)
     *    어댑터가 사실을 싣지 않아 그 분기가 **잠들어 있었다** — 문화유산(6호)·상속(7호)과
     *    같은 「어댑터 한 층만 끊긴 잠자는 분기」다.
     *
     * 🔑 9목 전부가 양도 주택에 성립하므로 명부 행과 **같은 필드 묶음**을 그대로 보낸다
     *    (근거: `RentalDeclaration` 주석의 법문 실독 — 사목은 문언이 「양도하는 주택」).
     */
    ...buildSellingRentalPayload(se?.longTermRental),
    isOfficetel: false,
    isUnsoldHousing: false,
    // P2 양도 주택 3주택+ 전용 배제 특례
    isMortgageExecution: se?.isMortgageExecution,
    isEmployeeHousing: se?.isEmployeeHousing,
    freeProvisionYears:
      se?.isEmployeeHousing && se.freeProvisionYears ? parseFloat(se.freeProvisionYears) : undefined,
    isTaxSpecialExemption: se?.isTaxSpecialExemption,
    isCulturalHeritage: se?.isCulturalHeritage,
    isDayCareCenter: se?.isDayCareCenter,
    dayCareOperationYears:
      se?.isDayCareCenter && se.dayCareOperationYears ? parseFloat(se.dayCareOperationYears) : undefined,
    // P2 양도 주택 2주택 전용 배제 — §167의10①3호(부득이)·7호(소송)는 **양도하는 주택 자신**에도
    // 적용된다(F-16). 종전에는 이 두 호가 다른 주택 행에만 실려 입력 경로가 아예 없었다.
    isUnavoidableReason: se?.isUnavoidableReason,
    unavoidableResidenceYears:
      se?.isUnavoidableReason && se.unavoidableResidenceYears
        ? parseFloat(se.unavoidableResidenceYears)
        : undefined,
    unavoidableReasonResolvedDate: se?.isUnavoidableReason
      ? se.unavoidableReasonResolvedDate || undefined
      : undefined,
    /**
     * 3호의 기준시가는 「취득 당시」다 — 양도 주택의 `officialPrice`에는 양도 당시 값이 실린다.
     *
     * ⚠️ **한 필드가 두 조문 축을 겸한다** — §167의10①3호(부득이)와 장기임대 나·라목이 둘 다
     *    「취득 당시 기준시가」를 본다. 가리키는 **사실이 같으므로** 값은 하나여야 하고, 어느
     *    칸에 적혔든 살아남아야 한다. 부득이 칸이 비어 있을 때 `undefined`로 덮으면 위 spread가
     *    실은 임대 쪽 값이 조용히 지워진다(속성 순서상 이 줄이 뒤에 온다).
     */
    acquisitionOfficialPrice:
      (se?.isUnavoidableReason && se.acquisitionOfficialPrice
        ? parseAmount(se.acquisitionOfficialPrice)
        : undefined) ?? sellingRentalAcquisitionPrice(se?.longTermRental),
    isLitigationHousing: se?.isLitigationHousing,
    litigationAcquisitionDate: se?.isLitigationHousing
      ? se.litigationAcquisitionDate || undefined
      : undefined,
  };

  const otherHouses = houses
    .filter((h) => h.acquisitionDate)
    .map((h) => ({
      id: h.id,
      region: h.region,
      // ④ 법정동 10자리 — 엔진 §167의3 지역기준(REGION/VALUE) 정밀 판정. houseSchema는
      // regionCode를 정확히 10자리(.length(10))만 수용 → ≠10자리는 undefined(Zod 400 회피).
      regionCode: h.regionCode?.length === 10 ? h.regionCode : undefined,
      acquisitionDate: h.acquisitionDate,
      officialPrice: parseInt(h.officialPrice) || 0,
      isInherited: h.isInherited,
      isLongTermRental: h.isLongTermRental,
      isApartment: h.isApartment,
      isOfficetel: h.isOfficetel,
      isUnsoldHousing: h.isUnsoldHousing,
      /**
       * ④⑬ §167의3①**6호** 국가유산주택 — **비과세 선언과 같은 칸에서 나온다**.
       *
       * 법문(실독 2026-09-22 · MST 286211): 「6. **제155조제6항제1호에 해당하는 국가유산주택**」
       * — 6호가 §155⑥1호를 **그대로 인용**한다. 그리고 §155⑥1호는 주택의 **정의**일 뿐이다
       * (「지정문화유산 … 국가등록문화유산 … 천연기념물등」). 「각각 1개씩」은 ⑥ **본문**에 있어
       * 6호로 넘어오지 않는다 ⇒ **행의 선언 그 자체가 6호의 요건 전부**다.
       *
       * 주택 수에는 **산입된다** — §167의3① 본문 괄호가 불산입으로 정한 것은 1호·12호뿐이라
       * `countEffectiveHouses`는 이 필드를 보지 않는다. 6호는 ⑩호 「유일한 일반주택」 판정
       * (`isGroupExcludable`)과 그 행 자신의 중과 배제에만 쓰인다.
       */
      isCulturalHeritage: h.oneHouseCulturalHeritage,
      // ⑬ 소형신축·준공후미분양 특례 (§167의3①12가·나목)
      acquisitionPrice: parseAmount(h.acquisitionPrice || "") || undefined,
      exclusiveArea: h.exclusiveArea ? parseFloat(h.exclusiveArea) : undefined,
      isUnsoldNewHouse: h.isUnsoldNewHouse,
      completionDate: h.completionDate || undefined,
      // #2a 배우자 단독 보유 (§167의3⑨ 혼인 차감) — 양도주택(selling)은 본인 소유라 미설정
      isSpouseOwned: h.isSpouseOwned,
      // 상속 5년 배제 — isInherited=true 일 때만 기산일 전달
      inheritedDate: h.isInherited ? h.inheritedDate || undefined : undefined,
      // §155③ 공동상속 (2-A2) — isInherited=true 일 때만 전달
      isCoInherited: h.isInherited ? h.isCoInherited : undefined,
      isLargestCoInheritedShareholder:
        h.isInherited && h.isCoInherited ? h.isLargestCoInheritedShareholder : undefined,
      // §155② 단서·순위 게이트 — isInherited=true 일 때만 전달. 동거봉양 예외는 동일세대일 때만.
      decedentSameHouseholdAtInheritance: h.isInherited
        ? h.decedentSameHouseholdAtInheritance
        : undefined,
      parentalCareMergeInheritedHouse:
        h.isInherited && h.decedentSameHouseholdAtInheritance
          ? h.parentalCareMergeInheritedHouse
          : undefined,
      isRankingDisqualifiedInheritedHouse: h.isInherited
        ? h.isRankingDisqualifiedInheritedHouse
        : undefined,
      // 장기임대 legacy 등록 경로 — isLongTermRental=true 일 때만 등록정보 전달
      isRegisteredRental: h.isLongTermRental ? h.isRegisteredRental : undefined,
      rentalRegistrationDate: h.isLongTermRental ? h.rentalRegistrationDate || undefined : undefined,
      businessRegistrationDate: h.isLongTermRental ? h.businessRegistrationDate || undefined : undefined,
      rentalPeriodYears:
        h.isLongTermRental && h.rentalPeriodYears ? parseFloat(h.rentalPeriodYears) : undefined,
      rentalCancelledDate: h.isLongTermRental ? h.rentalCancelledDate || undefined : undefined,
      // P2 특수 배제 (2주택 전용·인구감소) — 독립 플래그, 토글 ON 시 부속값 전달
      isUnavoidableReason: h.isUnavoidableReason,
      // §167의10①3호는 「**취득 당시** 기준시가 3억 이하」다 — `officialPrice`(양도일 연도 조회값)로
      // 갈음하지 않는다(F-16). 장기임대 9유형(라목)도 같은 칸을 쓰므로 그 게이트 밖에서 전달한다.
      acquisitionOfficialPrice: h.acquisitionOfficialPrice ? parseInt(h.acquisitionOfficialPrice) : undefined,
      unavoidableResidenceYears:
        h.isUnavoidableReason && h.unavoidableResidenceYears
          ? parseFloat(h.unavoidableResidenceYears)
          : undefined,
      unavoidableReasonResolvedDate: h.isUnavoidableReason
        ? h.unavoidableReasonResolvedDate || undefined
        : undefined,
      isLitigationHousing: h.isLitigationHousing,
      litigationAcquisitionDate: h.isLitigationHousing
        ? h.litigationAcquisitionDate || undefined
        : undefined,
      isRedevelopmentZone: h.isRedevelopmentZone,
      isPopulationDeclineArea: h.isPopulationDeclineArea,
      isSecondHomeRegistered: h.isPopulationDeclineArea ? h.isSecondHomeRegistered : undefined,
      populationAreaType: h.isPopulationDeclineArea ? h.populationAreaType : undefined,
      // ④⑬ 장기임대 9유형 매트릭스 — isLongTermRental=true && rentalType 설정 시에만 전달
      ...(h.isLongTermRental && h.rentalType
        ? {
            rentalType: h.rentalType,
            rentIncreaseUnder5Pct: h.rentIncreaseUnder5Pct,
            isNationalSizeHousing: h.isNationalSizeHousing,
            hasMinimum2Units: h.hasMinimum2Units,
            hasMinimum5UnitsInCity: h.hasMinimum5UnitsInCity,
            rentalLandArea: h.rentalLandArea ? parseFloat(h.rentalLandArea) : undefined,
            rentalTotalFloorArea: h.rentalTotalFloorArea ? parseFloat(h.rentalTotalFloorArea) : undefined,
            isConvertedToSale: h.isConvertedToSale,
            firstSaleContractDate: h.firstSaleContractDate || undefined,
            rentalStartOfficialPrice: h.rentalStartOfficialPrice
              ? parseInt(h.rentalStartOfficialPrice)
              : undefined,
            hasHalfDutyPeriodMet: h.hasHalfDutyPeriodMet,
            isSoldWithin1YearOfCancellation: h.isSoldWithin1YearOfCancellation,
            rentalCancellationDate: h.rentalCancellationDate || undefined,
            saMokBaseArticle: h.saMokBaseArticle,
            isExcluded918Rule: h.isExcluded918Rule,
            isExcludedAfter20200711Apt: h.isExcludedAfter20200711Apt,
            isExcludedShortToLongChange: h.isExcludedShortToLongChange,
            hasContractDepositProof: h.hasContractDepositProof,
          }
        : {}),
    }));

  return [sellingHouse, ...otherHouses];
}
