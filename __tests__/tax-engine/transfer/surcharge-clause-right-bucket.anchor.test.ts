/**
 * anchor: §104⑤2호 «동일한 호» 합산 버킷 — §104⑦1호와 2호, 3호와 4호를 한 버킷에 넣지 않는다 (후보 ⑥ · 2026-11-21)
 *
 * ## 법령 (KoreanLaw MCP 본문 실독 · 소득세법 현행 시행 2026-07-01본)
 *
 * §104⑤2호 단서 — 「둘 이상의 자산에 대하여 제1항 각 호, 제4항 각 호 및 제7항 각 호에 따른 세율 중 **동일한 호**의 세율이
 * 적용되고 … 각 자산의 양도소득과세표준을 합산한 것에 대하여 … 각 해당 호별 세율을 적용」.
 * §104⑦은 1호(1세대 2주택)·2호(1주택과 조합원입주권 또는 분양권 1개)·3호(1세대 3주택 이상)·4호(주택과 조합원입주권
 * 또는 분양권의 수의 합이 3 이상)를 **각 호로 따로** 둔다(가산율은 1·2호 100분의 20, 3·4호 100분의 30).
 * ⇒ 1호 주택과 2호 주택은 「동일한 호」가 아니므로 과세표준을 합산하지 않는다(3호·4호도 같다).
 *
 * ## 종전 결함
 * 엔진의 호 표지(`RateClause`)가 `104-7-1`·`104-7-3` 둘뿐이라, 같은 해 ⑦1호 주택과 ⑦2호 주택이 한 버킷에서
 * 합산 과세표준에 누진세율을 적용받았다(아래 S-1: 520,510,000 — 33,890,000 과다).
 * 수정은 버킷 **식별자**에만 `right:` 구분자를 붙인다(호 키·통산 키·신고서 코드는 그대로 — 사용자 결정 2026-11-21).
 *
 * ## 기대값 손계산 (2026 귀속 §55① — 3억 초과 5억 이하 40%·누진공제 25,940,000 / 5억 초과 10억 이하 42%·35,940,000)
 * 모든 시나리오: 자산 A 양도차익 5억(8억−3억) · 자산 B 4억(7억−3억) · 중과 주택이라 장기보유특별공제 0(§95②)
 *   · 기본공제 2,500,000은 A에서 공제(어느 쪽에서 공제해도 두 자산 모두 40% 구간이라 결과가 같다 — 아래 검산).
 *   - 가산 20%p(1·2호): A 497,500,000 × 60% − 25,940,000 = 272,560,000 · B 400,000,000 × 60% − 25,940,000 = 214,060,000
 *       → 호별 합 486,620,000 (B에서 공제해도 274,060,000 + 212,560,000 = 486,620,000)
 *       → 같은 호 합산이면 897,500,000 × 62% − 35,940,000 = 520,510,000
 *   - 가산 30%p(3·4호): A 497,500,000 × 70% − 25,940,000 = 322,310,000 · B 400,000,000 × 70% − 25,940,000 = 254,060,000
 *       → 호별 합 576,370,000 / 같은 호 합산 897,500,000 × 72% − 35,940,000 = 610,260,000
 *   - §104⑤1호(전체 누진) 897,500,000 × 42% − 35,940,000 = 341,010,000 — 어느 쪽보다 작아 2호 금액이 채택된다.
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST as MULTI_POST } from "@/app/api/calc/transfer/multi/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRatesWithHouseEngine, makeHouseInfo } from "../_helpers/mock-rates";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";

const rates = makeMockRatesWithHouseEngine();

// ── 손계산 (BigInt) ────────────────────────────────────────────
const BASIC = 2_500_000n;
const A_GAIN = 800_000_000n - 300_000_000n;
const B_GAIN = 700_000_000n - 300_000_000n;
/** §55① 2026 — 3억 초과 5억 이하 / 5억 초과 10억 이하 구간만 쓴다 */
const progressive = (base: bigint, addPct: bigint) =>
  base <= 500_000_000n
    ? (base * (40n + addPct)) / 100n - 25_940_000n
    : (base * (42n + addPct)) / 100n - 35_940_000n;
const perClause = (addPct: bigint) => Number(progressive(A_GAIN - BASIC, addPct) + progressive(B_GAIN, addPct));
const merged = (addPct: bigint) => Number(progressive(A_GAIN + B_GAIN - BASIC, addPct));

const right = (id: string) => ({
  id,
  type: "redevelopment_right" as const,
  acquisitionDate: new Date("2025-01-01"),
  region: "capital" as const,
});

function asset(
  id: string,
  transferPrice: number,
  transferDate: string,
  houseIds: string[],
  rightIds: string[],
): TransferTaxItemInput {
  return {
    propertyId: id,
    propertyLabel: id,
    propertyType: "housing",
    transferPrice,
    acquisitionPrice: 300_000_000,
    acquisitionDate: new Date("2020-01-01"),
    transferDate: new Date(transferDate),
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: houseIds.length,
    householdRightCount: rightIds.length,
    residencePeriodMonths: 0,
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: true,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    reductions: [],
    annualBasicDeductionUsed: 0,
    regionCode: "11680",
    houses: houseIds.map((h) => makeHouseInfo(h)),
    presaleRights: rightIds.map(right),
    sellingHouseId: houseIds[0],
  } as unknown as TransferTaxItemInput;
}

/** A는 2026-06-01 8억 양도, B는 2026-09-01 7억 양도 */
const A = (houses: string[], rights: string[]) => asset("A", 800_000_000, "2026-06-01", houses, rights);
const B = (houses: string[], rights: string[]) => asset("B", 700_000_000, "2026-09-01", houses, rights);

const run = (props: TransferTaxItemInput[]) =>
  calculateTransferTaxAggregate({ taxYear: 2026, annualBasicDeductionUsed: 0, properties: props }, rates);

const OVERLAP_NOTICE = "확인 필요";

describe("§104⑦ 1·2호 / 3·4호 — 동일한 호가 아니면 합산하지 않는다", () => {
  it("검산 — 손계산 상수", () => {
    expect(perClause(20n)).toBe(486_620_000);
    expect(merged(20n)).toBe(520_510_000);
    expect(perClause(30n)).toBe(576_370_000);
    expect(merged(30n)).toBe(610_260_000);
  });

  it("S-1 🔴 ⑦1호(2주택) + ⑦2호(1주택+입주권 1) → 호별 486,620,000 (종전 520,510,000)", () => {
    const r = run([A(["A", "B"], []), B(["B"], ["R1"])]);
    // 전제 — 두 자산 모두 중과 주택이고, B만 권리를 센 세대다.
    expect(r.properties.map((p) => p.surchargeHouseholdHasCountedRight ?? false)).toEqual([false, true]);
    expect(r.calculatedTaxByGroups).toBe(perClause(20n));
    expect(r.calculatedTax).toBe(perClause(20n));
  });

  it("S-2 🔴 ⑦3호(3주택) + ⑦4호(2주택+입주권 1) → 호별 576,370,000 (종전 610,260,000)", () => {
    const r = run([A(["A", "B", "C"], []), B(["B", "C"], ["R1"])]);
    expect(r.properties.map((p) => p.surchargeHouseholdHasCountedRight ?? false)).toEqual([false, true]);
    expect(r.calculatedTax).toBe(perClause(30n));
    // 3호·4호 겹침 자산이 없으면 고지하지 않는다.
    expect(r.warnings.some((w) => w.includes(OVERLAP_NOTICE) && w.includes("3호"))).toBe(false);
  });

  it("C-1 대조 ⑦1호 + ⑦1호 → 같은 호 합산 520,510,000", () => {
    expect(run([A(["A", "B"], []), B(["B", "C"], [])]).calculatedTax).toBe(merged(20n));
  });

  it("C-2 대조 ⑦2호 + ⑦2호 → 같은 호 합산 520,510,000", () => {
    expect(run([A(["A"], ["R0"]), B(["B"], ["R1"])]).calculatedTax).toBe(merged(20n));
  });

  it("C-3 대조 ⑦4호 + ⑦4호 → 같은 호 합산 610,260,000", () => {
    expect(run([A(["A", "B"], ["R0"]), B(["B", "C"], ["R1"])]).calculatedTax).toBe(merged(30n));
  });

  it("C-4 대조 ⑦3호 + ⑦3호 → 같은 호 합산 610,260,000", () => {
    expect(run([A(["A", "B", "C"], []), B(["B", "C", "D"], [])]).calculatedTax).toBe(merged(30n));
  });
});

describe("3호·4호 겹침(주택 3채 이상 + 산입 권리) — 4호 버킷 · 그룹이 갈릴 때만 확인 필요 고지", () => {
  it("O-1 겹침 자산 + 순수 3호 자산 → 4호로 보아 따로(576,370,000) + 확인 필요 고지", () => {
    const r = run([A(["A", "B", "C"], []), B(["B", "C", "D"], ["R1"])]);
    expect(r.calculatedTax).toBe(perClause(30n));
    const notice = r.warnings.filter((w) => w.includes(OVERLAP_NOTICE) && w.includes("3호") && w.includes("4호"));
    expect(notice).toHaveLength(1);
    expect(notice[0]).not.toMatch(/유리|불리/);
  });

  it("O-2 겹침 자산 + 순수 4호 자산 → 4호 버킷 합산(610,260,000) · 고지 없음", () => {
    const r = run([A(["A", "B"], ["R0"]), B(["B", "C", "D"], ["R1"])]);
    expect(r.calculatedTax).toBe(merged(30n));
    expect(r.warnings.some((w) => w.includes(OVERLAP_NOTICE) && w.includes("3호") && w.includes("4호"))).toBe(false);
  });
});

/**
 * 보유 1년 이상 2년 미만(§104①2호) ⑦1호 + ⑦2호 — 현행 유지(호가 다르면 합산하지 않음) + 확인 필요 고지 (사용자 결정 2026-11-22)
 * 시료(리뷰 probe와 같음): 각 13억 양도 · 3억 취득 · 2025-03-01 취득 · 2026-06-01 / 2026-09-01 양도 → 양도차익 각 10억 · 장특 0.
 *   현행(호별): 자산마다 60%가 중과(누진 + 20%p)보다 크다 → 997,500,000 × 60% + 1,000,000,000 × 60% = 598,500,000 + 600,000,000 = 1,198,500,000
 *   넓은 읽기(①2호 공유 = 동일한 호 · 합산 과세표준에 ⑦ 세율): 1,997,500,000 × 65% − 65,940,000 = 1,232,435,000 (⑦1+⑦1 대조군 값)
 */
describe("1~2년 단기 ⑦1호 + ⑦2호 — 합산하지 않음 + 해석례 미확인 고지", () => {
  const SHORT_NOTICE = "단기 세율의 호를 함께 쓰는 경우의 합산 단위";
  const short = (id: string, transferDate: string, houses: string[], rights: string[]) => ({
    ...asset(id, 1_300_000_000, transferDate, houses, rights),
    acquisitionDate: new Date("2025-03-01"),
  }) as TransferTaxItemInput;
  const notices = (r: ReturnType<typeof run>) => r.warnings.filter((w) => w.includes(SHORT_NOTICE));

  it("검산 — 손계산 상수", () => {
    expect(Number((997_500_000n * 60n) / 100n + (1_000_000_000n * 60n) / 100n)).toBe(1_198_500_000);
    expect(Number((1_997_500_000n * 65n) / 100n - 65_940_000n)).toBe(1_232_435_000);
  });

  it("ST-1 ⑦1호 + ⑦2호(둘 다 1~2년) → 1,198,500,000 · 고지 1건(유리·불리 표현 없음)", () => {
    const r = run([short("A", "2026-06-01", ["A", "B"], []), short("B", "2026-09-01", ["B"], ["R1"])]);
    expect(r.properties.map((p) => p.surchargeHouseholdHasCountedRight ?? false)).toEqual([false, true]);
    expect(r.calculatedTax).toBe(1_198_500_000);
    const n = notices(r);
    expect(n).toHaveLength(1);
    expect(n[0]).toContain("확인 필요");
    expect(n[0]).not.toMatch(/유리|불리/);
  });

  it("ST-2 대조 ⑦1호 + ⑦1호(둘 다 1~2년) → 같은 호 합산 1,232,435,000 · 고지 없음", () => {
    const r = run([short("A", "2026-06-01", ["A", "B"], []), short("B", "2026-09-01", ["B", "C"], [])]);
    expect(r.calculatedTax).toBe(1_232_435_000);
    expect(notices(r)).toHaveLength(0);
  });

  it("ST-3 대조 2년 이상 ⑦1호 + ⑦2호(S-1) → 단기 고지 없음", () => {
    expect(notices(run([A(["A", "B"], []), B(["B"], ["R1"])]))).toHaveLength(0);
  });

  it("ST-4 한쪽만 1~2년 ⑦1호 + 2년 이상 ⑦2호 → 단기 고지 없음", () => {
    expect(notices(run([short("A", "2026-06-01", ["A", "B"], []), B(["B"], ["R1"])]))).toHaveLength(0);
  });
});

describe("다건 route POST — ⑫ Zod → ⑭ 매핑 → 엔진", () => {
  /** JSON 경유(날짜 문자열) — 위 엔진 시나리오 S-1과 같은 사실관계 */
  const jsonHouse = (id: string) => ({
    id,
    acquisitionDate: "2020-01-01",
    officialPrice: 300_000_000,
    region: "capital",
    isInherited: false,
    isLongTermRental: false,
    isApartment: true,
    isOfficetel: false,
    isUnsoldHousing: false,
  });
  const jsonProp = (id: string, transferPrice: number, transferDate: string, houseIds: string[], rightIds: string[]) => ({
    propertyId: id,
    propertyLabel: id,
    propertyType: "housing",
    transferPrice,
    acquisitionPrice: 300_000_000,
    acquisitionDate: "2020-01-01",
    transferDate,
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: houseIds.length,
    householdRightCount: rightIds.length,
    residencePeriodMonths: 0,
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: true,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    reductions: [],
    regionCode: "1168010100",
    houses: houseIds.map(jsonHouse),
    presaleRights: rightIds.map((r) => ({ id: r, type: "redevelopment_right", acquisitionDate: "2025-01-01", region: "capital" })),
    sellingHouseId: houseIds[0],
  });

  it("R-1 🔴 ⑦1호 + ⑦2호 → 486,620,000 (종전 520,510,000)", async () => {
    const res = await MULTI_POST(
      new NextRequest("http://localhost/api/calc/transfer/multi", {
        method: "POST",
        headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify({
          taxYear: 2026,
          properties: [
            jsonProp("A", 800_000_000, "2026-06-01", ["A", "B"], []),
            jsonProp("B", 700_000_000, "2026-09-01", ["B"], ["R1"]),
          ],
        }),
      }),
    );
    const json = await res.json();
    expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
    expect(json.data.properties.map((p: { surchargeHouseholdHasCountedRight?: boolean }) => p.surchargeHouseholdHasCountedRight ?? false)).toEqual([false, true]);
    expect(json.data.calculatedTax).toBe(perClause(20n));
  });
});
