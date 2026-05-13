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
   * subject="right" 시 무시.
   */
  originalAssetType?: "land" | "housing";

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
    | "estimated_pre_disclosure_decree_164_7";
  /** §166③ 분자 — §164⑦ 발동 시 §164⑦ 본문 산식의 결과(취득당시 기준시가) */
  numerator: number;
  /** 관리처분 인가일 기준시가 — §166③ 분모 */
  denominator: number;
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
   * 분기별 LTHD 금액.
   * - subject="right" 의 인가후·청산금 분: 0 (대상 부존재 — 금액 0이 아니라 대상 자체 없음)
   * - 묶음 내 동일 LTHD율 적용 (§166⑤2호나목 동일 보유기간 → 동일 율)
   */
  lthd: number;

  /** 적용 LTHD율 (0~0.8, 표1 또는 표2) */
  lthdRate: number;
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

  /** 환산취득가 산정 메타 (환산 케이스만) */
  valuationMeta?: RedevelopmentValuationMeta;

  /**
   * §163⑥ 개산공제 — 환산 모드 시 취득당시 라목값 × 3% (원, 정수).
   * 인가전 양도차익에서 차감됨. 실가 모드 시 0 또는 undefined.
   */
  estimatedLumpDeduction?: number;
}
