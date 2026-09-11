/**
 * G2(엔진 단일소스 위임) — «UI 표시값 == 엔진 값» 고정.
 *
 * 대장: docs/reviews/inheritance-gift-ui-review-2026-09.md
 * 이 파일은 엔진 헬퍼 계약만 본다(.test.ts = node). 「컴포넌트가 그 헬퍼를 부르는가」는
 * 짝 파일 `ig-ui-g2-single-source-render.anchor.test.tsx`가 증명한다
 * (memory feedback_library_anchor_does_not_prove_component_uses_it).
 */
import { describe, it, expect } from "vitest";
import { calcFuneralExpenseDeduction } from "@/lib/tax-engine/inheritance-gift-common";
import { computeSecuredClaim } from "@/lib/tax-engine/valuation/resolve-estate-item-value";
import { getShareThresholdByDate } from "@/lib/tax-engine/deductions/family-business-autoderive";
import { familyBusinessCap } from "@/lib/tax-engine/deductions/family-business";
import { resolveS20Params } from "@/lib/tax-engine/deductions/personal-deduction-calc";
import { ANCILLARY_LAND_RATIO } from "@/lib/tax-engine/deductions/inheritance-cohabit-helpers";
import { ratePercent } from "@/lib/tax-engine/tax-utils";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

describe("IG-033·067 · 장례비는 상한뿐 아니라 «하한»도 있다 (상증령 §9②1호)", () => {
  it("S-1 지출 3백만 → 500만 인정 (하한). 상한만 적용하던 UI는 300만을 보였다", () => {
    const r = calcFuneralExpenseDeduction(3_000_000, 0);
    expect(r.deduction).toBe(5_000_000);
    expect(r.mealApplied).toBe(5_000_000);
  });

  it("S-2 0원이어도 500만이 인정된다 — 엔진 debtItems 경로가 무조건 이 헬퍼를 쓴다", () => {
    expect(calcFuneralExpenseDeduction(0, 0).deduction).toBe(5_000_000);
  });

  it("S-3 식대 상한 1천만 · 봉안 상한 500만은 별도로 적용된다 (§9②1호·2호)", () => {
    const r = calcFuneralExpenseDeduction(20_000_000, 7_000_000);
    expect(r.mealApplied).toBe(10_000_000);
    expect(r.bonganApplied).toBe(5_000_000);
    expect(r.deduction).toBe(15_000_000);
  });

  it("S-4 분리 값의 합은 항상 deduction과 같다 (UI가 세 값을 따로 그린다)", () => {
    for (const [m, b] of [[0, 0], [3_000_000, 0], [8_000_000, 7_000_000], [20_000_000, 2_000_000]]) {
      const r = calcFuneralExpenseDeduction(m, b);
      expect(r.mealApplied + r.bonganApplied).toBe(r.deduction);
    }
  });
});

describe("IG-088 · §66 담보채권액은 신용보증기관 보증액을 뺀다", () => {
  const item = (o: Partial<EstateItem>) => ({ id: "i", category: "real_estate_land", name: "토지", ...o }) as EstateItem;

  it("S-5 보증액이 저당분에서 차감된다 — 로컬 재구현(단순 합)과 갈린다", () => {
    const it = item({ mortgageAmount: 300_000_000, creditGuaranteeAmount: 100_000_000, leaseDeposit: 50_000_000 });
    expect(computeSecuredClaim(it)).toBe(250_000_000); // (3억−1억) + 5천만
    // 구별력: 종전 로컬 산식은 3.5억이었다
    expect(computeSecuredClaim(it)).not.toBe(350_000_000);
  });

  it("S-6 보증액이 저당분을 초과해도 음수가 되지 않는다 (임대보증금은 그대로)", () => {
    expect(computeSecuredClaim(item({ mortgageAmount: 50_000_000, creditGuaranteeAmount: 200_000_000, leaseDeposit: 30_000_000 }))).toBe(30_000_000);
  });
});

describe("IG-049 · 가업 지분 임계는 «상속개시일 시기별»이다", () => {
  it("S-7 UI가 고정하던 40/20은 2023.1.1.~ 값일 뿐이다", () => {
    expect(ratePercent(getShareThresholdByDate("2024-05-01", false))).toBe(40);
    expect(ratePercent(getShareThresholdByDate("2024-05-01", true))).toBe(20);
    // 2011~2022 — 하드코딩 40/20과 «다르다»(구별력)
    expect(ratePercent(getShareThresholdByDate("2015-05-01", false))).toBe(50);
    expect(ratePercent(getShareThresholdByDate("2015-05-01", true))).toBe(30);
    // 2010.12.31 이전
    expect(ratePercent(getShareThresholdByDate("2009-05-01", true))).toBe(40);
  });
});

describe("IG-034 · 가업 공제한도는 상속개시일 tier에 따라 «구간 경계»까지 다르다", () => {
  it("S-8 같은 영위연수라도 시기에 따라 한도가 다르다 — deathDate 미전달은 현행으로 떨어진다", () => {
    expect(familyBusinessCap(15, "2024-05-01")).toBe(30_000_000_000); // 현행 10~20 → 300억
    expect(familyBusinessCap(15, "2020-05-01")).toBe(20_000_000_000); // 2018~2022 10~20 → 200억
    expect(familyBusinessCap(15, "2016-05-01")).toBe(30_000_000_000); // 2014~2017은 15년이 경계 → 300억
  });

  it("S-9 «금액으로 호를 역산할 수 없다» — 300억이 1호일 수도 2호일 수도 있다", () => {
    expect(familyBusinessCap(15, "2024-05-01")).toBe(familyBusinessCap(15, "2016-05-01")); // 300억 동일
    // 그러나 구간은 다르다(현행 10~20 = 1호 / 2014~2017 15~20 = 2호) — UI가 호 라벨을 재현하면 틀린다
    expect(familyBusinessCap(12, "2016-05-01")).toBe(20_000_000_000); // 2014~2017 10~15 → 200억
    expect(familyBusinessCap(12, "2024-05-01")).toBe(30_000_000_000); // 현행 10~20 → 300억
  });
});

describe("IG-149·153 · §20 인적공제 단가·연령은 2016-01-01 tier로 갈린다", () => {
  it("S-10 2016 前 상속은 자녀 3,000만·연 500만·미성년 20세·연로자 60세", () => {
    const p = resolveS20Params("2015-06-01");
    expect(p).toMatchObject({ childAmount: 30_000_000, perYearAmount: 5_000_000, minorAgeLimit: 20, elderAgeThreshold: 60, elderAmount: 30_000_000 });
  });

  it("S-11 현행은 5,000만·1,000만·19세·65세 — UI가 하드코딩하던 값", () => {
    const p = resolveS20Params("2024-06-01");
    expect(p).toMatchObject({ childAmount: 50_000_000, perYearAmount: 10_000_000, minorAgeLimit: 19, elderAgeThreshold: 65 });
  });
});

describe("IG-105 · §154⑦ 지역별 배율 단일 소스", () => {
  it("S-12 엔진 상수가 export되어 UI가 재선언할 필요가 없다", () => {
    expect(ANCILLARY_LAND_RATIO).toEqual({
      metro_residential_commercial_industrial: 3,
      metro_green: 5,
      non_metro: 5,
      other: 10,
    });
  });
});
