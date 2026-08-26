/**
 * F-26 Pre-Do anchor — 부속시설 「미귀속 몫 증발」에 설계가 요구한 경고가 구현되지 않았다.
 *
 * 결함 위치: `lib/tax-engine/building-standard-price-helpers.ts` `calcCompositeForYear`
 *   const receivesAt = (p) => opts.adjustmentEnabled ? (공용조정률 지정 여부) : true;
 *
 * 상증 복합에서 **공용 조정률을 지정한 부분만** 부속시설 안분을 수령한다(의도된 설계).
 * 미지정 부분의 몫은 잔여 흡수 대상이 아니라 **그대로 증발**하므로,
 * Ⅴ표 행 합 < 계(t)(입력 총면적)가 되고 그 차액만큼 **평가에서 빠진다**.
 *
 * 설계문서 `building-std-price-nts-report.engine.design.md:225-227` 은 이 동작을 보존하되
 * **warnings 1건**을 요구한다 — 「부속시설 N㎡ 중 M㎡만 귀속 지정 — 미지정 몫은 평가 제외」.
 * 그런데 구현에는 그 경고가 없다. 게이팅 자체는 의도이므로 **금액은 바뀌지 않고**,
 * 사용자에게 「누락됐다」는 사실이 도달하지 않는 것만이 결함이다.
 *
 * ⚠️ 양도(`adjustmentEnabled: false`)는 전 부분이 수령하므로 경고 대상이 아니다(§2 역방향 가드).
 *
 * 법령: 「상속세 및 증여세법」 제61조 제1항 제2호 위임 하의 국세청 고시 제2025-39호 제11조(조정률).
 *   경고는 표시 사항이며 세액 산식에 개입하지 않는다.
 *
 * ⚠️ §1 은 **수정 전에 실패한다** — 의도된 Pre-Do anchor다.
 */
import { describe, it, expect } from "vitest";
import { calcBuildingStandardPrice } from "@/lib/tax-engine/building-standard-price";
import type { BuildingStandardPriceInput } from "@/lib/tax-engine/types/building-standard-price.types";

/** 상증 복합 2부분 — 부분1만 공용 조정률 지정 ⇒ 부분2 몫(부속 40㎡ 중 절반)이 증발한다 */
const PARTIAL: BuildingStandardPriceInput = {
  taxType: "inheritance_gift",
  floorArea: 0,
  builtYear: 2000,
  valuationYear: 2025,
  valuation: { structureKey: "rc", usageNo: 1, landPricePerM2: 2_000_000 },
  compositeParts: [
    { label: "1층 근생", structureKey: "rc", usageNo: 1, floorArea: 100, sharedAdjustmentRate: 110 },
    { label: "2층 주택", structureKey: "rc", usageNo: 22, floorArea: 100 },
  ],
  ancillaryFacilities: [{ kind: "parking", areaM2: 40 }],
};

describe("F-26 부속 미귀속 — §1 경고가 도달한다 (수정 전 실패)", () => {
  it("N㎡ 중 M㎡만 귀속 지정 경고가 있다", () => {
    const w = calcBuildingStandardPrice(PARTIAL).warnings;
    expect(w.some((s) => s.includes("귀속 지정") && s.includes("평가 제외"))).toBe(true);
  });

  it("경고가 실제 면적을 담는다 — 40㎡ 중 20㎡", () => {
    const msg = calcBuildingStandardPrice(PARTIAL).warnings.find((s) => s.includes("귀속 지정"))!;
    expect(msg).toContain("40");
    expect(msg).toContain("20");
  });

  it("경고는 1건만 — 시점마다 중복되지 않는다", () => {
    const w = calcBuildingStandardPrice(PARTIAL).warnings.filter((s) => s.includes("귀속 지정"));
    expect(w).toHaveLength(1);
  });
});

describe("F-26 — §2 역방향 가드 (수정 후에도 불변)", () => {
  it("전 부분이 지정되면 경고가 없다 — 잔여 흡수로 합이 일치한다", () => {
    const all = calcBuildingStandardPrice({
      ...PARTIAL,
      compositeParts: [
        { label: "1층 근생", structureKey: "rc", usageNo: 1, floorArea: 100, sharedAdjustmentRate: 110 },
        { label: "2층 주택", structureKey: "rc", usageNo: 22, floorArea: 100, sharedAdjustmentRate: 110 },
      ],
    });
    expect(all.warnings.some((s) => s.includes("귀속 지정"))).toBe(false);
  });

  it("부속시설이 없으면 경고가 없다", () => {
    const none = calcBuildingStandardPrice({ ...PARTIAL, ancillaryFacilities: [] });
    expect(none.warnings.some((s) => s.includes("귀속 지정"))).toBe(false);
  });

  it("금액은 바뀌지 않는다 — 게이팅은 의도된 설계다", () => {
    const r = calcBuildingStandardPrice(PARTIAL);
    // 부속 행은 부분1 몫 20㎡ 만 생성된다(부분2 몫 20㎡ 증발) — 현행 동작 고정
    const rows = r.ancillaryApportionment?.rows ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0].areaSum).toBe(20);
    expect(r.ancillaryApportionment?.totalByKind.parking).toBe(40);
  });
});
