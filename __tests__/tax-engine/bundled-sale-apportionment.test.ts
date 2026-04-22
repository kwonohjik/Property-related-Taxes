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
    // 116 / 208.781 ≈ 0.5556 (4자리)
    expect(r.apportioned[0].displayRatio).toBeGreaterThan(0.55);
    expect(r.apportioned[0].displayRatio).toBeLessThan(0.56);
    // 두 비율 합은 1에 근접 (반올림 오차 허용)
    const sumRatio = r.apportioned[0].displayRatio + r.apportioned[1].displayRatio;
    expect(Math.abs(sumRatio - 1)).toBeLessThan(0.001);
  });
});
