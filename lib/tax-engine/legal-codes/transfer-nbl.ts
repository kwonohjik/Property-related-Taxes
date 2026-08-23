/**
 * 비사업용 토지 법령 조문 상수 — 소득세법 §104조의3 + 시행령 §168조의6 ~ §168조의14
 *
 * `transfer.ts`가 800줄 정책(CLAUDE.md File Size Policy)을 넘겨 분리했다(2026-08-05).
 *
 * ⚠️ **하위 호환**: `transfer.ts`가 `export *`로 그대로 재수출한다 —
 * 기존 `import { NBL } from "./legal-codes/transfer"` 호출부와
 * barrel(`legal-codes.ts`) 경유 import가 모두 그대로 작동한다.
 *
 * ⚠️ **법령 검증 모수**: `lib/legal-verification/coverage-collect.ts`가
 * `import * as transfer`로 **namespace의 모든 문자열 leaf**를 순회해 인용을 모은다.
 * 재수출이 끊기면 여기 조문들이 **모수에서 조용히 빠진다**.
 *
 * 🔴 **기존 게이트는 이 누락을 잡지 못한다**(2026-08-05 실측 — 재수출을 지우고 돌려봄):
 *   · `npm run verify:legal` — manifest 기반이라 namespace와 무관 (**338건 그대로**)
 *   · 커버리지 테스트 — "모수 **안**이 100%"만 보므로 모수가 줄면 공허하게 통과
 *   · unverifiable 테스트 — 모수 **밖** 목록만 본다
 * ⇒ 유일한 가드는 `__tests__/lib/legal-codes-transfer-reexport.test.ts`다.
 */

// ============================================================
// 비사업용 토지 — 소득세법 §104조의3 + 시행령 §168조의6 ~ §168조의14
// ============================================================

/** 비사업용 토지 관련 주요 법령 상수 */
export const NBL = {
  /** 소득세법 §104조의3 — 비사업용 토지의 범위 (메인 근거) */
  MAIN:           "소득세법 §104조의3",
  /** 시행령 §168조의6 — 판정 3기준 (80% / 5년3년 / 3년2년) */
  CRITERIA:       "소득세법 시행령 §168조의6",
  /** 시행령 §168조의7 — 부득이한 사유 (질병·고령·징집 등) */
  UNAVOIDABLE:    "소득세법 시행령 §168조의7",
  /** 시행령 §168조의8 — 농지 자경 요건 + 건물 부수 토지 배율 */
  FARMLAND:       "소득세법 시행령 §168조의8",
  /** 시행령 §168조의8 ③ — 농지 사용의제 (주말농장·한계농지 등) */
  FARMLAND_DEEM:  "소득세법 시행령 §168조의8 ③",
  /** 시행령 §168조의9 — 목장용지·임야 사업용 요건 */
  FOREST_PASTURE: "소득세법 시행령 §168조의9",
  /** 시행령 §168조의10 — 임야 특수 요건 (영림계획·산림보호 등) */
  FOREST_SPECIAL: "소득세법 시행령 §168조의10",
  /** 시행령 §168조의11 — 별장 부수 토지·기타 토지 */
  VILLA_OTHER:    "소득세법 시행령 §168조의11",
  /** 시행령 §168조의11 ① — 기타토지 (나대지·잡종지) 재산세 유형 */
  OTHER_LAND:     "소득세법 시행령 §168조의11 ①",
  /** 시행령 §168조의8 — 건물 부수 토지 용도지역별 배율 (농지 자경 요건과 동일 조문) */
  BUILDING_SITE:  "소득세법 시행령 §168조의8",
  /** 시행령 §168조의8 — 주택 부수 토지 배율 */
  HOUSING_SITE:   "소득세법 시행령 §168조의8",
  /** 시행령 §168조의14 ① — 도시지역 편입유예 (2~3년) */
  URBAN_GRACE:    "소득세법 시행령 §168조의14 ①",
  /** 시행령 §168조의14 ③ — 무조건 사업용 의제 (7가지 사유) */
  UNCONDITIONAL:  "소득세법 시행령 §168조의14 ③",
  /** 시행령 §168조의11 ② + 기획재정부령 §83의5 — 수입금액 비율 테스트 (업종별 기준) */
  REVENUE_TEST:   "소득세법 시행령 §168조의11 ② + 소득세법 시행규칙 §83조의4",
  /** 시행령 §168조의11 ③ 1호 — 전세금·보증금 간주임대료 합산 (부가가치세법 시행령 §65① 준용) */
  REVENUE_DEEMED_RENT: "소득세법 시행령 §168조의11 ③1호 (부가가치세법 시행령 §65① · 부가가치세법 시행규칙 §47)",
  /** 시행령 §168조의11 ③ 2호 — 공통수입금액 토지가액 비율 안분 */
  REVENUE_COMMON_APPORTION: "소득세법 시행령 §168조의11 ③2호",

  // ── v2 엔진 전용 정확 조문 상수 (PDF p.1695~1707 매핑) ──
  CATEGORY:                       "소득세법 시행령 §168조의7",
  FARMLAND_URBAN_GRACE:           "소득세법 시행령 §168조의8 ⑤⑥",
  FOREST:                         "소득세법 시행령 §168조의9",
  FOREST_PUBLIC:                  "소득세법 시행령 §168조의9 ①",
  FOREST_RESIDENCE:               "소득세법 시행령 §168조의9 ②",
  FOREST_BUSINESS:                "소득세법 시행령 §168조의9 ③",
  PASTURE:                        "소득세법 시행령 §168조의10",
  PASTURE_RELATED:                "소득세법 시행령 §168조의10 ②",
  PASTURE_AREA:                   "소득세법 시행령 §168조의10 ③",
  PASTURE_URBAN:                  "소득세법 시행령 §168조의10 ④",
  PASTURE_URBAN_GRACE:            "소득세법 시행령 §168조의10 ⑤",
  OTHER_LAND_BUSINESS:            "소득세법 시행령 §168조의11 ①",
  // §168의11① 호별 면적기준 (갭 3a) — 초과분 비사업용 면적 안분
  OTHER_LAND_AREA_SPORTS:         "소득세법 시행령 §168조의11 ① 1호 + 소득세법 시행규칙 §83조의4 ①③④",
  OTHER_LAND_AREA_PARKING:        "소득세법 시행령 §168조의11 ① 2호 가목",
  OTHER_LAND_AREA_GARAGE:         "소득세법 시행령 §168조의11 ① 2호 나목",
  OTHER_LAND_AREA_YOUTH:          "소득세법 시행령 §168조의11 ① 4호 + 소득세법 시행규칙 §83조의4 ⑧",
  OTHER_LAND_AREA_RESERVE:        "소득세법 시행령 §168조의11 ① 5호 다목 + 소득세법 시행규칙 §83조의4 ⑨⑩",
  OTHER_LAND_AREA_RESORT:         "소득세법 시행령 §168조의11 ① 6호 + 소득세법 시행규칙 §83조의4 ⑪⑫",
  OTHER_LAND_AREA_HATCHANG:       "소득세법 시행령 §168조의11 ① 7호",
  OTHER_LAND_AREA_VACANT_LOT:     "소득세법 시행령 §168조의11 ① 13호 + 소득세법 시행규칙 §83조의4 ⑯⑰",
  // §101①2호나목 (지방세법 시행령) — 2% 미달 건축물 바닥면적분 별도합산 유지(cross-statute)
  OTHER_LAND_FOOTPRINT_CARVEOUT:  "지방세법 시행령 §101 ① 2호 나목",
  // 공장용 건축물 부속토지 기준면적 — 소재 지역에 따라 배타 분기(cross-statute)
  /** 읍·면(군 포함)·산업단지·공업지역 → 분리과세. 기준면적 = 연면적 × 100 ÷ 업종별 기준공장면적률 */
  FACTORY_LAND_SEPARATE:          "지방세법 시행령 §102 ① 1호 + 지방세법 시행규칙 §50 [별표 6]",
  /** 그 밖의 특별시·광역시(군 제외)·특별자치시·특별자치도·시지역 → 별도합산. 기준면적 = 바닥면적 × §101② 배율 */
  FACTORY_LAND_AGGREGATE:         "지방세법 시행령 §101 ① 1호 (같은 조 ② 적용배율)",
  // §168의11⑥ 복합용도 건축물 부속토지 안분 — 특정용도분만 사업용
  /** ⑥1호 — 하나의 건축물 복합용도: 부속토지 × 특정용도분 연면적 / 건축물 연면적 */
  OTHER_LAND_MIXED_USE_FLOOR:     "소득세법 시행령 §168조의11 ⑥ 1호",
  /** ⑥2호 — 동일경계 다수 건축물: 전체 부속토지 × 특정용도분 바닥면적 / 전체 바닥면적 */
  OTHER_LAND_MIXED_USE_FOOTPRINT: "소득세법 시행령 §168조의11 ⑥ 2호",
  /** ⑤ — 연접 다필지 일괄용도 기준면적 초과분: 취득시기 늦은 필지부터 비사업용 귀속(2호=바닥면적 제외) */
  OTHER_LAND_CONTIGUOUS:          "소득세법 시행령 §168조의11 ⑤",
  HOUSING_MULTIPLIER:             "소득세법 시행령 §168조의12",
  /** 건물(비주택) 부수토지 배율 — 주택(§168조의12)과 **다른 조문·다른 배율표**다(수도권 축 없음) */
  BUILDING_SITE_MULTIPLIER:       "지방세법 시행령 §101 ① 2호 (같은 조 ② 적용배율)",
  VILLA:                          "소득세법 시행령 §168조의13",
  UNAVOIDABLE_PERIOD:             "소득세법 시행령 §168조의14 ① (소득세법 시행규칙 §83의5①)",
  TRANSFER_DATE_PRESUMED:         "소득세법 시행령 §168조의14 ②",
  UNCONDITIONAL_ANCESTOR:         "소득세법 시행령 §168조의14 ③ 1의2호",
  UNCONDITIONAL_PUBLIC:           "소득세법 시행령 §168조의14 ③ 3호",
  UNCONDITIONAL_JONGJOONG_INHERIT: "소득세법 시행령 §168조의14 ③ 4호",
} as const;

/**
 * 업종별 수입금액비율 기준 (소득세법 시행령 §168조의11② + 소득세법 시행규칙 §83조의4)
 *
 * §168의11②: 수입금액비율 = max(① 당해 수입÷당해 토지가액, ② (당해+직전 수입)÷(당해+직전 토지가액)).
 * 비율 ≥ 율이면 해당 토지 사업용 인정(§104의3①4호다목). 적용 대상: §168의11①2호다목·10호·11호다목·12호.
 * 율 근거(KoreanLaw 본문 검증 2026-06-16): 시행규칙 §83조의4 ⑥(주차장 3%)·⑬(광천지·양어장 4%)·⑮(12호 20/7/10/7/10%).
 * ⚠️ 체육시설(1호)·청소년수련(4호)·휴양업(6호)은 면적기준 — 수입금액비율 대상 아님.
 */
export const NBL_REVENUE_THRESHOLDS = {
  /** 2호다목 주차장운영업용: 3% (§83의4⑥) */
  PARKING_OPERATION:        0.03,
  /** 10호 광천지: 4% (§83의4⑬) */
  MINERAL_SPRING:           0.04,
  /** 11호다목 양어장·지소 기타: 4% (§83의4⑬) */
  FISH_FARM_OTHER:          0.04,
  /** 12호 블록·석물·토관 제조업용: 20% (§83의4⑮1) */
  BLOCK_STONE_PIPE_MFG:     0.20,
  /** 12호 조경작물식재·화훼판매시설업용: 7% (§83의4⑮2) */
  LANDSCAPING_FLORICULTURE: 0.07,
  /** 12호 자동차·중장비 정비/운전 학원용: 10% (§83의4⑮3) */
  VEHICLE_REPAIR_ACADEMY:   0.10,
  /** 12호 농업 학원용: 7% (§83의4⑮4) */
  AGRICULTURE_ACADEMY:      0.07,
  /** 12호 도소매업용(§83의4⑭): 10% (§83의4⑮5) */
  WHOLESALE_RETAIL:         0.10,
  /** 수입금액비율 비적용 (면적기준 등 다른 판정) */
  NONE:                     0,
} as const;

export type NblRevenueBusinessType =
  | "parking_operation"
  | "mineral_spring"
  | "fish_farm_other"
  | "block_stone_pipe_mfg"
  | "landscaping_floriculture"
  | "vehicle_repair_academy"
  | "agriculture_academy"
  | "wholesale_retail"
  | "none";

export function getNblRevenueThreshold(type: NblRevenueBusinessType): number {
  switch (type) {
    case "parking_operation":        return NBL_REVENUE_THRESHOLDS.PARKING_OPERATION;
    case "mineral_spring":           return NBL_REVENUE_THRESHOLDS.MINERAL_SPRING;
    case "fish_farm_other":          return NBL_REVENUE_THRESHOLDS.FISH_FARM_OTHER;
    case "block_stone_pipe_mfg":     return NBL_REVENUE_THRESHOLDS.BLOCK_STONE_PIPE_MFG;
    case "landscaping_floriculture": return NBL_REVENUE_THRESHOLDS.LANDSCAPING_FLORICULTURE;
    case "vehicle_repair_academy":   return NBL_REVENUE_THRESHOLDS.VEHICLE_REPAIR_ACADEMY;
    case "agriculture_academy":      return NBL_REVENUE_THRESHOLDS.AGRICULTURE_ACADEMY;
    case "wholesale_retail":         return NBL_REVENUE_THRESHOLDS.WHOLESALE_RETAIL;
    case "none":                     return NBL_REVENUE_THRESHOLDS.NONE;
  }
}

/**
 * 개산공제율 (소득세법 §97②2호 + 시행령 §163⑥)
 *
 * 취득 당시 기준시가에 곱해 필요경비(개산공제)를 산정하는 율.
 * 일반건물·상가 환산취득가 엔진의 단일 진실 원천(SSOT).
 */
export const ESTIMATED_DEDUCTION_RATE = {
  /** 등기 자산(토지·건물·주택·오피스텔 등) — 시행령 §163⑥1호·2호 */
  LAND_BUILDING: 0.03,
  /** 미등기양도자산 — 시행령 §163⑥1호·2호 **단서** */
  UNREGISTERED:  0.003,
  /**
   * 시행령 §163⑥**4호** —「제1호 내지 제3호외의 자산 취득당시의 기준시가×1／100」
   *
   * 조합원입주권·분양권은 법 §94①2호 **가목**(「부동산을 취득할 수 있는 권리」)이다.
   * 7%인 3호는 「법 제94조제1항제2호 **나목 및 다목**」(지상권 / 전세권·등기된 부동산임차권)만
   * 열거하므로 **가목은 3호에 없다** ⇒ 4호로 떨어져 **1%**다(법문 실독 2026-08-23,
   * 소득세법 시행령 mst 286211 · 소득세법 mst 280405).
   *
   * ⚠️ **4호에는 미등기 단서가 없다.** 1호·2호만 「미등기양도자산의 경우 3／1000」을 두고,
   *    3호는 아예 「미등기 양도자산을 제외한다」로 4호에 넘긴다. 따라서 4호 대상 자산은
   *    미등기 여부와 무관하게 1%다 — `estimatedDeductionRate()`가 미등기보다 **먼저** 판정한다.
   */
  CLAUSE_4_OTHER: 0.01,
} as const;

/**
 * 시행령 §163⑥**4호**(1%) 대상인가 — 법 §94①2호 **가목** 「부동산을 취득할 수 있는 권리」.
 *
 * 이 앱의 자산 종류 8종 중 가목에 해당하는 것은 **입주권·분양권** 둘뿐이다:
 *
 * | propertyType | §163⑥ | 율 |
 * |---|---|---|
 * | `land` | 1호 | 3% |
 * | `housing`·`building`·`commercial_building`·`general_building`(`_unit`)·`mixed-use-house` | 2호 | 3% |
 * | `redevelopment_apt` | 2호 — **완공 신축주택**의 양도라 주택이다 | 3% |
 * | **`right_to_move_in`·`presale_right`** | **4호** | **1%** |
 *
 * ⚠️ **원조합원 입주권의 §166③ 환산은 여기 해당하지 않는다.** 그 환산의 대상은 입주권이 아니라
 *    조합에 제공한 **종전 건물과 그 부수토지**(= 토지·건물)이므로 3%다. 그래서 §166 경로
 *    (`redevelopment-*-contribution.ts` · `redevelopment-split.ts`)는 `propertyType`을 넘기지
 *    **않고** 호출한다 — 인자를 추가하면 조용히 1%로 떨어진다. ⛔ 넘기지 말 것.
 */
export function isSec163_6Clause4Asset(propertyType?: string): boolean {
  return propertyType === "right_to_move_in" || propertyType === "presale_right";
}

/**
 * §163⑥ 개산공제율 선택 — **미등기양도자산(소득세법 §104③) 여부 단일 판정점**.
 *
 * 각 산출 지점이 `0.03`을 직접 쓰면 미등기 분기가 조용히 누락된다 — 실제로 split·PHD·겸용·재개발
 * 경로 15곳이 3% 고정이어서 미등기 자산의 개산공제가 **10배**로 산출됐다(2026-07-28 정정).
 * 같은 자산이 분리 계산 경로를 타면 다른 율이 적용되는 모순이었다.
 *
 * 신규 개산공제 지점은 반드시 이 함수를 경유할 것. 리터럴 `0.03` 사용 금지.
 *
 * @param propertyType 넘기면 §163⑥**4호**(1%) 여부를 함께 판정한다. **§166③ 환산처럼 대상이
 *   토지·건물인 경로는 넘기지 않는다**(`isSec163_6Clause4Asset` 주석의 표 참조).
 */
export function estimatedDeductionRate(isUnregistered?: boolean, propertyType?: string): number {
  // 4호가 먼저다 — 4호에는 미등기 단서(3／1000)가 없다.
  if (isSec163_6Clause4Asset(propertyType)) return ESTIMATED_DEDUCTION_RATE.CLAUSE_4_OTHER;
  return isUnregistered
    ? ESTIMATED_DEDUCTION_RATE.UNREGISTERED
    : ESTIMATED_DEDUCTION_RATE.LAND_BUILDING;
}
