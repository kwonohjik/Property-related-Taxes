/**
 * P2a — 취득가액 축(A) 파트별 완결. 별개 취득 자산은 총액을 참조하지 않는다.
 *
 * 설계: docs/02-design/features/transfer-separate-acq-date-per-part-completion.engine.design.md
 *       §4 E2(actual·appraisal) · E3(salesCase) · E4′(null 전파)
 *
 * 법령 근거:
 *   - 소득세법 §97①1호 — 필요경비는 "그 자산의 취득에 든 실지거래가액". 토지와 건물을 서로 다른
 *     시점에 각각 취득했다면 실지거래가액은 애초에 두 개이며, 합계 총액은 사후 집계일 뿐이다.
 *   - 소득세법 §114⑦ · 소득령 §176의2③ — 추계결정은 **자산별**로 한다.
 *   - 소득령 §176의2③1호 — 매매사례가액의 탐색 창은 "취득일 전후 각 3개월". 파트별 취득일이
 *     다르면 창도 다르므로, 하나의 총액을 안분할 법적 근거가 없다.
 *
 * 게이트: `isSeparateAcquisition`(API 변환이 파생, lib/calc/transfer-tax-split-acq-mode.ts).
 *   겸용주택·`selfOwns≠both`도 `hasSeperateLandAcquisitionDate`를 강제로 켜지만, 취득일이
 *   같으면 총액이 실재하므로 §166⑥ 안분이 정당하다 → 게이트 false → 종전 동작 유지.
 */
import { describe, it, expect } from "vitest";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import { baseTransferInput } from "../_helpers/mock-rates";

/** 토지 2015 취득 / 건물 2018 취득 · 취득시 기준시가 총액 5억(토지분 2억 → landRatio 0.4) */
const sep = (over: Record<string, unknown> = {}) =>
  baseTransferInput({
    propertyType: "housing",
    acquisitionDate: new Date("2018-06-01"),
    landAcquisitionDate: new Date("2015-06-01"),
    transferDate: new Date("2024-06-01"),
    transferPrice: 1_000_000_000,
    acquisitionPrice: 400_000_000, // 별개 취득에서는 "존재하지 않는" 총액 — 참조되면 안 된다
    saleSplitMode: "actual",
    landTransferPrice: 600_000_000,
    buildingTransferPrice: 400_000_000,
    standardPricePerSqmAtAcquisition: 1_000_000,
    acquisitionArea: 200,
    standardPriceAtAcquisition: 500_000_000,
    landStandardPriceAtTransfer: 600_000_000,
    buildingStandardPriceAtTransfer: 400_000_000,
    isSeparateAcquisition: true,
    ...over,
  });

// ════════════════════════════════════════════════════════════
// B1 · H2 — 실지거래가액 파트별 완결
// ════════════════════════════════════════════════════════════
describe("B1·H2: actual — 파트 취득가액 그대로, 총액 미참조", () => {
  it("파트 둘 다 입력 → 각 직접값. 합이 총액과 달라도 무관", () => {
    const r = calcSplitGain(
      sep({
        landAcqMode: "actual",
        buildingAcqMode: "actual",
        landAcquisitionPrice: 300_000_000,
        buildingAcquisitionPrice: 250_000_000,
      }),
    );
    expect(r).not.toBeNull();
    expect(r!.land.acquisitionPrice).toBe(300_000_000);
    expect(r!.building.acquisitionPrice).toBe(250_000_000);
    // 실가 모드 → 개산공제 없음(§163⑥은 추계 전용)
    expect(r!.land.appraisalDeduction).toBe(0);
    expect(r!.building.appraisalDeduction).toBe(0);
  });

  it("총액(acquisitionPrice)을 아예 지워도 결과 불변 — 총액 비참조 증명", () => {
    const withTotal = calcSplitGain(
      sep({
        landAcqMode: "actual",
        buildingAcqMode: "actual",
        landAcquisitionPrice: 300_000_000,
        buildingAcquisitionPrice: 250_000_000,
      }),
    );
    const withoutTotal = calcSplitGain(
      sep({
        landAcqMode: "actual",
        buildingAcqMode: "actual",
        landAcquisitionPrice: 300_000_000,
        buildingAcquisitionPrice: 250_000_000,
        acquisitionPrice: 0,
      }),
    );
    expect(withoutTotal!.land.acquisitionPrice).toBe(withTotal!.land.acquisitionPrice);
    expect(withoutTotal!.building.acquisitionPrice).toBe(withTotal!.building.acquisitionPrice);
    expect(withoutTotal!.land.gain).toBe(withTotal!.land.gain);
    expect(withoutTotal!.building.gain).toBe(withTotal!.building.gain);
  });
});

// ════════════════════════════════════════════════════════════
// B10 · H3 — 잔액 도출·비율 안분 폐지 (P0-B가 실증한 현행 동작의 반전)
// ════════════════════════════════════════════════════════════
describe("B10·H3: 파트 미입력 → 차단 (잔액 도출·안분 폐지)", () => {
  it("건물만 미입력 → 총액 − 토지 로 채우지 않고 차단", () => {
    expect(() =>
      calcSplitGain(
        sep({
          landAcqMode: "actual",
          buildingAcqMode: "actual",
          landAcquisitionPrice: 300_000_000,
        }),
      ),
    ).toThrow(TaxCalculationError);
  });

  it("차단 메시지가 미입력 파트를 지목한다", () => {
    try {
      calcSplitGain(
        sep({
          landAcqMode: "actual",
          buildingAcqMode: "actual",
          buildingAcquisitionPrice: 250_000_000,
        }),
      );
      throw new Error("차단되지 않았다");
    } catch (e) {
      expect(e).toBeInstanceOf(TaxCalculationError);
      expect((e as TaxCalculationError).message).toContain("토지");
      expect((e as TaxCalculationError).details?.missingParts).toEqual(["토지"]);
    }
  });

  it("둘 다 미입력 → 기준시가 비율 안분(1.6억/2.4억)을 만들지 않고 차단", () => {
    expect(() =>
      calcSplitGain(sep({ landAcqMode: "actual", buildingAcqMode: "actual" })),
    ).toThrow(TaxCalculationError);
  });
});

// ════════════════════════════════════════════════════════════
// B6 — 감정가액도 파트별 완결 (총액 appraisalValue 완전 미사용)
// ════════════════════════════════════════════════════════════
describe("B6: appraisal — 총액 appraisalValue 미참조", () => {
  it("파트 감정가액 그대로. 총액 appraisalValue가 있어도 무시", () => {
    const r = calcSplitGain(
      sep({
        landAcqMode: "appraisal",
        buildingAcqMode: "appraisal",
        appraisalValue: 900_000_000, // 미참조여야 한다
        landAcquisitionPrice: 350_000_000,
        buildingAcquisitionPrice: 200_000_000,
      }),
    );
    expect(r!.land.acquisitionPrice).toBe(350_000_000);
    expect(r!.building.acquisitionPrice).toBe(200_000_000);
    // 추계 모드 → 파트별 개산공제 3% (토지 2억 × 3% / 건물 3억 × 3%)
    expect(r!.land.appraisalDeduction).toBe(6_000_000);
    expect(r!.building.appraisalDeduction).toBe(9_000_000);
  });

  it("파트 미입력 → 취득가액 0 + 개산공제 3%라는 그럴듯한 소액을 만들지 않고 차단", () => {
    expect(() =>
      calcSplitGain(
        sep({
          landAcqMode: "appraisal",
          buildingAcqMode: "appraisal",
          appraisalValue: 900_000_000,
          landAcquisitionPrice: 350_000_000,
        }),
      ),
    ).toThrow(TaxCalculationError);
  });
});

// ════════════════════════════════════════════════════════════
// B7·B8·H5 — 매매사례가액 파트별 완결 (§176의2③1호 탐색 창 상이)
// ════════════════════════════════════════════════════════════
describe("B8·H5: salesCase — 총액 안분 fallback 폐지", () => {
  it("파트 매매사례가액 둘 다 입력 → 각 직접값", () => {
    const r = calcSplitGain(
      sep({
        landAcqMode: "salesCase",
        buildingAcqMode: "salesCase",
        similarSalesValue: 500_000_000, // 미참조여야 한다
        landSalesCaseValue: 220_000_000,
        buildingSalesCaseValue: 330_000_000,
      }),
    );
    expect(r!.land.acquisitionPrice).toBe(220_000_000);
    expect(r!.building.acquisitionPrice).toBe(330_000_000);
  });

  it("파트 미입력 → similarSalesValue 안분(2억/3억)을 만들지 않고 차단", () => {
    expect(() =>
      calcSplitGain(
        sep({
          landAcqMode: "salesCase",
          buildingAcqMode: "salesCase",
          similarSalesValue: 500_000_000,
        }),
      ),
    ).toThrow(TaxCalculationError);
  });

  it("B7: 토지 매매사례 + 건물 실가 혼합 — 파트 독립", () => {
    const r = calcSplitGain(
      sep({
        landAcqMode: "salesCase",
        buildingAcqMode: "actual",
        landSalesCaseValue: 220_000_000,
        buildingAcquisitionPrice: 180_000_000,
      }),
    );
    expect(r!.land.acquisitionPrice).toBe(220_000_000);
    expect(r!.building.acquisitionPrice).toBe(180_000_000);
    expect(r!.land.appraisalDeduction).toBe(6_000_000); // 토지만 추계 → 3%
    expect(r!.building.appraisalDeduction).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════
// 환산(estimated)은 원래 총액 미참조 구조 — 별개 취득 여부와 무관하게 불변
// ════════════════════════════════════════════════════════════
describe("환산 모드: 별개 취득 게이트 무영향 (회귀 가드)", () => {
  it("양 파트 환산 → isSeparateAcquisition 유무로 결과가 달라지지 않는다", () => {
    const on = calcSplitGain(sep({ landAcqMode: "estimated", buildingAcqMode: "estimated" }));
    const off = calcSplitGain(
      sep({
        landAcqMode: "estimated",
        buildingAcqMode: "estimated",
        isSeparateAcquisition: undefined,
      }),
    );
    expect(on!.land.acquisitionPrice).toBe(off!.land.acquisitionPrice);
    expect(on!.building.acquisitionPrice).toBe(off!.building.acquisitionPrice);
    // 축 B 항등성(§163⑥2호가목) — 라목 결합 총액 5억 × 3%
    expect(on!.land.appraisalDeduction + on!.building.appraisalDeduction).toBe(15_000_000);
  });

  it("토지 실가 + 건물 환산 혼합 — 토지는 파트값 필수, 건물은 환산", () => {
    const r = calcSplitGain(
      sep({
        landAcqMode: "actual",
        buildingAcqMode: "estimated",
        landAcquisitionPrice: 300_000_000,
      }),
    );
    expect(r!.land.acquisitionPrice).toBe(300_000_000);
    // 건물 환산 = 건물 양도가 4억 × (건물 취득시 기준시가 3억 / 건물 양도시 기준시가 4억)
    expect(r!.building.acquisitionPrice).toBe(300_000_000);
    expect(r!.land.appraisalDeduction).toBe(0);
    expect(r!.building.appraisalDeduction).toBe(9_000_000);
  });
});

// ════════════════════════════════════════════════════════════
// B11 — selfOwns: 비소유 파트의 미입력은 차단 대상이 아니다
//   (그 파트의 gain은 transfer-tax.ts:315에서 버려진다)
// ════════════════════════════════════════════════════════════
describe("B11: selfOwns — 본인 소유 파트만 차단 대상", () => {
  it("land_only + 토지 취득가액만 입력 → 건물 미입력이어도 계산된다", () => {
    const r = calcSplitGain(
      sep({
        selfOwns: "land_only",
        landAcqMode: "actual",
        buildingAcqMode: "actual",
        landAcquisitionPrice: 300_000_000,
      }),
    );
    expect(r).not.toBeNull();
    expect(r!.land.acquisitionPrice).toBe(300_000_000);
    expect(r!.selfOwns).toBe("land_only");
  });

  it("land_only인데 **토지**가 미입력이면 차단", () => {
    expect(() =>
      calcSplitGain(
        sep({
          selfOwns: "land_only",
          landAcqMode: "actual",
          buildingAcqMode: "actual",
          buildingAcquisitionPrice: 250_000_000,
        }),
      ),
    ).toThrow(TaxCalculationError);
  });
});

// ════════════════════════════════════════════════════════════
// 게이트 회귀 — 동시 취득(겸용·selfOwns 강제 분리)은 종전 §166⑥ 안분 유지
// ════════════════════════════════════════════════════════════
describe("게이트 off(동시 취득): 총액 모델 완전 무변경", () => {
  const same = (over: Record<string, unknown> = {}) =>
    sep({ isSeparateAcquisition: undefined, ...over });

  it("한쪽만 입력 → 잔액 도출 유지 (총액이 실재하므로 정당)", () => {
    const r = calcSplitGain(
      same({
        landAcqMode: "actual",
        buildingAcqMode: "actual",
        landAcquisitionPrice: 300_000_000,
      }),
    );
    expect(r!.building.acquisitionPrice).toBe(100_000_000); // 4억 − 3억
  });

  it("둘 다 미입력 → 기준시가 비율 안분 유지 (landRatio 0.4)", () => {
    const r = calcSplitGain(same({ landAcqMode: "actual", buildingAcqMode: "actual" }));
    expect(r!.land.acquisitionPrice).toBe(160_000_000);
    expect(r!.building.acquisitionPrice).toBe(240_000_000);
  });

  it("salesCase 파트 미입력 → similarSalesValue 안분 유지", () => {
    const r = calcSplitGain(
      same({
        landAcqMode: "salesCase",
        buildingAcqMode: "salesCase",
        similarSalesValue: 500_000_000,
      }),
    );
    expect(r!.land.acquisitionPrice).toBe(200_000_000);
    expect(r!.building.acquisitionPrice).toBe(300_000_000);
  });
});
