/**
 * anchor: §104⑤2호 **본문**의 「자산별」 = **호별로 합산한 자산** (예규 고정)
 *
 * 계획서: docs/02-design/features/transfer-104-5-proviso-mixed-use-rate-gaps.plan.md §D-13
 *
 * ── 이 파일이 존재하는 이유 ────────────────────────────────────────────
 * 2026-08-02 **P11에서 정반대로 고쳤다가 되돌렸다**. 그 오류를 다시 들이지 않기 위한 잠금이다.
 *
 * [예규 — 확정] 「"자산별"에서 "자산"의 의미는 동법 **제104조 각 호별로 합산한 자산**을 의미」
 *   · 「기획재정부 재산세제과-536」(생산 2018.6.19.)
 *   · 국세청 「기준-2018-법령해석재산-0098」[법령해석과-1715](생산 2018.6.21. · 등록 2018.11.28.)
 *     — 위 기재부 해석을 그대로 인용해 회신
 *
 * ⇒ **같은 호 자산의 과세표준 합산은 「단서」가 아니라 「본문」이고, 조건이 없다.**
 *   자산별 **적용세율**이 같은지(누진 구간이 같은지)는 **묻지 않는다**.
 *
 * 단서는 그 위에 얹히는 별개 규칙이다 — 「그 자산이 **둘 이상의 호**에 해당해 적용세율이
 * 둘 이상이면, 합산액에 **각 해당 호별** 세율을 적용해 **큰** 산출세액을 취한다」.
 * 교재 사례2(§104①2호 + §104⑦3호 동시 해당)가 그 국면이고 D-11/P9가 구현했다
 * (`aggregate-same-clause-104-5.anchor.test.ts`).
 *
 * ❌ **재제안 금지 — 「자산별 적용세율이 같으면 자산별 합으로 쪼갠다」.**
 *   P11이 그렇게 고쳤다가 과소과세를 만들었다(실측: `progressive` 231,260,000 →
 *   207,960,000). 「2호 본문은 자산별로 누진을 각각 태워 구간이 리셋된다」는 서술도
 *   **호가 다른 경우에만** 맞다 — 같은 호는 합산이다.
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

const groupOf = (r: ReturnType<typeof agg>, g: string) => r.groupTaxes.find((x) => x.group === g)!;

/**
 * 각 케이스에 미등기(70%)를 함께 둬 `byGroups`가 `byGeneral`을 이기게 만든다 —
 * 누진 호 그룹만 있으면 1호가 같은 값을 내 그룹 내부 계산 방식이 최종 세액에 드러나지 않는다.
 */
describe("§104⑤2호 본문 — 같은 호 자산은 **적용세율이 같아도** 합산 1회", () => {
  it("B-36: `progressive` 2건(둘 다 38% 구간) — 합산 468,000,000으로 1회", () => {
    const r = agg([plain("P1", 300_000_000), plain("P2", 300_000_000), unreg("U", 100_000_000)]);
    const g = groupOf(r, "progressive");
    expect(g.groupTaxBase).toBe(468_000_000);
    // 468,000,000 × 40% − 25,940,000 = 161,260,000
    // (자산별로 쪼개면 68,980,000 × 2 = 137,960,000 — **과소**. P11이 이 값을 냈다.)
    expect(g.groupCalculatedTax).toBe(161_260_000);
    expect(r.calculatedTax).toBe(231_260_000);
  });

  it("B-37: `non_business_land` 2건(동률) — 합산 1회 + 10%p", () => {
    const r = agg([nbl("N1", 300_000_000), nbl("N2", 300_000_000), unreg("U", 100_000_000)]);
    // 161,260,000 + 10%p × 468,000,000 = 46,800,000 → 208,060,000
    expect(groupOf(r, "non_business_land").groupCalculatedTax).toBe(208_060_000);
    expect(r.calculatedTax).toBe(278_060_000);
  });

  it("B-38: `multi_house_surcharge` ⑦3호 2건(동률) — 합산 1회 + 30%p", () => {
    const r = agg([mh3("M1", 300_000_000), mh3("M2", 300_000_000), unreg("U", 100_000_000)]);
    const g = groupOf(r, "multi_house_surcharge");
    expect(g.groupTaxBase).toBe(600_000_000); // 중과라 LTHD 배제
    // 600,000,000 × 42% − 35,940,000 = 216,060,000 + 30% × 600,000,000 = 180,000,000
    expect(g.groupCalculatedTax).toBe(396_060_000);
    expect(r.calculatedTax).toBe(466_060_000);
  });

  it("B-41: `progressive` 2건이 **다른 구간**(38%·42%)이어도 같은 결론 — 합산 1회", () => {
    // 교재 사례1(§1.6)과 같은 구조: B주택 3억(40%) + C주택 5억(42%) → 합산 8억.
    // 적용세율이 갈리든 같든 **본문이 호별 합산**이므로 처리가 동일하다는 것을 고정한다.
    const r = agg([plain("P1", 300_000_000), plain("P2", 700_000_000), unreg("U", 100_000_000)]);
    const g = groupOf(r, "progressive");
    expect(g.groupTaxBase).toBe(780_000_000); // 234,000,000 + 546,000,000
    expect(g.groupCalculatedTax).toBe(291_660_000); // 780,000,000 × 42% − 35,940,000
  });
});

describe("§104⑤2호 본문 — 합산 단위는 「호」다", () => {
  it("B-39: `unregistered` 2건(§104①10호 70% 단일세율)도 합산 1회 — floor 1원이 판별한다", () => {
    // 과세표준 100,000,001씩. 자산별이면 floor(100,000,001×0.7)=70,000,000 → 합 140,000,000.
    // 합산 1회면 floor(200,000,002×0.7)=140,000,001.
    const r = agg([unreg("U1", 100_000_001), unreg("U2", 100_000_001)]);
    expect(groupOf(r, "unregistered").groupTaxBase).toBe(200_000_002);
    expect(groupOf(r, "unregistered").groupCalculatedTax).toBe(140_000_001);
  });

  it("B-40: 누진 호 자산이 **1건**이면 합산 대상이 없다 — 자산 단위 그대로", () => {
    const r = agg([plain("P1", 300_000_000), unreg("U", 100_000_000)]);
    expect(groupOf(r, "progressive").groupCalculatedTax).toBe(68_980_000);
    expect(r.calculatedTax).toBe(138_980_000);
  });

  it("B-42: **호가 다르면**(⑦1호 +20%p / ⑦3호 +30%p) 합산하지 않는다 — 자산별 합", () => {
    // 예규는 「각 **호별**로 합산」이라고 했다. 호가 다르면 합산 단위가 다르다.
    // R7 감사(2026-07-29)가 고친 결함 — `mixedTier`가 이 판정을 담당한다.
    const r = agg([
      mh3("M1", 300_000_000),
      item("M2", {
        propertyType: "housing",
        transferPrice: 300_000_000,
        isRegulatedArea: true,
        householdHousingCount: 2, // ⑦1호 +20%p
      }),
    ]);
    const g = groupOf(r, "multi_house_surcharge");
    expect(g.groupTaxBase).toBe(600_000_000);
    // 자산별: (94,060,000 + 90,000,000) + (94,060,000 + 60,000,000) = 338,120,000
    // 합산 1회로 묶으면 대표세율 하나가 전체에 적용돼 입력 순서 의존이 되살아난다.
    expect(g.groupCalculatedTax).toBe(338_120_000);
  });
});
