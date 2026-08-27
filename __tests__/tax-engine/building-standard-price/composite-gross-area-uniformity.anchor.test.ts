/**
 * F-10 Pre-Do anchor — 복합건물에서 **건물 전체 항목**인 II 연면적이 「부분 특성이 있는 부분」에만 적용된다.
 *
 * 결함 위치: `lib/tax-engine/building-standard-price-helpers.ts` `resolvePartAdjustment`
 *   const merged = { ...(opts.buildingWideFeatures ?? {}), ...(p.specialFeatures ?? {}) };
 *   if (Object.keys(merged).length === 0) return { adjRate: 1.0, items: undefined };   // ← 조기반환
 *
 *   그런데 II 연면적(번호 9~13)은 merged 의 키가 아니라 **`buildingTotalArea` 인자에서 자동 도출**된다
 *   (`selectSpecialAdjustment` 의 `if (!ctx.isResidential && floorArea > 0)` 분기).
 *   실제로 `selectSpecialAdjustment({}, 100, 6000, ctx)` 는 `[{nos:[11], rate:110}]` 을 반환한다 —
 *   특성이 하나도 없어도 II 는 붙는다. 그것을 호출부 조기반환이 가로막는 것이다.
 *
 * ⇒ 같은 건물·같은 연면적인데 **부분마다 II 적용 여부가 갈린다.** 어떤 독법에서도 성립할 수 없다.
 *   `buildingTotalArea` 는 `calcCompositeForYear` 에서 건물 전체로 계산해 전 부분에 동일하게 넘긴다.
 *
 * 법령: 「상속세 및 증여세법」 제61조 제1항 제2호 위임 하의 국세청 조정률 고시 구분 II 연면적 ·
 *   적용요령 (4) 「지하층·옥탑 포함 전체면적 기준」 — **고시 본문 미확인**.
 *   다만 **부분 간 불일치**는 고시와 무관하게 성립한다.
 *
 * 🟡 **범위 밖(F-09 축)** — 「특성이 건물 전체에 하나도 없을 때 II 를 적용할 것인가」는
 *   별개의 미결 문제이고 국세청 고시의 적용요령 (2)·(4) 본문이 있어야 판정된다.
 *   ⇒ 이 수정은 **종전 동작을 유지**한다: 특성이 아예 없으면 전 부분 1.0(현행 그대로),
 *      특성이 어디든 하나라도 있으면 II 를 **전 부분에 동일하게** 적용한다.
 *
 * 실측(2026-08-26 · 상증 2025 · rc · 용도49 · 2부분 각 3,000㎡(건물 6,000㎡) · 공시지가 3,000,000):
 *   A 둘 다 특성 없음     P1 1.0  7,401,000,000 | P2 1.0  7,401,000,000   (일치 — 무영향)
 *   B P1만 상가1층(20)    P1 1.32 9,768,000,000 | P2 —    7,401,000,000   ← **불일치**
 *     P1 items [{11,110},{20,120}] / P2 items []
 *   D P1 상가1층 + P2 구조진단(31)  P1 1.32 | P2 0.99 (= 110 × 90)  — P2 도 특성이 생기자 II 가 붙는다
 *
 * ⚠️ §1 은 **F-10 수정 전에 실패한다** — 의도된 Pre-Do anchor다.
 */
import { describe, it, expect } from "vitest";
import { calcBuildingStandardPrice } from "@/lib/tax-engine/building-standard-price";
import { selectSpecialAdjustment } from "@/lib/tax-engine/building-standard-price-helpers";
import type { BuildingStandardPriceInput } from "@/lib/tax-engine/types/building-standard-price.types";

type Feats = BuildingStandardPriceInput["specialFeatures"] | null;

const twoParts = (p1: Feats, p2: Feats): BuildingStandardPriceInput => ({
  taxType: "inheritance_gift",
  floorArea: 0,
  builtYear: 2015,
  valuationYear: 2025,
  valuation: { structureKey: "rc", usageNo: 49, landPricePerM2: 3_000_000 },
  compositeParts: [
    { label: "P1", structureKey: "rc", usageNo: 49, floorArea: 3000, ...(p1 ? { specialFeatures: p1 } : {}) },
    { label: "P2", structureKey: "rc", usageNo: 49, floorArea: 3000, ...(p2 ? { specialFeatures: p2 } : {}) },
  ],
});

/** 부분의 적용 항목에서 II 연면적(번호 9~13) 요소만 추린다 */
const grossAreaItems = (items?: { nos: number[]; rate: number }[]) =>
  (items ?? []).filter((i) => i.nos.some((n) => n >= 9 && n <= 13));

describe("F-10 복합 II 연면적 — §1 부분 간 동일 적용 (수정 전 실패)", () => {
  it("P1 에만 특성이 있어도 II 연면적은 두 부분에 동일하게 붙는다", () => {
    const r = calcBuildingStandardPrice(twoParts({ commercialFloor: 20 }, null));
    const [b1, b2] = r.compositeBreakdowns ?? [];
    expect(grossAreaItems(b1?.adjustmentItems)).toEqual([{ nos: [11], rate: 110 }]);
    expect(grossAreaItems(b2?.adjustmentItems)).toEqual([{ nos: [11], rate: 110 }]);
  });

  it("P2(특성 없음)의 조정률은 II 연면적 단독인 1.10 이어야 한다 — 현재는 미적용", () => {
    const r = calcBuildingStandardPrice(twoParts({ commercialFloor: 20 }, null));
    const [, b2] = r.compositeBreakdowns ?? [];
    expect(b2?.adjustmentRate).toBe(1.1);
  });

  it("건물 전체 특성만 있어도 부분 특성이 없는 부분에 II 가 붙는다", () => {
    const input = twoParts(null, null);
    input.specialFeatures = { roofMaterial: 1 }; // I 지붕 — 건물 전체 특성
    const r = calcBuildingStandardPrice(input);
    const [b1, b2] = r.compositeBreakdowns ?? [];
    expect(grossAreaItems(b1?.adjustmentItems)).toEqual([{ nos: [11], rate: 110 }]);
    expect(grossAreaItems(b2?.adjustmentItems)).toEqual([{ nos: [11], rate: 110 }]);
  });
});

describe("F-10 복합 II 연면적 — §2 F-09 축 확정 후 (2026-08-27 갱신)", () => {
  /**
   * ⚠️ 종전 이 블록은 「전 부분·건물 전체 모두 특성이 없으면 **종전대로 조정률 미적용**」을
   *    고정했다 — 당시 F-09 축(「특성이 없어도 구분 II 를 적용하는가」)이 **고시 본문 미확인**
   *    이라 현행 동작을 보존한 것이다.
   *    2026-08-27 고시 제11조 + 계산사례 13건 전수 실측으로 **적용이 맞다**고 확정됐다
   *    (상속 사례 9건이 예외 없이 구분 II 를 받고, 근생(라멘)·운동시설은 구분 II **만**으로 붙는다).
   *    ⇒ 단언을 뒤집는다. 갈림은 이제 **주거/비주거**다.
   */
  it("특성이 없어도 비주거 부분은 구분 II 연면적을 받는다 — 두 부분이 같은 값이다", () => {
    const bds = calcBuildingStandardPrice(twoParts(null, null)).compositeBreakdowns ?? [];
    expect(bds).toHaveLength(2);
    // 연면적 합 6,000㎡ → #11(5천~1만) 110 ⇒ 두 부분 모두 1.10
    expect(grossAreaItems(bds[0].adjustmentItems)).toEqual([{ nos: [11], rate: 110 }]);
    expect(grossAreaItems(bds[1].adjustmentItems)).toEqual([{ nos: [11], rate: 110 }]);
    expect(bds[0].adjustmentRate).toBe(bds[1].adjustmentRate);
  });
});

describe("F-10 복합 II 연면적 — §3 역방향 가드 (수정 후에도 불변)", () => {
  it("두 부분 다 같은 특성이면 종전과 동일 — 각 1.32 · 합계 19,536,000,000", () => {
    const r = calcBuildingStandardPrice(
      twoParts({ commercialFloor: 20 }, { commercialFloor: 20 }),
    );
    const [b1, b2] = r.compositeBreakdowns ?? [];
    expect(b1?.adjustmentRate).toBe(1.32);
    expect(b2?.adjustmentRate).toBe(1.32);
    expect(r.compositeTotal).toBe(19_536_000_000);
  });

  it("부분별 수동 조정률(adjustmentRate)은 완전 override 로 남는다", () => {
    const input = twoParts({ commercialFloor: 20 }, null);
    input.compositeParts![1].adjustmentRate = 80;
    const r = calcBuildingStandardPrice(input);
    const [, b2] = r.compositeBreakdowns ?? [];
    expect(b2?.adjustmentRate).toBe(0.8);
    expect(grossAreaItems(b2?.adjustmentItems)).toEqual([]); // 수동은 자동 선택을 타지 않는다
  });

  it("leaf 는 원래 특성이 비어도 II 를 반환한다 — 조기반환이 그것을 가로막고 있었다", () => {
    const ctx = { isResidential: false, isApartment: false, structureKey: "rc" };
    expect(selectSpecialAdjustment({}, 100, 6000, ctx)).toEqual([{ nos: [11], rate: 110 }]);
  });
});
