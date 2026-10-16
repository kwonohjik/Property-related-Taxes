/**
 * RentalHousingExceptionFormSlice — 장기임대주택 보유자 거주주택 비과세 특례(소령 §155⑳) 입력.
 * AssetForm이 extends. 800줄 정책으로 calc-wizard-asset.ts에서 분리.
 */
import type { AptDeadlineExtensionForm } from "./calc-wizard-asset-nbl";

export interface RentalHousingExceptionFormSlice {
  // ── 장기임대주택 보유자 거주주택 비과세 특례 (소령 §155⑳) ──
  rentalHousingException: {
    applyException: boolean;
    /** 거주주택 양도(A) / PHRP 양도(B) */
    scenario: 'A' | 'B';
    rentalUnits: Array<{
      /**
       * React 리스트 key 전용 **안정 식별자** — 엔진·④에 전송되지 않는다
       * (`transfer-tax-api-rental-housing.ts`는 필드를 명시 매핑한다).
       *
       * 🔴 종전에는 카드 key가 배열 인덱스였다. 중간 호를 삭제하면 뒤 카드가 삭제된 호의
       *    인덱스를 물려받아 **자식의 로컬 state가 그대로 남았다** — `AddressSearch`의 검색어는
       *    마운트 시 1회만 초기화되고(`address-search.tsx:75`) 동기화 useEffect는 외부 값이
       *    **빈 문자열이 될 때만** 초기화하며(:102~105), `HousingStdPriceLookupField`의
       *    `selectedYear`·`isManual`·`priceType`·`lookupError`도 로컬 state뿐이다.
       *    ⇒ 삭제된 호의 주소 검색어·조회 상태가 남은 카드에 그대로 붙어 있었다.
       *
       * ⚠️ stale sessionStorage·이력 복원분에는 없다 — ③ `migrateAsset`이 채운다.
       */
      unitId: string;
      /** 세무서 사업자등록일 §168 (YYYY-MM-DD) */
      businessRegistrationDate: string;
      /** 지자체 임대사업자등록신청일 민특법§5 (YYYY-MM-DD) */
      rentalRegistrationDate: string;
      /** 임대구분 (의무기간·cap 파생 소스). existing_business=나목·unsold_08_09=라목(미분양) */
      rentalCategory: 'long_general' | 'short_6y' | 'pre_2018' | 'existing_business' | 'unsold_08_09';
      rentalAcquisitionType: 'purchase' | 'construction';
      isApartment: boolean;
      /** 소재지역 수도권/비수도권 (918 조정취득은 isExcluded918Rule 별도) */
      region: 'seoul-metro' | 'non-metro';
      /** 소재지 법정동코드 10자리 (주소 검색 시 자동 채움 — region 자동판별 소스·자동배지 신호). 미검색 시 "" */
      regionCode: string;
      /**
       * 거주주택 양도일 현재 이 임대주택 기준시가(원, 문자열) — 영 §167의3①1호(지방 3억 이하 중과 주택 수 불산입).
       * 소재지가 가액기준 지역일 때만 묻고 보낸다(`rentalUnitLowPriceInScope`). "" = 모름(산입).
       */
      officialPriceAtResidenceTransfer: string;
      /** 918 조정취득 배제(2018.9.14 이후 조정대상지역 신규취득). 마목 hard·아목 carve-out */
      isExcluded918Rule: boolean;
      /** 아목 918 carve-out — 조정대상지역 공고 전 계약 + 계약금 지급 증빙 */
      hasContractDepositProof: boolean;
      /** 마·바목 단기→장기 변경신고 배제 여부 */
      isExcludedShortToLongChange: boolean;
      /** 임대개시일 기준시가 (원, 문자열) — 가/다/마/바/아/자/구법 */
      standardPriceAtRentalStart: string;
      /** 취득당시 기준시가 (원, 문자열) — 나목(취득당시 3억) */
      acquisitionOfficialPrice: string;
      /** 국민주택규모 충족 자기확인 — 나목 */
      isNationalSizeHousing: boolean;
      /** 대지면적 ㎡ (건설임대 규모요건, 문자열) */
      rentalLandArea: string;
      /** 연면적/전용면적 ㎡ (건설임대 규모요건, 문자열) */
      rentalTotalFloorArea: string;
      /** 2호 이상 임대 충족 자기확인 (건설임대·나목) */
      hasMinimum2Units: boolean;
      /** 같은 시·군 5호 이상 임대 충족 (라목 미분양) */
      hasMinimum5UnitsInCity: boolean;
      /** 최초 분양계약일 (라목 미분양 2008.6.11~2009.6.30, YYYY-MM-DD) */
      firstSaleContractDate: string;
      /** 실제 임대 개월 수 (direct 모드 값·legacy fallback) */
      rentalMonths: string;
      /** 임대기간 입력 모드 — direct(개월 직접)·interval(시작~종료일 다중 기간) */
      rentalInputMode: "interval" | "direct";
      /** 임대 구간 (interval 모드, 비연속 허용). 개월은 API 변환 시 deriveRentalMonths로 합산 */
      rentalPeriods: Array<{ start: string; end: string }>;
      /** 임대주택 지번 주소 — 임대개시일 기준시가 Vworld 조회용(UI 상태·엔진 미전송) */
      rentalAddressJibun: string;
      /** 공동주택 동(예: "324") — 임대개시일 기준시가 세대 식별용(UI 상태·엔진 미전송) */
      rentalDong: string;
      /** 공동주택 호(예: "1004") — 임대개시일 기준시가 세대 식별용(UI 상태·엔진 미전송) */
      rentalHo: string;
      /** §155㉓ 말소 — 자진(임대의무기간 1/2↑)·자동말소로 등록이 말소된 호 (가·다·라·마목) */
      rentalAutoTermination: boolean;
      /**
       * §155㉓ 등록 말소일(YYYY-MM-DD, I-4) — 「말소 이후(2호 이상이면 최초 말소 이후) 5년 이내 양도」의
       * 기산일. "" = 미입력(말소 토글 ON이면 ⑧이 차단 · 엔진은 ㉓ 판정 보류).
       */
      registrationCancellationDate: string;
      /**
       * ㉓1호 자진말소 1/2 판정용 — 말소 주택의 종전 민특법 등록 유형(OH-39). "" = 미선택.
       * short_term = 단기민간임대(4년 → 24개월) · long_term_general = 장기일반민간임대(8년 → 48개월).
       */
      terminatedRegistrationType: "" | "short_term" | "long_term_general";
      /**
       * 말소 사유 — 다주택 중과 판정 전용(영 §167의3①2호 단서: 자동말소면 임대기간요건 간주 충족). "" = 미선택
       * (자동말소로 보지 않고 확인 필요 고지). optional — 이 칸 신설 전 복원분(undefined)도 미선택과 같다.
       */
      terminationReason?: "" | "auto" | "voluntary";
      /**
       * §167의3⑪ 기한 연장 사실 — 도출 목이 가·나·라·마이고 아파트일 때만 묻는다(§155㉓ 말소 경로 제외).
       * optional — 미입력·stale 복원분(undefined)은 「모름」(엔진 판정 보류). 범위: `apt-deadline-extension-scope.ts`.
       */
      aptDeadlineExtension?: AptDeadlineExtensionForm;
      /**
       * 혼인합가(§155⑤) — 이 임대주택의 혼인 전 보유자(판정 메뉴 전용 · 명부 밖 임대주택). undefined = 미선택.
       * 각각 2주택 이상인 사람끼리의 혼인이면 특례 불가(기획재정부 조세정책과-1199)라 양쪽 주택 수에 센다.
       */
      mergeOrigin?: "seller_side" | "counterpart_side" | "after_merge";
      /** 기타 요건 충족 자기확인 (5%증액 등) */
      requirementsConfirmed: boolean;
    }>;
    /** B 시나리오: 직전거주주택 양도일 (YYYY-MM-DD) */
    priorResidenceTransferDate?: string;
    /** B 시나리오: 취득 당시 기준시가 P_acq (원, 문자열) */
    standardPriceAtAcquisitionForPhrp?: string;
    /** B 시나리오: 직전양도 당시 기준시가 P_prior (원, 문자열) */
    standardPriceAtPriorTransfer?: string;
    /** B 시나리오: 현 양도 당시 기준시가 P_transfer (원, 문자열) */
    standardPriceAtTransferForPhrp?: string;
    /**
     * B 시나리오: 사업자등록·임대사업자 등록 이후 거주기간(개월, 문자열) — §155⑳1호 괄호(OH-15).
     * "" = 미입력(⑧이 차단).
     */
    postRegistrationResidenceMonths?: string;
    /**
     * 생애 1회 제한 구간(2019-02-12 이후 취득 · 2025-02-27 이전 양도)의 종전 §155⑳ 적용 이력(OH-40).
     * "" = 미선택.
     */
    priorRentalExemptionHistory?: "" | "none" | "used";
    /** 대통령령 제29523호 부칙 제7조② 경과조치 해당(2019-02-12 당시 거주 중 · 그 전 계약금 지급) — OH-40 */
    residenceTransitionUnderAddendum?: boolean;
    /** 위 경과조치의 사유(D11) — "" = 미선택(판정 메뉴 ⑧이 막는다). 체크를 끄면 함께 비운다. */
    residenceTransitionBasis?: "" | "residing" | "contract_with_prior_rental" | "contract_without_prior_rental";
    /**
     * §154⑩1호(I-5) — 이 주택이 임대주택 등록(민특법§5) 또는 어린이집 설치·운영(영유아보육법§12·§13)
     * 사실이 있는가. `rentalUnits`가 0호인 B 시나리오(§154⑩ 표준 경로)에서만 UI가 노출·판정에 쓴다.
     * 거주기간은 별도 필드 없이 취득 시기별로 `postRegistrationResidenceMonths`(2019.2.12 이후
     * 취득) 또는 일반 거주기간(그 전 취득)을 재사용한다.
     */
    wasRegisteredRentalOrChildcare?: boolean;
  };
}
