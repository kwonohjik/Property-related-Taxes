/**
 * anchor (L-11) — 「소급 2년 내 피상속인 증여주택 제외」는 **§155② 단독상속 풀에만** 걸린다.
 *
 * 법령(KoreanLaw MCP — 「소득세법 시행령」 현행 MST 286211 실독, 2026-09-28):
 *   · §155② 괄호 「그 밖의 주택(상속개시 당시 보유한 주택 … 만 해당하며, 상속개시일부터 소급하여 2년
 *     이내에 피상속인으로부터 증여받은 주택 … 은 제외한다. **이하 이 항에서** "일반주택"이라 한다)」
 *     — 범위가 「이 항」(②)으로 한정된다. 같은 항 단서(동거봉양 합가)는 「(이하 **제3항**, 제7항제1호, …에서
 *     같다)」로 ③에 명시 연결하지만 괄호에는 그런 연결이 없다.
 *   · §155③ 「제154조제1항을 적용할 때 공동상속주택 … 외의 다른 주택을 양도하는 때에는 해당 공동상속주택은
 *     해당 거주자의 주택으로 보지 아니한다.」 — 보유 시점·증여 제외 괄호가 없다.
 *   · 서면-2021-법규재산-1901(법규과-1841, 2022.6.21.) — 공동상속주택 소수지분 상속 **후** 취득한 일반주택
 *     양도에도 「공동상속주택(B)은 보유주택으로 보지 아니하므로 … 제154조제1항을 적용」 ⇒ ②의 괄호를 ③에
 *     가져오지 않는다(taxlaw.nts.go.kr 원문 확인). 증여 제외만 ③에 적용한 직접 해석례는 미확보.
 *
 * 종전에는 `resolveInheritedHouseExclusion` 첫 줄이 증여 불리언으로 **②·③ 풀을 모두** 비웠다(납세자 불리).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { resolveInheritedHouseExclusionFromInput } from "@/lib/tax-engine/transfer-inheritance-exclusion";
import { judgeOneHouseExemptionFromInput } from "@/lib/tax-engine/one-house/judge";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import { baseTransferInput, makeMockRates, makeHouseInfo } from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);
const rates = makeMockRates();

type Pool = "sole" | "co_minority" | "co_largest";
const inheritedRow = (pool: Pool, id = "inh") =>
  makeHouseInfo(id, {
    isInherited: true,
    inheritedDate: D("2019-06-01"),
    acquisitionDate: D("2019-06-01"),
    ...(pool === "sole"
      ? {}
      : { isCoInherited: true, isLargestCoInheritedShareholder: pool === "co_largest" }),
  });

/**
 * 일반주택 A — 2018-03-01 피상속인에게서 증여(상속개시 2019-06-01의 소급 2년 내) · 비조정 · 8억 ·
 * 양도 2023-06-01. 세대 2주택(A + 상속주택 1채).
 */
function input(pool: Pool, giftDate: string | undefined, over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 2,
    sellingHouseId: "selling",
    transferPrice: 800_000_000,
    acquisitionPrice: 400_000_000,
    acquisitionDate: D("2018-03-01"),
    transferDate: D("2023-06-01"),
    houses: [makeHouseInfo("selling", { acquisitionDate: D("2018-03-01") }), inheritedRow(pool)],
    generalHouseGiftedFromDecedentWithin2yr: true,
    ...(giftDate ? { generalHouseGiftDate: D(giftDate) } : {}),
    ...over,
  } as Partial<TransferTaxInput>);
}
const ex = (i: TransferTaxInput) => resolveInheritedHouseExclusionFromInput(i);

describe("L-11 — §155③ 공동상속(소수지분) 풀에는 증여 제외 괄호가 없다", () => {
  it("🔴 ③ 소수지분 + 증여(2018-02-13 이후) 일반주택 → 공동상속주택 제외 1 → 비과세", () => {
    const i = input("co_minority", "2018-03-01");
    expect(ex(i).coExcludedCount).toBe(1);
    expect(ex(i).excludedHouses).toEqual([{ houseId: "inh", basis: "co_inherited" }]);
    const r = calculateTransferTax(i, rates);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });

  it("② 쌍둥이 — 같은 사실에 단독상속이면 증여 제외 괄호로 제외 0 → 과세", () => {
    const i = input("sole", "2018-03-01");
    expect(ex(i).soleExcludedCount).toBe(0);
    expect(ex(i).excludedCount).toBe(0);
    const r = calculateTransferTax(i, rates);
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBeGreaterThan(0);
  });

  it("② 연혁 쌍둥이(±1일) — 증여 2018-02-12 → 괄호 적용 전이라 제외 1 / 2018-02-13 → 제외 0", () => {
    expect(ex(input("sole", "2018-02-12")).soleExcludedCount).toBe(1);
    expect(ex(input("sole", "2018-02-13")).soleExcludedCount).toBe(0);
  });

  it("③ 연혁 쌍둥이 — 증여일이 2018-02-12든 2018-02-13이든 ③ 제외는 그대로 1", () => {
    expect(ex(input("co_minority", "2018-02-12")).coExcludedCount).toBe(1);
    expect(ex(input("co_minority", "2018-02-13")).coExcludedCount).toBe(1);
  });

  it("증여일 미입력(구 저장분) — ②는 종전대로 배제 유지, ③은 제외 1", () => {
    expect(ex(input("sole", undefined)).soleExcludedCount).toBe(0);
    expect(ex(input("co_minority", undefined)).coExcludedCount).toBe(1);
  });

  it("③ 단서 — 최대지분 상속인은 증여와 무관하게 산입(제외 0)", () => {
    expect(ex(input("co_largest", "2018-03-01")).excludedCount).toBe(0);
  });

  it("②·③ 함께 보유(3주택) + 증여 — ② 제외 0 · ③ 제외 1", () => {
    const i = input("sole", "2018-03-01", {
      householdHousingCount: 3,
      houses: [
        makeHouseInfo("selling", { acquisitionDate: D("2018-03-01") }),
        inheritedRow("sole", "inh-sole"),
        inheritedRow("co_minority", "inh-co"),
      ],
    });
    const x = ex(i);
    expect(x.soleExcludedCount).toBe(0);
    expect(x.coExcludedCount).toBe(1);
    expect(x.excludedCount).toBe(1);
    expect(x.excludedHouses).toEqual([{ houseId: "inh-co", basis: "co_inherited" }]);
  });

  it("대조군 — 증여 아님이면 두 풀 모두 종전대로 제외 1", () => {
    expect(ex(input("sole", undefined, { generalHouseGiftedFromDecedentWithin2yr: false })).soleExcludedCount).toBe(1);
    expect(ex(input("co_minority", undefined, { generalHouseGiftedFromDecedentWithin2yr: false })).coExcludedCount).toBe(1);
  });
});

describe("L-11 — 판정 메뉴 불성립 사유: 증여 괄호는 ② 단독상속 풀만 배제한다", () => {
  const house = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    acquisitionDate: D("2018-03-01"),
    officialPrice: 300_000_000,
    region: "capital" as const,
    regionCode: "11680",
    isInherited: false,
    isLongTermRental: false,
    isApartment: true,
    isOfficetel: false,
    isUnsoldHousing: false,
    ...extra,
  });
  const judgeInput = (extraInh: Record<string, unknown>) =>
    ({
      propertyType: "housing",
      isOneHousehold: true,
      acquisitionDate: D("2016-01-01"),
      transferDate: D("2023-06-01"),
      transferPrice: 800_000_000,
      householdHousingCount: 2,
      houses: [
        house("selling", { acquisitionDate: D("2016-01-01") }),
        house("inh", { isInherited: true, inheritedDate: D("2019-06-01"), ...extraInh }),
      ],
      sellingHouseId: "selling",
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      residencePeriodMonths: 0,
      generalHouseGiftedFromDecedentWithin2yr: true,
      generalHouseGiftDate: D("2018-03-01"),
    }) as unknown as OneHouseJudgeInput;
  const RULES = {
    one_house_exemption: {
      minHoldingYears: 2,
      regulatedAreaMinResidenceYears: 2,
      prePolicyDate: "2017-08-03",
      prePolicyExemptResidence: true,
    },
    temporary_two_house: { disposalDeadlineYears: 3 },
  } as never;

  // 판정 leaf(`judgeOneHouseExemptionFromInput`)는 주택 수 제외 전 값을 받는다 — 세액 결론은 위 엔진·route anchor가 본다.
  it("③ 소수지분만 있으면 증여 사유를 말하지 않는다(제외가 성립하므로 사유 0건)", () => {
    const r = judgeOneHouseExemptionFromInput(
      judgeInput({ isCoInherited: true, isLargestCoInheritedShareholder: false }),
      RULES,
    );
    expect(r.unmetExceptions).toEqual([]);
  });

  it("② 단독상속이면 증여 사유를 ② 한정으로 알린다", () => {
    const r = judgeOneHouseExemptionFromInput(judgeInput({}), RULES);
    const reasons = r.unmetExceptions.flatMap((u) => u.reasons);
    const gift = reasons.find((x) => x.includes("2년 이내에 피상속인으로부터 증여"));
    expect(gift).toBeDefined();
    expect(gift).toContain("§155③ 공동상속주택");
  });
});
