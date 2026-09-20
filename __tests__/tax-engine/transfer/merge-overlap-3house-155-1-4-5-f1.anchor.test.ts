/**
 * F-1 — §155①(일시적 2주택)과 §155④·⑤(동거봉양·혼인 합가)가 **겹쳐** 3주택이 된 세대.
 * 계획서: docs/00-pm/transfer-review-4-defects.plan.md §10 F-1 · §24.
 *
 * 국세청 해석(본문 직독):
 * - 사전-2025-법규재산-1240(2026.3.16) — 일시적 2주택 상태에서 동거봉양 합가로 3주택이 된 경우
 *   「…「소득세법 시행령」 제155조제1항 및 제4항에 따라 이를 1세대1주택으로 보아 … 제154조제1항을 적용」
 * - 서면-2022-법규재산-5124(2025.6.18) — 혼인 합가 후 신규주택 취득으로 3주택
 *   「…제155조제1항 및 제5항의 규정에 의하여 1세대1주택 비과세를 적용받을 수 있는 것」
 * - 사전-2021-법령해석재산-1719(2021.12.22) — 중첩으로 §154①이 적용되는 주택에 대해
 *   「…제154조제1항의 요건을 모두 충족하는 경우에는 … 제167조의3제1항제13호에 따라 중과세율을
 *   적용하지 아니하며 장기보유특별공제도 적용할 수 있는 것」(중첩 조합은 §155①+⑳)
 *
 * 시기 축: 13호는 2021.2.17. 신설이고, 그 전에는 같은 중첩에 대해 국세청이 「비과세는 되지만
 * 세율 +20%p·장특 배제」라고 회신했다(사전-2019-법령해석재산-0368 · 서면-2020-부동산-2226 전재).
 * ⇒ **비과세 의제는 시기 무관, 중과 배제는 2021.2.17. 이후 양도분**.
 *
 * 수정 전 실측(fallback 세율 · 조정지역 · 3주택 · 동거봉양 합가 2022-01-01 · 2026-08-01 양도):
 *
 * | 입력 | 수정 전 | 기대 |
 * |---|---|---|
 * | 8억 중첩 | 354,541,000 (70% 중과) | 0 (비과세) |
 * | 15억 중첩 | 915,403,500 (75% 중과·장특 0) | 22,709,500 = 2주택 합가와 같음 |
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput } from "../_helpers/mock-rates";
import { determineMultiHouseSurcharge } from "@/lib/tax-engine/multi-house-surcharge";
import {
  defaultRules,
  makeHouse,
  makeInput,
  mockRegulatedHistory,
  suspensionNone,
} from "../_helpers/multi-house-mock";

const house = (id: string, acq: string) => ({
  id,
  acquisitionDate: new Date(acq),
  officialPrice: 300_000_000,
  region: "capital" as const,
  regionCode: "11680",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
});

/**
 * 양도주택(2015 취득·거주 48개월) + 종전주택(2012) + 신규주택(2024-02-01) = 3주택.
 * 동거봉양 합가 2022-01-01 · 먼저 양도 · 신규주택 취득일부터 3년 이내(2026-08-01) 양도.
 */
const overlap = (extra: Partial<TransferTaxInput> = {}): TransferTaxInput =>
  baseTransferInput({
    transferPrice: 800_000_000,
    acquisitionDate: new Date("2015-01-01"),
    transferDate: new Date("2026-08-01"),
    isRegulatedArea: true,
    residencePeriodMonths: 48,
    householdHousingCount: 3,
    houses: [
      house("selling", "2015-01-01"),
      house("h2", "2012-01-01"),
      house("h3", "2024-02-01"),
    ] as TransferTaxInput["houses"],
    sellingHouseId: "selling",
    parentalCareMerge: { mergeDate: new Date("2022-01-01") },
    isFirstTransferredInMerge: true,
    temporaryTwoHouse: {
      previousAcquisitionDate: new Date("2012-01-01"),
      newAcquisitionDate: new Date("2024-02-01"),
    },
    ...extra,
  });

/** 같은 조건의 2주택 합가(중첩 없음) — 13호 배제가 서면 같은 값이어야 한다. */
const twoHouseMerge = (extra: Partial<TransferTaxInput> = {}): TransferTaxInput =>
  overlap({
    householdHousingCount: 2,
    houses: [house("selling", "2015-01-01"), house("h2", "2012-01-01")] as TransferTaxInput["houses"],
    temporaryTwoHouse: undefined,
    ...extra,
  });

const MARRIAGE = { parentalCareMerge: undefined, marriageMerge: { marriageDate: new Date("2022-01-01") } };

const calc = (i: TransferTaxInput) => calculateTransferTax(i, loadFallbackTransferRates(i.transferDate));
const reasons = (i: TransferTaxInput) =>
  (calc(i).multiHouseSurchargeEvaluation?.exclusionReasons ?? []).map((e) => e.type);

describe("F-1 중첩 의제 — 비과세 축(§154① 적용)", () => {
  it("F1-1 8억 · 동거봉양 중첩 → 비과세 0 (종전 354,541,000)", () => {
    const r = calc(overlap());
    expect(r.totalTax).toBe(0);
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toContain("§155①");
  });

  it("F1-2 8억 · 혼인 중첩도 같다", () => {
    const r = calc(overlap(MARRIAGE));
    expect(r.totalTax).toBe(0);
    expect(r.isExempt).toBe(true);
  });

  it("F1-3 12억 초과는 고가주택 부분과세 — 2주택 합가와 같은 세액·장특", () => {
    const hv = { transferPrice: 1_500_000_000 };
    const r = calc(overlap(hv));
    const two = calc(twoHouseMerge(hv));
    expect(r.totalTax).toBe(two.totalTax);
    expect(r.totalTax).toBe(22_709_500); // 종전 915,403,500
    expect(r.longTermHoldingDeduction).toBe(two.longTermHoldingDeduction);
    expect(r.longTermHoldingDeduction).toBeGreaterThan(0); // 중과 배제 → 장특 적용
  });
});

describe("F-1 중첩 의제 — 중과 배제(§167의3①13호)", () => {
  it("F1-4 15억 중첩 → 13호 배제 사유가 남고 「중첩 미성립」 한계 경고는 사라진다", () => {
    const r = calc(overlap({ transferPrice: 1_500_000_000 }));
    expect((r.multiHouseSurchargeEvaluation?.exclusionReasons ?? []).map((e) => e.type)).toContain(
      "parental_care_merge",
    );
    expect(
      (r.multiHouseSurchargeEvaluation?.warnings ?? []).some((w) => w.includes("성립하지 않았습니다")),
    ).toBe(false);
    expect(reasons(overlap({ transferPrice: 1_500_000_000, ...MARRIAGE }))).toContain("marriage_merge");
  });

  it("F1-5 §154① 요건(조정지역 거주 2년) 미충족이면 배제 없음 — 13호 ② 요소", () => {
    // 2018년 조정지역 취득 + 거주 0 → §154① 미충족(2017.8.3 이후 취득분 거주요건).
    const r = calc(
      overlap({
        transferPrice: 1_500_000_000,
        acquisitionDate: new Date("2018-01-01"),
        residencePeriodMonths: 0,
        wasRegulatedAtAcquisition: true,
      }),
    );
    expect(r.isExempt).toBe(false);
    expect(r.isPartialExempt).toBe(false);
    expect(r.totalTax).toBe(915_403_500);
  });

  it("F1-6 13호 시행일(2021.2.17) — 그 전 양도분은 중과 배제가 없다", () => {
    // 세액 경로로는 관측할 수 없다 — 2021년 fallback 세율표에 주택 수 산정 규칙이 없어
    // 정밀 중과 판정(STEP 0.5) 자체가 돌지 않는다. 그래서 중과 엔진을 직접 부른다.
    const houses = [
      makeHouse("selling", { acquisitionDate: new Date("2015-01-01"), regionCode: "11680" }),
      makeHouse("h2", { acquisitionDate: new Date("2012-01-01"), regionCode: "11680" }),
      makeHouse("h3", { acquisitionDate: new Date("2019-06-01"), regionCode: "11680" }),
    ];
    const run = (transferDate: string) =>
      determineMultiHouseSurcharge(
        makeInput(houses, {
          transferDate: new Date(transferDate),
          sellingHouseId: "selling",
          deemedOneHouseBy155: "parental_care_merge_overlap",
          parentalCareMerge: { mergeDate: new Date("2019-01-01") },
          sellingHouseMeetsOneHouseRequirements: true,
        }),
        defaultRules,
        mockRegulatedHistory,
        suspensionNone,
        true,
      );
    const before = run("2021-02-16");
    expect(before.surchargeApplicable).toBe(true);
    expect(before.exclusionReasons.map((e) => e.type)).not.toContain("parental_care_merge");
    const after = run("2021-02-17");
    expect(after.surchargeApplicable).toBe(false);
    expect(after.exclusionReasons.map((e) => e.type)).toContain("parental_care_merge");
    expect(after.exclusionReasons[0].detail).toContain("§167의3①13호");
  });

  it("F1-6b 3주택 중첩은 §154① 요건을 면제받지 못한다 — 구 5·6호 완화는 2주택 축 전용", () => {
    const houses = [
      makeHouse("selling", { acquisitionDate: new Date("2015-01-01"), regionCode: "11680" }),
      makeHouse("h2", { acquisitionDate: new Date("2012-01-01"), regionCode: "11680" }),
      makeHouse("h3", { acquisitionDate: new Date("2019-06-01"), regionCode: "11680" }),
    ];
    const r = determineMultiHouseSurcharge(
      makeInput(houses, {
        transferDate: new Date("2022-01-01"), // 15호 §154① 게이트(2023.2.28) 전
        sellingHouseId: "selling",
        deemedOneHouseBy155: "parental_care_merge_overlap",
        parentalCareMerge: { mergeDate: new Date("2019-01-01") },
        sellingHouseMeetsOneHouseRequirements: false,
      }),
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );
    expect(r.surchargeApplicable).toBe(true);
    expect(r.exclusionReasons.map((e) => e.type)).not.toContain("parental_care_merge");
  });
});

describe("F-1 대조 — 중첩이 성립하지 않는 경우는 종전대로", () => {
  it("F1-7 일시적 2주택 입력이 없으면 3주택 중과 유지 + 한계 경고 (D9-A1과 같은 값)", () => {
    const r = calc(overlap({ temporaryTwoHouse: undefined }));
    expect(r.totalTax).toBe(354_541_000);
    expect(r.multiHouseSurchargeEvaluation?.warnings.some((w) => w.includes("합가 특례"))).toBe(true);
  });

  it("F1-8 신규주택 취득일부터 3년이 지났으면 불성립", () => {
    const r = calc(
      overlap({
        temporaryTwoHouse: {
          previousAcquisitionDate: new Date("2012-01-01"),
          newAcquisitionDate: new Date("2023-07-31"), // +3년 = 2026-07-31 < 양도 2026-08-01
        },
      }),
    );
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBe(354_541_000);
  });

  it("F1-9 합가 후 취득한 주택을 양도하면 불성립(§155④⑤ 문언)", () => {
    const r = calc(overlap({ acquisitionDate: new Date("2023-01-01") }));
    expect(r.isExempt).toBe(false);
  });

  it("F1-10 4주택은 중첩 대상이 아니다 — 국세청도 4주택 인정 사례가 없다", () => {
    const r = calc(
      overlap({
        householdHousingCount: 4,
        houses: [
          house("selling", "2015-01-01"),
          house("h2", "2012-01-01"),
          house("h3", "2024-02-01"),
          house("h4", "2013-01-01"),
        ] as TransferTaxInput["houses"],
      }),
    );
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBeGreaterThan(0);
  });

  it("F1-10b 주택 3 + 분양권 1(=4개)도 대상이 아니다 — 분양권은 주택 수에 산입된다", () => {
    const houses = [
      makeHouse("selling", { acquisitionDate: new Date("2015-01-01"), regionCode: "11680" }),
      makeHouse("h2", { acquisitionDate: new Date("2012-01-01"), regionCode: "11680" }),
      makeHouse("h3", { acquisitionDate: new Date("2024-02-01"), regionCode: "11680" }),
    ];
    const run = (rights: { id: string }[]) =>
      determineMultiHouseSurcharge(
        makeInput(houses, {
          transferDate: new Date("2026-08-01"),
          sellingHouseId: "selling",
          deemedOneHouseBy155: "parental_care_merge_overlap",
          parentalCareMerge: { mergeDate: new Date("2022-01-01") },
          sellingHouseMeetsOneHouseRequirements: true,
          presaleRights: rights.map((r) => ({
            id: r.id,
            type: "presale_right" as const,
            acquisitionDate: new Date("2024-01-01"),
            region: "capital" as const,
          })),
        }),
        defaultRules,
        mockRegulatedHistory,
        suspensionNone,
        true,
      );
    expect(run([]).surchargeApplicable).toBe(false); // 3개 — 배제(긍정 짝)
    const four = run([{ id: "p1" }]);
    expect(four.effectiveHouseCount).toBe(4);
    expect(four.surchargeApplicable).toBe(true);
  });

  it("F1-11 「먼저 양도」 선언이 없으면 불성립", () => {
    expect(calc(overlap({ isFirstTransferredInMerge: false })).isExempt).toBe(false);
  });
});

describe("F-1 근거 고지", () => {
  it("F1-12 중첩을 적용하면 국세청 해석 근거와 한계를 경고로 남긴다", () => {
    const w = calc(overlap()).warnings ?? [];
    expect(w.some((x) => x.includes("사전-2025-법규재산-1240") || x.includes("사전-2021-법령해석재산-1719"))).toBe(true);
  });
});
