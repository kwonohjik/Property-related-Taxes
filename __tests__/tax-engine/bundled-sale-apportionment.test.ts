/**
 * 일괄양도 안분 엔진 테스트
 *
 * 근거: 소득세법 시행령 §166 ⑥
 * PDF: 2023 양도·상속·증여세 이론 및 계산실무 p387~391
 */

import { describe, it, expect } from "vitest";
import { apportionBundledSale } from "@/lib/tax-engine/bundled-sale-apportionment";
import type { BundledAssetInput } from "@/lib/tax-engine/bundled-sale-apportionment";
import {
  TOTAL_SALE_PRICE,
  HOUSE_STD_AT_TRANSFER,
  LAND_STD_AT_TRANSFER,
  ANS_HOUSE_ALLOCATED_SALE,
  ANS_LAND_ALLOCATED_SALE,
  INHERIT_HOUSE_PRICE,
  INHERIT_LAND_SUPPLEMENTARY,
  HOUSE_INHERIT_EXPENSE,
  LAND_INHERIT_EXPENSE,
} from "../fixtures/pdf-bundled-farmland";

describe("apportionBundledSale — PDF p387~391 상속주택+농지 일괄양도", () => {
  it("2자산 양도가액 기준시가 비율 안분 — 말단 잔여값 보정", () => {
    const r = apportionBundledSale({
      totalSalePrice: TOTAL_SALE_PRICE,
      assets: [
        {
          assetId: "house",
          assetLabel: "거주 주택 △△번지",
          assetKind: "housing",
          standardPriceAtTransfer: HOUSE_STD_AT_TRANSFER,
        },
        {
          assetId: "land",
          assetLabel: "농지(밭) 54번지",
          assetKind: "land",
          standardPriceAtTransfer: LAND_STD_AT_TRANSFER,
        },
      ],
    });

    expect(r.apportioned[0].allocatedSalePrice).toBe(ANS_HOUSE_ALLOCATED_SALE);
    expect(r.apportioned[1].allocatedSalePrice).toBe(ANS_LAND_ALLOCATED_SALE);
    // 합계 무결성
    expect(
      r.apportioned[0].allocatedSalePrice + r.apportioned[1].allocatedSalePrice,
    ).toBe(TOTAL_SALE_PRICE);

    // 법적 근거
    expect(r.legalBasis).toBe("소득세법 시행령 §166 ⑥");
    expect(r.residualAbsorbedBy).toBe("land");
    expect(r.warnings).toEqual([]);
    expect(r.totalStandardAtTransfer).toBe(HOUSE_STD_AT_TRANSFER + LAND_STD_AT_TRANSFER);
  });

  it("fixedAcquisitionPrice(상속 보충적평가액) 지정 시 취득가액 안분 건너뜀", () => {
    const r = apportionBundledSale({
      totalSalePrice: TOTAL_SALE_PRICE,
      assets: [
        {
          assetId: "house",
          assetLabel: "주택",
          assetKind: "housing",
          standardPriceAtTransfer: HOUSE_STD_AT_TRANSFER,
          fixedAcquisitionPrice: INHERIT_HOUSE_PRICE,
          directExpenses: HOUSE_INHERIT_EXPENSE,
        },
        {
          assetId: "land",
          assetLabel: "농지",
          assetKind: "land",
          standardPriceAtTransfer: LAND_STD_AT_TRANSFER,
          fixedAcquisitionPrice: INHERIT_LAND_SUPPLEMENTARY,
          directExpenses: LAND_INHERIT_EXPENSE,
        },
      ],
    });

    // 취득가액: fixed 그대로
    expect(r.apportioned[0].allocatedAcquisitionPrice).toBe(INHERIT_HOUSE_PRICE);
    expect(r.apportioned[1].allocatedAcquisitionPrice).toBe(INHERIT_LAND_SUPPLEMENTARY);

    // 직접경비: 공통경비 없으므로 그대로
    expect(r.apportioned[0].allocatedExpenses).toBe(HOUSE_INHERIT_EXPENSE);
    expect(r.apportioned[1].allocatedExpenses).toBe(LAND_INHERIT_EXPENSE);
  });

  it("totalAcquisitionPrice 지정 + fixed 없음 → 취득시 기준시가 비율 안분", () => {
    const r = apportionBundledSale({
      totalSalePrice: 1_000_000_000,
      totalAcquisitionPrice: 500_000_000,
      assets: [
        {
          assetId: "A",
          assetLabel: "A",
          assetKind: "land",
          standardPriceAtTransfer: 300_000_000,
          standardPriceAtAcquisition: 200_000_000,
        },
        {
          assetId: "B",
          assetLabel: "B",
          assetKind: "land",
          standardPriceAtTransfer: 700_000_000,
          standardPriceAtAcquisition: 300_000_000,
        },
      ],
    });

    // 취득시 기준시가 비율: 200 : 300 = 2/5 : 3/5
    // A = floor(500,000,000 * 200,000,000 / 500,000,000) = 200,000,000
    // B = 500,000,000 - 200,000,000 = 300,000,000 (말단)
    expect(r.apportioned[0].allocatedAcquisitionPrice).toBe(200_000_000);
    expect(r.apportioned[1].allocatedAcquisitionPrice).toBe(300_000_000);
  });

  it("공통경비 있으면 양도가 비율 키로 안분 + 직접경비 합산", () => {
    const r = apportionBundledSale({
      totalSalePrice: 1_000_000_000,
      commonExpenses: 10_000_000,
      assets: [
        {
          assetId: "X",
          assetLabel: "X",
          assetKind: "housing",
          standardPriceAtTransfer: 400_000_000,
          directExpenses: 1_000_000,
        },
        {
          assetId: "Y",
          assetLabel: "Y",
          assetKind: "land",
          standardPriceAtTransfer: 600_000_000,
          directExpenses: 2_000_000,
        },
      ],
    });

    // 공통경비 안분: 10,000,000 × 400/1000 = 4,000,000 / 나머지 6,000,000
    // 직접경비 합산: X = 4,000,000 + 1,000,000 / Y = 6,000,000 + 2,000,000
    expect(r.apportioned[0].allocatedExpenses).toBe(5_000_000);
    expect(r.apportioned[1].allocatedExpenses).toBe(8_000_000);
  });

  it("3자산: 말단에만 잔여값 흡수, 합계 무결성 보장", () => {
    // 의도적으로 나눠지지 않는 비율 설정
    const total = 1_000_000_007; // 3으로 나누어 떨어지지 않음
    const assets: BundledAssetInput[] = [
      { assetId: "A", assetLabel: "A", assetKind: "housing", standardPriceAtTransfer: 100 },
      { assetId: "B", assetLabel: "B", assetKind: "land", standardPriceAtTransfer: 100 },
      { assetId: "C", assetLabel: "C", assetKind: "building", standardPriceAtTransfer: 100 },
    ];
    const r = apportionBundledSale({ totalSalePrice: total, assets });

    const sum = r.apportioned.reduce((s, a) => s + a.allocatedSalePrice, 0);
    expect(sum).toBe(total);
    // 말단(C)이 잔여값 흡수
    expect(r.residualAbsorbedBy).toBe("C");
  });

  it("자산 1건이면 에러 (최소 2건 요구)", () => {
    expect(() =>
      apportionBundledSale({
        totalSalePrice: 100_000_000,
        assets: [
          {
            assetId: "solo",
            assetLabel: "solo",
            assetKind: "housing",
            standardPriceAtTransfer: 100_000_000,
          },
        ],
      }),
    ).toThrow(/최소 2건/);
  });

  it("총 양도가 0 이하면 에러", () => {
    expect(() =>
      apportionBundledSale({
        totalSalePrice: 0,
        assets: [
          {
            assetId: "a",
            assetLabel: "a",
            assetKind: "housing",
            standardPriceAtTransfer: 1,
          },
          {
            assetId: "b",
            assetLabel: "b",
            assetKind: "housing",
            standardPriceAtTransfer: 1,
          },
        ],
      }),
    ).toThrow(/총 양도가액/);
  });

  it("자산 중 1건의 기준시가가 0이면 경고 발생", () => {
    const r = apportionBundledSale({
      totalSalePrice: 100_000_000,
      assets: [
        {
          assetId: "zero",
          assetLabel: "제로자산",
          assetKind: "land",
          standardPriceAtTransfer: 0,
        },
        {
          assetId: "main",
          assetLabel: "메인",
          assetKind: "housing",
          standardPriceAtTransfer: 100_000_000,
        },
      ],
    });
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings[0]).toContain("제로자산");
    // 제로자산은 0 받음, 메인은 말단 잔여값으로 전액
    expect(r.apportioned[0].allocatedSalePrice).toBe(0);
    expect(r.apportioned[1].allocatedSalePrice).toBe(100_000_000);
  });

  it("모든 자산 기준시가 합이 0이면 에러", () => {
    expect(() =>
      apportionBundledSale({
        totalSalePrice: 100_000_000,
        assets: [
          { assetId: "a", assetLabel: "a", assetKind: "land", standardPriceAtTransfer: 0 },
          { assetId: "b", assetLabel: "b", assetKind: "land", standardPriceAtTransfer: 0 },
        ],
      }),
    ).toThrow(/안분 불가/);
  });

  it("displayRatio 표시용 소수 4자리", () => {
    const r = apportionBundledSale({
      totalSalePrice: TOTAL_SALE_PRICE,
      assets: [
        {
          assetId: "h",
          assetLabel: "주택",
          assetKind: "housing",
          standardPriceAtTransfer: HOUSE_STD_AT_TRANSFER,
        },
        {
          assetId: "l",
          assetLabel: "농지",
          assetKind: "land",
          standardPriceAtTransfer: LAND_STD_AT_TRANSFER,
        },
      ],
    });
    // displayRatio = allocatedSalePrice / totalSalePrice
    // 주택 ANS_HOUSE_ALLOCATED_SALE / TOTAL_SALE_PRICE ≈ 0.5556
    expect(r.apportioned[0].displayRatio).toBeGreaterThan(0.55);
    expect(r.apportioned[0].displayRatio).toBeLessThan(0.56);
    // 두 비율 합은 1에 근접 (반올림 오차 허용)
    const sumRatio = r.apportioned[0].displayRatio + r.apportioned[1].displayRatio;
    expect(Math.abs(sumRatio - 1)).toBeLessThan(0.001);
  });
});

// ─── §166⑥ 본문 — fixedSalePrice (계약서 구분 기재) ───────────────

describe("apportionBundledSale — §166⑥ 본문 fixedSalePrice", () => {
  const baseHouse: BundledAssetInput = {
    assetId: "house",
    assetLabel: "주택",
    assetKind: "housing",
    standardPriceAtTransfer: 100_000_000,
  };
  const baseLand: BundledAssetInput = {
    assetId: "land",
    assetLabel: "농지",
    assetKind: "land",
    standardPriceAtTransfer: 50_000_000,
  };

  it("모두 actual: 안분 분모 0이어도 OK, 합계 = totalSalePrice", () => {
    const r = apportionBundledSale({
      totalSalePrice: 300_000_000,
      assets: [
        { ...baseHouse, standardPriceAtTransfer: 0, fixedSalePrice: 200_000_000 },
        { ...baseLand, standardPriceAtTransfer: 0, fixedSalePrice: 100_000_000 },
      ],
    });
    expect(r.apportioned[0].allocatedSalePrice).toBe(200_000_000);
    expect(r.apportioned[1].allocatedSalePrice).toBe(100_000_000);
    expect(r.apportioned[0].saleMode).toBe("actual");
    expect(r.apportioned[1].saleMode).toBe("actual");
    expect(r.residualAbsorbedBy).toBeNull();
    expect(r.totalStandardAtTransfer).toBe(0);
  });

  it("주+컴패니언 모두 actual: 합계가 totalSalePrice와 일치", () => {
    const r = apportionBundledSale({
      totalSalePrice: 500_000_000,
      assets: [
        { ...baseHouse, fixedSalePrice: 350_000_000 },
        { ...baseLand, fixedSalePrice: 150_000_000 },
      ],
    });
    expect(
      r.apportioned[0].allocatedSalePrice + r.apportioned[1].allocatedSalePrice,
    ).toBe(500_000_000);
  });

  it("actual 합 > totalSalePrice → throw", () => {
    expect(() =>
      apportionBundledSale({
        totalSalePrice: 200_000_000,
        assets: [
          { ...baseHouse, fixedSalePrice: 150_000_000 },
          { ...baseLand, fixedSalePrice: 100_000_000 },
        ],
      }),
    ).toThrow(/초과/);
  });

  it("일부 actual + 일부 apportioned: 잔여를 variable에 안분", () => {
    // total 300M, fixed 100M(주택) → 잔여 200M, variable 농지 단독 → 200M 흡수
    const r = apportionBundledSale({
      totalSalePrice: 300_000_000,
      assets: [
        { ...baseHouse, fixedSalePrice: 100_000_000 },
        baseLand,
      ],
    });
    expect(r.apportioned[0].allocatedSalePrice).toBe(100_000_000);
    expect(r.apportioned[0].saleMode).toBe("actual");
    expect(r.apportioned[1].allocatedSalePrice).toBe(200_000_000);
    expect(r.apportioned[1].saleMode).toBe("apportioned");
    expect(r.residualAbsorbedBy).toBe("land");
  });

  it("일부 actual + 다수 apportioned: 잔여를 기준시가 비율로 안분", () => {
    // total 600M, 주택 actual 200M → 잔여 400M
    // 농지A(std 100M) + 농지B(std 100M) → 각 200M 안분
    const r = apportionBundledSale({
      totalSalePrice: 600_000_000,
      assets: [
        { ...baseHouse, fixedSalePrice: 200_000_000 },
        { assetId: "land-a", assetLabel: "농지A", assetKind: "land", standardPriceAtTransfer: 100_000_000 },
        { assetId: "land-b", assetLabel: "농지B", assetKind: "land", standardPriceAtTransfer: 100_000_000 },
      ],
    });
    expect(r.apportioned[0].allocatedSalePrice).toBe(200_000_000);
    expect(r.apportioned[1].allocatedSalePrice).toBe(200_000_000);
    expect(r.apportioned[2].allocatedSalePrice).toBe(200_000_000);
    expect(r.residualAbsorbedBy).toBe("land-b");
  });

  it("variableSet 비어있고 잔여 > 0 → throw", () => {
    expect(() =>
      apportionBundledSale({
        totalSalePrice: 300_000_000,
        assets: [
          { ...baseHouse, fixedSalePrice: 100_000_000 },
          { ...baseLand, fixedSalePrice: 100_000_000 },
        ],
      }),
    ).toThrow(/잔여 양도가액/);
  });

  it("displayRatio: actual 자산도 자기 가액/totalSalePrice 기준으로 표시", () => {
    const r = apportionBundledSale({
      totalSalePrice: 400_000_000,
      assets: [
        { ...baseHouse, fixedSalePrice: 300_000_000 },
        { ...baseLand, fixedSalePrice: 100_000_000 },
      ],
    });
    expect(r.apportioned[0].displayRatio).toBe(0.75);
    expect(r.apportioned[1].displayRatio).toBe(0.25);
  });

  it("commonExpenses는 결정된 양도가액 비율로 안분 (fixed/variable 모두 적용)", () => {
    const r = apportionBundledSale({
      totalSalePrice: 400_000_000,
      commonExpenses: 4_000_000,
      assets: [
        { ...baseHouse, fixedSalePrice: 300_000_000, directExpenses: 1_000_000 },
        baseLand, // variable, 잔여 100M
      ],
    });
    // 주택: 4M × (300M / 400M) = 3M, + direct 1M = 4M
    // 농지(말단): 4M - 3M = 1M, + direct 0 = 1M
    expect(r.apportioned[0].allocatedExpenses).toBe(4_000_000);
    expect(r.apportioned[1].allocatedExpenses).toBe(1_000_000);
  });

  it("회귀: 모든 자산 apportioned (기존 동작) — fixedSalePrice 미사용 시 변동 없음", () => {
    const r = apportionBundledSale({
      totalSalePrice: TOTAL_SALE_PRICE,
      assets: [
        { ...baseHouse, standardPriceAtTransfer: HOUSE_STD_AT_TRANSFER },
        { ...baseLand, standardPriceAtTransfer: LAND_STD_AT_TRANSFER },
      ],
    });
    expect(r.apportioned[0].allocatedSalePrice).toBe(ANS_HOUSE_ALLOCATED_SALE);
    expect(r.apportioned[1].allocatedSalePrice).toBe(ANS_LAND_ALLOCATED_SALE);
    expect(r.residualAbsorbedBy).toBe("land");
    expect(r.apportioned[0].saleMode).toBe("apportioned");
    expect(r.apportioned[1].saleMode).toBe("apportioned");
  });
});
