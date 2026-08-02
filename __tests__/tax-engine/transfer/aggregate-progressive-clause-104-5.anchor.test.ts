/**
 * anchor: 누진 호 그룹은 §104⑤2호 **본문**(자산별 합)이다 — 합산 1회 금지 (P11 / D-13)
 *
 * 계획서: docs/02-design/features/transfer-104-5-proviso-mixed-use-rate-gaps.plan.md
 *   §D-13 · §4.9(설계)
 *
 * ── 무엇을 고정하는가 ──────────────────────────────────────────────────
 * [법령 — §104⑤] 산출세액 = MAX(1호, 2호)
 *   1호: 해당 과세기간의 양도소득과세표준 **합계액**에 §55①의 세율
 *   2호 **본문**: §104①~④·⑦에 따라 계산한 **자산별** 양도소득 산출세액 **합계액**
 *   2호 **단서**: 둘 이상의 자산에 ⓐ「동일한 호의 세율이 적용되고」 ⓑ「그 **적용세율이 둘 이상**인
 *     경우」해당 자산의 과세표준을 **합산**한 것에 각 해당 **호별** 세율을 적용해 **큰** 산출세액
 *
 * **단서는 요건 둘을 함께 요구한다.** 종전 엔진(`:505-507`)은 ⓐ(중과 tier 동일)만 보고
 * **ⓑ를 검사하지 않아**, 자산별 적용세율이 **모두 같아도** 그룹 과세표준을 합산 1회 계산했다.
 * 누진 호에서 합산 1회는 누진 **구간과 누진공제를 통째로 병합**해 **과대**가 된다.
 *
 * ── ⓑ「적용세율이 둘 이상」의 뜻 ──────────────────────────────────────
 * **같은 호 안에서 자산별 적용세율이 갈리는 것**을 말한다. 누진 호는 과세표준 구간에 따라
 * 자산마다 한계세율이 달라지고, 그때가 단서가 예정한 국면이다.
 *
 * 근거는 교재 사례1(계획서 §1.6 — 원 단위 재현 완료)이다:
 *   A토지 2억(§104①1호) + **B주택 3억·C주택 5억(둘 다 §104⑦3호 · 2년 이상)**
 *   → B·C는 **적용세율이 40%·42%로 둘**이라 단서가 걸려 **합산 8억**으로 계산한다.
 *   ⇒ 「자산이 둘 이상의 **호**에 해당해야 ⓑ가 성립한다」는 해석은 **이 사례가 반증한다**
 *     (B·C는 ⑦3호 하나뿐이다). 그 anchor는 `aggregate-same-clause-104-5.anchor.test.ts` B-29.
 *
 * 반대로 자산별 적용세율이 **하나뿐**이면 단서의 효과절인 「각 해당 호별 세율을 적용하여
 * 산출한 세액 중에서 **큰** 산출세액」이라는 절차가 성립할 여지가 없다 ⇒ **2호 본문**(자산별 합).
 * 「2호 본문은 자산별로 누진을 각각 태우므로 **구간이 리셋**된다」는 R7 감사(2026-07-29,
 * `docs/00-pm/transfer-open-items.plan.md:554-575`)가 확정한 doctrine이다 —
 * 엔진은 tier가 갈릴 때만 그것을 따르고 **tier·세율이 모두 같으면 스스로 위반**했다.
 *
 * ⚠️ `unregistered`(§104①10호 70% **단일세율**)는 ⓑ가 영원히 불충족이지만 **대상이 아니다** —
 *   그 호에서는 두 경로의 차이가 실제로 floor 횟수뿐이라 세액 판단이 갈리지 않는다.
 *   종전 floor 규약을 유지한다(B-39가 그 규약을 고정한다).
 *
 * 🔶 **미확인**: ⓑ를 「그 과세기간 자산 전체에 적용되는 세율이 둘 이상」으로 읽는 해석도
 *   교재 두 사례를 설명한다(사례1·2 모두 A토지가 있어 호가 둘이다). 그 해석이면 이 파일의
 *   B-36~B-38도 합산이 맞다. 두 해석을 가르는 근거는 **국세청 89198(2018.6.21.)** 본문인데
 *   법제처 OPEN API가 국세청 해석 본문을 제공하지 않아 미확보다(계획서 §1.6·§D-13).
 *   여기서는 **문언에 더 가까운 쪽**(「그」의 선행사 = 앞의 「둘 이상의 자산」)을 채택했다.
 */
import { describe, it, expect } from "vitest";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const D = (s: string) => new Date(s);

function item(id: string, o: Partial<TransferTaxItemInput> = {}): TransferTaxItemInput {
  return {
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
    transferDate: D("2026-06-01"),
    acquisitionDate: D("2015-01-01"), // 11년 보유 → 24개월 게이트 통과(누진 호 그룹)
    acquisitionPrice: 0,
    isOneHousehold: false,
    householdHousingCount: 0,
    isRegulatedArea: false,
    expenses: 0,
    ...o,
  };
}

/** 사업용 토지 — `progressive` 그룹. LTHD 22%(11년) → 과세표준 = gross × 0.78 */
const plain = (id: string, gross: number) =>
  item(id, { propertyType: "land", transferPrice: gross, isNonBusinessLand: false });

/** 비사업용 토지 — `non_business_land` 그룹(누진 + 10%p). 취득 2015 = 위기취득 배제구간 밖 */
const nbl = (id: string, gross: number) =>
  item(id, { propertyType: "land", transferPrice: gross, isNonBusinessLand: true });

/** 조정지역 3주택 — `multi_house_surcharge` 그룹(누진 + 30%p). 중과라 LTHD 배제 */
const mh3 = (id: string, gross: number) =>
  item(id, {
    propertyType: "housing",
    transferPrice: gross,
    isRegulatedArea: true,
    householdHousingCount: 3,
  });

/** 미등기 — `unregistered` 그룹(70% 단일). LTHD·기본공제 배제 → 과세표준 = gross */
const unreg = (id: string, gross: number) =>
  item(id, { propertyType: "land", transferPrice: gross, isUnregistered: true });

function agg(properties: TransferTaxItemInput[]) {
  const input: AggregateTransferInput = {
    taxYear: 2026,
    annualBasicDeductionUsed: 2_500_000, // 기본공제 소진 → 과세표준 = 양도소득금액
    properties,
  };
  return calculateTransferTaxAggregate(input, mockRates);
}

const groupTax = (r: ReturnType<typeof agg>, g: string) =>
  r.groupTaxes.find((x) => x.group === g)!.groupCalculatedTax;

describe("P11 / D-13 — 누진 호 그룹은 자산별 합 (§104⑤2호 본문)", () => {
  /**
   * 미등기(70%)를 함께 둬 `byGroups`가 `byGeneral`을 이기게 만든다 —
   * 누진 호 그룹만 있으면 1호가 같은 값을 내 결함이 최종 세액에 드러나지 않는다.
   */
  it("B-36: `progressive` 2건(동률 38%) — 합산 1회가 아니라 자산별 합", () => {
    const r = agg([plain("P1", 300_000_000), plain("P2", 300_000_000), unreg("U", 100_000_000)]);
    // 각 자산 과세표준 234,000,000 → 234,000,000×38% − 19,940,000 = 68,980,000
    // 종전(합산 1회): 468,000,000×40% − 25,940,000 = 161,260,000  ← 누진공제·구간 병합
    expect(groupTax(r, "progressive")).toBe(137_960_000);
    // §104⑤ MAX(1호 202,620,000, 2호 본문 207,960,000) = 207,960,000
    expect(r.calculatedTax).toBe(207_960_000);
  });

  it("B-37: `non_business_land` 2건(동률) — 자산별 합", () => {
    const r = agg([nbl("N1", 300_000_000), nbl("N2", 300_000_000), unreg("U", 100_000_000)]);
    // 각 자산: 누진 68,980,000 + 10%p × 234,000,000 = 23,400,000 → 92,380,000
    // 종전(합산 1회): 161,260,000 + 46,800,000 = 208,060,000
    expect(groupTax(r, "non_business_land")).toBe(184_760_000);
    expect(r.calculatedTax).toBe(254_760_000);
  });

  it("B-38: `multi_house_surcharge` 3주택 2건(동률 +30%p) — 자산별 합", () => {
    const r = agg([mh3("M1", 300_000_000), mh3("M2", 300_000_000), unreg("U", 100_000_000)]);
    // 각 자산(LTHD 배제 → 과세표준 300,000,000):
    //   누진 300,000,000×40% − 25,940,000 = 94,060,000 + 30% × 300,000,000 = 90,000,000 → 184,060,000
    // ⇒ R7 감사가 §104⑤ 도출값 280,120,000을 계산할 때 쓴 **바로 그 산식**이다.
    // 종전(합산 1회): 600,000,000×42% − 35,940,000 = 216,060,000 + 180,000,000 = 396,060,000
    expect(groupTax(r, "multi_house_surcharge")).toBe(368_120_000);
    expect(r.calculatedTax).toBe(438_120_000);
  });
});

describe("P11 대조 — ⓑ가 충족되면 종전대로 합산 1회", () => {
  it("B-41: `progressive` 2건이 **다른 구간**(38%·42%)이면 단서 발동 → 합산 1회", () => {
    // 교재 사례1과 같은 구조(§1.6 — B 40% + C 42% → 합산 8억)를 누진 호에서 재현한다.
    // 과세표준 234,000,000(38%) + 546,000,000(42%) → 적용세율이 **둘** ⇒ ⓑ 충족.
    const r = agg([plain("P1", 300_000_000), plain("P2", 700_000_000), unreg("U", 100_000_000)]);
    const g = r.groupTaxes.find((x) => x.group === "progressive")!;
    expect(g.groupTaxBase).toBe(780_000_000);
    // 합산 1회: 780,000,000×42% − 35,940,000 = 291,660,000
    // (자산별 합이라면 68,980,000 + 193,380,000 = 262,360,000 — 단서가 이를 배제한다)
    expect(g.groupCalculatedTax).toBe(291_660_000);
  });
});

describe("P11 회귀 — 바꾸지 않은 경로", () => {
  it("B-39: `unregistered`(70% 단일세율)는 **합산 1회 유지** — floor 규약 불변", () => {
    // 과세표준 100,000,001씩. 자산별이면 floor(100,000,001×0.7)=70,000,000 → 합 140,000,000.
    // 합산 1회면 floor(200,000,002×0.7)=140,000,001. **1원 차이가 경로를 판별한다.**
    const r = agg([unreg("U1", 100_000_001), unreg("U2", 100_000_001)]);
    expect(r.groupTaxes.find((x) => x.group === "unregistered")!.groupTaxBase).toBe(200_000_002);
    expect(groupTax(r, "unregistered")).toBe(140_000_001);
  });

  it("B-40: 누진 호 자산이 **1건**이면 합산할 대상이 없어 불변", () => {
    const r = agg([plain("P1", 300_000_000), unreg("U", 100_000_000)]);
    expect(groupTax(r, "progressive")).toBe(68_980_000);
    expect(r.calculatedTax).toBe(138_980_000);
  });
});
