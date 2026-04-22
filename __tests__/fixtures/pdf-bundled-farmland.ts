/**
 * PDF 재현 테스트 고정 상수 — 2023 양도·상속·증여세 이론 및 계산실무 p387~391
 *
 * 사례: "상속받은 주택과 농지의 양도가액 안분 / 수정신고"
 *   - 갑씨가 1세대 1주택(농가주택+부속토지) + 농지(밭)를 일괄양도
 *   - 상속 2005.4.7, 부친 취득 1999.10.21 (150,000,000원)
 *   - 양도 2023.2.15 (총 225,000,000원)
 *   - 주택분: 2년+ 보유 → 1세대 1주택 비과세
 *   - 농지분: 8년+ 자경 → 조특법 §69 100% 감면, 농특세 비과세
 *
 * **회귀 방어 앵커링 원칙** (feedback_pdf_example_test_anchoring.md):
 *   모든 정답값을 원 단위까지 `toBe()`로 고정한다. `toBeCloseTo` 금지.
 */

// ─────────────────────────────────────────────────────────────
// 입력 상수
// ─────────────────────────────────────────────────────────────

/** 상속개시일 */
export const INHERITANCE_DATE = new Date("2005-04-07");
/** 피상속인 취득일 (부친) */
export const DECEDENT_ACQUISITION_DATE = new Date("1999-10-21");
/** 피상속인 취득가액 (150백만) — 참고용 */
export const DECEDENT_ACQUISITION_PRICE = 150_000_000;
/** 양도일 */
export const TRANSFER_DATE = new Date("2023-02-15");
/** 총 양도가액 (매매계약 일괄양도) */
export const TOTAL_SALE_PRICE = 225_000_000;

// ─────────────────────────────────────────────────────────────
// 자산별 기준시가 (양도 시점 = 2022.1.1 고시)
// ─────────────────────────────────────────────────────────────

/** 주택 개별주택가격 (2022.1.1 고시) */
export const HOUSE_STD_AT_TRANSFER = 116_000_000;
/** 농지 공시지가 (2022.1.1 고시, 원/㎡) */
export const LAND_PRICE_PER_M2_AT_TRANSFER = 117_000;
/** 농지 면적 (㎡) */
export const LAND_AREA_M2 = 793;
/** 농지 양도시점 기준시가 = 793 × 117,000 */
export const LAND_STD_AT_TRANSFER = LAND_AREA_M2 * LAND_PRICE_PER_M2_AT_TRANSFER; // 92,781,000

// ─────────────────────────────────────────────────────────────
// 상속개시일(2005.4.7) 직전 고시 기준시가 = 보충적평가액
// PDF 본문·표에 근거
// ─────────────────────────────────────────────────────────────

/** 주택 개별주택가격 (2005.1.1 고시) */
export const INHERIT_HOUSE_PRICE = 108_000_000;
/**
 * 농지 개별공시지가 (2004.1.1 고시, 원/㎡) — 2005.4.7 상속개시일 직전 고시
 * (2005.1.1 공시는 같은 해이나 일반적으로 5월 이후 공시되어 4월 상속개시 시에는 직전 연도 값 사용)
 */
export const INHERIT_LAND_PRICE_PER_M2 = 12_000;
/** 농지 상속 시점 보충적평가액 = 793 × 12,000 */
export const INHERIT_LAND_SUPPLEMENTARY = LAND_AREA_M2 * INHERIT_LAND_PRICE_PER_M2; // 9,516,000

// ─────────────────────────────────────────────────────────────
// 필요경비 (취득 부대비용)
// ─────────────────────────────────────────────────────────────

/** 주택 취득 부대비용 */
export const HOUSE_INHERIT_EXPENSE = 1_250_000;
/** 농지 취득 부대비용 */
export const LAND_INHERIT_EXPENSE = 285_480;

// ─────────────────────────────────────────────────────────────
// PDF 정답 수치 (p388 안분표 + p390~391 계산명세서)
// ─────────────────────────────────────────────────────────────

/** PDF p388 — 주택 안분 양도가액 */
export const ANS_HOUSE_ALLOCATED_SALE = 125_011_376;
/** PDF p388 — 농지 안분 양도가액 */
export const ANS_LAND_ALLOCATED_SALE = 99_988_624;

/** PDF p390 — 농지 취득가액 (보충적평가액, 표시값) */
export const ANS_LAND_ACQUISITION_PRICE = 9_801_480;
/** PDF p390 — 농지 양도차익 */
export const ANS_LAND_TRANSFER_GAIN = 90_187_144;
/** PDF p390 — 농지 장기보유특별공제 (30%) */
export const ANS_LAND_LTHD = 27_056_143;
/** PDF p390 — 농지 양도소득금액 */
export const ANS_LAND_INCOME = 63_131_001;
/** PDF p391 — 농지 과세표준 */
export const ANS_LAND_TAX_BASE = 60_631_001;
/** PDF p391 — 농지 산출세액 */
export const ANS_LAND_CALCULATED_TAX = 8_791_440;
/** PDF p391 — 농지 감면세액 (100% 감면) */
export const ANS_LAND_REDUCTION = 8_791_440;
/** PDF p391 — 농지 납부세액 (감면 후) */
export const ANS_LAND_DETERMINED = 0;

/** PDF p391 — 지방소득세 산출세액 (과표 × 2.4%) */
export const ANS_LAND_LOCAL_INCOME_CALCULATED = 879_144;
/** PDF p391 — 지방소득세 감면 */
export const ANS_LAND_LOCAL_INCOME_REDUCTION = 879_144;
/** PDF p391 — 지방소득세 납부세액 */
export const ANS_LAND_LOCAL_INCOME_DETERMINED = 0;
