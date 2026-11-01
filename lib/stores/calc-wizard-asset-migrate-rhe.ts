/**
 * AssetForm 마이그레이션 중 「장기임대주택 거주주택 비과세 특례」(`rentalHousingException`) 정규화 — calc-wizard-asset-migrate.ts에서 분리
 * (800줄 정책, 2026-10-13). 로직은 그대로 옮겼다(순서·조건 불변).
 */

import { migrateRentalPeriodFields } from "./calc-wizard-asset-rental-period";
import { RENTAL_HOUSING_EXCEPTION_DEFAULTS, nextRentalUnitId } from "./calc-wizard-asset-factory";

/** ③ 장기임대주택 거주주택 비과세 특례 마이그레이션 (sessionStorage 호환) — `a`를 제자리에서 고친다. */
export function migrateRentalHousingException(a: Record<string, unknown>): void {
  if (!a.rentalHousingException || typeof a.rentalHousingException !== "object") {
    a.rentalHousingException = { ...RENTAL_HOUSING_EXCEPTION_DEFAULTS };
  } else {
    const rhe = a.rentalHousingException as Record<string, unknown>;
    if (rhe.applyException === undefined) rhe.applyException = false;
    if (!rhe.scenario) rhe.scenario = 'A';
    if (!Array.isArray(rhe.rentalUnits)) rhe.rentalUnits = [];
    // 구 스키마 임대주택 유닛 → 신규 스키마 분해 (능동형 UI 개편, 2026-07-25)
    else {
      (rhe.rentalUnits as Record<string, unknown>[]).forEach((u) => {
        // React 리스트 key 전용 안정 식별자 — stale sessionStorage·이력 복원분에는 없다.
        // 없으면 카드 key가 인덱스로 되돌아가 삭제 시 자식 로컬 state가 옆 카드에 남는다.
        if (typeof u.unitId !== "string" || !u.unitId) u.unitId = nextRentalUnitId();
        // 임대기간 다중 구간 필드 기본값 (interval 모드·rentalPeriods)
        migrateRentalPeriodFields(u);
        // 등록일 1필드 → 세무서/지자체 2필드 (구 값을 지자체 신청일로 이전, 세무서는 재입력)
        if (u.registrationDate !== undefined && u.rentalRegistrationDate === undefined) {
          u.rentalRegistrationDate = u.registrationDate;
          if (u.businessRegistrationDate === undefined) u.businessRegistrationDate = "";
          delete u.registrationDate;
        }
        if (u.businessRegistrationDate === undefined) u.businessRegistrationDate = "";
        if (u.rentalRegistrationDate === undefined) u.rentalRegistrationDate = "";
        // rentalType 5값 → rentalCategory 3값 (short-4는 pre_2018로: 의무기간 4→5년 상향·재입력 유도)
        if (u.rentalCategory === undefined) {
          const t = u.rentalType;
          u.rentalCategory =
            t === "short-6" ? "short_6y"
            : t === "pre-2018" ? "pre_2018"
            : t === "short-4" ? "pre_2018"
            : "long_general"; // long-8/long-10/기타
          delete u.rentalType;
        }
        // region 3값 → 2값 + 918 게이트
        if (u.region === "regulated-area") {
          u.region = "seoul-metro";
          if (u.isRegulatedAreaNewAcq === undefined && u.isExcluded918Rule === undefined) u.isRegulatedAreaNewAcq = true;
        }
        if (u.region !== "seoul-metro" && u.region !== "non-metro") u.region = "seoul-metro";
        // 소재지 법정동코드(주소 자동판별 소스) — 미검색 stale unit은 "" (분기 술어는 length>=10)
        if (u.regionCode === undefined) u.regionCode = "";
        // 거주주택 양도 당시 기준시가(영 §167의3①1호) — 이 칸 신설 전 복원분은 "" (모름 = 산입)
        if (typeof u.officialPriceAtResidenceTransfer !== "string") u.officialPriceAtResidenceTransfer = "";
        // isRegulatedAreaNewAcq → isExcluded918Rule rename (Phase 1 데이터 값 보존, C4 D-2)
        if (u.isRegulatedAreaNewAcq !== undefined) {
          if (u.isExcluded918Rule === undefined) u.isExcluded918Rule = u.isRegulatedAreaNewAcq;
          delete u.isRegulatedAreaNewAcq;
        }
        if (u.isExcluded918Rule === undefined) u.isExcluded918Rule = false;
        if (u.hasContractDepositProof === undefined) u.hasContractDepositProof = false;
        if (u.isExcludedShortToLongChange === undefined) u.isExcludedShortToLongChange = false;
        if (u.acquisitionOfficialPrice === undefined) u.acquisitionOfficialPrice = "";
        if (u.isNationalSizeHousing === undefined) u.isNationalSizeHousing = false;
        if (u.rentalLandArea === undefined) u.rentalLandArea = "";
        if (u.rentalTotalFloorArea === undefined) u.rentalTotalFloorArea = "";
        if (u.hasMinimum2Units === undefined) u.hasMinimum2Units = false;
        if (u.hasMinimum5UnitsInCity === undefined) u.hasMinimum5UnitsInCity = false;
        if (u.firstSaleContractDate === undefined) u.firstSaleContractDate = "";
        if (u.rentalAutoTermination === undefined) u.rentalAutoTermination = false;
        // I-4 — ㉓ 말소일. 구 기록은 「말소 후 5년 이내」를 불리언 하나로 선언했다 — 날짜가 없으니 미입력("")으로
        // 둔다. 말소 토글이 켜진 구 기록은 ⑧이 말소일을 요구하고 엔진은 ㉓을 판정하지 않는다(비과세로 새지 않는다).
        if (typeof u.registrationCancellationDate !== "string") u.registrationCancellationDate = "";
        // OH-39 — 말소 주택 민특법 등록 유형(구 세션엔 없다 → 미선택)
        if (u.terminatedRegistrationType !== "short_term" && u.terminatedRegistrationType !== "long_term_general") {
          u.terminatedRegistrationType = "";
        }
        // 말소 사유(다주택 중과 §167의3①2호 단서) — 구 세션엔 없다 → 미선택
        if (u.terminationReason !== "auto" && u.terminationReason !== "voluntary") u.terminationReason = "";
      });
    }
    if (rhe.priorResidenceTransferDate === undefined) rhe.priorResidenceTransferDate = undefined;
    if (rhe.standardPriceAtAcquisitionForPhrp === undefined) rhe.standardPriceAtAcquisitionForPhrp = undefined;
    if (rhe.standardPriceAtPriorTransfer === undefined) rhe.standardPriceAtPriorTransfer = undefined;
    if (rhe.standardPriceAtTransferForPhrp === undefined) rhe.standardPriceAtTransferForPhrp = undefined;
    // OH-15·OH-40 신규 판정 사실 — 구 세션엔 없다 → 미입력(⑧·엔진이 「판정 불가」로 다룬다, 침묵 충족 금지)
    if (typeof rhe.postRegistrationResidenceMonths !== "string") rhe.postRegistrationResidenceMonths = "";
    if (rhe.priorRentalExemptionHistory !== "none" && rhe.priorRentalExemptionHistory !== "used") {
      rhe.priorRentalExemptionHistory = "";
    }
    if (rhe.counterpartHouseResidedTwoYears !== "yes" && rhe.counterpartHouseResidedTwoYears !== "no") {
      rhe.counterpartHouseResidedTwoYears = "";
    }
    if (typeof rhe.residenceTransitionUnderAddendum !== "boolean") rhe.residenceTransitionUnderAddendum = false;
    // D11 — 경과조치 사유. 구 세션엔 없다 → 미선택(엔진은 사유 없이 종전 규정을 주지 않는다 · 판정 메뉴 ⑧이 묻는다)
    if (
      rhe.residenceTransitionBasis !== "residing" &&
      rhe.residenceTransitionBasis !== "contract_with_prior_rental" &&
      rhe.residenceTransitionBasis !== "contract_without_prior_rental"
    ) {
      rhe.residenceTransitionBasis = "";
    }
    // §154⑩ 표준 경로(I-5) 신규 필드 — 구 세션엔 없다 → 미입력(엔진이 「판정 불가」로 다룬다)
    if (typeof rhe.wasRegisteredRentalOrChildcare !== "boolean") rhe.wasRegisteredRentalOrChildcare = false;
    // §154⑩ 사실 질문 — 구 기록엔 없다 → 미응답(판정 메뉴 ⑧이 묻는다). §154⑩ 선언 기록은 응답 없이도 「예」로 도출된다.
    if (rhe.phrp154_10Answer !== "yes" && rhe.phrp154_10Answer !== "no") rhe.phrp154_10Answer = "";
    // 구 브랜치(PR #1903 초판)의 residenceMonthsAfterPriorResidenceTransfer 필드는 폐기 —
    // 거주기간은 postRegistrationResidenceMonths(위 backfill)를 재사용한다. 남아 있어도 무해(미소비)하므로
    // 굳이 delete하지 않는다.
  }
}
