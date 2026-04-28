/**
 * 상속 부동산 취득가액 의제 테스트 픽스처
 *
 * 의제취득일 = 1985-01-01 (소득세법 부칙 1985.1.1. 개정)
 */

/** 의제취득일 직전 상속 (case A) */
export const BEFORE_DEEMED = {
  inheritanceDate: new Date("1984-12-31"),
  /** 피상속인 취득일 (1983.7.26. — PDF 첨부 사례) */
  decedentAcquisitionDate: new Date("1983-07-26"),
};

/** 의제취득일 이후 상속 (case B) */
export const AFTER_DEEMED = {
  inheritanceDate: new Date("2020-01-01"),
};

/**
 * PDF 첨부 사례 (이미지 §13 계산 사례)
 * - 상속개시일: 1983.7.26. (부친으로부터 상속개시일)
 * - 양도일: 2023.2.16.
 * - 양도가액: 920,000,000원
 * - 토지 184.2㎡, 건물 253.75㎡
 * - 의제취득일(1985.1.1.) 개별공시지가: 1,100,000원/㎡ (표에서 1990.1.1. 최초 = 1,100,000)
 * - 양도시(2022.1.1.) 개별공시지가: 6,750,000원/㎡
 */
export const PDF_SCENARIO = {
  inheritanceDate: new Date("1983-07-26"),
  decedentAcquisitionDate: new Date("1983-07-26"),
  transferDate: new Date("2023-02-16"),
  transferPrice: 920_000_000,
  /** 의제취득일 시점 토지 기준시가: 개별공시지가 × 면적 */
  standardPriceAtDeemedDate: 1_100_000 * 184.2, // 202,620,000
  /** 양도 직전 공시(2022.1.1.) 개별공시지가 × 면적 */
  standardPriceAtTransfer: 6_750_000 * 184.2,   // 1,243,350,000
  landAreaM2: 184.2,
  assetKind: "land" as const,
};

/**
 * Excel 13번 케이스 — 상속주택 환산가액 (개별주택가격 미공시 + 1990 이전 토지 등급가액 환산)
 *
 * 케이스: 취득가 환산, 개별주택 공시전 취득 상속취득(환산가액적용)
 * - 상속개시일: 1985-01-01 (의제취득일, case A)
 * - 양도일: 2023-02-19
 * - 양도가액: 920,000,000원
 * - 자산: 주택 (토지 184.2㎡ + 주택)
 * - 토지: 1990.8.30. 이전 취득 → 등급가액 환산 필요
 * - 주택: 개별주택가격 최초 공시일(2005-04-30) 이전 → PHD 3-시점 환산 또는 직접 입력
 *
 * 엑셀 검증값 (원단위 기준):
 *   토지 환산단가 (rateLandA)            =   598,517원/㎡
 *   토지 상속개시일 기준시가 (landStdA)   = 110,246,831원
 *   상속개시일 합계 기준시가              = 148,382,411원  ← Excel C37
 *   양도시 합계 기준시가                  = 1,269,486,250원 ← Excel C36
 *   주택 취득시 직접 입력 override        =  38,135,580원  ← Excel E37 (직접 입력값)
 *   환산취득가 (합계 기준)                = 109,611,427원  ← Excel C9
 *   필요경비 (개산공제 3%)                =   4,600,105원  ← Excel C10
 *   양도차익                             = 805,788,468원  ← Excel C11
 *   장기보유특별공제 (15년 × 2% = 30%)   = 241,736,539원  ← Excel C12
 *   양도소득금액                          = 564,051,929원  ← Excel C13
 *   과세표준 (- 기본공제 250만)           = 561,551,929원  ← Excel C20
 *   산출세액 (2023년 누진세율)            = 199,911,810원  ← Excel C21
 *   지방소득세 (10%)                     =  19,991,181원  ← Excel C24
 */
export const EXCEL_13_INHERITED_HOUSE_PRE_DISCLOSURE = {
  inheritanceDate: new Date("1985-01-01"),
  transferDate: new Date("2023-02-19"),
  transferPrice: 920_000_000,
  assetKind: "house_individual" as const,

  // ── 토지 입력 ──
  landArea: 184.2,
  /** 양도시 개별공시지가 (원/㎡) */
  landPricePerSqmAtTransfer: 6_750_000,
  /** 최초고시(2005-04-30) 시점 개별공시지가 (원/㎡) */
  landPricePerSqmAtFirstDisclosure: 1_560_000,
  /** 1990 등급가액 환산 입력 (상속개시일 1985-01-01 < 1990-08-30) */
  pre1990: {
    pricePerSqm_1990: 1_100_000,
    grade_1990_0830: { gradeValue: 185_000 },
    gradePrev_1990_0830: { gradeValue: 98_400 },
    gradeAtAcquisition: { gradeValue: 77_100 },
  },

  // ── 주택 입력 ──
  /** 양도시 공시된 개별주택가격 P_T (홈택스/부동산공시가격알리미) */
  housePriceAtTransfer: 1_287_000_000,
  /** 최초 공시(2005-04-30) 시점 개별주택가격 P_F */
  housePriceAtFirstDisclosure: 341_000_000,
  /** 양도시 건물기준시가 (국세청) — 합계 기준시가 산출용 */
  buildingStdPriceAtTransfer: 26_136_250,
  /** 최초 공시 시점 건물기준시가 — §164⑤ Sum_F 분모 */
  buildingStdPriceAtFirstDisclosure: 42_630_000,
  /** 상속개시일 시점 건물기준시가 — §164⑤ Sum_A 분자 */
  buildingStdPriceAtInheritance: 38_135_580,
  /**
   * 상속개시일 시점 주택가격 직접 입력 override.
   * Excel E37 직접 입력값(38,135,580). 이 값은 본래 건물기준시가지만,
   * 기존 override-mode 테스트(inheritance-house-valuation.test.ts)에서
   * `housePriceAtInheritanceUsed`로 직접 채택하는 시나리오 검증에 사용된다.
   * 자동 추정 시나리오(E-6a)에서는 이 필드를 사용하지 않는다.
   */
  housePriceAtInheritanceOverride: 38_135_580,

  firstDisclosureDate: "2005-04-30",

  // ── 기대값 (원단위 anchor) ──
  // 시나리오별로 분리: override 모드(기존) vs 자동 추정 모드(E-6a)
  expected: {
    // ── 공통 ──
    landPricePerSqmAtInheritance: 598_517,         // 토지 환산단가
    landStdAtInheritance: 110_246_831,              // 토지 상속개시일 기준시가
    landStdAtTransfer: 1_243_350_000,               // 토지 양도시 기준시가
    /**
     * 양도시 합계 기준시가 = 토지 + 양도시 건물기준시가 (Excel C36)
     * = 1,243,350,000 + 26,136,250 = 1,269,486,250
     */
    totalStdAtTransfer: 1_269_486_250,

    // ── override 모드 (housePriceAtInheritanceOverride 사용) ──
    /**
     * 상속개시일 합계 기준시가 = 토지 + override(38,135,580) = 148,382,411 (Excel C37)
     * 이 값은 inheritance-house-valuation.test.ts의 override-mode 테스트에서 사용.
     */
    totalStdAtInheritance: 148_382_411,

    // ── 자동 추정 모드 (P_A_est) ──
    /**
     * 추정 상속개시일 개별주택가격 P_A_est = floor(P_F × Sum_A / Sum_F)
     * = floor(341,000,000 × 148,382,411 / 329,982,000) = 153,336,855
     * (Sum_A = 110,246,831 + 38,135,580 = 148,382,411,
     *  Sum_F = 287,352,000 + 42,630,000 = 329,982,000)
     */
    autoEstimatedHousePrice: 153_336_855,
    /** 자동 추정 시 합계 기준시가 = 토지 + P_A_est = 110.2M + 153.3M = 263,583,686 */
    autoEstimatedTotalStdAtInheritance: 263_583_686,
    /**
     * Excel C9: 환산취득가 = floor(920M × 153,336,855 / 1,287,000,000) = 109,611,427
     * (개별주택가격 단일 분자/분모로 §176조의2④ 적용)
     */
    convertedAcquisition: 109_611_427,
    /** Excel C10: 개산공제 = floor(153,336,855 × 3%) = 4,600,105 */
    estimatedDeduction: 4_600_105,
  },
} as const;
