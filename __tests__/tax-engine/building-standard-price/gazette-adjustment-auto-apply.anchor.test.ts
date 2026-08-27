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
 * ── ✅ **축은 확정됐다 — 「항상 적용」이 옳다**(2026-08-27 계산사례 13건 전수 확인)
 *   고시 제11조 조정률표 **구분 II** 적용대상은 「최고층수 / 연면적 / 인텔리전트시스템빌딩」이고
 *   적용범위 단서는 「최고층수 계산시 지하층·옥탑 제외 / 통나무조 적용 제외 /
 *   **주거용건물은 아파트에 한해 최고층수기준만 적용**」뿐 — **용도 제한이 없다.**
 *   2026년 계산사례 13건 실측: **상속 사례 9건이 예외 없이 구분 II 를 받는다.**
 *     · 근생(라멘) №41 — 다른 특성 없이 **「9. 1천㎡ 이하」만**으로 0.90
 *     · 운동시설 №24  — 다른 특성 없이 **「10. 1천㎡ 이상~5천㎡ 미만」만**으로 1.00
 *     · 양도 사례 4건(직업훈련소№33·노인주거복지№35·자원순환№54·판매시설№11)은
 *       조정률 칸이 **「-(양도세 계산시 미적용)」** — 애초에 조정률 대상이 아니다.
 *   ⇒ 종전에 「공식 사례 4건이 반증한다」고 본 것은 **그 4건이 양도 사례임을 몰랐기 때문**이었다.
 *     `nts-cases.test.ts` 의 그 4건은 이제 `manualAdj: 100` 으로 출처와 함께 명시 고정돼 있다.
 *
 * ── ✅ **선행 조건 2건을 없애고 게이트를 풀었다**(같은 PR)
 *   ① **주거 판정을 용도번호로 자동화**했다(`isResidentialUsage`) — 조정률 모달을 열지 않아도
 *      단독주택이 주거로 판정된다. 경계는 체계마다 다르다:
 *      2001~2002 = 1~2 · 2003~2013 = 1~3 · 2014~2026 = 1~2.
 *   ②-1 **아파트 판정도 짝으로 자동화**했다(`isApartmentUsage`) — 주거인데 아파트가 아니면
 *      구분 II 가 **통째로** 빠지므로(단서 「아파트에 한해 최고층수기준만」), 한쪽만 자동화하면
 *      아파트가 「주거·비아파트」로 오판돼 최고층수까지 사라진다(BSP-03 이 그렇게 깨졌다).
 *      ⚠️ 2001~2002 는 #1 이 「단독주택·아파트」 통합이라 번호로 못 가른다 ⇒ 사용자 플래그 정본.
 *   ②-2 **복합은 부분별 용도번호로** 판정한다 — 건물 단위 플래그 하나로는 1층 근생 + 2·3층 주택
 *      혼합이 갈리지 않아 공식 작성례(3) 171,500,000 이 깨졌다.
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

describe("F-09 — §1 구분 II 자동 적용 (수정 후)", () => {
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

  it("미선택(undefined)과 빈 객체 {} 가 **같은 결과**다 — 화면이 둘을 구별하지 않으므로", () => {
    const none = calcBuildingStandardPrice(SUPER_1F({}));
    const empty = calcBuildingStandardPrice(SUPER_1F({ specialFeatures: {} }));
    // 종전에는 504,000(미적용) ↔ 453,000 으로 **11.2% 갈렸다** — 그것이 F-09 의 실체였다.
    expect(none.valuation?.pricePerM2).toBe(453_000);
    expect(empty.valuation?.pricePerM2).toBe(453_000);
    expect(none.valuation!.standardPrice).toBe(empty.valuation!.standardPrice);
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
