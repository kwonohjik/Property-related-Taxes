/**
 * 양도세 마법사 **폼 타입** — `TransferFormData`.
 *
 * `calc-wizard-store.ts`에서 분리했다(800줄 정책). 그 파일은 **초기값·스토어·요약 계산**을 맡고,
 * 여기는 선언만 둔다(로직 없음 — CLAUDE.md의 「타입 전용 파일」 층위).
 *
 * 종전 import 경로 호환을 위해 `calc-wizard-store.ts`가 재export한다.
 */
import type {
  AssetForm,
  HouseEntry,
  PresaleRightEntry,
  PriorReductionUsageItem,
  SpecialHouseExclusionFormItem,
} from "./calc-wizard-asset";

export interface TransferFormData {
  // ── Step 1: 자산 목록 + 양도 기본 정보 ──
  /** 모든 양도 자산 (최소 1건). assets[0]이 대표 자산. */
  assets: AssetForm[];
  /** 계약서 단위 총 양도가액 (모든 자산 합계) */
  contractTotalPrice: string;
  /**
   * 폼-수준 총 양도비 (지분 모드 자동 안분용, 선택).
   * 양도 시 1회 발생하는 부대비용(중개수수료·인지대 등)을 한 번만 입력.
   * 지분 모드에서 시스템이 자산별 ratio 비율로 자동 안분 (assets[i].transferExpense 우선 — 자산별 직접 입력이 있으면 우선).
   * 단독 소유는 자산-수준 transferExpense 그대로 사용.
   */
  totalTransferExpense: string;
  /**
   * 일괄양도 양도가액 결정 모드 (계약서 단위 단일 결정).
   * - "actual": 계약서에 자산별 가액이 구분 기재된 경우 (§166⑥ 본문)
   * - "apportioned": 구분 불분명 → 기준시가 비율 안분 (§166⑥ 단서)
   */
  bundledSaleMode: "actual" | "apportioned";
  /** 양도일 (YYYY-MM-DD) */
  transferDate: string;
  /** 양도소득세 신고일 (YYYY-MM-DD) */
  filingDate: string;

  // ── Step 2 (구 Step3 잔여): 대표 자산 고급 취득 정보 ──
  /**
   * @deprecated 자산-수준 `useEstimatedAcquisition`/`isAppraisalAcquisition`로 대체됨(2026-04-25).
   *
   * **읽지 말 것** — `defaultFormData`(calc-wizard-store.ts:56)에서 `"actual"`로 한 번 정해진 뒤
   * 갱신하는 코드가 0건이다(「동기화」한다는 종전 서술은 사실이 아니었다).
   * 필드를 남겨 두는 것은 구 스키마 sessionStorage를 `migrateLegacyForm`이 읽기 위해서다
   * (calc-wizard-migration.ts:93 — 구 폼의 `"appraisal"` → `assets[0].isAppraisalAcquisition`).
   */
  acquisitionMethod: "actual" | "estimated" | "appraisal";
  appraisalValue: string;
  isSelfBuilt: boolean;
  buildingType: "new" | "extension" | "";
  constructionDate: string;
  extensionFloorArea: string;
  pre1990Enabled: boolean;
  pre1990PricePerSqm_1990: string;
  pre1990PricePerSqm_atTransfer: string;
  pre1990Grade_current: string;
  pre1990Grade_prev: string;
  pre1990Grade_atAcq: string;
  pre1990GradeMode: "number" | "value";

  // ── Step 3 (구 Step4): 보유 상황 (세대·납세자 단위) ──
  isOneHousehold: boolean;
  householdHousingCount: string;
  /**
   * 세대 보유 조합원입주권 수 (양도일 현재).
   * §89①4호 가목 1세대1입주권 비과세 판단 — "1" 고정 (사례 36).
   * right_to_move_in 자산 유형에서만 의미. 기본값 "0".
   */
  householdRightCount: string;
  residencePeriodMonths: string;
  isRegulatedArea: boolean;
  wasRegulatedAtAcquisition: boolean;
  /** 조정대상지역 토글 수동 조작 여부 (UI 전용 — API 미전송). true면 자동판별 결과를 재반영하지 않음 */
  isRegulatedAreaTouched: boolean;
  wasRegulatedAtAcquisitionTouched: boolean;
  /** 양도 자산 법정동코드(10자리 — AddressSearch PNU 앞10). 제공 시 정밀 판정, 미제공 시 boolean fallback */
  regionCode?: string;
  isUnregistered: boolean;
  temporaryTwoHouseSpecial: boolean;
  // 종전주택 취득일은 별도 필드를 두지 않고 양도 자산(assets[0])의 acquisitionDate를 단일소스로 사용(§155① 종전주택 = 양도주택).
  newHouseAcquisitionDate: string;
  /** §155⑯ 공공기관·법인 지방이전 — 처분기한 3년→5년 + 1년 요건 면제 (효과 둘) */
  publicInstitutionRelocation: boolean;
  /** §155⑯ 이전한 기관 소재지 지번주소 (연접 판정용) */
  relocatedInstitutionJibun: string;
  /** §155⑯ 이전한 기관 시·군 코드 (행안부 10자리) */
  relocatedSigunguCode: string;
  /** §155⑯ 신규주택 소재지 지번주소 */
  newHouseJibun: string;
  /** §155⑯ 신규주택 시·군 코드 (행안부 10자리) */
  newHouseSigunguCode: string;
  /** §155⑧ 수도권 밖 부득이 주택 보유 여부 — 양도 대상은 **일반주택**이다 */
  unavoidableOutsideCapitalSpecial: boolean;
  /** §155⑧ 부득이한 사유 ("study"|"work"|"illness"|"other") */
  unavoidableOutsideCapitalReason: string;
  /** §155⑧ 사유 해소일 (YYYY-MM-DD). "" = 미해소 → 3년 기한 미기산 */
  unavoidableOutsideCapitalResolvedDate: string;
  /** §155⑦ 농어촌주택 보유 여부 — 양도 대상은 **일반주택**이다 */
  ruralHouseSpecial: boolean;
  /** §155⑦ 유형 ("inherited"|"farm_exit"|"return_to_farm") */
  ruralHouseKind: string;
  /** §155⑦ 소재 — 수도권 밖 읍(도시지역 제외)·면 */
  ruralHouseOutsideCapitalEupMyeon: boolean;
  /** §155⑦ 소재지 지번주소 — 읍·면 자동 판별용 (W-3) */
  ruralHouseJibun: string;
  /** §155⑦ 소재지 법정동코드(PNU 앞 10) — 수도권 여부 자동 판별용 */
  ruralHouseRegionCode: string;
  /** 소재 요건 토글을 사용자가 직접 조작했는지 — true면 자동 판정을 덮지 않는다 */
  ruralHouseLocationTouched: boolean;
  /** §155⑦1호 — 피상속인 거주 연수 */
  ruralHouseDecedentResidenceYears: string;
  /** §155⑦2호 — 이농인 거주 연수 */
  ruralHouseOwnerResidenceYears: string;
  /** §155⑦3호 — 귀농주택 취득일(⑦단서 5년 판정) */
  ruralHouseAcquisitionDate: string;
  /** §155⑩2호 — 취득 당시 고가주택 여부 */
  ruralHouseHighPriceAtAcquisition: boolean;
  /** §155⑩3호 — 대지면적(㎡) */
  ruralHouseLandAreaSqm: string;
  /** §155⑩5호 — 세대전원 이사·거주 */
  ruralHouseWholeHouseholdMoved: boolean;
  /** §155⑱ 처분기한 예외 사유 — "" = 해당 없음. 「3년이 되는 날 현재」 기준 */
  disposalDelayReason: string;
  // §156의2⑤ 대체주택 비과세 특례 FLAT 필드 (API에서 replacementHouse nested로 조립)
  replacementHouseSpecial: boolean;
  replBusinessApprovalDate: string;   // 사업시행계획인가일
  replCompletionDate: string;         // 신축주택 준공일
  replResidenceMonths: string;        // 대체주택 거주개월수 (숫자 문자열)
  replWillResideNewHouse: boolean;    // 신축주택 1년 이상 거주 자기선언

  /**
   * §89② 배제의 3년 초과 예외 FLAT 필드 — 「소득세법 시행령」 §156의2④·§156의3③ /
   * 「소득세법 시행규칙」 §75①. API에서 `rightThreeYearException` 판별 유니온으로 조립.
   *
   * ⚠️ `""`(미선언)과 `"none"`(해당 없음)은 **다르다** — 미선언은 판정 불가로 남고,
   *    `"none"`을 골라야 §89② 배제가 확정된다.
   */
  rightThreeYearExceptionKind: "" | "new_house" | "before_completion" | "delay" | "none";
  rightNewHouseCompletionDate: string;     // ④1호·2호 신축주택 완성일
  rightMovedInWithin3Years: boolean;       // ④1호 완성 후 3년 내 세대전원 이사
  rightResidedOneYearOrMore: boolean;      // ④1호 1년 이상 계속 거주
  rightDisposalDelayReason: "" | "kamco" | "auction" | "public_sale"; // 시행규칙 §75① 1~3호
  rightDisposedByThatMethod: boolean;      // §75① 「그 방법에 따라 양도된 경우」 — 둘째 요건

  /**
   * §89② 배제의 **합가 예외** FLAT 필드 — 「소득세법 시행령」 §156의2⑧·⑨(§156의3⑥ 준용).
   * API에서 `mergedHouseholdFirstHouse` 판별 유니온으로 조립한다.
   *
   * ⚠️ `""`(미선언)과 `"none"`(해당 없음)은 **다르다** — 미선언은 판정 불가로 남는다.
   */
  mergedHouseholdFirstHouseKind:
    | ""
    | "house_only"      // ⑧3호(⑨2호)
    | "initial_right"   // ⑧4호가목(⑨3호가목)
    | "succeeded_right" // ⑧4호나목(⑨3호나목)
    | "presale_right"   // ⑧4호다목(⑨3호다목)
    | "right_only"      // ⑧5호(⑨4호)
    | "none";
  /** ⑧4호가목 「사업시행계획 인가일 이후 취득」 — 자기선언 */
  mergedHouseholdAcquiredAfterApproval: boolean;
  /** ⑧4호가목 「취득 후 1년 이상 거주」 — 자기선언(가목은 요건이 **둘**이다) */
  mergedHouseholdResidedOneYear: boolean;
  /** ⑧4호나목·다목 「최초양도주택이 그 권리를 취득하기 전부터 소유」 — 자기선언 */
  mergedHouseholdOwnedBeforeRight: boolean;
  marriageDate: string;
  /**
   * §155⑥1호 — 지정문화유산·국가등록문화유산·천연기념물등 주택을 일반주택과 각각 1개씩 보유.
   * 2·3호가 삭제돼 요건은 boolean 하나다. §156의2⑩·§156의3⑦의 특수주택 판정에도 쓰인다.
   */
  culturalHeritageHouseSpecial: boolean;
  /** §155④⑤ 합가·혼인 세대 내 먼저 양도 주택 여부 (비과세 판정 — 먼저 양도 요건) */
  isFirstTransferredInMerge: boolean;
  /** §155② 양도(일반)주택이 상속개시 2년내 피상속인 증여분 여부 (상속주택 특례 배제 게이트) */
  generalHouseGiftedFromDecedentWithin2yr: boolean;
  /**
   * §156의2⑥·⑦ · §156의3④·⑤ — 양도하는 일반주택을 **상속개시 당시 이미 보유**하고 있었는가.
   * ⚠️ 긍정 선언이 있어야 상속 권리 예외를 인정한다(미선언 = 판정 불가).
   */
  generalHouseHeldAtInheritance: boolean;
  /**
   * §156의2⑮ · §156의3⑫ — 피상속인이 주택 없이 입주권과 분양권만 남긴 경우 상속인의 선택.
   * 「다른 종류의 권리 미소유」 요건**만** 면제한다.
   */
  inheritedRightChoiceWhenBothHeld: "" | "redevelopment_right" | "presale_right";
  parentalCareMergeDate: string;
  // §154① 단서 — 비과세 보유·거주 요건 면제 사유 (FLAT; API에서 oneHouseExemptionProviso로 조립)
  provisoReason:
    | ""
    | "rental_5yr_residence"
    | "expropriation"
    | "overseas_migration"
    | "overseas_residence"
    | "unavoidable"
    | "pre_designation_contract";
  provisoDepartureDate: string;
  provisoExpropriationDate: string;
  provisoBusinessApprovalDate: string;
  provisoPreContractNoHouse: boolean;
  houses: HouseEntry[];
  /** 세대 보유 분양권·입주권 (2021.1.1 이후 취득분 주택 수 산입 — 소령 §167의11) */
  presaleRights: PresaleRightEntry[];
  /**
   * 다주택 중과세 한시 유예 조건부 판정 (소령 §167의3 중과 한시 배제 2022.5.10~2026.5.9).
   * 폼-전역 단수 객체 — undefined면 유예 윈도우 blanket 판정, 객체면 정밀 조건 판정.
   * 3-state: undefined(미입력) / 객체(입력). 날짜는 폼 문자열(YYYY-MM-DD).
   */
  gracePeriod?: {
    contractDate: string;
    /** 토지거래허가 대상 여부 — true=나목(허가신청·허가·계약금), false=다목(계약·계약금) */
    isLandPermitTarget?: boolean;
    /** 나목1) 토지거래허가 신청일 */
    permitApplicationDate?: string;
    /** 나목2) 허가 수령 여부 */
    permitGranted?: boolean;
    /** 나목3)·다목1) 계약금 수령 증빙 확인 */
    depositReceiptConfirmed?: boolean;
    /** @deprecated G3(조건C 근거 없음) — 판정 미사용, 하위호환만 */
    isLandPermitArea?: boolean;
    /** @deprecated G3 — 판정 미사용 */
    hasTenantInResidence?: boolean;
    /** @deprecated G6(regionCode 명단 판정 대체) — 판정 미사용 */
    areaDesignatedDate?: string;
  };
  /**
   * 양도(selling) 주택의 3주택+ 전용 중과배제 특례 (소령 §167의10 — 양도 주택 자체가 배제 항목 해당).
   * 양도 주택을 기술하므로 폼-전역. effectiveHouseCount≥3에서만 의미. 날짜·연수는 폼 문자열.
   */
  sellingHouseExclusion?: {
    /** 저당권 실행·채권변제 취득 (취득 후 3년 이내) */
    isMortgageExecution?: boolean;
    /** 사원용 주택 (10년 이상 무상 제공) */
    isEmployeeHousing?: boolean;
    freeProvisionYears?: string;
    /** 조세특례제한법 특례 적용 주택 */
    isTaxSpecialExemption?: boolean;
    /** 국가유산(문화재) 주택 */
    isCulturalHeritage?: boolean;
    /** 어린이집 운영 주택 (5년 이상) */
    isDayCareCenter?: boolean;
    dayCareOperationYears?: string;
  };

  // ── Step 4 (구 Step5): 감면·공제 ──
  /** 당해 연도 기사용 기본공제 (사람 단위, 연간 한도 250만원) */
  annualBasicDeductionUsed: string;
  /**
   * 인별 5년 합산 한도 산정용 과거 감면 이력 (조특법 §133).
   * 최근 4개 과세연도 사용분을 입력.
   */
  priorReductionUsage: PriorReductionUsageItem[];
  /** P5 모드 2 — 보유 감면주택 주택수 제외 (§89①3호 의제, 폼-전역) */
  specialHouseExclusions: SpecialHouseExclusionFormItem[];

  // appurtenantLandRateMode 필드 제거 (사례 28 landNature 명시 입력 정책으로 대체, 2026-05-07)
  // 자산-수준 landNature("appurtenant"|"standalone")가 폼-수준 모드 결정을 대체.
  // 엔진이 자산-수준 landNature를 읽어 자동 분기 — 사용자 수동 모드 선택 불필요.

  // ── Step 5 (가산세) ──
  enablePenalty: boolean;
  filingType: "none" | "under" | "excess_refund" | "correct";
  penaltyReason: "normal" | "fraudulent" | "offshore_fraud";
  priorPaidTax: string;
  originalFiledTax: string;
  excessRefundAmount: string;
  interestSurcharge: string;
  /**
   * 부정행위로 인한 과소신고납부세액등 — 국세기본법 §47조의3①1호 **가목** base.
   * 빈 문자열이면 **전액을 부정행위분**으로 본다(종전 동작). 무신고에는 이 분해가 없다.
   */
  fraudulentPortion: string;
  /**
   * 「결정할 것을 미리 알고」 기한 후 신고 — 「국세기본법」 §48②2호·§48②3호라목 **배제 단서**.
   *
   * 🔴 G-05. 무신고(`filingType === "none"`)에서만 노출된다. 기본 false(=감면 적용) —
   * 기한 후 신고는 법이 감면을 예정한 상태이고, 배제는 예외이기 때문이다.
   * 수정신고 축의 `priorAssessmentNotified`(§48②**1호**)와 **다른 필드**다 — 두 축은
   * `amendmentMode` 로 배타이고, 한 필드를 공유하면 모드를 오갈 때 stale 값이 새 축의
   * 감면을 조용히 꺼 버린다.
   */
  lateFilingNotified: boolean;
  unpaidTax: string;
  paymentDeadline: string;
  actualPaymentDate: string;

  // ── 수정신고(경정) — 국세기본법 §45·§48 ──
  amendmentMode: boolean;
  /** 당초 결정세액(=당초 납부 본세) — 이력에서 자동 prefill, 수정 가능 */
  originalDeterminedTax: string;
  /** 불러온 당초 이력 id (추적용) */
  amendmentSourceId: string;
  /** 법정신고기한(YYYY-MM-DD) — 양도일 파생, 수정 가능 (소득세법 §110①) */
  statutoryFilingDeadline: string;
  /** 수정신고일(YYYY-MM-DD) — §48② 경과기간 종점 */
  amendedFilingDate: string;
  applyUnderReportingPenalty: boolean;
  underReportingReason: "normal" | "fraudulent" | "offshore_fraud";
  underReductionMode: "exempt" | "auto_48_2";
  priorAssessmentNotified: boolean;
  applyLatePaymentPenalty: boolean;
  /** 수정신고 납부(예정)일(YYYY-MM-DD) — 납부지연 경과일 종점 */
  amendedPaymentDate: string;
  // ── 경정청구(세액 감소·환급) — 국세기본법 §45의2 ──
  /** 정정 방향 (amend=수정신고 / refund_claim=경정청구) */
  correctionKind: "amend" | "refund_claim";
  /** 경정청구 사유 유형 (ordinary=일반 5년 / posterior=후발적 3개월) */
  claimReasonType: "ordinary" | "posterior";
  /** 후발적 사유 안 날(YYYY-MM-DD) — posterior 3개월 기산 (§45의2②) */
  posteriorEventDate: string;
  /** 당초 납부일(YYYY-MM-DD, 선택) — 환급가산금 기산일 안내(form-only, 엔진 미전송) */
  originalPaymentDate: string;
}
