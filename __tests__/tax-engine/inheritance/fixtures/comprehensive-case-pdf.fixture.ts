/**
 * 상속세 종합사례 PDF (책 1852~1877) — Pre-Do anchor용 입력 fixture.
 *
 * 출처: `/Users/mynote/Downloads/OneDrive_2026-05-20/상속세 계산 사례.pdf`
 * Plan: `docs/00-pm/inheritance-comprehensive-case.plan.md`
 * Design: `docs/02-design/features/inheritance-comprehensive-case.engine.design.md`
 *
 * ⚠️ 본 fixture에서 참조하는 신규 타입(`PresumedInheritanceItem`·`DebtItem`·`HeirAllocation`·
 *    `beneficiaryType`·`deemedCategory` 등)은 아직 엔진에 미구현. Pre-Do anchor 정책상
 *    import 실패가 정상 — 실패 메시지로 디자인 환류.
 *
 * ── 인적사항 ──────────────────────────────────────
 *   피상속인: 문00 (M사 25년 경영, 60% 지분)
 *   상속개시일: 2023-03-05
 *   상속인: 배우자(갑, 85세) · 장남(을, 55세) · 차남(병, 52세)
 *   수유자: 손녀(정, 30세 — 장남의 자녀, 세대생략 수유자)
 *   영리법인 수증자: M사 (사전 채무면제 7억)
 *
 * ── 최종 결과 (PDF 책 1859 표) ─────────────────────
 *   상속세 과세가액:   8,775,000,000
 *   상속공제:          4,600,000,000
 *   과세표준:          4,175,000,000
 *   산출세액:          1,627,500,000
 *   세대생략 할증:        30,232,198  (손녀)
 *   영리법인 면제:       150,000,000
 *   자진납부세액 합계: 1,033,760,232 (배우자 432,871,250 + 장남 276,593,379 + 차남 228,833,517 + 손녀 95,462,086)
 */

// 신규 타입은 미구현이지만, fixture가 의도하는 모양을 명확히 하기 위해
// 디자인 문서의 타입을 그대로 사용 (import 실패는 의도된 Pre-Do 실패).
import type {
  InheritanceTaxInput,
  EstateItem,
  Heir,
  PriorGift,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// 식별자
// ============================================================

export const HEIR_ID = {
  spouse: "heir_spouse_kap",
  son: "heir_son_eul",
  son2: "heir_son2_byung",
  granddaughter: "legatee_granddaughter_jeong",
  corporate: "corporate_msa",
} as const;

export const DEATH_DATE = "2023-03-05";

// ============================================================
// Heir 배열 — 상속인·수유자·영리법인 통합 (Design §2-0)
// ============================================================

export const EXAMPLE_HEIRS: Heir[] = [
  {
    id: HEIR_ID.spouse,
    relation: "spouse",
    name: "갑",
    birthDate: "1938-01-01",
    isHeir: true,
    isGenerationSkipBeneficiary: false,
  },
  {
    id: HEIR_ID.son,
    relation: "child",
    name: "을(장남)",
    birthDate: "1968-01-01",
    isHeir: true,
    isGenerationSkipBeneficiary: false,
  },
  {
    id: HEIR_ID.son2,
    relation: "child",
    name: "병(차남)",
    birthDate: "1971-01-01",
    isCohabitant: true, // 10년 계속 동거 (§23의2 대상)
    isHeir: true,
    isGenerationSkipBeneficiary: false,
  },
  {
    relation: "legatee",
    id: HEIR_ID.granddaughter,
    name: "정(손녀)",
    birthDate: "1993-01-01",
    isHeir: false,
    isGenerationSkipBeneficiary: true, // §27 ② 30% 할증 대상
  },
  {
    relation: "corporate",
    id: HEIR_ID.corporate,
    name: "M사",
    isHeir: false,
    corporateGiftComputedTax: 150_000_000, // §3의2② 면제 한도용
  },
] as Heir[];

// ============================================================
// EstateItem 배열 — 본래상속재산 + 간주상속재산 (Plan §1 합계 6,680M)
// ============================================================

export const EXAMPLE_ESTATE_ITEMS: EstateItem[] = [
  // ── 예금 (PDF 책 1853 1) ──
  {
    id: "estate_bank_oo",
    category: "financial",
    name: "○○은행 예금",
    marketValue: 1_100_000_000,
    heirAllocations: [{ heirId: HEIR_ID.spouse, amount: 1_100_000_000 }],
  },
  {
    id: "estate_bank_savings",
    category: "financial",
    name: "○○저축은행 예금",
    marketValue: 1_000_000_000,
    heirAllocations: [
      { heirId: HEIR_ID.son, amount: 500_000_000 },
      { heirId: HEIR_ID.granddaughter, amount: 500_000_000 }, // 유언 — 손녀
    ],
  },

  // ── 부동산 (PDF 책 1853 2) ──
  {
    id: "estate_apt_yeoksam",
    category: "real_estate_apartment",
    name: "강남구 역삼동 아파트 165㎡(대지45㎡)",
    marketValue: 800_000_000, // 매매사례가액 (기준시가 6억보다 우선)
    standardPrice: 600_000_000,
    heirAllocations: [{ heirId: HEIR_ID.son2, amount: 800_000_000 }], // 차남 단독, 동거주택공제 대상
  },
  {
    id: "estate_forest_gwangju",
    category: "real_estate_land",
    name: "경기 광주 임야 1,500㎡",
    standardPrice: 450_000_000,
    heirAllocations: [{ heirId: HEIR_ID.son, amount: 450_000_000 }],
  },
  {
    id: "estate_farmland_icheon",
    category: "real_estate_land",
    name: "경기 이천 농지 10,000㎡",
    standardPrice: 1_150_000_000,
    heirAllocations: [{ heirId: HEIR_ID.spouse, amount: 1_150_000_000 }],
  },
  {
    id: "estate_factory_building",
    category: "real_estate_building",
    name: "경기 이천 공장건물 1,650㎡",
    standardPrice: 330_000_000,
    heirAllocations: [{ heirId: HEIR_ID.son2, amount: 330_000_000 }],
  },
  {
    // PDF 책 1853 ④ — 1물건 협의분할 (2500㎡ vs 1500㎡)
    id: "estate_factory_land",
    category: "real_estate_land",
    name: "경기 이천 공장부지 4,000㎡",
    standardPrice: 800_000_000,
    heirAllocations: [
      { heirId: HEIR_ID.spouse, amount: 500_000_000, areaM2: 2500 },
      { heirId: HEIR_ID.son2, amount: 300_000_000, areaM2: 1500 },
    ],
  },

  // ── 주식 (PDF 책 1854 3) — 평가는 별도 모듈, 본 사례는 시가 직접 입력 ──
  {
    id: "estate_listed_h",
    category: "other",
    name: "H사 상장주식 (소액주주, 2개월 평균종가 시가)",
    marketValue: 150_000_000,
    heirAllocations: [{ heirId: HEIR_ID.spouse, amount: 150_000_000 }],
  },
  {
    id: "estate_unlisted_m",
    category: "other",
    name: "비상장 M사 25,000주 (60% 지분) — 가업승계, 기준시가 평가",
    marketValue: 500_000_000,
    isFamilyBusinessAsset: true,
    heirAllocations: [{ heirId: HEIR_ID.son2, amount: 500_000_000 }],
  },

  // ── 기타재산 (PDF 책 1854 4) — 배우자 일괄 ──
  {
    id: "estate_golf_membership",
    category: "other",
    name: "J골프 회원권 (매매사례가액)",
    marketValue: 80_000_000,
    heirAllocations: [{ heirId: HEIR_ID.spouse, amount: 80_000_000 }],
  },
  {
    id: "estate_car_s",
    category: "other",
    name: "S사 승용차",
    marketValue: 30_000_000,
    heirAllocations: [{ heirId: HEIR_ID.spouse, amount: 30_000_000 }],
  },
  {
    id: "estate_lease_deposit",
    category: "other",
    name: "이천 아파트 임차보증금",
    marketValue: 20_000_000,
    heirAllocations: [{ heirId: HEIR_ID.spouse, amount: 20_000_000 }],
  },
  {
    id: "estate_cash",
    category: "cash",
    name: "현금",
    marketValue: 35_000_000,
    heirAllocations: [{ heirId: HEIR_ID.spouse, amount: 35_000_000 }],
  },
  {
    id: "estate_court_deposit",
    category: "financial",
    name: "S법원 공탁금",
    marketValue: 5_000_000,
    heirAllocations: [{ heirId: HEIR_ID.spouse, amount: 5_000_000 }],
  },
  {
    id: "estate_pottery",
    category: "other",
    name: "도자기외 2점 골동품",
    marketValue: 20_000_000,
    heirAllocations: [{ heirId: HEIR_ID.spouse, amount: 20_000_000 }],
  },
  {
    id: "estate_loan_to_m",
    category: "other",
    name: "M사 대여금",
    marketValue: 30_000_000,
    heirAllocations: [{ heirId: HEIR_ID.spouse, amount: 30_000_000 }],
  },
  {
    id: "estate_salary",
    category: "other",
    name: "M사 급여 (상속개시 전 근무)",
    marketValue: 6_000_000,
    heirAllocations: [{ heirId: HEIR_ID.spouse, amount: 6_000_000 }],
  },

  // ── 간주상속재산 §10 (PDF 책 1854) ──
  {
    id: "deemed_retirement",
    category: "other",
    name: "M사 퇴직금",
    marketValue: 124_000_000,
    deemedCategory: "retirement",
    heirAllocations: [{ heirId: HEIR_ID.spouse, amount: 124_000_000 }],
  },
  {
    id: "deemed_insurance",
    category: "financial",
    name: "L 생명보험금",
    marketValue: 50_000_000,
    deemedCategory: "insurance",
    heirAllocations: [{ heirId: HEIR_ID.spouse, amount: 50_000_000 }],
  },
] as EstateItem[];

// ============================================================
// 추정상속재산 §15 (PDF 책 1857) — Design §2-3
// ============================================================

/**
 * EXAMPLE_PRESUMED — 4종 카테고리 (Plan §5-1 산식 발췌)
 *
 * ⓐ 부동산처분: A토지(2년 385M) + B아파트(2년 500M), 확인 600M
 *    → 미소명 285M − Min(885×20%, 200) = 108M
 * ⓑ 예금인출: 2년 1,500M, 확인 1,200M
 *    → 미소명 300M − Min(1500×20%, 200) = 100M
 * ⓒ 기타재산 영업권: 1년 180M (200M 미만 → 소명대상 아님)
 *    → 0
 * ⓓ 금융기관채무: 2년 1,000M, 확인 658M
 *    → 미소명 342M − Min(1000×20%, 200) = 142M
 *  합계 = 350,000,000
 */
export const EXAMPLE_PRESUMED = [
  {
    id: "presumed_realestate",
    category: "real_estate" as const,
    amountWithin1Y: 385_000_000, // A토지 2022-08-10 (1년 이내)
    amountWithin2Y: 500_000_000, // B아파트 2021-08-15 (2년 이내)
    verifiedUseAmount: 600_000_000,
    // PDF 책 1859 역산 — 부동산 108M 전체를 배우자에게
    heirAllocations: [{ heirId: HEIR_ID.spouse, amount: 108_000_000 }],
  },
  {
    id: "presumed_deposit",
    category: "deposit" as const,
    amountWithin1Y: 0,
    amountWithin2Y: 1_500_000_000,
    verifiedUseAmount: 1_200_000_000,
    // PDF 책 1859 역산 — 예금 100M 전체를 차남에게
    heirAllocations: [{ heirId: HEIR_ID.son2, amount: 100_000_000 }],
  },
  {
    id: "presumed_other",
    category: "other_asset" as const,
    amountWithin1Y: 180_000_000, // 영업권 1년 이내 (200M 미만 → 임계 미발동)
    amountWithin2Y: 0,
    verifiedUseAmount: 0,
    heirAllocations: [], // 0 — 소명대상 아님
  },
  {
    id: "presumed_debt",
    category: "financial_debt" as const,
    amountWithin1Y: 0,
    amountWithin2Y: 1_000_000_000,
    verifiedUseAmount: 658_000_000,
    // PDF 책 1859 표 — 배우자 42M + 장남 100M = 142M (차남 0)
    heirAllocations: [
      { heirId: HEIR_ID.spouse, amount: 42_000_000 },
      { heirId: HEIR_ID.son, amount: 100_000_000 },
    ],
  },
];

// ============================================================
// 추정상속재산 귀속자별 합계 검산 (PDF 책 1859 표)
// ============================================================
// 부동산 108M → 배우자 108M
// 예금 100M  → 차남 100M
// 채무 142M  → 배우자 42M + 장남 100M
// ─────────────────────────────────────────────
// 합계: 배우자 150M + 장남 100M + 차남 100M = 350M ✓ (PDF 책 1859)
// 단, 항목별 안분 규칙은 PDF 본문에 명시되지 않음 (Plan §6-2 모호 사항).
// fixture의 안분은 PDF 결과 표를 역산하여 가정 — Phase A 구현 시 협의분할 입력 명시로 처리.

// ============================================================
// 채무·공과금·장례비 §14 (PDF 책 1858) — Design §2-3-1
// ============================================================

export const EXAMPLE_DEBT_ITEMS = [
  {
    id: "debt_k_bank",
    category: "financial" as const,
    name: "K은행 (2021-06-20 차입)",
    amount: 400_000_000,
    heirAllocations: [{ heirId: HEIR_ID.son, amount: 400_000_000 }],
  },
  {
    id: "debt_s_savings",
    category: "financial" as const,
    name: "S저축은행 (2018-05-10 차입)",
    amount: 745_000_000,
    heirAllocations: [
      { heirId: HEIR_ID.spouse, amount: 500_000_000 },
      { heirId: HEIR_ID.son2, amount: 245_000_000 },
    ],
  },
  {
    id: "expense_income_tax",
    category: "tax" as const,
    name: "2022 귀속 종합소득세 등",
    amount: 55_000_000,
    heirAllocations: [{ heirId: HEIR_ID.son2, amount: 55_000_000 }],
  },
  {
    id: "funeral_meal",
    category: "funeral" as const,
    name: "S장례식장 식대 등",
    amount: 18_000_000, // 한도 1,000만 — 엔진 10M 인식
    isBongan: false,
    heirAllocations: [{ heirId: HEIR_ID.spouse, amount: 10_000_000 }],
  },
  {
    id: "funeral_bongan",
    category: "funeral" as const,
    name: "공원묘지 봉안시설 사용료",
    amount: 15_000_000, // 한도 500만 — 엔진 5M 인식
    isBongan: true,
    heirAllocations: [{ heirId: HEIR_ID.spouse, amount: 5_000_000 }],
  },
];

// ============================================================
// 사전증여 §13 (PDF 책 1858) — Design §2-2
// ============================================================

export const EXAMPLE_PRIOR_GIFTS: PriorGift[] = [
  {
    giftDate: "2021-08-10",
    isHeir: false,
    giftAmount: 700_000_000,
    giftTaxBase: 700_000_000,
    giftTaxPaid: 0, // 영리법인은 증여세 없음 (법인세 처리)
    doneeId: HEIR_ID.corporate,
    beneficiaryType: "corporate",
    corporateGiftComputedTax: 150_000_000, // 비교 — 사례에서 산출된 증여세 의제값
  },
  {
    giftDate: "2022-06-10",
    isHeir: true,
    giftAmount: 760_000_000,
    giftTaxBase: 160_000_000, // = 760M − 배우자 증여공제 600M
    giftTaxPaid: 22_000_000, // 당시 납부
    doneeId: HEIR_ID.spouse,
    beneficiaryType: "heir",
  },
  {
    giftDate: "2018-08-17",
    isHeir: true,
    giftAmount: 1_500_000_000,
    giftTaxBase: 1_450_000_000, // = 1,500M − 직계비속 증여공제 50M
    giftTaxPaid: 420_000_000,
    doneeId: HEIR_ID.son,
    beneficiaryType: "heir",
  },
] as PriorGift[];

// ============================================================
// 통합 InheritanceTaxInput — PRE-5/6 anchor용
// ============================================================

export const EXAMPLE_INPUT: InheritanceTaxInput = {
  decedentType: "resident",
  deathDate: DEATH_DATE,
  estateItems: EXAMPLE_ESTATE_ITEMS,
  presumedItems: EXAMPLE_PRESUMED,
  debtItems: EXAMPLE_DEBT_ITEMS,
  // legacy 호환 (deprecated)
  funeralExpense: 0,
  funeralIncludesBongan: false,
  debts: 0,
  exemptions: [],
  preGiftsWithin10Years: EXAMPLE_PRIOR_GIFTS,
  heirs: EXAMPLE_HEIRS,
  deductionInput: {
    heirs: EXAMPLE_HEIRS,
    spouseActualAmount: 2_800_000_000, // PDF 책 1863 ③ 배우자 실제 상속
    netFinancialAssets: 1_155_000_000, // PDF 책 1863 ④ 순금융재산
    cohabitHouseStdPrice: 0, // 차남 동거주택 직접입력 모드로 처리 (Phase E)
    farmingAssetValue: 0,
    familyBusinessValue: 0, // 가업상속 직접입력 모드로 처리 (Phase E)
    familyBusinessDirectAmount: 500_000_000, // 가업상속공제 직접 입력
    cohabitDirectAmount: 600_000_000, // 동거주택공제 직접 입력
    // Phase D §19 배우자 법정상속분 자동 계산 — orchestrator가 분자 산식 직접 적용
    // (spouseLegalShareOverride 미입력 시 자동)
    legateeAmountNonHeir: 500_000_000, // 손녀 유증 (저축은행 예금 5억)
    // priorGiftDeductionTotal 미입력 — §24 자동 도출 검증(dual-truth 차단):
    // preGifts giftTaxBase에서 650M(배우자 600 + 장남 50 + 법인 0) 자동 계산되어야 ceiling 5,965M 유지.
  },
  creditInput: {
    priorGifts: EXAMPLE_PRIOR_GIFTS,
    isFiledOnTime: true,
  },
  isGenerationSkip: true,
  isMinorHeir: false,
  generationSkipAssetAmount: 500_000_000, // 손녀 유증
} as InheritanceTaxInput;

// ============================================================
// PRE-4 anchor용 — 배우자 단독 share 계산 입력
// ============================================================

export const SPOUSE_INPUT = {
  heirId: HEIR_ID.spouse,
  /** 배우자 과세가액상당액 — PDF 책 1859 표 */
  taxableValueShare: 3_695_000_000, // 본래 1,650+150+400 + 채무·공과 -515 + 사전증여 760 + 추정 150 ≈ 3,695
  /** 배우자 사전증여 가산가액 (gross) */
  priorGiftAmount: 760_000_000,
  /** 배우자 사전증여 과세표준 */
  priorGiftTaxBase: 160_000_000,
  /** 배우자 증여공제 (배우자 600M) */
  priorGiftDeduction: 600_000_000,
  /** 간접배부 분자 (taxBase − Σ직접 − corporateGiftTaxBase) */
  indirectNumerator: 1_865_000_000,
  /** 간접배부 분모 (grossEstateWithGifts − Σ(상속인·수유자 외 모든 사전증여 가액)) */
  indirectDenominator: 5_815_000_000,
};
