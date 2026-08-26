/**
 * F-03 Pre-Do anchor — 다필지(landParcels)를 켜면 상증 「조정률 직접 입력」이 엔진에서 통째로 버려진다.
 *
 * 결함 경로 (`lib/tax-engine/building-standard-price.ts`, 원문 재확인 2026-08-26):
 *   :66  hasComposite() = (compositeParts?.length ?? 0) > 0 || (landParcels?.length ?? 0) > 0
 *        → landParcels 만 있어도 상증 단일 평가가 **복합 경로**(calcCompositeValuation)로 빠진다.
 *   :95-106 resolveCompositeParts 의 fallback part 는 { label, structureKey, usageNo, floorArea }
 *        **4필드뿐**이라 조정률이 실릴 자리가 없다.
 *   :136 buildingWideFeatures: input.manualAdjustmentRate == null ? input.specialFeatures : undefined
 *        → manual 이면 특성 경로마저 꺼진다.
 *   :268 if (input.manualAdjustmentRate != null) return input.manualAdjustmentRate / 100;
 *        → manualAdjustmentRate 를 배율로 바꾸는 지점은 저장소 전체에서 **여기 하나**이고,
 *          이 함수(computeAdjustmentRate)는 **단일시점 경로 전용**이다. 복합 경로는 부르지 않는다.
 *   ⇒ 조정률이 1.0 으로 떨어지고 경고도 검증 오류도 없다(warnings = []).
 *
 * 도달성: 「다필지 부속토지」 토글과 「조정률 직접 입력」은 UI 에서 독립이고
 *   `lib/calc/building-std-price-form.ts` 의 toEngineInput 이 같은 비복합 분기에서 둘 다 채운다.
 *   validate 는 음수만 차단한다.
 *
 * 법령: 「상속세 및 증여세법」 제61조 제1항 제2호 위임 하의 국세청 「건물 기준시가 계산방법」 고시
 *   개별특성조정률 — **고시 본문 미확인**. 다만 이 결함은 「사용자가 입력한 조정률이 엔진에 도달하지
 *   않는다」는 배선 결함이라 고시 해석에 의존하지 않는다.
 *
 * ⚠️ §1·§2 는 **F-03 수정 전에 실패한다** — 의도된 Pre-Do anchor다.
 *
 * 수정 방향(확정): `resolveCompositeParts` 의 **fallback 분기(다필지 전용)에만** 조정률을 실어 보낸다.
 *   compositeParts 가 실재하는 복합 입력은 설계문서
 *   `docs/02-design/features/building-std-price-composite-adjustment.engine.design.md` 가
 *   「복합에서 manual 은 부분별」로 확정했으므로 종전 동작을 보존해야 한다 → §3 이 그 가드다.
 *   validate 차단 방향은 채택하지 않는다(두 토글이 독립 노출되는 정상 입력을 막는다).
 */
import { describe, it, expect } from "vitest";
import { calcBuildingStandardPrice } from "@/lib/tax-engine/building-standard-price";
import type { BuildingStandardPriceInput } from "@/lib/tax-engine/types/building-standard-price.types";

/**
 * 상증 1시점 · 시멘트벽돌조 · 용도 2 · 연면적 115.16㎡ · 신축 1991 · 평가 2023 · 공시지가 2,430,000원/㎡.
 * 다필지는 **가중평균이 단일 공시지가와 같아지도록** 구성해 위치지수 축을 없앤다
 * ⇒ 두 경로의 차이는 조정률 축 하나만 남는다.
 */
const BASE = {
  taxType: "inheritance_gift" as const,
  floorArea: 115.16,
  builtYear: 1991,
  valuationYear: 2023,
  valuation: { structureKey: "cement_brick", usageNo: 2, landPricePerM2: 2_430_000 },
};

/** 가중평균 = (100×2,430,000 + 200×2,430,000) / 300 = 2,430,000 — 단일 입력과 동일 */
const PARCELS = [
  { areaM2: 100, pricePerM2: 2_430_000 },
  { areaM2: 200, pricePerM2: 2_430_000 },
];

/** 다필지 경로는 valuation 대신 compositeTotal 에 값이 실린다. */
function totalOf(input: BuildingStandardPriceInput): number {
  const r = calcBuildingStandardPrice(input);
  return r.compositeTotal ?? r.valuation?.standardPrice ?? 0;
}

const NO_ADJ = 28_559_680; // 조정률 미적용값 (㎡당 248,000)
const ADJ_80 = 22_801_680; // 조정률 80% (㎡당 198,000)
const ADJ_120 = 34_317_680; // 조정률 120% (㎡당 298,000)

describe("F-03 다필지 × 조정률 직접입력 — §0 단일 경로는 정상 (수정 전후 불변)", () => {
  it("단일 + 조정률 미적용 → 28,559,680", () => {
    expect(totalOf({ ...BASE })).toBe(NO_ADJ);
  });

  it("단일 + manualAdjustmentRate 80 → 22,801,680", () => {
    expect(totalOf({ ...BASE, manualAdjustmentRate: 80 })).toBe(ADJ_80);
  });

  it("단일 + manualAdjustmentRate 120 → 34,317,680", () => {
    expect(totalOf({ ...BASE, manualAdjustmentRate: 120 })).toBe(ADJ_120);
  });
});

describe("F-03 다필지 × 조정률 직접입력 — §1 결함 고정 (수정 전 실패)", () => {
  it("다필지 + manualAdjustmentRate 80 → 22,801,680 (현재 28,559,680 · +5,758,000 = +25.25% 과대)", () => {
    expect(totalOf({ ...BASE, manualAdjustmentRate: 80, landParcels: PARCELS })).toBe(ADJ_80);
  });

  it("다필지 + manualAdjustmentRate 120 → 34,317,680 (현재 28,559,680 · −5,758,000 = −16.78% 과소)", () => {
    expect(totalOf({ ...BASE, manualAdjustmentRate: 120, landParcels: PARCELS })).toBe(ADJ_120);
  });

  it("조용한 실패 — 조정률이 버려지는데 warnings 도 검증 오류도 없다 (현재 동작 기록)", () => {
    const r = calcBuildingStandardPrice({
      ...BASE,
      manualAdjustmentRate: 80,
      landParcels: PARCELS,
    });
    // 수정 후에는 값이 맞아지므로 warnings 가 비어 있는 것이 정상이 된다.
    // 지금은 「틀린 값 + 무경고」라 사용자가 알 방법이 없다는 사실을 기록한다.
    expect(r.warnings).toEqual([]);
  });
});

describe("F-03 다필지 × 조정률 직접입력 — §2 비대칭 고정 (수정 전 실패)", () => {
  /**
   * 다필지는 **위치지수 가중평균**에만 영향을 주는 축이다. 가중평균이 단일 공시지가와 같으면
   * 다필지 유무가 결과를 바꿔서는 안 된다.
   */
  it("가중평균 = 단일 공시지가일 때, 다필지 유무가 결과를 바꾸지 않는다 (조정률 80)", () => {
    expect(totalOf({ ...BASE, manualAdjustmentRate: 80, landParcels: PARCELS })).toBe(
      totalOf({ ...BASE, manualAdjustmentRate: 80 }),
    );
  });

  it("가중평균 = 단일 공시지가일 때, 다필지 유무가 결과를 바꾸지 않는다 (조정률 120)", () => {
    expect(totalOf({ ...BASE, manualAdjustmentRate: 120, landParcels: PARCELS })).toBe(
      totalOf({ ...BASE, manualAdjustmentRate: 120 }),
    );
  });

  it("대조군 — 조정률이 없으면 다필지 유무가 이미 결과를 바꾸지 않는다 (수정 전에도 통과)", () => {
    expect(totalOf({ ...BASE, landParcels: PARCELS })).toBe(totalOf({ ...BASE }));
  });
});

describe("F-03 다필지 × 조정률 직접입력 — §3 역방향 가드 (수정이 깨면 안 되는 것)", () => {
  /**
   * compositeParts 가 실재하면 조정률 정본은 **부분별 adjustmentRate** 다.
   * 수정은 fallback 분기에만 손대야 하므로 이 값은 불변이어야 한다.
   */
  it("compositeParts 있음 + 부분별 adjustmentRate 80 → 22,801,680 (수정 전후 불변)", () => {
    expect(
      totalOf({
        ...BASE,
        floorArea: 0,
        landParcels: [{ areaM2: 100, pricePerM2: 2_430_000 }],
        compositeParts: [
          {
            label: "전체",
            structureKey: "cement_brick",
            usageNo: 2,
            floorArea: 115.16,
            adjustmentRate: 80,
          },
        ],
      }),
    ).toBe(ADJ_80);
  });

  it("compositeParts 가 있으면 manualAdjustmentRate 는 부분별 값을 덮지 않는다 (수정 전후 불변)", () => {
    expect(
      totalOf({
        ...BASE,
        floorArea: 0,
        manualAdjustmentRate: 120, // 부분별 80 이 정본이므로 이 값이 이겨서는 안 된다
        landParcels: [{ areaM2: 100, pricePerM2: 2_430_000 }],
        compositeParts: [
          {
            label: "전체",
            structureKey: "cement_brick",
            usageNo: 2,
            floorArea: 115.16,
            adjustmentRate: 80,
          },
        ],
      }),
    ).toBe(ADJ_80);
  });
});
