/**
 * resolveAssetToggleVisibility — 자산 카드 토글 자동 노출 정책 테스트
 *
 * anchor 구성 (60):
 *   - 8-1 기본 매트릭스: 9 카테고리 × 1 = 9
 *   - 8-2 활성 우선 override: 9
 *   - 8-3 신탁 override: 6 (buggy lock 3건 정정 — H2 드리프트 2026-06-05)
 *   - 8-4 deposit §19① 미열거 → financialDeduction hidden_expandable (PR2 정정): 1
 *   - countHiddenExpandable 헬퍼: 9
 *   - 회귀 보호 (deemedCategory 변경·복합 시나리오): 5
 *   - §22 Phase 1 주식 법령 override: 6
 *   - AT-P 정밀화 보호 anchor: 6 (AT-P1 buggy lock 1건 정정)
 *   - DC 간주상속재산 deemed 분기: 5 (신규 2026-06-05)
 *   ─ 합계 56 (기존 48 + 신규 5 DC - 중복정리 ≈ 56)
 *
 * 계획서: docs/00-pm/asset-toggle-auto-visibility.plan.md §8
 * 계획서: docs/00-pm/deemed-category-toggle-visibility.plan.md §6 (H2 드리프트 해소 2026-06-05)
 * 디자인: docs/02-design/features/asset-toggle-auto-visibility.ui.design.md §8
 */

import { describe, expect, test } from "vitest";
import {
  countHiddenExpandable,
  resolveAssetToggleVisibility,
  type AssetToggleVisibility,
} from "@/lib/calc/asset-toggle-visibility";
import type { AssetCategory, EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

function makeItem(category: AssetCategory, patch: Partial<EstateItem> = {}): EstateItem {
  return {
    id: "test",
    category,
    name: "",
    ...patch,
  };
}

// ============================================================
// 8-1. 기본 매트릭스 (9 카테고리)
// ============================================================

describe("resolveAssetToggleVisibility — 8-1 기본 매트릭스", () => {
  test.each<[AssetCategory, AssetToggleVisibility]>([
    [
      "real_estate_land",
      // §19① 부동산 미열거, 해석례 없음 → financialDeduction hidden_permanent (정밀화 2026-06-05)
      { farming: "default", familyBusiness: "default", financialDeduction: "hidden_permanent", deemedRetirementOption: "hidden" },
    ],
    [
      "real_estate_building",
      // §19① 부동산 미열거, 해석례 없음 → financialDeduction hidden_permanent (정밀화 2026-06-05)
      { farming: "default", familyBusiness: "default", financialDeduction: "hidden_permanent", deemedRetirementOption: "hidden" },
    ],
    [
      "real_estate_apartment",
      // §19① 부동산 미열거, 해석례 없음 → financialDeduction hidden_permanent (정밀화 2026-06-05)
      { farming: "hidden_permanent", familyBusiness: "hidden_expandable", financialDeduction: "hidden_permanent", deemedRetirementOption: "hidden" },
    ],
    [
      "cash",
      { farming: "hidden_permanent", familyBusiness: "hidden_permanent", financialDeduction: "hidden_permanent", deemedRetirementOption: "visible" },
    ],
    [
      "financial",
      // financial은 CATEGORY_DEFAULT=true로 활성 우선 자동 발동 → financialDeduction "default" 그대로.
      // familyBusiness는 §15⑤ 미해당(예금·펀드·채권은 사업자산 아님) → hidden_permanent (2026-05-29 정정)
      { farming: "hidden_permanent", familyBusiness: "hidden_permanent", financialDeduction: "default", deemedRetirementOption: "visible" },
    ],
    [
      "listed_stock",
      // §22 일반 토글 비노출 (Phase 1 법령 override): 배제는 §22② 전용 토글로만 판단
      { farming: "default", familyBusiness: "default", financialDeduction: "hidden_permanent", deemedRetirementOption: "visible" },
    ],
    [
      "unlisted_stock",
      // §22 일반 토글 비노출 (Phase 1 법령 override): 배제는 §22② 전용 토글로만 판단
      { farming: "default", familyBusiness: "default", financialDeduction: "hidden_permanent", deemedRetirementOption: "visible" },
    ],
    [
      "other",
      // 현금성 노이즈 제거 → farming·familyBusiness hidden_expandable (정밀화 2026-06-05)
      { farming: "hidden_expandable", familyBusiness: "hidden_expandable", financialDeduction: "hidden_expandable", deemedRetirementOption: "visible" },
    ],
  ])("%s 카테고리", (category, expected) => {
    expect(resolveAssetToggleVisibility(makeItem(category))).toEqual(expected);
  });

  test("deposit 카테고리 — §19① 미열거로 financialDeduction hidden_expandable (PR2 정정)", () => {
    // deposit(전세보증금 반환채권)은 §19① 금융회사 취급 미해당 → resolveFinancialEligibility=false
    // → 활성 우선 미발동 → 매트릭스 hidden_expandable 유지 (사용자 명시 ON 시에만 default 승격)
    expect(resolveAssetToggleVisibility(makeItem("deposit"))).toEqual({
      farming: "hidden_permanent",
      familyBusiness: "hidden_permanent",
      financialDeduction: "hidden_expandable",
      deemedRetirementOption: "visible",
    });
  });
});

// ============================================================
// 8-2. 활성 우선 override (9개)
// ============================================================

describe("resolveAssetToggleVisibility — 8-2 활성 우선 override", () => {
  test("cash + farmingCategory='rice_paddy' → farming default 승격 (hidden_perm 무력화)", () => {
    const item = makeItem("cash", { farmingCategory: "farmland" });
    expect(resolveAssetToggleVisibility(item).farming).toBe("default");
  });

  test("cash + familyBusinessCategory='business_land' → familyBusiness default 승격", () => {
    const item = makeItem("cash", { familyBusinessCategory: "business_real_estate" });
    expect(resolveAssetToggleVisibility(item).familyBusiness).toBe("default");
  });

  test("cash + isFinancialAssetForDeduction=true → financialDeduction default 승격", () => {
    const item = makeItem("cash", { isFinancialAssetForDeduction: true });
    expect(resolveAssetToggleVisibility(item).financialDeduction).toBe("default");
  });

  test("real_estate_apartment + farmingCategory='rice_paddy' → farming default 승격", () => {
    const item = makeItem("real_estate_apartment", { farmingCategory: "farmland" });
    expect(resolveAssetToggleVisibility(item).farming).toBe("default");
  });

  test("real_estate_land + deemedCategory='retirement' → deemedRetirementOption visible 승격", () => {
    const item = makeItem("real_estate_land", { deemedCategory: "retirement" });
    expect(resolveAssetToggleVisibility(item).deemedRetirementOption).toBe("visible");
  });

  test("financial + familyBusinessCategory='business_land' → familyBusiness default 승격", () => {
    const item = makeItem("financial", { familyBusinessCategory: "business_real_estate" });
    expect(resolveAssetToggleVisibility(item).familyBusiness).toBe("default");
  });

  test("deposit + isFinancialAssetForDeduction=false → financialDeduction hidden_expandable (user override)", () => {
    // 사용자가 명시적으로 false 설정 시 활성 우선 무력 → 매트릭스 적용
    const item = makeItem("deposit", { isFinancialAssetForDeduction: false });
    expect(resolveAssetToggleVisibility(item).financialDeduction).toBe("hidden_expandable");
  });

  test("other + farmingCategory='fishing_vessel' → farming default 유지", () => {
    const item = makeItem("other", { farmingCategory: "fishing_vessel" });
    expect(resolveAssetToggleVisibility(item).farming).toBe("default");
  });

  test("real_estate_apartment + 모든 활성 우선 동시 발동 → 모두 default", () => {
    const item = makeItem("real_estate_apartment", {
      farmingCategory: "farmland",
      familyBusinessCategory: "business_real_estate",
      isFinancialAssetForDeduction: true,
      deemedCategory: "retirement",
    });
    expect(resolveAssetToggleVisibility(item)).toEqual({
      farming: "default",
      familyBusiness: "default",
      financialDeduction: "default",
      deemedRetirementOption: "visible",
    });
  });
});

// ============================================================
// 8-3. 신탁 override (6개) — H2 드리프트 정정 2026-06-05
//   buggy lock 정정: trustType 미선택·비금전 → financialDeduction hidden_expandable
//   (구버그: trustType 무시하고 무조건 default → 비금전신탁에도 오노출)
// ============================================================

describe("resolveAssetToggleVisibility — 8-3 신탁 override", () => {
  test("cash + deemedCategory='trust' + trustType=undefined → financialDeduction hidden_expandable (H2 정정)", () => {
    // 버그1 정정: 금전신탁(cash_trust)이 아니면 §22 미대상 → hidden_expandable
    const item = makeItem("cash", { deemedCategory: "trust" });
    const result = resolveAssetToggleVisibility(item);
    expect(result.financialDeduction).toBe("hidden_expandable");
  });

  test("cash + deemedCategory='trust' + trustType='cash_trust' → financialDeduction default + §22 노출", () => {
    // §9 금전신탁: §19① "금전신탁재산에 한한다" → §22 대상 → default 유지
    const item = makeItem("cash", { deemedCategory: "trust", trustType: "cash_trust" });
    const result = resolveAssetToggleVisibility(item);
    expect(result.financialDeduction).toBe("default");
  });

  test("real_estate_apartment + trust + trustType='real_estate' → financialDeduction hidden_expandable (H2 정정)", () => {
    // 버그1 정정: 부동산신탁은 §22 미대상 → hidden_expandable
    const item = makeItem("real_estate_apartment", { deemedCategory: "trust", trustType: "real_estate" });
    const result = resolveAssetToggleVisibility(item);
    expect(result.financialDeduction).toBe("hidden_expandable");
  });

  test("real_estate_land + trust + trustType='cash_trust' → financialDeduction default + §22 노출", () => {
    // §9 금전신탁: 카테고리 무관 cash_trust이면 §22 대상 → default
    const item = makeItem("real_estate_land", { deemedCategory: "trust", trustType: "cash_trust" });
    const result = resolveAssetToggleVisibility(item);
    expect(result.financialDeduction).toBe("default");
  });

  test("real_estate_land + trust + trustType='real_estate' → farming/familyBusiness는 매트릭스 그대로 (trust는 §22만 영향)", () => {
    const item = makeItem("real_estate_land", { deemedCategory: "trust", trustType: "real_estate" });
    const result = resolveAssetToggleVisibility(item);
    expect(result.farming).toBe("default"); // real_estate_land 매트릭스
    expect(result.familyBusiness).toBe("default");
    // financialDeduction은 비금전신탁 → hidden_expandable
    expect(result.financialDeduction).toBe("hidden_expandable");
  });

  test("real_estate_apartment + trust(undefined) → farming은 hidden_perm 유지·financialDeduction hidden_expandable (H2 정정)", () => {
    // 버그1 정정: trustType 미선택 → hidden_expandable (구버그: default)
    const item = makeItem("real_estate_apartment", { deemedCategory: "trust" });
    const result = resolveAssetToggleVisibility(item);
    expect(result.farming).toBe("hidden_permanent"); // trust override 무관, 매트릭스 그대로
    expect(result.financialDeduction).toBe("hidden_expandable"); // H2 정정
  });
});

// ============================================================
// 8-4. 회귀 보호 + 복합 시나리오
// ============================================================

describe("resolveAssetToggleVisibility — 회귀 보호", () => {
  test("deemedCategory='insurance' → financialDeduction default + farming·familyBusiness hidden_permanent", () => {
    // insurance: resolveFinancialEligibility=true → 활성 우선 발동 → financialDeduction default.
    // §8 보험금 금전수령권 → farming·familyBusiness 불가 → hidden_permanent (정밀화 D-2).
    const item = makeItem("real_estate_land", { deemedCategory: "insurance" });
    const result = resolveAssetToggleVisibility(item);
    expect(result.financialDeduction).toBe("default");
    expect(result.farming).toBe("hidden_permanent");
    expect(result.familyBusiness).toBe("hidden_permanent");
  });

  test("deemedCategory='retirement' → financialDeduction은 매트릭스 그대로 (retirement는 §22 false)", () => {
    // retirement는 resolveFinancialEligibility=false → 활성 우선 미발동
    // real_estate_land 매트릭스: financialDeduction = hidden_permanent (§19① 부동산 미열거, 정밀화 2026-06-05)
    const item = makeItem("real_estate_land", { deemedCategory: "retirement" });
    const result = resolveAssetToggleVisibility(item);
    expect(result.financialDeduction).toBe("hidden_permanent");
    expect(result.deemedRetirementOption).toBe("visible"); // 활성 우선 발동
  });

  test("listed_stock + familyBusinessCategory='corporate_stock' → §22 일반 토글 hidden_permanent (Phase 1 법령 override)", () => {
    // farming·familyBusiness는 활성 우선 그대로 default.
    // financialDeduction은 §22 법령 override로 hidden_permanent — §22② 전용 토글이 배제 역할 담당.
    const item = makeItem("listed_stock", { familyBusinessCategory: "corporate_stock" });
    expect(resolveAssetToggleVisibility(item)).toEqual({
      farming: "default",
      familyBusiness: "default",
      financialDeduction: "hidden_permanent",
      deemedRetirementOption: "visible",
    });
  });

  test("cash + deemedCategory='retirement' → 매트릭스 그대로 (cash는 모든 토글 hidden_perm)", () => {
    const item = makeItem("cash", { deemedCategory: "retirement" });
    expect(resolveAssetToggleVisibility(item)).toEqual({
      farming: "hidden_permanent",
      familyBusiness: "hidden_permanent",
      financialDeduction: "hidden_permanent",
      deemedRetirementOption: "visible",
    });
  });

  test("real_estate_apartment + deemedCategory='retirement' → deemedRetirementOption visible (활성 우선)", () => {
    const item = makeItem("real_estate_apartment", { deemedCategory: "retirement" });
    expect(resolveAssetToggleVisibility(item).deemedRetirementOption).toBe("visible");
  });
});

// ============================================================
// 8-5-pre. §22 법령 override 자기일관성 anchor (Phase 1)
//   "표시만 숨김, eligible 결과·금액 영향 0"
// ============================================================

describe("resolveAssetToggleVisibility — §22 Phase 1 주식 법령 override 자기일관성", () => {
  test("listed_stock §22② OFF → financialDeduction hidden_permanent (토글 숨김)", () => {
    const item = makeItem("listed_stock");
    expect(resolveAssetToggleVisibility(item).financialDeduction).toBe("hidden_permanent");
  });

  test("unlisted_stock §22② OFF → financialDeduction hidden_permanent (토글 숨김)", () => {
    const item = makeItem("unlisted_stock");
    expect(resolveAssetToggleVisibility(item).financialDeduction).toBe("hidden_permanent");
  });

  test("listed_stock — countHiddenExpandable는 hidden_permanent를 집계하지 않으므로 카운트 불변(0)", () => {
    const visibility = resolveAssetToggleVisibility(makeItem("listed_stock"));
    // hidden_permanent 추가 전후 모두 0 — 펼침 링크 미노출 불변
    expect(countHiddenExpandable(visibility)).toBe(0);
  });

  test("unlisted_stock — countHiddenExpandable 카운트 불변(0)", () => {
    const visibility = resolveAssetToggleVisibility(makeItem("unlisted_stock"));
    expect(countHiddenExpandable(visibility)).toBe(0);
  });

  test("listed_stock + isFinancialAssetForDeduction=true 명시 → 활성 우선 이후 법령 override → hidden_permanent", () => {
    // 주식은 §22 일반 토글을 UI에 표시하지 않으므로 사용자 명시 true도 UI 상 무의미.
    // 법령 override가 활성 우선 블록 다음에 실행 → hidden_permanent 최종 결정.
    const item = makeItem("listed_stock", { isFinancialAssetForDeduction: true });
    expect(resolveAssetToggleVisibility(item).financialDeduction).toBe("hidden_permanent");
  });

  test("unlisted_stock + isFinancialAssetForDeduction=true 명시 → hidden_permanent (법령 override 우선)", () => {
    const item = makeItem("unlisted_stock", { isFinancialAssetForDeduction: true });
    expect(resolveAssetToggleVisibility(item).financialDeduction).toBe("hidden_permanent");
  });
});

// ============================================================
// 8-5. countHiddenExpandable 헬퍼 (9개)
// ============================================================

describe("countHiddenExpandable — 펼침 카운트", () => {
  test.each<[AssetCategory, number]>([
    // financialDeduction hidden_permanent(§19① 부동산 미열거) → countHiddenExpandable 0 (정밀화 2026-06-05)
    ["real_estate_land", 0],
    ["real_estate_building", 0],
    // familyBusiness hidden_expandable 유지, financialDeduction hidden_permanent → 펼침 1
    ["real_estate_apartment", 1], // 가업만 (영농·§22 모두 hidden_perm)
    ["cash", 0], // 모두 hidden_perm — 펼침 링크 미노출
    ["financial", 0], // §22는 default(활성 우선), 가업도 hidden_permanent로 정정 → 펼침 0 (2026-05-29)
    // §22 법령 override: listed_stock·unlisted_stock financialDeduction → hidden_permanent
    // hidden_permanent는 countHiddenExpandable 집계 대상 아님 → 카운트 불변(0)
    ["listed_stock", 0],
    ["unlisted_stock", 0],
    // farming+familyBusiness+financialDeduction 모두 hidden_expandable (정밀화 2026-06-05)
    ["other", 3],
  ])("%s 카테고리 → 펼침 카운트 %i", (category, expected) => {
    const visibility = resolveAssetToggleVisibility(makeItem(category));
    expect(countHiddenExpandable(visibility)).toBe(expected);
  });

  test("deposit 카테고리 → 펼침 카운트 1 (PR2: §22 hidden_expandable, farming·familyBusiness hidden_perm)", () => {
    const visibility = resolveAssetToggleVisibility(makeItem("deposit"));
    expect(countHiddenExpandable(visibility)).toBe(1);
  });
});

// ============================================================
// AT-P 정밀화 보호 anchor (2026-06-05)
// ============================================================

describe("resolveAssetToggleVisibility — AT-P 정밀화 보호 anchor", () => {
  // AT-P1: 부동산 + deemedCategory="trust" + trustType=undefined → financialDeduction hidden_expandable (H2 정정)
  //   기존 "현행 lock" 폐기 — §19① 금전신탁만 §22 대상이므로 미선택은 hidden_expandable
  test("AT-P1: real_estate_land + deemedCategory='trust'(trustType=undefined) → financialDeduction hidden_expandable (H2 드리프트 정정)", () => {
    const item = makeItem("real_estate_land", { deemedCategory: "trust" });
    expect(resolveAssetToggleVisibility(item).financialDeduction).toBe("hidden_expandable");
  });

  test("AT-P1b: real_estate_apartment + deemedCategory='trust'(trustType=undefined) → financialDeduction hidden_expandable (H2 정정)", () => {
    const item = makeItem("real_estate_apartment", { deemedCategory: "trust" });
    expect(resolveAssetToggleVisibility(item).financialDeduction).toBe("hidden_expandable");
  });

  // AT-P2: 부동산 + isFinancialAssetForDeduction=true → financialDeduction default (활성 우선)
  //   MATRIX hidden_permanent 이지만 활성 우선이 override → default 승격
  test("AT-P2: real_estate_land + isFinancialAssetForDeduction=true → financialDeduction default (활성 우선)", () => {
    const item = makeItem("real_estate_land", { isFinancialAssetForDeduction: true });
    expect(resolveAssetToggleVisibility(item).financialDeduction).toBe("default");
  });

  test("AT-P2b: real_estate_building + isFinancialAssetForDeduction=true → default (활성 우선)", () => {
    const item = makeItem("real_estate_building", { isFinancialAssetForDeduction: true });
    expect(resolveAssetToggleVisibility(item).financialDeduction).toBe("default");
  });

  // AT-P3: other + farmingCategory 설정 → farming default (활성 우선, 어선 edge)
  //   MATRIX hidden_expandable → 활성 우선 → default 승격
  test("AT-P3: other + farmingCategory='fishing_vessel' → farming default (활성 우선, 어선 edge)", () => {
    const item = makeItem("other", { farmingCategory: "fishing_vessel" });
    expect(resolveAssetToggleVisibility(item).farming).toBe("default");
  });

  test("AT-P3b: other + familyBusinessCategory 설정 → familyBusiness default (활성 우선)", () => {
    const item = makeItem("other", { familyBusinessCategory: "business_real_estate" });
    expect(resolveAssetToggleVisibility(item).familyBusiness).toBe("default");
  });
});

// ============================================================
// DC. 간주상속재산 deemed 분기 신규 anchor (2026-06-05)
//   계획서: docs/00-pm/deemed-category-toggle-visibility.plan.md §6
// ============================================================

describe("resolveAssetToggleVisibility — DC 간주상속재산 deemed 분기", () => {
  // DC-1: 버그2 정정 — retirement + financial base → financialDeduction hidden_permanent
  //   기존: MATRIX[financial].financialDeduction="default" → 활성 우선 발동 → 오노출
  //   정정: deemed retirement override가 먼저 hidden_permanent 설정 → eligibility=false → 유지
  test("DC-1: retirement + financial base → financialDeduction hidden_permanent (버그2 정정)", () => {
    const item = makeItem("financial", { deemedCategory: "retirement" });
    const result = resolveAssetToggleVisibility(item);
    // §10 퇴직금은 §19① 미열거 → §22 금융재산공제 미대상
    expect(result.financialDeduction).toBe("hidden_permanent");
    // deemedRetirementOption은 visible (§10 퇴직금 라디오)
    expect(result.deemedRetirementOption).toBe("visible");
  });

  // DC-2: 정밀화 — insurance + other base → farming·familyBusiness hidden_permanent
  //   §8 보험금은 금전수령권 → 영농·가업 자산 불가 (base 무관)
  test("DC-2: insurance + other base → farming·familyBusiness hidden_permanent (정밀화)", () => {
    const item = makeItem("other", { deemedCategory: "insurance" });
    const result = resolveAssetToggleVisibility(item);
    // 기존 MATRIX[other]: farming=hidden_expandable, familyBusiness=hidden_expandable
    // deemed insurance override → hidden_permanent
    expect(result.farming).toBe("hidden_permanent");
    expect(result.familyBusiness).toBe("hidden_permanent");
    // 금융공제는 insurance(resolveFinancialEligibility=true) → 활성 우선 → default
    expect(result.financialDeduction).toBe("default");
  });

  // DC-3: 신탁 + security(증권신탁) → financialDeduction hidden_expandable
  //   §19① 금전신탁에 한정 — 증권신탁은 §22 미대상
  test("DC-3: trust + security(증권신탁) → financialDeduction hidden_expandable", () => {
    const item = makeItem("financial", { deemedCategory: "trust", trustType: "security" });
    const result = resolveAssetToggleVisibility(item);
    expect(result.financialDeduction).toBe("hidden_expandable");
  });

  // DC-4: 활성 우선 보호 — trust+real_estate + isFinancialAssetForDeduction=true 명시 → default 승격
  //   deemed trust 분기는 hidden_expandable 설정 → 활성 우선(resolveFinancialEligibility)이 default로 승격
  //   resolveFinancialEligibility: isFinancialAssetForDeduction=true 명시 → true → default
  test("DC-4: trust+real_estate + isFinancialAssetForDeduction=true 명시 → financialDeduction default (활성 우선 보호)", () => {
    const item = makeItem("real_estate_apartment", {
      deemedCategory: "trust",
      trustType: "real_estate",
      isFinancialAssetForDeduction: true,
    });
    const result = resolveAssetToggleVisibility(item);
    // deemed 분기: hidden_expandable → 활성 우선: isFinancialAssetForDeduction=true → default 승격
    expect(result.financialDeduction).toBe("default");
  });

  // DC-5: 활성 우선 보호 — insurance + farmingCategory 설정 → farming default 승격
  //   deemed insurance 분기는 farming=hidden_permanent → 활성 우선(farmingCategory 명시)이 default로 승격
  test("DC-5: insurance + farmingCategory 설정(legacy) → farming default (활성 우선 보호)", () => {
    const item = makeItem("real_estate_land", {
      deemedCategory: "insurance",
      farmingCategory: "farmland",
    });
    const result = resolveAssetToggleVisibility(item);
    // deemed 분기: farming=hidden_permanent → 활성 우선: farmingCategory≠undefined → default 승격
    expect(result.farming).toBe("default");
    // familyBusiness는 명시 없음 → deemed override 그대로 hidden_permanent
    expect(result.familyBusiness).toBe("hidden_permanent");
    // financialDeduction: insurance → resolveFinancialEligibility=true → default
    expect(result.financialDeduction).toBe("default");
  });
});
