/**
 * 재개발/재건축(redevelopment) 폼 슬라이스.
 *
 * calc-wizard-asset.ts 800줄 정책으로 분리.
 * AssetForm은 이 slice를 extends하여 합성.
 *
 * 법령 근거: 소득세법 시행령 §166 (재개발/재건축 양도차익 산정 본문) + §164⑦ 단서 + §166⑤ LTHD 분기.
 *
 * 본 PR UI 는 사례 44 (APT-환산-납부-주택출자) 만 노출.
 * 엔진은 사례 36~46 매트릭스 전체 지원.
 */

/** 재개발/재건축 입력 묶음 — AssetForm에 mix-in. */
export interface RedevelopmentFormSlice {
  // ── 분기 결정 ToggleCard·RadioCardGroup ──

  /**
   * 양도 대상.
   * - "right": 입주권 양도 (사례 36~39)
   * - "apt":   완공 APT 양도 (사례 40~46)
   * - "":      미선택
   * 본 PR UI 는 "apt" 만 노출 (입주권 후속 PR).
   */
  redevSubject: "" | "right" | "apt";

  /**
   * 인가 법령 근거 — §95② 본법 단서에 등재된 두 가지.
   * - "urban_renovation_art_74": 도시정비법 §74 관리처분계획 인가 (재개발/재건축 본류)
   * - "small_housing_art_29":    빈집소규모정비법 §29 사업시행계획 인가 (소규모정비)
   * 본 PR UI 는 §74 만 노출. §29 슬롯은 후속 PR 마이그레이션 회피용 사전 도입.
   */
  redevApprovalLawBasis: "" | "urban_renovation_art_74" | "small_housing_art_29";

  /**
   * 출자 자산 — subject="apt" 시 필요.
   * - "land":    토지출자 (사례 40~43)
   * - "housing": 주택출자 (사례 44~46)
   * subject="right" 시 무시.
   * 본 PR UI 는 "housing" 만 노출.
   */
  redevOriginalAssetType: "" | "land" | "housing";

  /** 청산금 방향. 본 PR UI 는 "pay" 만 노출. */
  redevSettlementDirection: "" | "pay" | "receive";

  // ── 일정·금액 (CurrencyInput / DateInput) ──

  /** 관리처분/사업시행계획 인가일 (도정법 §74 또는 빈집소규모법 §29, YYYY-MM-DD) */
  redevApprovalDate: string;

  /**
   * 청산금 수령 시 양도일 — 소유권이전 고시일 다음날.
   * NTS 집행기준 + 소법 §95④ 보유기간 정의 조합 도출.
   * redevSettlementDirection === "receive" 시 필수. YYYY-MM-DD.
   */
  redevSettlementSaleDate: string;

  /**
   * 권리가액 (원, 인가전 분 양도가액으로 의제).
   * 시행령 §166④ 평가액 = 관리처분계획에 따라 정하여진 가격.
   */
  redevRightsValue: string;

  /** 청산금 (원, 절댓값) */
  redevSettlementAmount: string;

  /** 인가전 분 필요경비 (원). 법 §97①2·3호 + 시행령 §163⑥. */
  redevPreApprovalExpenses: string;

  /** 인가후 분 필요경비 (원, 사례 44 = 0). §166①1호 인가후양도차익 산식 본문에 등장. */
  redevPostApprovalExpenses: string;

  // ── 환산 모드 입력 (useEstimatedAcquisition=true 시) ──

  /**
   * @deprecated 단일 합산 입력 — 옛 인터페이스. 신규 케이스에선 PHD 패턴 필드 사용.
   * sessionStorage 호환을 위해 필드 자체는 유지하되 UI 노출 제거.
   */
  redevAcquisitionStdPrice: string;

  /**
   * @deprecated 단일 합산 입력 — 옛 인터페이스. 신규 케이스에선 redevManagementDisposalHousingPrice 사용.
   */
  redevManagementDisposalStdPrice: string;

  /**
   * @deprecated 단일 합산 입력 — 옛 인터페이스. 신규 케이스에선 PHD 패턴 Sum_F 산정으로 대체.
   */
  redevFirstDisclosureStdPrice: string;

  /**
   * 개별주택/공동주택가격 최초 공시일 (§164⑦ 본문 트리거, YYYY-MM-DD).
   * acquisitionDate < redevFirstDisclosureDate 시 §164⑦ 본문 산식 발동.
   */
  redevFirstDisclosureDate: string;

  /**
   * §164⑦ 본문 산식 — A: 최초공시 주택가격 (원, 단일 라목값).
   * 산식: 취득당시 라목값 = A × (Sum_A / Sum_F)
   * 본문 발동 시 필수.
   */
  redevFirstDisclosureHousingPrice: string;

  // ── PHD 패턴 (토지 ㎡당 단가 × 면적 + 건물 기준시가) ──
  // §164⑦ 본문 발동 시 Sum_A·Sum_F 산정용. 본문 미발동 시 사용 안 함.

  /** 토지면적 (㎡, 단일 면적; 시점별 동일 가정) */
  redevLandArea: string;

  /** 취득시 토지 ㎡당 단가 (원/㎡) — Vworld API 조회 + 면적 자동계산 */
  redevLandPricePerSqmAtAcq: string;

  /** 취득시 건물 기준시가 (원, 총액) — 수동 입력 */
  redevBuildingStdPriceAtAcq: string;

  /** 최초공시 당시 토지 ㎡당 단가 (원/㎡) — Vworld API 조회 + 면적 자동계산 */
  redevLandPricePerSqmAtFirst: string;

  /** 최초공시 당시 건물 기준시가 (원, 총액) — 수동 입력 */
  redevBuildingStdPriceAtFirst: string;

  /**
   * D — 관리처분 인가일 개별주택공시가격 (원, 단일 라목값).
   * 환산 모드 + 환산취득가 산정 시 필수 (§166③ 분모).
   * 관리처분 인가일에는 라목값이 이미 공시되어 있으므로 단일 입력으로 충분.
   */
  redevManagementDisposalHousingPrice: string;

  /**
   * 본문 미발동 시 — 취득당시 개별주택공시가격 (원, 단일 라목값).
   * 취득일 ≥ 최초공시일 또는 최초공시일 미입력 케이스 (사례 44 회귀 경로).
   */
  redevAcquisitionHousingPrice: string;

  /**
   * 실가 모드 인가전 분 종전 주택 취득가액 (실거래가, 원).
   * useEstimatedAcquisition === false 시 §166①1호 인가전 분 차감 기준.
   * 환산 모드 시 무시 (validate skip).
   *
   * 직전 PR(C안)에서 상단 일반 `fixedAcquisitionPrice` 입력 영역이 재개발 케이스에서 숨겨졌으므로
   * §166 섹션 내부 별도 입력 위치로 분리. 사례 45/46 시나리오 브라우저 재현 보장.
   */
  redevActualAcquisitionPrice: string;

  // ── 사례 45 — 거주월수 분리 입력 (1세대1주택 + 12억 초과 분기) ──
  //
  // 법령 근거: 시행령 §155⑰ (보유·거주 통산) + 사전법령해석재산 2020-386 (청산금분 거주 분리).
  // 가시성: assetKind === "redevelopment_apt" + isOneHousehold + householdHousingCount === 1.
  // 미입력 시 빈문자열. silent 0 채우기 금지.

  /**
   * 종전주택 거주개월수 (정수, 개월 단위).
   * 종전주택 취득일~관리처분 또는 그 이후 철거 전까지 실제 거주개월수.
   * 기존건물분 LTHD 표2 거주분 = prior + new (§155⑰ 통산).
   */
  redevPriorHouseResidenceMonths: string;

  /**
   * 신축주택 거주개월수 (정수, 개월 단위).
   * 준공검사일~양도일 사이 신축아파트 실거주개월수.
   * 청산금납부분 LTHD 표2 진입 가드 (해석례 2020-386).
   */
  redevNewHouseResidenceMonths: string;

  // ── 거주기간 자동산정 입력 (입주일·퇴거일, YYYY-MM-DD) ──
  //
  // 사용자가 거주개월수를 직접 계산하지 않고 입주일/퇴거일을 입력하면 UI 가 monthsBetween으로
  // 자동 산정해 위 *ResidenceMonths 필드에 함께 기록한다.
  // 4필드 모두 비어있으면 기존 *ResidenceMonths 직접 입력 경로(legacy fallback)를 사용한다.

  /** 종전주택 입주일 (YYYY-MM-DD) */
  redevPriorResidenceStartDate: string;
  /** 종전주택 퇴거일 (YYYY-MM-DD) — 일반적으로 관리처분 인가일 또는 철거일 */
  redevPriorResidenceEndDate: string;
  /** 신축주택 입주일 (YYYY-MM-DD) — 일반적으로 준공검사일·입주가능일 */
  redevNewResidenceStartDate: string;
  /** 신축주택 퇴거일 (YYYY-MM-DD) — 일반적으로 양도일 */
  redevNewResidenceEndDate: string;

  // ── 사례 46 — 청산금 수령분 단독 신고 ──

  /**
   * 청산금 수령분 단독 신고 모드 (사례 46).
   * "yes" 시 인가전·인가후 양도차익 0 강제, settlement 단독 산정 (§166①2호 가목).
   * - "":   기본값 (legacy 사례 44·45 동일 분기 진입)
   * - "yes": 단독 신고 모드 진입
   * - "no":  명시적 OFF (사용자 의도 — UI 상에서 미러)
   */
  redevReceiveOnlyMode: "" | "yes" | "no";

  /**
   * 관리처분계획인가일 기준 1세대1주택 비과세 보유·거주 요건 충족 여부 (override).
   * 서면2016-법령해석재산-2705 (2017.02.13) — 청산금 수령분 비과세 판정 시점.
   * UI 자동 산정: monthsBetween(acquisitionDate, redevApprovalDate) ≥ 24 → "yes".
   * 빈문자열 = 자동 산정값 사용. "yes"/"no" = 사용자 override.
   */
  redevExemptionEligibleAtApproval: "" | "yes" | "no";

  // ── 사례 36 — 1세대1입주권 비과세 C-1 안전장치 ──

  /**
   * 인가일 기준 종전주택 보유 월수 (C-1 안전장치 a — 자동 검증용).
   *
   * 24개월 미만 시 UI 경고 카드(b) 노출 (차단 X — 자기선언 우선).
   * 빈문자열 = 미입력 (UI 경고 미발동). 음수 불가.
   * 법령 근거: §89①4호 가목 → §89①3호 가목 보유 2년 요건.
   */
  redevPriorHouseHoldingMonths: string;

  // ── 사례 37 — 토지 출자 §166③ 환산 (subject="right" + originalAssetType="land") ──

  /**
   * @deprecated §166③ 분자 — 취득당시 토지 기준시가 (원, 총액).
   * 구형 CurrencyInput 총액 직접 입력 인터페이스.
   * 신규 입력 경로는 redevLandPricePerSqmAtAcq × redevLandArea 계산값 우선 사용.
   * sessionStorage 호환을 위해 필드 자체는 유지 (legacy fallback).
   */
  redevLandStdPriceAtAcq: string;

  /**
   * @deprecated §166③ 분모 — 관리처분 직전 토지 기준시가 (원, 총액).
   * 구형 CurrencyInput 총액 직접 입력 인터페이스.
   * 신규 입력 경로는 redevLandPricePerSqmAtApproval × redevLandArea 계산값 우선 사용.
   * sessionStorage 호환을 위해 필드 자체는 유지 (legacy fallback).
   */
  redevLandStdPriceAtApproval: string;

  /**
   * §166③ 분자 — 취득당시 토지 ㎡당 단가 (원/㎡).
   * LandPriceLookupField 입력: Vworld API 조회 + 면적 자동 곱셈.
   * redevOriginalAssetType === "land" + useEstimatedAcquisition=true 시 신규 입력 경로.
   * redevLandArea × 이 값 = 취득당시 토지 기준시가 총액.
   * 기존 housing 분기의 redevLandPricePerSqmAtAcq(PHD 패턴용)와 이름이 같으나
   * land 분기에서는 §166③ 분자 산정에 사용.
   */
  // redevLandPricePerSqmAtAcq 는 기존 필드 재사용 (위 PHD 패턴 주석 참조)

  /**
   * §166③ 분모 — 관리처분 직전 토지 ㎡당 단가 (원/㎡).
   * LandPriceLookupField 입력: Vworld API 조회 + 면적 자동 곱셈.
   * redevOriginalAssetType === "land" + useEstimatedAcquisition=true 시 필수.
   * referenceDate = redevApprovalDate (관리처분 인가일).
   * §99①1호 공시기준일 시점 모호성(2007.1.1 vs 2006.1.1) 주의 — UI 안내 카드 포함.
   */
  redevLandPricePerSqmAtApproval: string;

  // ── 사례 48 — 승계조합원 신축APT 양도 ──

  /**
   * 사례 48 — 승계조합원 모드.
   * 관리처분 인가일 이후 입주권을 상속·증여·매매로 승계 취득한 경우 "yes".
   *
   * "yes" 시:
   *  - §166 인가전·인가후 안분 우회 (preApprovalGain=0 강제)
   *  - 양도차익 = transferPrice − rightsValue − postApprovalExpenses (단순 차감)
   *  - LTHD/세율 보유기간 기산일 = redevCompletionDate (사전-2019-법령해석재산-0649)
   *  - settlement·12억 안분·환산 모드는 본 PR 미지원 (validate 차단)
   *
   * "":   기본값 (원조합원 분기 — 사례 44~47 동일 진입)
   * "no": 명시적 OFF (사용자 의도)
   */
  redevIsSuccessorMember: "" | "yes" | "no";

  /**
   * 사례 48 — 신축APT 사용검사필증 교부일(준공일).
   * redevIsSuccessorMember === "yes" 시 LTHD/세율 보유기간 기산일.
   * 시행령 §162①4호 "건축법 §22②에 따른 사용승인서 교부일".
   */
  redevCompletionDate: string;
}
