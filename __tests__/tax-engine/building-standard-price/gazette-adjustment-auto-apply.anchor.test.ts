/**
 * F-09 Pre-Do anchor — 조정률 구분 II(연면적)는 **사용자 선택 항목이 아니다**.
 *   특성을 하나도 고르지 않아도 비주거 건물에는 자동으로 붙어야 하는데,
 *   단일(비복합) 상증 경로만 `specialFeatures`가 null 이면 조정률 전체를 1.0 으로 만든다.
 *
 * ── 고시 실측 근거(2026년 국세청 「건물 기준시가 계산사례」 마. — 2026-08-27 원문 확인)
 *   서울 종로구 · 철근콘크리트조 · 지상3/지하1 · **건물전체 연면적 390㎡** ·
 *   신축 2000 · 상속 2026.1.1 · 공시지가 2,500,000
 *     지상1 근린생활시설(용도지수 0.95) → 조정률 칸 **(9) 0.9 · (20) 1.2** ⇒ 1.08 · ㎡당 544,000
 *     지상2·3 단독주택(1.00)            → 조정률 칸 **빈칸**              ⇒ 1.00 · ㎡당 530,000
 *   ⇒ 같은 건물·같은 연면적인데 **비주거 부분만 9번(1천㎡미만·0.90)을 받는다**.
 *   ⇒ 부속 지하층도 같다 — 주차장(24번)뿐인 부분에도 **슈퍼 귀속분에만** 9번이 함께 붙어
 *     0.54(=0.9×0.6)이고, 주택 귀속분은 0.60(24번만)이다.
 *   ⇒ **9번은 「연면적·비주거」로 자동 판정되는 항목**이며 사용자가 고르는 특성이 아니다.
 *
 * ── 결함
 *   `lib/calc/building-std-price-form.ts:481` 단일 분기는 `else if (f.adjustmentFeatures)` 라
 *   미선택 시 `specialFeatures` 가 **undefined 로 남는다**(복합 분기 :473 은 `pickFeatures` 로
 *   항상 정규화한다). 이어서 `building-standard-price.ts:325` 가
 *   `if (!input.specialFeatures) return 1.0;` 으로 **조정률 계산 자체를 건너뛴다.**
 *   화면은 `{}` 와 null 을 구별해 보여주지 않는다(섹션 칩이 `Object.keys().length > 0` 게이트).
 *
 * ⚠️ 기존 공식 사례 anchor(`nts-cases.test.ts:160` 안분계산 마)는 `adjustmentRate: 108` 을
 *    **manual 로 주입**해 통과한다 — 자동 도출 축을 한 번도 검증하지 않는다. 그래서 「13/13 재현」이
 *    이 축을 가리지 못했다.
 *
 * ── 🟠 **미결 — 고시 문언과 공식 계산사례가 갈린다**(2026-08-27 실측 후에도 종결 못 함)
 *   고시 제11조 조정률표 **구분 II** 적용대상은 「최고층수 / 연면적 / 인텔리전트시스템빌딩」이고
 *   적용범위 단서는 「최고층수 계산시 지하층·옥탑 제외 / 통나무조 적용 제외 /
 *   **주거용건물은 아파트에 한해 최고층수기준만 적용**」뿐이다 — **용도 제한이 없다.**
 *   연면적은 어떤 구간엔 반드시 들어가므로 문언상 **비주거면 항상 적용**이 맞다.
 *
 *   그런데 `nts-cases.test.ts` 의 공식 사례 13건 중 **4건**(직업훈련소 №33·노인주거복지 №35·
 *   자원순환 №54·판매시설 №11)은 조정률 미적용으로 고정돼 있고, 같은 비주거·비슷한 연면적인
 *   근생(라멘) №41·운동시설 №24 는 `features: {}` 로 **9번을 받아** 공식 값과 맞는다.
 *   갈림은 연면적도 주거여부도 아니고 **`features` 필드 기재 유무**다.
 *
 *   같은 파일의 필드 주석이 「manualAdj?: number; // **양도 사례(조정률 미적용)는 생략**」이라
 *   적고 있어, 그 4건이 **양도세 사례**여서 조정률 대상이 아닐 가능성이 높다. 그렇다면 고시 문언대로
 *   고쳐도 무방하다. 그러나 **이번에 받은 계산사례 PDF는 「마.」 항목만 담고 있어**(pp.71~77)
 *   13건의 세목을 원본으로 확인할 수 없다.
 *
 *   ⇒ **착수 조건**: 2026년 계산사례집의 단일 건물 13건 원문(가~라 항목). 그것 없이 게이트를
 *      풀면 공식 사례 anchor 4건이 깨진다 — 실제로 시도해 4건이 깨지는 것을 실측했다.
 *      (`computeAdjustmentRate` 의 `if (!input.specialFeatures) return 1.0;` 과
 *       `resolvePartAdjustment` 의 `buildingHasAnyFeatures` 조기반환이 그 게이트다.)
 *
 * 법령: 「상속세 및 증여세법」 제61조 제1항 제2호 위임 하의 국세청 「건물 기준시가 계산방법」 고시
 *   제11조(개별건물의 특성에 따른 조정률) 구분 II. 양도(소득세법 §99①1호나목)는 미적용.
 */
import { describe, it, expect } from "vitest";
import { calcBuildingStandardPrice } from "@/lib/tax-engine/building-standard-price";
import { selectSpecialAdjustment } from "@/lib/tax-engine/building-standard-price-helpers";
import type { BuildingStandardPriceInput } from "@/lib/tax-engine/types/building-standard-price.types";

/** 계산사례 마.의 지상1 근린생활시설을 단일 건물로 재구성(연면적 390㎡ 유지) */
const SUPER_1F = (over: Partial<BuildingStandardPriceInput>): BuildingStandardPriceInput => ({
  taxType: "inheritance_gift",
  floorArea: 390,
  builtYear: 2000,
  valuationYear: 2026,
  valuation: { structureKey: "rc", usageNo: 41, landPricePerM2: 2_500_000 },
  isResidentialUse: false,
  ...over,
});

describe("F-09 — §0 술어는 고시대로다 (사실 고정 · 수정 후에도 불변)", () => {
  const NONRES = { isResidential: false, isApartment: false, structureKey: "rc" };
  const RES = { isResidential: true, isApartment: false, structureKey: "rc" };

  it("비주거 + 특성 미선택 → 9번(1천㎡미만) 0.90 이 붙는다", () => {
    expect(selectSpecialAdjustment({}, 95, 390, NONRES)).toEqual([{ nos: [9], rate: 90 }]);
  });

  it("비주거 + 상가1층 → 9번 × 20번 = 1.08 (계산사례 마. 지상1 일치)", () => {
    expect(selectSpecialAdjustment({ commercialFloor: 20 }, 95, 390, NONRES)).toEqual([
      { nos: [9], rate: 90 },
      { nos: [20], rate: 120 },
    ]);
  });

  it("주거 → 적용 항목 없음 (계산사례 마. 지상2·3 빈칸 일치)", () => {
    expect(selectSpecialAdjustment({}, 100, 390, RES)).toEqual([]);
  });
});

describe("F-09 — §1 현행 동작 characterization (🟠 미결 — 위 헤더 참조)", () => {
  it("㎡당 금액이 계산사례와 같다 — 544,000 (조정률 1.08 = 9번 × 20번)", () => {
    const r = calcBuildingStandardPrice(
      SUPER_1F({ specialFeatures: { commercialFloor: 20 } }),
    );
    expect(r.valuation?.pricePerM2).toBe(544_000);
  });

  it("빈 객체 {} 는 9번을 받는다 — 453,000 (고시 문언과 일치)", () => {
    const r = calcBuildingStandardPrice(SUPER_1F({ specialFeatures: {} }));
    // 860,000 × 1.00 × 0.95 × 1.16 × 0.532 × 0.90 = 453,768 → 천원미만 절사
    expect(r.valuation?.pricePerM2).toBe(453_000);
  });

  it("🟠 미선택(undefined)은 504,000 — {} 와 **11.2% 갈리는데 화면은 두 상태를 구별하지 않는다**", () => {
    const none = calcBuildingStandardPrice(SUPER_1F({}));
    const empty = calcBuildingStandardPrice(SUPER_1F({ specialFeatures: {} }));
    expect(none.valuation?.pricePerM2).toBe(504_000); // 조정률 미적용
    expect(empty.valuation?.pricePerM2).toBe(453_000);
    // 이 불일치가 F-09 의 실체다. 고시 문언은 453,000 을 지지하나 공식 사례 4건이 반증한다 —
    // 13건 원문 확보 전까지 현행 동작을 고정해 **조용한 변화**를 막는다.
    expect(none.valuation!.standardPrice).not.toBe(empty.valuation!.standardPrice);
  });
});

describe("F-09 — §2 역방향 가드 (수정 후에도 불변)", () => {
  it("양도는 조정률을 적용하지 않는다 — 고시 제5조③ 각주", () => {
    const r = calcBuildingStandardPrice({
      taxType: "transfer",
      floorArea: 390,
      builtYear: 2000,
      acquisitionYear: 2010,
      transferYear: 2026,
      acquisition: { structureKey: "rc", usageNo: 41, landPricePerM2: 2_500_000 },
      transfer: { structureKey: "rc", usageNo: 41, landPricePerM2: 2_500_000 },
    });
    // 조정률 미적용 ⇒ 860,000 × 0.95 × 1.16 × 0.532 = 504,187 → 504,000
    expect(r.transfer?.pricePerM2).toBe(504_000);
  });

  it("직접입력(manual) 조정률이 우선한다", () => {
    const r = calcBuildingStandardPrice(SUPER_1F({ manualAdjustmentRate: 120 }));
    // 504,187 × 1.20 = 605,024 → 605,000
    expect(r.valuation?.pricePerM2).toBe(605_000);
  });

  it("주거용은 특성 미선택 시 조정률이 붙지 않는다 — 530,000 (계산사례 지상2·3)", () => {
    const r = calcBuildingStandardPrice(
      SUPER_1F({ valuation: { structureKey: "rc", usageNo: 2, landPricePerM2: 2_500_000 }, isResidentialUse: true }),
    );
    expect(r.valuation?.pricePerM2).toBe(530_000);
  });
});
