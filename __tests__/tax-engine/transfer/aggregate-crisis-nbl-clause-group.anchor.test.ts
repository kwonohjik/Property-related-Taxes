/**
 * anchor: 부칙 §9270호 §14① **중과배제 비사업용 토지는 §104⑤ 합산에서 §104①1호 자산**이다
 *
 * ── 이 파일이 존재하는 이유 ────────────────────────────────────────────
 * `calcTax`는 위기취득(2009.3.16~2012.12.31) 비사업용 토지의 **해당 호**를 이미 `"104-1-1"`로
 * 확정해 싣는다(`transfer-tax-rate-calc.ts:380` — Q2/PR#982). 근거는 해석이 아니라 정본이다:
 *
 *   「부칙 §9270호 §14① — 중과세율 배제(**→ §104①1호 기본세율**, 보유 2년 미만이면 §104①2·3호)」
 *   · 기획재정부 재산세제과-1422(2023.12.26.) — 현행 §104⑦에도 적용
 *   · 서울행정법원 2024구단72950 — 세율만 배제(§95② 장특 배제는 존속)
 *   (`lib/tax-engine/legal-codes/surcharge-transition.ts:41`)
 *
 * 그런데 **`classifyRateGroup`만 그 판정을 따라가지 않았다** — `item.isNonBusinessLand` 원시
 * 플래그만 보고 `non_business_land` 그룹으로 보내, 같은 §104①1호인 사업용 토지와
 * §104⑤2호 버킷을 공유하지 못했다. 예규가 「"자산별" = **제104조 각 호별로 합산한 자산**」으로
 * 못박은 이상(기재부 재산세제과-536 · 국세청 기준-2018-법령해석재산-0098) 합산은 **본문·무조건**이다.
 *
 * 바로 아래 다주택 축(`rateSurchargeStatutoryExcluded`)은 **이미 같은 부칙을 `progressive`로**
 * 분류하고 있었다 — 비사토 축만 빠진 좌우 불일치였다.
 *
 * ⚠️ **그룹 세액 ≠ 결정세액** — 위에 §104⑤ MAX(1호 합산누진, 2호)가 한 번 더 걸린다.
 *   2자산만 두면 1호가 미합산을 그대로 가려 결함이 드러나지 않는다(C-2가 그것을 고정한다).
 *   결함을 결정세액으로 드러내려면 **2호가 이기는 조합**(중과 자산 동석)이 필요하다.
 *
 * ⚠️ **배율 초과분 파트만 비사업용인 자산은 이 정정의 대상이 아니다** — 그 파트가 중과 배제되면
 *   `surchargeType`이 undefined이고 `item.isNonBusinessLand`도 false라 애초에 이 분기에
 *   걸리지 않는다. 「배율 초과분 파트가 자산 전체를 §104⑤상 비사업용 토지 자산으로 만드는가」는
 *   **미판정 별건**이다(C-4가 그 경로의 불변을 고정한다).
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

/** 전 자산 **동일 취득일**(2010-06-01 = 위기취득 윈도 내) — LTHD·과세표준을 대조군과 맞춘다 */
function item(id: string, o: Partial<TransferTaxItemInput> = {}): TransferTaxItemInput {
  return {
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
    transferDate: D("2026-06-01"),
    acquisitionDate: D("2010-06-01"),
    acquisitionPrice: 0,
    isOneHousehold: false,
    householdHousingCount: 0,
    isRegulatedArea: false,
    expenses: 0,
    ...o,
  };
}

function agg(properties: TransferTaxItemInput[]) {
  const input: AggregateTransferInput = {
    taxYear: 2026,
    annualBasicDeductionUsed: 2_500_000, // 기본공제 소진 → 과세표준 = 양도소득금액
    properties,
  };
  return calculateTransferTaxAggregate(input, mockRates);
}

const groupOf = (r: ReturnType<typeof agg>, g: string) => r.groupTaxes.find((x) => x.group === g);

/** 위기취득 비사업용 토지 — +10%p 배제 → 해당 호 §104①1호 */
const crisisNbl = (id: string, gross: number) =>
  item(id, { propertyType: "land", transferPrice: gross, isNonBusinessLand: true });

/** 사업용 토지 — 해당 호 §104①1호. `crisisNbl`과 취득일이 같아 과세표준이 동일하다 */
const plain = (id: string, gross: number) =>
  item(id, { propertyType: "land", transferPrice: gross, isNonBusinessLand: false });

/** 조정지역 3주택 중과 — 2호가 1호를 이기게 만드는 동석 자산 */
const mh3 = (id: string, gross: number) =>
  item(id, {
    propertyType: "housing",
    transferPrice: gross,
    isRegulatedArea: true,
    householdHousingCount: 3,
  });

/** 2015 취득 비사업용 토지 — 위기취득 윈도 **밖** → 종전대로 §104①8호 */
const normalNbl = (id: string, gross: number) =>
  item(id, {
    propertyType: "land",
    transferPrice: gross,
    isNonBusinessLand: true,
    acquisitionDate: D("2015-01-01"),
  });

describe("§104⑤ — 부칙 §9270호 §14① 중과배제 비사토는 §104①1호로 합산", () => {
  it("C-1: 위기취득 비사토 + 사업용 토지가 **한 그룹에서 합산 1회** (중과 자산 동석 → 2호 채택)", () => {
    const r = agg([
      crisisNbl("A", 300_000_000),
      plain("B", 200_000_000),
      mh3("C", 400_000_000),
    ]);

    // 위기취득분은 더 이상 `non_business_land` 그룹을 만들지 않는다.
    expect(groupOf(r, "non_business_land")).toBeUndefined();

    // 두 토지가 같은 §104①1호로 합산된다 (210,000,000 + 140,000,000).
    const g = groupOf(r, "progressive")!;
    expect(g.groupTaxBase).toBe(350_000_000);
    // 350,000,000 × 40% − 25,940,000 = 114,060,000
    // (쪼개면 59,860,000 + 33,560,000 = 93,420,000 — **20,640,000 과소**. 종전 산출이 그 값이었다.)
    expect(g.groupCalculatedTax).toBe(114_060_000);

    // 2호가 1호(전체 합산누진)를 이겨 미합산이 결정세액까지 드러난다.
    expect(r.comparedTaxApplied).toBe("groups");
    expect(r.calculatedTaxByGroups).toBe(368_120_000); // 114,060,000 + 중과 254,060,000
    expect(r.calculatedTax).toBe(368_120_000); // 종전 347,480,000 (실측) — 20,640,000 과소
  });

  it("C-2: **대조군** — 위기취득 비사토를 사업용 토지로 바꿔도 결정세액이 같다", () => {
    // 과세표준·해당 호가 모두 동일하므로 §104⑤ 결과도 같아야 한다.
    // 「비사업용이라는 이유만으로」 갈리던 것이었음을 엔진 자신이 확증한다.
    const control = agg([
      plain("A", 300_000_000),
      plain("B", 200_000_000),
      mh3("C", 400_000_000),
    ]);
    expect(control.groupTaxes.find((x) => x.group === "progressive")!.groupTaxBase).toBe(350_000_000);
    expect(control.calculatedTax).toBe(368_120_000); // C-1과 동일 — 대조군 등식이 성립 기준이다
  });

  it("C-3: 회귀 — 위기취득 윈도 **밖** 비사토는 종전대로 §104①8호(+10%p) 그룹", () => {
    const r = agg([normalNbl("N", 300_000_000), plain("B", 200_000_000)]);
    const g = groupOf(r, "non_business_land");
    expect(g).toBeDefined();
    expect(g!.surchargeRate).toBe(0.1);
    // 사업용 토지와 **합쳐지지 않는다** — 해당 호가 8호와 1호로 다르다.
    expect(groupOf(r, "progressive")).toBeDefined();
  });

  it("C-4: 회귀 — 위기취득 비사토 2건끼리는 종전대로 같은 버킷(§104①1호 합산 1회)", () => {
    const r = agg([crisisNbl("A", 300_000_000), crisisNbl("B", 300_000_000)]);
    const g = groupOf(r, "progressive")!;
    expect(g.groupTaxBase).toBe(420_000_000);
    // 420,000,000 × 40% − 25,940,000 = 142,060,000 (+10%p 없음 — 부칙 배제)
    expect(g.groupCalculatedTax).toBe(142_060_000);
    expect(g.surchargeRate).toBeFalsy();
  });
});
