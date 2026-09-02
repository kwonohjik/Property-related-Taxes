// D7-09 · D7-10 anchor — 조특령 §66⑪·⑫ 합산 요건 + §66⑭ 결격 과세기간 차감
//
// **§66⑪ 본문**: 「제4항의 규정에 따른 경작한 기간을 계산할 때 **상속인이 상속받은 농지를
//   1년 이상 계속하여 경작하는 경우**(제1항 각 호의 어느 하나에 따른 지역에 거주하면서
//   경작하는 경우를 말한다 …) 다음 각 호의 기간은 상속인이 이를 경작한 기간으로 본다.
//   1. 피상속인이 취득하여 경작한 기간 … 2. 피상속인이 배우자로부터 상속받아 경작한 …」
// **§66⑫**: 「제11항에도 불구하고 … 1년 이상 계속하여 경작하지 아니하더라도 **상속받은 날부터
//   3년이 되는 날까지 양도**하거나 … 협의매수 또는 수용되는 경우로서 상속받은 날부터 3년이
//   되는 날까지 **택지개발지구·산업단지 등으로 지정**되는 경우(상속받은 날 전에 지정된 경우를
//   포함한다)에는 제11항제1호 및 제2호의 경작기간을 상속인이 경작한 기간으로 본다.」
// **§66⑭**: 「제4항·제6항·제11항 및 제12항에 따른 경작한 기간 중 **해당 피상속인(그 배우자를
//   포함한다) 또는 거주자 각각에 대하여** 다음 각 호의 어느 하나에 해당하는 과세기간이 있는
//   경우 그 기간은 … 경작한 기간에서 **제외한다**. 1. 사업소득금액 + 총급여액 ≥ 3,700만원인
//   과세기간 … 2. 사업소득 총수입금액이 소령 §208⑤2호 각 목 금액 이상인 과세기간」
//
// ## 종전 동작
// · `farmingYears + (decedentFarmingYears ?? 0)`을 **조건 없이** 합산 — §66⑪ 본문의
//   「1년 이상 계속 경작」도 §66⑫ 대체요건도 검증하지 않았다 (D7-09).
//   실제 과다감면 창은 `farmingYears === 0` 구간이고, Step5 UI가 「본인 자경 < 8년」이면
//   합산 위젯을 띄워 그 구간을 적극 유도했다.
// · §66⑭ 결격 과세기간 차감이 **양도세 §69 경로에만** 없었다 (D7-10).
//   상속세 영농상속공제(상증령 §16⑭)에는 이미 있다 — 다만 그쪽은 **boolean 결격**이고
//   조특령 §66⑭은 **기간 차감**이라 모델을 복사하면 안 된다.
import { describe, it, expect } from "vitest";
import {
  calculateSelfFarmingReduction,
  type SelfFarmingReductionInput,
} from "@/lib/tax-engine/self-farming-reduction";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { toEngineReductions } from "@/lib/calc/transfer-tax-api-reductions";
import { reductionSchema } from "@/lib/api/transfer-tax-schema-reductions";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-store";

function base(over: Partial<SelfFarmingReductionInput> = {}): SelfFarmingReductionInput {
  return {
    transferIncome: 500_000_000,
    farmingYears: 0,
    minFarmingYears: 8,
    acquisitionDate: new Date("2019-01-01"),
    transferDate: new Date("2026-05-01"),
    ...over,
  };
}

describe("D7-09 §66⑪·⑫ — 피상속인 경작기간 합산 요건", () => {
  it("D7-09-1: 본인 0년 + 피상속인 10년, 요건 미선언 → 합산 불가 → 감면 0", () => {
    const r = calculateSelfFarmingReduction(base({ decedentFarmingYears: 10 }));
    expect(r.qualifies).toBe(false);
    expect(r.reducibleIncome).toBe(0);
    expect(r.breakdown.some((b) => b.includes("합산 제외"))).toBe(true);
  });

  it("D7-09-2: §66⑪ 「1년 이상 계속 경작」 선언 → 합산 → 감면 대상", () => {
    const r = calculateSelfFarmingReduction(
      base({ decedentFarmingYears: 10, heirContinuedFarming1Year: true }),
    );
    expect(r.qualifies).toBe(true);
    expect(r.reducibleIncome).toBe(500_000_000);
  });

  it("D7-09-3: §66⑫ 대체요건만 선언해도 합산된다", () => {
    const r = calculateSelfFarmingReduction(
      base({ decedentFarmingYears: 10, meetsDecedentAggregationAlt: true }),
    );
    expect(r.qualifies).toBe(true);
  });

  it("D7-09-4: 본인 자경만으로 8년을 넘으면 합산 요건과 무관하다", () => {
    const r = calculateSelfFarmingReduction(base({ farmingYears: 9 }));
    expect(r.qualifies).toBe(true);
  });

  it("D7-09-5: 합산 요건이 있어도 합계가 8년 미만이면 여전히 불가", () => {
    const r = calculateSelfFarmingReduction(
      base({ farmingYears: 2, decedentFarmingYears: 3, heirContinuedFarming1Year: true }),
    );
    expect(r.qualifies).toBe(false);
  });
});

describe("D7-10 §66⑭ — 결격 과세기간 차감", () => {
  it("D7-10-1: 본인 10년 − 결격 3년 = 7년 < 8년 → 감면 0", () => {
    const r = calculateSelfFarmingReduction(
      base({ farmingYears: 10, disqualifiedTaxPeriodsSelf: 3 }),
    );
    expect(r.qualifies).toBe(false);
    expect(r.reducibleIncome).toBe(0);
    expect(r.breakdown.some((b) => b.includes("§66⑭"))).toBe(true);
  });

  it("D7-10-2 경계: 결격 2년이면 8년이 남아 통과", () => {
    const r = calculateSelfFarmingReduction(
      base({ farmingYears: 10, disqualifiedTaxPeriodsSelf: 2 }),
    );
    expect(r.qualifies).toBe(true);
  });

  it("D7-10-3: 피상속인분 결격은 «각각» 차감된다 (본인분과 별개 축)", () => {
    // 본인 3 + 피상속인 10 = 13 → 피상속인 결격 6 차감 → 3 + 4 = 7 < 8
    const r = calculateSelfFarmingReduction(
      base({
        farmingYears: 3,
        decedentFarmingYears: 10,
        heirContinuedFarming1Year: true,
        disqualifiedTaxPeriodsDecedent: 6,
      }),
    );
    expect(r.qualifies).toBe(false);
    // 결격 5면 3 + 5 = 8 → 통과
    expect(
      calculateSelfFarmingReduction(
        base({
          farmingYears: 3,
          decedentFarmingYears: 10,
          heirContinuedFarming1Year: true,
          disqualifiedTaxPeriodsDecedent: 5,
        }),
      ).qualifies,
    ).toBe(true);
  });

  it("D7-10-4: 결격이 자경기간을 넘어도 음수가 되지 않는다", () => {
    const r = calculateSelfFarmingReduction(
      base({ farmingYears: 3, disqualifiedTaxPeriodsSelf: 10 }),
    );
    expect(r.qualifies).toBe(false);
    expect(r.nonReducibleIncome).toBe(500_000_000);
  });

  it("D7-10-5: 미입력(=결격 없음)은 종전 동작과 같다", () => {
    expect(calculateSelfFarmingReduction(base({ farmingYears: 9 })).qualifies).toBe(true);
  });
});

describe("④⑫⑬ 배관 — 합산 요건·결격 과세기간이 엔진까지 도달한다", () => {
  function run(over: Record<string, unknown>) {
    return calculateTransferTax(
      baseTransferInput({
        propertyType: "land",
        transferPrice: 1_000_000_000,
        acquisitionPrice: 400_000_000,
        acquisitionDate: new Date("2019-01-01"),
        transferDate: new Date("2026-05-01"),
        reductions: [{ type: "self_farming" as const, farmingYears: 0, decedentFarmingYears: 10, ...over }],
      }),
      makeMockRates(),
    );
  }

  it("PL-1 ⑬: 합산 요건 미선언 → 감면 0 / 선언 → 감면 발생", () => {
    expect(run({}).reductionAmount).toBe(0);
    expect(run({ heirContinuedFarming1Year: true }).reductionAmount).toBeGreaterThan(0);
  });

  it("PL-2 ⑬: §66⑭ 결격 과세기간이 엔진까지 도달한다", () => {
    const ok = run({ farmingYears: 10 });
    const disq = run({ farmingYears: 10, disqualifiedTaxPeriodsSelf: 3 });
    expect(ok.reductionAmount).toBeGreaterThan(0);
    expect(disq.reductionAmount).toBe(0);
  });

  it("PL-3 ④: toEngineReductions가 4필드를 상속 취득에서 실어 보낸다", () => {
    const form = {
      type: "self_farming",
      farmingYears: "0",
      decedentFarmingYears: "10",
      heirContinuedFarming1Year: true,
      meetsDecedentAggregationAlt: false,
      disqualifiedTaxPeriodsSelf: "2",
      disqualifiedTaxPeriodsDecedent: "3",
    } as unknown as AssetReductionForm;
    const [r] = toEngineReductions([form], "inheritance") as Array<Record<string, unknown>>;
    expect(r.heirContinuedFarming1Year).toBe(true);
    expect(r.meetsDecedentAggregationAlt).toBe(false);
    expect(r.disqualifiedTaxPeriodsSelf).toBe(2);
    expect(r.disqualifiedTaxPeriodsDecedent).toBe(3);
  });

  it("PL-4 ⑫: Zod가 4필드를 stripping하지 않는다", () => {
    const parsed = reductionSchema.parse({
      type: "self_farming",
      farmingYears: 0,
      decedentFarmingYears: 10,
      heirContinuedFarming1Year: true,
      meetsDecedentAggregationAlt: false,
      disqualifiedTaxPeriodsSelf: 2,
      disqualifiedTaxPeriodsDecedent: 3,
    }) as Record<string, unknown>;
    expect(parsed.heirContinuedFarming1Year).toBe(true);
    expect(parsed.disqualifiedTaxPeriodsSelf).toBe(2);
    expect(parsed.disqualifiedTaxPeriodsDecedent).toBe(3);
  });
});
