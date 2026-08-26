/**
 * 재개발/재건축 양도소득세 — 입력·결과 타입
 *
 * 800줄 정책 준수를 위해 transfer.types.ts에서 분리.
 * transfer.types.ts에서 재수출되어 외부 소비자 경로는 변경 없음.
 *
 * 법령 근거 (law.go.kr 확인 2026-05-13):
 * - 시행령 §166 — 재개발/재건축 양도차익 산정 본문 (가장 핵심)
 *   - §166①1호 (입주권+납부), §166①2호 (입주권+수령)
 *   - §166②1호 (APT+납부 — 사례 44 핵심), §166②2호 (APT+수령, §166①2호 준용)
 *   - §166③ (환산취득가 산식, 재개발 전용 1차 근거)
 *   - §166④ (평가액 정의 = 관리처분 가격 = 권리가액)
 *   - §166⑤ (LTHD 보유기간 분기 — 1호/2호가목/2호나목)
 * - 본법 §89①4호 (입주권 비과세), §95② (LTHD 단서), §95③ (고가주택 위임), §95④ (LTHD 보유기간)
 * - 시행령 §160 (12억 안분 산식), §154 (1세대1주택 보유 2년), §176의2②2호 (일반 환산),
 *   §164⑦ (최초공시 전 단서), §164⑤ (단서 대체 산식 준용)
 * - 도시정비법 §74 (관리처분 인가), 빈집소규모정비법 §29 (사업시행 인가)
 *
 * 사례 매트릭스 (양도코리아 xlsx):
 * - 사례 36~39: 입주권 양도 (실가/환산 × 납부/수령)
 * - 사례 40~43: 완공 APT 양도 / 토지출자 (실가/환산 × 납부/수령)
 * - 사례 44~46: 완공 APT 양도 / 주택출자 (환산납부 / 실가납부 / 실가수령)
 */

// ──────────────────────────────────────────────────────────────────────────────
// 입력 타입
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 재개발/재건축 양도 정보.
 *
 * propertyType="redevelopment_apt" 또는 입주권("right_to_move_in")에서 사용.
 * TransferTaxInput.redevelopment 에 optional 부착.
 */
export interface RedevelopmentInfo {
  /** 양도 대상 — 입주권("right") 또는 완공 APT("apt") */
  subject: "right" | "apt";

  /**
   * 사례 48 — 승계조합원 여부.
   * 관리처분 인가일 이후 입주권을 상속·증여·매매로 승계 취득한 경우 true.
   *
   * true 시 redevelopment.ts 의 runRedevelopment() 가 runSuccessorMember() 로 라우팅:
   *  - §166 인가전·인가후 안분 산식 우회 (preApprovalGain=0 강제)
   *  - 양도차익 = transferPrice − rightsValue − postApprovalExpenses (단순 차감)
   *  - LTHD/세율 보유기간 기산일 = completionDate (resolveLTHDStartDate 분기)
   *
   * 근거: 사전-2019-법령해석재산-0649 (2020.02.11.) — 승계조합원 신축APT 취득시기 = 사용검사필증 교부일.
   *      소득세법 시행령 §162①4호 (자가건설 의제 — 사용승인서 교부일).
   */
  isSuccessorMember?: boolean;

  /**
   * 사례 48 — 신축APT 사용검사필증 교부일(준공일).
   * isSuccessorMember === true 시 LTHD/세율 보유기간 기산일.
   *
   * 시행령 §162①4호 본문 "건축법 §22②에 따른 사용승인서 교부일".
   * 옛 용어 "사용검사필증 교부일"·"사용승인일" 동의.
   *
   * isSuccessorMember=false 시 무시.
   */
  completionDate?: Date;

  /**
   * 인가일 법령 근거 식별자 — §95② 본법 단서에 등재된 두 가지를 분기.
   * - "urban_renovation_art_74": 도시정비법 §74 관리처분계획 인가 (재개발/재건축 본류)
   * - "small_housing_art_29":    빈집소규모정비법 §29 사업시행계획 인가 (소규모정비)
   *
   * 본 PR anchor 는 §74 만 등록. §29 슬롯은 후속 PR 마이그레이션 회피용 사전 도입.
   */
  approvalLawBasis: "urban_renovation_art_74" | "small_housing_art_29";

  /** 관리처분/사업시행계획 인가일 (approvalLawBasis 에 따라 §74 또는 §29) */
  approvalDate: Date;

  /**
   * 권리가액 (원, 정수).
   * 시행령 §166④ 평가액 = 관리처분계획에 따라 정하여진 가격.
   * 인가전 분 양도가액으로 의제 (§166②1호).
   */
  rightsValue: number;

  /** 청산금 방향 */
  settlementDirection: "pay" | "receive";

  /** 청산금 금액 (원, 절댓값) */
  settlementAmount: number;

  /**
   * 청산금 수령 시 양도일 — 소유권이전 고시일의 다음날 (NTS 집행기준 + 소법 §95④ 보유기간 정의).
   *
   * settlementDirection === "receive" 시 필수.
   * LTHD `settlement.holdingMonths` = monthsBetween(acquisitionDate, settlementSaleDate).
   *
   * settlementDirection === "pay" 시 무시.
   */
  settlementSaleDate?: Date;

  /**
   * 인가전 분 필요경비 (원, 정수).
   * 법 §97①2·3호 + 시행령 §163⑥ — §166①1호·②1호·①2호가목 산식 본문에 등장.
   */
  preApprovalExpenses: number;

  /**
   * 인가후 분 필요경비 (원, optional).
   * §166①1호 인가후양도차익 산식: "[양도가액 − (평가액 + 납부청산금) − 필요경비]" 의 필요경비.
   * 본 PR 사례 44 = 0 (인가후 분 추가 필요경비 없음). 미입력 시 0 처리.
   */
  postApprovalExpenses?: number;

  /**
   * 출자 자산 종류 — subject="apt" 시 의미 있음.
   * - "land":    토지출자 (사례 40~43)
   * - "housing": 주택출자 (사례 44~46)
   * subject="right" 시에도 사례 37 토지 출자 입주권 분기에서 필수 (originalAssetType="land").
   */
  originalAssetType?: "land" | "housing";

  // ─ 주택 출자 환산 케이스 (사례 39 — originalAssetType="housing" + subject="right" + useEstimatedAcquisition=true 시 필수) ─
  //
  // 산식 (§166③ 2-point 비율 환산):
  //   환산취득가 = floor(권리가액 × housingStdPriceAtAcq / housingStdPriceAtApproval)
  //   개산공제   = floor(housingStdPriceAtAcq × 3%)  (§163⑥)
  //
  // ※ 토지 출자 환산(landStdPriceAt*)과 별개 필드.
  // ※ 완공APT 환산(managementDisposalHousingPrice/acquisitionHousingPrice — §166③ 공시주택가격 비율)과도 별개.

  /**
   * §166③ 분자 — 취득당시 개별주택가격 (원, 총액).
   * originalAssetType="housing" + subject="right" + useEstimatedAcquisition=true 시 필수.
   * 취득일 직전 최근 공시 기준 (예: 취득일 2008-04-09 → 2007-01-01 공시값).
   */
  housingStdPriceAtAcq?: number;

  /**
   * §166③ 분모 — 인가당시 개별주택가격 (원, 총액).
   * originalAssetType="housing" + subject="right" + useEstimatedAcquisition=true 시 필수.
   * 관리처분인가일 직전 최근 공시 기준 (예: 인가일 2013-10-23 → 2013-01-01 공시값).
   *
   * 법령 의제: §166③ "양도 당시 기준시가" = 재개발 맥락에서 의제양도일(인가일) 기준시가.
   */
  housingStdPriceAtApproval?: number;

  // ─ 토지 출자 환산 케이스 (originalAssetType="land" + useEstimatedAcquisition=true 시 필수) ─
  //
  // 산식 (시행령 §166③ 토지분):
  //   환산취득가 = floor(권리가액 × landStdPriceAtAcq / landStdPriceAtApproval)
  //
  // 주택 출자 환산(housingStdPriceAt*)과 별개 필드.

  /**
   * §166③ 분자 — 취득당시 토지 기준시가 (원, 총액).
   * originalAssetType="land" + useEstimatedAcquisition=true 시 필수.
   */
  landStdPriceAtAcq?: number;

  /**
   * §166③ 분모 — 관리처분 직전 토지 기준시가 (원, 총액).
   * originalAssetType="land" + useEstimatedAcquisition=true 시 필수.
   */
  landStdPriceAtApproval?: number;

  // ─ 환산 케이스 (useEstimatedAcquisition=true 시 입력) ─
  //
  // 산식 (주택 — §99①1호 라목 개별주택공시가격 기준):
  //   환산취득가 = floor(권리가액 × P_A / D)
  //     D   = managementDisposalHousingPrice (관리처분 인가일 라목값, 단일)
  //     P_A = 취득당시 라목값
  //           본문 발동 시: P_A = floor(A × Sum_A / Sum_F)  (§164⑦ 본문)
  //             A     = firstDisclosureHousingPrice
  //             Sum_A = landPricePerSqmAtAcq × landArea + buildingStdPriceAtAcq
  //             Sum_F = landPricePerSqmAtFirst × landArea + buildingStdPriceAtFirst
  //           본문 미발동 시: P_A = acquisitionHousingPrice (사용자 단일 직접 입력)

  /** D — 관리처분 인가일 개별주택공시가격 (원, 단일 라목값). 환산 모드 시 필수. */
  managementDisposalHousingPrice?: number;

  /** 본문 미발동 시 — 취득당시 개별주택공시가격 (원, 단일 라목값). */
  acquisitionHousingPrice?: number;

  /**
   * 개별주택가격/공동주택가격 최초 공시일 (시행령 §164⑦ 본문 트리거).
   * 조건: acquisitionDate < firstDisclosureDate 인 경우 §164⑦ 본문 산식 발동.
   */
  firstDisclosureDate?: Date;

  /** §164⑦ 본문 — A: 최초공시 주택가격 (원, 단일 라목값). 본문 발동 시 필수. */
  firstDisclosureHousingPrice?: number;

  /** 토지면적 (㎡, 단일; 시점별 동일 가정). 본문 발동 시 필수. */
  landArea?: number;

  /** 취득시 토지 ㎡당 단가 (원/㎡). 본문 발동 시 필수. */
  landPricePerSqmAtAcq?: number;

  /** 취득시 건물 기준시가 (원, 총액). 본문 발동 시 필수. */
  buildingStdPriceAtAcq?: number;

  /** 최초공시 당시 토지 ㎡당 단가 (원/㎡). 본문 발동 시 필수. */
  landPricePerSqmAtFirst?: number;

  /** 최초공시 당시 건물 기준시가 (원, 총액). 본문 발동 시 필수. */
  buildingStdPriceAtFirst?: number;

  // ─ deprecated 단일 합산 입력 (옛 인터페이스, schema 호환만 유지) ─

  /** @deprecated managementDisposalHousingPrice 사용 */
  acquisitionStdPrice?: number;
  /** @deprecated managementDisposalHousingPrice 사용 */
  managementDisposalStdPrice?: number;
  /** @deprecated PHD 패턴(landArea·landPricePerSqm·buildingStd) 사용 */
  firstDisclosureStdPrice?: number;

  /**
   * 환산취득가 rounding 모드.
   * 시행령 §176의2②2호는 산식만 규정하고 rounding 미규정.
   * 본 엔진 기본값 "floor" (BigInt 정수 연산 일관성).
   */
  acquisitionRounding?: "floor" | "round";

  // ─ 사례 45 (1세대1주택 + 12억 초과) 거주월수 분리 입력 ─
  //
  // 법령 근거:
  // - 시행령 §154⑧: 멸실·재건축 주택의 거주·보유기간 통산 — 재개발·재건축 신축주택의
  //   거주·보유기간은 종전주택과 통산 (제1호 멸실·재건축 주택 포섭, NTS 실무 통설)
  //   → 기존건물분(인가전+인가후 비청산) LTHD 표2 거주분 = prior + new (통산)
  // - 사전법령해석재산 2020-386 (2020-11-23):
  //   "재개발+청산금 납부+종전주택 거주 2년 충족+신축주택 거주 2년 미충족 시,
  //    청산금납부분 양도차익은 §95② 본문 표1 적용"
  //   → 청산금납부분 LTHD 표2 거주분 = new (신축거주만)
  //
  // 본 두 필드가 모두 undefined 일 때 legacy fallback:
  //   기존건물분 = TransferTaxInput.residencePeriodMonths
  //   청산금분   = 0 (보수적 — 신축거주 입력 없으면 표1 강등)

  /**
   * 종전주택 거주개월수.
   * 종전주택 취득일~관리처분 또는 그 이후 철거 전까지의 실제 거주개월수.
   * 시행령 §154⑧ 거주기간 통산 산식의 prior 분량.
   */
  priorHouseResidenceMonths?: number;

  /**
   * 신축주택 거주개월수.
   * 준공검사일~양도일 사이 신축아파트 실거주개월수.
   * 사전법령해석재산 2020-386 — 청산금납부분 LTHD 표2 진입 가드.
   */
  newHouseResidenceMonths?: number;

  // ── 거주기간 자동 산정 입력 (UI에서 입력) — 결과 카드 산정 근거 표시용 ──
  // 본 4 필드는 엔진 계산에는 사용되지 않으며 (계산은 priorHouseResidenceMonths·newHouseResidenceMonths 사용),
  // 오직 결과 카드의 "입주일 ~ 퇴거일" 보조 라인 표시용으로 pass-through 된다.

  /** 종전주택 입주일 (YYYY-MM-DD) */
  priorResidenceStartDate?: string;
  /** 종전주택 퇴거일 (YYYY-MM-DD) */
  priorResidenceEndDate?: string;
  /** 신축주택 입주일 (YYYY-MM-DD) */
  newResidenceStartDate?: string;
  /** 신축주택 퇴거일 (YYYY-MM-DD) */
  newResidenceEndDate?: string;

  // ── 사례 46 — 청산금 수령분 단독 신고 모드 ──

  /**
   * 청산금 수령분 단독 신고 모드 (사례 46).
   *
   * true 시:
   *   - 인가전 양도차익 (preApproval.gain) = 0 강제
   *   - 인가후 기존주택분 (postApprovalExistingHouse.gain) = 0 강제
   *   - settlement 분만 §166①2호 가목 산식으로 계산
   *   - transferPrice 입력은 무시되고 settlementAmount 가 양도가액으로 의제됨
   *
   * 법령 근거:
   *   시행령 §166① 본문 + 제1항 제2호 가목 (§166②·§166①2호 나목 미적용)
   *   LTHD 보유기간 = 기획재정부 재산-439 (2014.06.09) 유권해석
   * NTS 해석: "청산금 수령분 상당액 만큼 종전주택의 일부 양도로 본다."
   */
  receiveOnlyMode?: boolean;

  /**
   * 관리처분계획인가일 기준 1세대1주택 비과세 보유·거주 요건 충족 여부.
   *
   * 서면2016-법령해석재산-2705 (2016.09.12):
   *   - 보유주택수: 양도일 현재 기준 (§154①)
   *   - 보유·거주요건: 관리처분계획인가일 현재 기준 (해석례)
   *
   * false 시:
   *   - LTHD 표1 강제 (표2 진입 차단)
   *   - 12억 안분 비활성화 (전부 과세)
   *
   * UI 자동 산정: monthsBetween(acquisitionDate, approvalDate) ≥ 24 → true
   * 사용자 override 허용. 미입력(undefined) 시 legacy `isOneHouseSingle` fallback.
   *
   * 사례 46: 자동 판정 false (1년 2개월 < 2년).
   */
  exemptionEligibleAtApproval?: boolean;

  /**
   * 인가일 기준 종전주택 보유 월수 (C-1 안전장치 a — 자동 검증용).
   *
   * 사례 36 §89①4호 가목 1세대1입주권 비과세 카드에서 입력.
   * 24개월 미만 시 UI 경고 카드(b) 노출 — 차단이 아닌 사용자 자기선언 우선.
   * 엔진 계산에는 직접 사용되지 않음 (비과세 판단은 exemptionEligibleAtApproval 자기선언).
   *
   * 법령 근거: §89①4호 가목 → §89①3호 가목 요건 (보유 2년) → 시행령 §154
   */
  priorHouseHoldingMonths?: number;

  /**
   * **§89①4호 「나」목 전용** — 양도일 현재 세대가 보유한 「그 1주택」의 취득일.
   *
   * > 나. 양도일 현재 1조합원입주권 외에 1주택을 보유한 경우(분양권을 보유하지 아니하는 경우로
   * >    한정한다)로서 **해당 1주택을 취득한 날부터 3년 이내에** 해당 조합원입주권을 양도할 것
   * >    (3년 이내에 양도하지 못하는 경우로서 대통령령으로 정하는 사유에 해당하는 경우를 포함한다)
   *
   * 나목은 「가」목(다른 주택 0채)과 **택일**이다. 세대 주택이 1채인 경우에만 의미가 있으므로
   * `householdHousingCount === 1`에서만 입력받는다.
   *
   * ⚠️ **미입력이면 나목을 적용하지 않는다.** 3년 요건은 이 날짜 없이는 판정 자체가 불가능하고,
   *    「모르니까 준다」는 근거 없는 유리 적용이다. 반대로 미입력을 이유로 12억 안분을 걸지도
   *    않는다 — 종전에는 요건을 하나도 보지 않은 채 「세대 주택수 1」만으로 안분이 발동해
   *    과소과세가 났다(E3-03 · 실측 Δ 409,152,700).
   *
   * ⚠️ **괄호의 「대통령령으로 정하는 사유」는 미구현이다.** 위임받은 시행령 조문을 특정하지
   *    못했다(§156의2는 법 §89**②** 단서의 위임을 받는 조문이라 해당하지 않는다 — 확인 필요).
   *    3년을 넘긴 경우 비과세를 주지 않되, 사유가 있을 수 있다는 사실을 `warnings`로 알린다.
   *
   * 2026-08-25 신설 (C1-03).
   */
  otherHouseAcquisitionDate?: Date;
}

// ──────────────────────────────────────────────────────────────────────────────
// 결과 타입
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 환산취득가 산정 메타 (환산 케이스만 노출).
 * UI 배지 및 valuationMeta anchor 검증용.
 */
export interface RedevelopmentValuationMeta {
  /**
   * 적용 산식 식별자 (legal-codes 상수와 일치):
   * - "actual": 실가 모드 (환산 미사용)
   * - "estimated_post_disclosure_decree_166_3": 일반 환산 산식 (§166③ 단독, 취득일 ≥ 최초공시일)
   * - "estimated_pre_disclosure_decree_164_7":  §164⑦ 본문 산식 (취득일 < 최초공시일)
   *     2단계: 취득당시 기준시가 = A × (B/C) → 환산취득가 = 권리가액 × (위 결과 / D)
   */
  method:
    | "actual"
    | "estimated_post_disclosure_decree_166_3"
    | "estimated_pre_disclosure_decree_164_7"
    | "successor_member_decree_162_1_4"; // 사례 48 — 승계조합원 (안분 미적용)
  /**
   * §166③ 분자 — §164⑦ 발동 시 §164⑦ 본문 산식의 결과(취득당시 기준시가).
   * "successor_member_decree_162_1_4" 분기에서는 undefined (안분 미적용).
   */
  numerator: number | undefined;
  /**
   * 개산공제 base로 실제 사용된 값 = `floor(numerator × 지분율)`.
   * `numerator`는 물건 전체(100%) 값이므로 표시 산식에는 이 값을 써야 자기 값을 만든다
   * (`feedback_engine_result_display_drift`).
   */
  lumpDeductionBase?: number;
  /**
   * 관리처분 인가일 기준시가 — §166③ 분모.
   * "successor_member_decree_162_1_4" 분기에서는 undefined (안분 미적용).
   */
  denominator: number | undefined;
  /** 단서 적용 근거 */
  rationale: string;
  /**
   * §164⑦ 본문 발동 시 Step 1 상세 (PHD 패턴 — A·Sum_A·Sum_F·산정 결과).
   * 본문 미발동 시 undefined.
   */
  preDisclosureStep1?: {
    /** A: 최초공시 주택가격 (단일 라목값) */
    firstDisclosureHousingPrice: number;
    /** 토지면적 (㎡) */
    landArea: number;
    /** 취득시 토지 ㎡당 단가 (원/㎡) */
    landPricePerSqmAtAcq: number;
    /** 취득시 건물 기준시가 (원) */
    buildingStdPriceAtAcq: number;
    /** 최초공시 당시 토지 ㎡당 단가 (원/㎡) */
    landPricePerSqmAtFirst: number;
    /** 최초공시 당시 건물 기준시가 (원) */
    buildingStdPriceAtFirst: number;
    /** Sum_A = 단가×면적 + 건물 (취득시 합계) */
    sumAtAcq: number;
    /** Sum_F = 단가×면적 + 건물 (최초공시 당시 합계) */
    sumAtFirst: number;
    /** P_A = floor(A × Sum_A / Sum_F) — 취득당시 라목값 추정 */
    computedAcquisitionHousingPrice: number;
  };
}

/** 3분할 각 분기의 양도차익·LTHD 상세 */
export interface RedevelopmentBranchDetail {
  /**
   * 양도가액 안분 (의제 또는 안분).
   * - preApproval: 권리가액 (의제)
   * - postApprovalExistingHouse: 인가후양도가액 × 권리가액/분양가
   * - settlement: 인가후양도가액 × 청산금/분양가 (납부) 또는 청산금 수령액 (수령)
   */
  apportionedTransfer: number;

  /**
   * 취득가액 안분 (의제 또는 안분).
   * - preApproval: 실가 또는 환산취득가
   * - postApprovalExistingHouse: 권리가액 (분양가 × 권리가액/분양가)
   * - settlement: 청산금 (납부) 또는 안분 종전 취득가액 (수령)
   */
  apportionedAcquisition: number;

  /** 양도차익 (분기별) */
  gain: number;

  /**
   * 보유기간 (months 단위 — 기존 LTHD 헬퍼 호환).
   * 분기별 §166⑤ 호별 기산:
   * - preApproval (subject="apt"):  취득일 → 신축양도일 (§166⑤2호나목)
   * - preApproval (subject="right"): 취득일 → 관리처분 인가일 (§166⑤1호)
   * - postApprovalExistingHouse (apt): 취득일 → 신축양도일 (§166⑤2호나목)
   * - postApprovalExistingHouse (right): 0 (LTHD 대상 양도차익 부존재)
   * - settlement (apt+pay):     approvalDate → transferDate (§166⑤2호가목)
   * - settlement (apt+receive): acquisitionDate → settlementSaleDate (§95④ + NTS 집행기준)
   * - settlement (right):       0 (LTHD 대상 자산 부존재)
   */
  holdingMonths: number;

  /**
   * 잔여 일수 (months 외 추가 — DATEDIF "d" 보완).
   * 신고서 양식 표 "X년 Y월 Z일" 일관 표시용 (사례 46 = 6년 9월 11일).
   * 기존 사례 44·45 anchor 영향 없음 (optional).
   */
  holdingDays?: number;

  /**
   * 분기별 LTHD 금액.
   * - subject="right" 의 인가후·청산금 분: 0 (대상 부존재 — 금액 0이 아니라 대상 자체 없음)
   * - 묶음 내 동일 LTHD율 적용 (§166⑤2호나목 동일 보유기간 → 동일 율)
   */
  lthd: number;

  /** 적용 LTHD율 (0~0.8, 표1 또는 표2) */
  lthdRate: number;

  // ── 신고서 양식 표시용 부착 필드 (재개발 3분할 표 렌더링) ──

  /** 분기별 취득일자 (기산일) — §166⑤ 호별 정의에 따른 보유기간 시작일 */
  branchAcqDate?: Date;
  /** 분기별 양도일자 (의제일) — §166⑤ 호별 정의에 따른 보유기간 종료일 */
  branchTransferDate?: Date;

  /**
   * 분기별 필요경비.
   * - preApproval: redevPreApprovalExpenses (§166①1호 인가전 양도차익 산식 본문) + (환산 모드 시 개산공제)
   * - postApprovalExistingHouse: redevPostApprovalExpenses (§166①1호 인가후 양도차익 산식 본문)
   * - settlement: 0 (청산금분에는 별도 필요경비 미산정 — 의제양도차익 모형)
   */
  expenses?: number;

  /**
   * 분기별 거주기간 시작일 (YYYY-MM-DD, 신고서 양식 입주일 행 표시용).
   * - preApproval: 종전주택 입주일
   * - postApprovalExistingHouse / settlement: 신축주택 입주일
   */
  residenceStartDate?: string;
  /** 분기별 거주기간 종료일 (YYYY-MM-DD, 퇴거일 행 표시용) */
  residenceEndDate?: string;
  /** 분기별 거주개월수 (자동산정 또는 직접입력값) — 거주기간 행 표시용 */
  residenceMonths?: number;

  /**
   * LTHD 보유기간분 금액 (표2 적용 시 분리, 표1은 전액).
   * §95② 단서 표2 = 보유분(최대 40%) + 거주분(최대 40%, 거주2년+ 가드).
   */
  lthdHoldingPart?: number;
  /** LTHD 거주기간분 금액 (표2 활성 시만 양수, 표1은 0) */
  lthdResidencePart?: number;

  /**
   * 12억 안분 전 양도차익 (분기별 원본 양도차익).
   * 1세대1주택 + 12억 초과 안분 적용 케이스에서만 부착. 미적용 케이스에서는 undefined.
   * 신고서 양식 표 "전체 양도차익" 행 표시용.
   * 산식 검산: gainBeforeAllocation = nontaxableGain + gain (안분 후 과세대상)
   */
  gainBeforeAllocation?: number;
  /**
   * 12억 이하 부분에 해당하는 비과세 양도차익 (분기별).
   * §95③·시행령 §160 — gainBeforeAllocation × (1 - taxableRatio).
   * 1세대1주택 + 12억 초과 안분 적용 케이스에서만 부착.
   */
  nontaxableGain?: number;

  /**
   * 12억 안분 직후 분기별 양도차익 (사례 47 비과세 차감 trace 보존용).
   * applyHighValueAllocation 결과 직후 값을 보존하여 settlement 마스킹 후에도
   * DetailedStatement·FilingFormTable·RedevelopmentDetailCard 에서 3단계 분해
   * 시각화 (안분 전 → 안분 후 → 비과세 차감)에 사용.
   *
   * 사례 47 (settlementExemptionApplied=true)에서만 부착. 그 외 undefined.
   * settlement 분기: 마스킹 후 gain=0이 되어도 gainAfterAllocation 보존.
   * preApproval/postApprovalExistingHouse 분기: 안분 결과 그대로 보존 (UI 대칭).
   */
  gainAfterAllocation?: number;

  /**
   * 12억 안분 직후 분기별 LTHD (사례 47 비과세 차감 trace 보존용).
   * gainAfterAllocation 과 쌍. settlement 분기는 표1 강등 후 LTHD 21M.
   * 사례 47 비과세 차감 시각화에 사용.
   */
  lthdAfterAllocation?: number;
}

/**
 * 재개발/재건축 양도 결과 — 3분할 분기별 상세 + 합계.
 *
 * §166②1호 법령은 2묶음 (청산금납부분 + 기존건물분=인가전+인가후기존)이지만,
 * 본 엔진은 UI 가독성 위해 3분할(preApproval / postApprovalExistingHouse / settlement)로 분리.
 * 분배법칙 적용으로 산술 결과는 동일 (사례 44 84,000,126 검증).
 */
export interface RedevelopmentResult {
  /** 인가전 분 (§166②1호 "기존건물분양도차익"의 일부) */
  preApproval: RedevelopmentBranchDetail;

  /**
   * 인가후 기존주택분 (§166②1호 "기존건물분양도차익"의 일부, subject="apt" 만 산출).
   * subject="right" 시 gain·lthd 모두 0 (§95② 단서 — LTHD 대상 양도차익 부존재).
   */
  postApprovalExistingHouse: RedevelopmentBranchDetail;

  /** 청산금 분 (납부: §166②1호 청산금납부분 / 수령: §166①2호가목) */
  settlement: RedevelopmentBranchDetail;

  /** 합계 */
  total: {
    /** 합계 양도차익 = ① + ②₁ + ②₂ */
    gain: number;
    /** 합계 LTHD */
    lthd: number;
    /** 양도소득금액 = 합계 양도차익 − 합계 LTHD */
    taxableIncome: number;
  };

  /**
   * 분양가 (subject="apt" 만 의미).
   * - 납부: rightsValue + settlementAmount (= 평가액 + 납부청산금)
   * - 수령: rightsValue − settlementAmount
   */
  salePriceTotal?: number;

  /**
   * receiveOnly 모드 활성 여부 — DetailedStatementFormulaBuilders / FilingFormTable의
   * 분기 산식·라벨 결정 신호. RedevelopmentInfo.receiveOnlyMode === true 시 true.
   * 사례 46 — 청산금 수령분 단독 신고에서 settlement 단독 산식 라벨 적용.
   */
  receiveOnlyMode?: boolean;

  /** 환산취득가 산정 메타 (환산 케이스만) */
  valuationMeta?: RedevelopmentValuationMeta;

  /**
   * 사례 48 — 승계조합원 분기 활성 여부.
   * DetailedStatementRedevelopmentBuilders.getBranchLabels() 분기·buildLthdEmitLines·
   * RedevelopmentDetailCard 산식 분기 트리거.
   *
   * true 시:
   *  - preApproval·settlement 분기는 0 fill (안분 우회)
   *  - postApprovalExistingHouse 만 primary 값 (단순 차감)
   *  - successorMemberDetail 부착
   *
   * 근거: 사전-2019-법령해석재산-0649 + 시행령 §162①4호.
   */
  successorMemberApplied?: boolean;

  /**
   * 사례 48 — 승계조합원 분기 상세 (UI 표시·anchor 검증용).
   * successorMemberApplied === true 시에만 부착.
   */
  successorMemberDetail?: {
    /** 분기 활성 (= successorMemberApplied) */
    applied: boolean;
    /** 사용검사필증 교부일 (= input.redevelopment.completionDate) */
    completionDate: Date;
    /** 보유일수 (준공일 ~ 양도일) */
    holdingDaysFromCompletion: number;
    /** 단기세율 적용 여부 (보유 < 24개월) */
    shortTermRateApplied: boolean;
    /** 결과 카드 표시용 세율 라벨 */
    rateLabel:
      | "1년 미만 70% (§104①3호 주택 본문)"
      | "1년 이상 2년 미만 60% (§104①2호 주택)"
      | "기본누진세율 (§55·§104①1호)";
  };

  /**
   * §163⑥ 개산공제 — 환산 모드 시 취득당시 라목값 × 3% (원, 정수).
   * 인가전 양도차익에서 차감됨. 실가 모드 시 0 또는 undefined.
   */
  estimatedLumpDeduction?: number;

  /**
   * §95③·시행령 §160 12억 초과 안분 결과.
   * 1세대1주택 + 양도가액 > 12억 시만 부착. 그 외 undefined.
   */
  highValueAllocation?: {
    /** 비과세 양도차익 = totalGain × min(transferPrice, 12억) / transferPrice */
    nontaxableGain: number;
    /** 과세 양도차익 = totalGain × max(0, transferPrice − 12억) / transferPrice */
    taxableGain: number;
    /** 과세 비율 = (transferPrice − 12억) / transferPrice (float, 표시·로그용) */
    taxableRatio: number;
    /** 비과세 기준 (= 1,200,000,000 상수) */
    nontaxableThreshold: number;
  };

  /**
   * 사례 47 — 청산금 수령 동시신고 settlement 분기 비과세 차감 적용 여부.
   *
   * 트리거 (AND): settlementDirection === "receive" AND exemptionEligibleAtApproval === true
   *   AND rightsValue ≤ 12억 AND receiveOnlyMode !== true AND isOneHouseSingle === true.
   *
   * true 시:
   *   - settlement.gain → 0 (마스킹, totalGain 재계산용)
   *   - settlement.lthd → 0 (마스킹, totalLthd 재계산용)
   *   - settlement.gainAfterAllocation = 마스킹 전 안분 후 양도차익 (trace 보존)
   *   - settlement.lthdAfterAllocation = 마스킹 전 안분 후 LTHD (trace 보존)
   *   - exemptedGain = settlement.gainAfterAllocation (별도 메타)
   *   - exemptedLthd = settlement.lthdAfterAllocation (별도 메타)
   *
   * 사례 46(receiveOnlyMode=true)·44/45(pay 모드)에서는 undefined.
   * 근거: 서면2016-법령해석재산-2705 + PDF 사례수정 2 (2)-1번 주석.
   */
  settlementExemptionApplied?: boolean;

  /**
   * 사례 47 비과세로 차감된 양도차익 (= settlement.gainAfterAllocation).
   * CalculationStep·DetailedStatement 3단계 분해 시각화·FilingFormTable 비과세 행에 사용.
   * settlementExemptionApplied === true 시에만 부착.
   */
  exemptedGain?: number;

  /**
   * 사례 47 비과세로 차감된 LTHD (= settlement.lthdAfterAllocation).
   * exemptedGain 와 쌍. settlement 분기는 표1 강등 후 LTHD 21M(사례수정 2 기준).
   * settlementExemptionApplied === true 시에만 부착.
   */
  exemptedLthd?: number;

  /**
   * 사례 36 — §89①4호 가목 1세대1입주권 비과세 적용 여부.
   *
   * 트리거 (AND 4조건):
   *   1. subject === "right"
   *   2. exemptionEligibleAtApproval === true (인가일 기준 자기선언)
   *   3. householdHousingCount === 0 AND householdRightCount === 1 (양도일 현재 1세대1입주권)
   *   4. transferPrice ≤ 12억 (단서 미발동)
   *
   * true 시: 3분기 모두 gain=0·lthd=0 마스킹 → total.taxableIncome=0 → 산출세액 0.
   * 12억 초과 시 미적용 — applyOneRightExemption 내부에서 안분 과세분만 남김.
   *
   * 법령 근거: 소득세법 §89①4호 가목 본문 + 시행령 §154 (1세대 범위)
   * 국세청 해석례: "고가주택에 해당하는 조합원입주권 양도차익 산정방법" (2010.11.01, 2008.01.10 등 7건)
   */
  oneRightExemptionApplied?: boolean;

  /**
   * 사례 36 — §89①4호 각 목 외의 부분 단서 12억 초과 안분 과세 적용 여부.
   *
   * subject="right" + 비과세 요건 충족 + transferPrice > 12억 시 true.
   * applyOneRightExemption 내부에서 안분 후 비과세분을 마스킹하고 과세분만 남김.
   * highValueAllocation (사례 45 apt 분기) 과 별개 — 두 플래그는 mutually exclusive.
   *
   * 법령 근거: §89①4호 각 목 외의 부분 단서 + §95③ + 시행령 §160 (안분 산식)
   */
  oneRightHighValueApplied?: boolean;

  /**
   * **§89①4호의 어느 목으로 비과세·안분이 성립했는가** (2026-08-25 신설 — C1-03).
   *
   *   · `"ga"` — 가목: 양도일 현재 다른 주택 **또는 분양권**을 보유하지 아니할 것
   *   · `"na"` — 나목: 1조합원입주권 외 1주택 보유(분양권 미보유) + 그 1주택 취득일부터 3년 이내 양도
   *
   * 두 목은 **택일**이고 요건·세액 효과가 다르므로, 결과 화면·신고서가 「어느 목으로 비과세가
   * 났는지」를 표시할 수 있어야 한다. 종전에는 나목 경로 자체가 없어 가목만 존재했고,
   * 12억 안분은 목과 무관하게 「세대 주택수 1」로 발동했다(E3-03).
   *
   * undefined = §89①4호 불성립(과세) 또는 subject !== "right".
   */
  oneRightExemptionClause?: "ga" | "na";

  /**
   * **완공 신축주택(subject="apt") §89①3호가목 전액 비과세 적용 여부** (2026-08-25 신설 — E3-01).
   *
   * 종전에는 재개발 분기가 `transfer-tax.ts` STEP 0.65에서 조기 반환하며 `checkExemption`을
   * 건너뛰어 **§95③ 12억 초과 안분만** 구현돼 있었다. 그 결과 1세대1주택 요건을 갖춘 완공
   * 신축주택이 양도가액 **12억 이하**면 전액 과세되고, 12억을 1원 넘기면 안분으로 세액이 0에
   * 수렴하는 **불연속**이 생겼다(실측: 12억 98,241,000원 → 12억+1원 0원).
   *
   * true 시: 3분기 모두 gain=0·lthd=0 마스킹 → total.taxableIncome=0 → 산출세액 0.
   * 판정 자체는 이 모듈이 하지 않는다 — `transfer-tax.ts`가 일반 주택 경로와 **같은**
   * `checkExemption`을 태워 넘긴 결과를 그대로 쓴다(판정 이중화 금지).
   *
   * 법령 근거: 소득세법 §89①3호 가목 + 시행령 §154①(보유·거주 요건)·§160(고가주택)
   * 대응 관계: subject="right"의 `oneRightExemptionApplied`(§89①**4호**)와 mutually exclusive.
   */
  aptOneHouseExemptionApplied?: boolean;

  /**
   * LTHD 분기별 거주월수 귀속 (디버그·결과카드 표시용).
   * 사전법령해석재산 2020-386 + 시행령 §154⑧ 적용 결과 노출.
   * 1세대1주택 redev 케이스에서만 부착.
   */
  lthdResidenceAttribution?: {
    /** 기존건물분 거주월수 = prior + new (§154⑧ 통산) */
    existingResidenceMonths: number;
    /** 청산금분 거주월수 = new (해석례 2020-386) */
    payResidenceMonths: number;
    /** 기존건물분 적용 표 */
    existingTable: "table1" | "table2";
    /** 청산금분 적용 표 */
    payTable: "table1" | "table2";
    /** 종전주택 거주기간(입주일·퇴거일, YYYY-MM-DD) — 결과 카드 산정 근거 표시용. UI 자동산정 입력 시 부착 */
    priorPeriod?: { start: string; end: string };
    /** 신축주택 거주기간(입주일·퇴거일, YYYY-MM-DD) — 결과 카드 산정 근거 표시용. UI 자동산정 입력 시 부착 */
    newPeriod?: { start: string; end: string };
  };

  /**
   * 사례 39 — 주택 출자 입주권(right+receive) 환산취득가 echo 필드 (UI 결과 카드 표시용).
   *
   * originalAssetType="housing" + subject="right" + settlementDirection="receive" +
   * useEstimatedAcquisition=true 분기에서만 부착.
   * 그 외(토지 출자·실가·승계조합원) 분기에서는 undefined.
   *
   * 법령 근거:
   *   §166③ 환산취득가, §163⑥ 개산공제, §166⑤1호 LTHD 보유기간
   */
  housingContribDetail?: {
    /** §166③ 환산취득가 (원) = floor(권리가액 × 취득당시PHD / 인가당시PHD) */
    convertedAcquisition: number;
    /** §163⑥ 개산공제 (원) = floor(취득당시PHD × 3%) */
    estimatedDeduction: number;
    /** 취득당시 개별주택가격 (원, §166③ 분자) */
    housingStdPriceAtAcq: number;
    /** 인가당시 개별주택가격 (원, §166③ 분모) */
    housingStdPriceAtApproval: number;
    /** 인가전 분 LTHD (원) */
    preApprovalLTHD: number;
    /** 인가후 분 LTHD = 0 (§95② 본문 괄호) */
    postApprovalLTHD: number;
    /** LTHD 보유기간 시작일 = 취득일 (§166⑤1호) */
    lthdHoldingStartDate: Date;
    /** LTHD 보유기간 종료일 = 인가일 (§166⑤1호) */
    lthdHoldingEndDate: Date;
  };

  /**
   * 사례 37 — 토지 출자 입주권 환산취득가 echo 필드 (UI 결과 카드 표시용).
   *
   * originalAssetType="land" + useEstimatedAcquisition=true 분기에서만 부착.
   * 그 외(주택 출자·실가·승계조합원) 분기에서는 undefined.
   *
   * 법령 근거:
   *   §166③  환산취득가, §163⑥ 개산공제, §166⑤1호 LTHD 보유기간
   */
  landContribDetail?: {
    /** §166③ 환산취득가 (원) */
    convertedAcquisition: number;
    /** §163⑥ 개산공제 (원) = floor(취득당시공시지가 × 3%) */
    estimatedDeduction: number;
    /** 취득당시 토지 기준시가 (원, §166③ 분자) */
    landStdPriceAtAcq: number;
    /** 관리처분인가 당시 토지 기준시가 (원, §166③ 분모) */
    landStdPriceAtApproval: number;
    /** 인가전 분 LTHD (원) */
    preApprovalLTHD: number;
    /** 인가후 분 LTHD = 0 (§95② 본문 괄호) */
    postApprovalLTHD: number;
    /** LTHD 보유기간 시작일 = 취득일 (§166⑤1호) */
    lthdHoldingStartDate: Date;
    /** LTHD 보유기간 종료일 = 인가일 (§166⑤1호) */
    lthdHoldingEndDate: Date;
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 사례 37 — 토지 출자 입주권 환산 결과 타입
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 토지 출자 입주권 환산취득가 산정 결과.
 *
 * `lib/tax-engine/redevelopment-land-contribution.ts` 의
 * `calcRedevLandContribEstimated()` 반환값.
 *
 * 법령 근거:
 * - 시행령 §166③ — 환산취득가 = floor(권리가액 × 취득당시 토지기준시가 / 관리처분 직전 토지기준시가)
 * - 시행령 §163⑥ — 개산공제 = floor(취득당시 토지기준시가 × 3%)
 * - 시행령 §166⑤ 1호 — LTHD 보유기간 = 취득일 ~ 관리처분 인가일
 * - 본법 §95② 본문 괄호 — 인가전 분만 LTHD 적용, 인가후 0
 */
export interface RedevLandContribResult {
  /** §166③ 환산취득가 (원, 정수) = floor(권리가액 × landStdPriceAtAcq / landStdPriceAtApproval) */
  convertedAcquisition: number;

  /** §163⑥ 개산공제 (원, 정수) = floor(landStdPriceAtAcq × 3%) */
  estimatedDeduction: number;

  /**
   * 인가전 양도차익 (원, 정수).
   * = 권리가액 − 환산취득가 − 개산공제
   * (preApprovalExpenses 는 본 PR에서 강제 0 — 후속 PR에서 optional 추가)
   */
  preApprovalGain: number;

  /**
   * 인가후 양도차익 (원, 정수).
   * = 양도가액 − 권리가액 − 청산금 불입액 (시행령 §166①1호 인가후 산식)
   */
  postApprovalGain: number;

  /** 양도차익 합계 = preApprovalGain + postApprovalGain */
  totalGain: number;

  /**
   * 인가전 분 LTHD (원, 정수).
   * §95② 본문 괄호: 인가전 분만 표1 보유분 적용.
   */
  preApprovalLTHD: number;

  /**
   * 인가후 분 LTHD — 항상 0.
   * 본문 괄호: "관리처분 인가 전 토지·건물분에 한정"
   * → 권리 양도이므로 인가후 분은 LTHD 배제.
   */
  postApprovalLTHD: number;

  /** LTHD 합계 = preApprovalLTHD + postApprovalLTHD */
  totalLTHD: number;

  /** LTHD 보유기간 시작일 = 취득일 (시행령 §166⑤ 1호) */
  lthdHoldingStartDate: Date;

  /** LTHD 보유기간 종료일 = 관리처분 인가일 (시행령 §166⑤ 1호) */
  lthdHoldingEndDate: Date;

  /** 만 보유 연수 (년, 정수 — 표1 공제율 조회용) */
  lthdHoldingYears: number;

  /** 표1 공제율 (0~0.30) */
  lthdRate: number;
}
