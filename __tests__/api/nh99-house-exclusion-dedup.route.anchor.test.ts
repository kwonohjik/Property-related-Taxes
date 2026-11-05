/**
 * NH-13·NH-12 anchor — 한 주택을 주택 수 제외에 두 번 쓰는 결함 (계획서 `docs/00-pm/new-housing-99-review-fixes.plan.md` §2).
 *
 * 계산기(`/api/calc/transfer`)·다건(`/multi`)·판정 메뉴(`/api/calc/one-house-exemption`) 세 경로에 같은 사실(명부 행)을 건다.
 * 기대값은 「같은 사실에서 제외를 하나만 선언한 대조」의 실측값이다(시료 표는 `_helpers/nh99-dedup-scenarios.ts`).
 *
 * - NH-13: 같은 행이 조특법 §99의4와 소득세법 시행령 §155② 상속 제외에 함께 걸리면 한 번만 뺀다(Q-1 A, 서로 다른 피상속인 R1·R2는 Q-10 a).
 * - NH-12: 이미 주택 수에서 빠진 행을 §155⑥⑦⑧ 특례 상대방으로 다시 쓰지 않는다(⑥⑧은 Q-2 a). 동시 선언 자체는 막지 않는다.
 * - 엔진 주택 수(판정 메뉴 countedForExemption) = 거울(`resolveExemptionHousingCount`).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
    getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
    shouldBypassRateLimit: vi.fn().mockReturnValue(true),
  };
});

import {
  base, ce994, inherited, ruralLoc, rural7, rural7b, heritage6, unavoid8, setRates, calcForm, captureCalcBody, postCalcBody,
  runScen, runJudge, jForm, XG, R35, REG, HV, BUSAN, type Obj,
} from "./_helpers/nh99-dedup-harness";
import { CASES } from "./_helpers/nh99-dedup-scenarios";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

const X = () => base("x", "2010-01-01");

describe("NH-13·NH-12 — 계산기·판정 메뉴 route anchor (계획서 §2-5)", () => {
  it.each(CASES.map((c) => [c.id, c] as const))("%s", async (_id, c) => {
    const r = await runScen(c.scen);
    expect(r.calc.err).toBeUndefined();
    expect(r.calc.result.totalTax).toBe(c.expect);
    if (r.judge) {
      expect(r.judge.err).toBeUndefined();
      // 판정 메뉴 결론 = 계산기 결론 (비과세·일부 비과세 여부)
      const calcExempt = r.calc.result.isExempt === true || r.calc.result.isPartialExempt === true;
      expect(r.judge.isExempt === true || r.judge.isPartialExempt === true).toBe(calcExempt);
      if (c.counted !== undefined) {
        // 엔진 주택 수(판정 메뉴 명세) = 기대 = 거울
        expect(r.judge.counted).toBe(c.counted);
        expect(r.mirror).toBe(c.counted);
      }
    }
    if (c.multi !== undefined) expect(r.multi?.totalTax).toBe(c.multi);
  });
});

describe("NH-12 — ④가 싣는 ⑦ 행 (N12-10 행 순서 · houseId 운반)", () => {
  it("k1: 앞 행 R1(⑦+§99의4)을 건너뛰고 적법한 R2를 싣는다 — body.ruralHouse = R2 값", async () => {
    setRates("2024-06-01");
    const body = await captureCalcBody(
      calcForm([base("r1", "2015-03-01", { ...rural7, ...ce994() }), base("r2", "2016-05-01", rural7b)]),
    );
    expect(body.ruralHouse?.houseId).toBe("r2");
    expect(body.ruralHouse?.decedentResidenceYears).toBe(12);
  });
  it("k2: 순서가 반대여도 같다", async () => {
    setRates("2024-06-01");
    const body = await captureCalcBody(
      calcForm([base("r2", "2016-05-01", rural7b), base("r1", "2015-03-01", { ...rural7, ...ce994() })]),
    );
    expect(body.ruralHouse?.houseId).toBe("r2");
    expect(body.ruralHouse?.decedentResidenceYears).toBe(12);
  });
  it("단일 ⑦ 행은 houseId 를 싣는다(⑫ strip 방지)", async () => {
    setRates("2024-06-01");
    const body = await captureCalcBody(calcForm([base("r", "2015-03-01", rural7)]));
    expect(body.ruralHouse?.houseId).toBe("r");
  });
  it("⑦+§99의4 같은 행만 있으면 payload 는 그 행 id 와 함께 실리고, 가부는 엔진이 대조한다(양론 재판정 입장 보존)", async () => {
    setRates("2024-06-01");
    const body = await captureCalcBody(calcForm([X(), base("r", "2015-03-01", { ...rural7, ...ce994() })]));
    expect(body.ruralHouse?.houseId).toBe("r");
    expect((await postCalcBody(body)).r.totalTax).toBe(141_966_000);
  });
  it("⑥ 국가유산: 행 id 를 싣는다 — 이미 빠진 행이어도 엔진이 대조해 쓰지 않는다", async () => {
    setRates("2024-06-01");
    const only = await captureCalcBody(calcForm([base("r", "2015-03-01", { ...ruralLoc, ...heritage6 })]));
    expect(only.culturalHeritageHouse).toBe(true);
    expect(only.culturalHeritageHouseId).toBe("r");
    const same = await captureCalcBody(calcForm([X(), base("r", "2015-03-01", { ...ce994(), ...heritage6 })]));
    expect(same.culturalHeritageHouseId).toBe("r");
    expect((await postCalcBody(same)).r.totalTax).toBe(141_966_000);
  });
  it("⑧ 부득이: 행 id 를 싣는다 — 이미 빠진 행이어도 엔진이 대조해 쓰지 않는다", async () => {
    setRates("2024-06-01");
    const only = await captureCalcBody(calcForm([base("r", "2015-03-01", { ...ruralLoc, ...unavoid8 })]));
    expect(only.unavoidableOutsideCapitalHouse?.houseId).toBe("r");
    const same = await captureCalcBody(calcForm([X(), base("r", "2015-03-01", { ...ce994(), ...unavoid8 })]));
    expect(same.unavoidableOutsideCapitalHouse?.houseId).toBe("r");
    expect((await postCalcBody(same)).r.totalTax).toBe(141_966_000);
  });
  it("⑥ 국가유산 행이 둘이면 주택 수에서 빠지지 않은 행을 싣는다", async () => {
    setRates("2024-06-01");
    const body = await captureCalcBody(
      calcForm([base("r1", "2015-03-01", { ...ce994(), ...heritage6 }), base("r2", "2016-05-01", { ...ruralLoc, ...heritage6 })]),
    );
    expect(body.culturalHeritageHouseId).toBe("r2");
  });
});

describe("NH-12 — 엔진 직접 대조(직접 API 입력): 행 id 를 싣고 ④ 건너뛰기가 없는 호출", () => {
  /** 계산기 body 를 복원한 뒤 ⑦ 선언만 어느 행인지 직접 지정해 엔진 leaf(houseId ∈ 제외 목록)를 단독으로 검증한다. */
  it("⑦ 선언이 §99의4 로 빠진 행을 가리키면 ⑦ 불성립 — 141,966,000", async () => {
    setRates("2024-06-01");
    const f = calcForm([X(), base("r", "2015-03-01", { ...ce994() })]);
    const body = await captureCalcBody(f);
    const withRural: Obj = {
      ...body,
      ruralHouse: { houseId: "r", kind: "inherited", isOutsideCapitalEupMyeon: true, decedentResidenceYears: 10, decedentSameHouseholdAtInheritance: false },
    };
    const res = await postCalcBody(withRural);
    expect(res.r.totalTax).toBe(141_966_000);
  });
  it("houseId 없는 ⑦ 선언은 대조하지 않는다(레거시 — Q-3 현행 유지)", async () => {
    setRates("2024-06-01");
    const f = calcForm([X(), base("r", "2015-03-01", { ...ce994() })]);
    const body = await captureCalcBody(f);
    const withRural: Obj = {
      ...body,
      ruralHouse: { kind: "inherited", isOutsideCapitalEupMyeon: true, decedentResidenceYears: 10, decedentSameHouseholdAtInheritance: false },
    };
    const res = await postCalcBody(withRural);
    expect(res.r.totalTax).toBe(0);
  });
  it("⑥ 선언(culturalHeritageHouseId)이 §99의4 로 빠진 행을 가리키면 불성립 — 141,966,000", async () => {
    setRates("2024-06-01");
    const body = await captureCalcBody(calcForm([X(), base("r", "2015-03-01", ce994())]));
    const res = await postCalcBody({ ...body, culturalHeritageHouse: true, culturalHeritageHouseId: "r" });
    expect(res.r.totalTax).toBe(141_966_000);
    const legacy = await postCalcBody({ ...body, culturalHeritageHouse: true });
    expect(legacy.r.totalTax).toBe(0);
  });
  it("⑧ 선언(houseId)이 §99의4 로 빠진 행을 가리키면 불성립 — 141,966,000", async () => {
    setRates("2024-06-01");
    const body = await captureCalcBody(calcForm([X(), base("r", "2015-03-01", ce994())]));
    const un = { reason: "work", unresolvedAtTransfer: true };
    const res = await postCalcBody({ ...body, unavoidableOutsideCapitalHouse: { ...un, houseId: "r" } });
    expect(res.r.totalTax).toBe(141_966_000);
    const legacy = await postCalcBody({ ...body, unavoidableOutsideCapitalHouse: un });
    expect(legacy.r.totalTax).toBe(0);
  });
});

describe("N13-12 — houseId 없는 §99의4 선언 + 상속 행(직접 API): 현행 유지(개수로 더한다)", () => {
  const strip = (b: Obj): Obj => {
    const c = JSON.parse(JSON.stringify(b)) as Obj;
    for (const red of c.reductions ?? []) delete red.houseId;
    return c;
  };
  it("3채: 0 (id 없는 선언은 개수로 더하고 상속도 따로 뺀다)", async () => {
    setRates("2024-06-01");
    const body = await captureCalcBody(calcForm([X(), base("r", "2015-03-01", { ...ce994(), ...inherited("2015-03-01") })]));
    expect((await postCalcBody(strip(body))).r.totalTax).toBe(0);
  });
  it("2채: 141,966,000", async () => {
    setRates("2024-06-01");
    const body = await captureCalcBody(calcForm([base("r", "2015-03-01", { ...ce994(), ...inherited("2015-03-01") })]));
    expect((await postCalcBody(strip(body))).r.totalTax).toBe(141_966_000);
  });
});

describe("짝 — §99의4 가 요건 미달이면 그 행은 제외 목록에 없으므로 ⑦ 등은 그대로 성립", () => {
  it("§99의4 미달 + ⑦ 2채 → 0 (⑦ 성립)", async () => {
    const r = await runScen({ houses: [base("r", "2015-03-01", { ...rural7, ...ce994({ meetsLocationRequirement: false }) })] });
    expect(r.calc.result.totalTax).toBe(0);
    expect(r.calc.result.exemptReason).toContain("농어촌주택");
  });
});

describe("V-14 — §89② 예외(이농주택·국가유산주택)가 §99의4 로 이미 뺀 행을 특수주택으로 다시 쓰지 않는다", () => {
  const farmExit = { ...ruralLoc, oneHouseRuralHouse: true, ruralHouseKind: "farm_exit", ruralOutsideCapitalEupMyeon: true, ruralOwnerResidenceYears: "6", ruralReturnedToFarmExitHouse: false } as Partial<HouseEntry>;
  const right = { id: "p1", type: "redevelopment_right", acquisitionDate: "2023-03-01", region: "non_capital", regionCode: BUSAN, memberOrigin: "successor" };
  const N = () => base("n", "2023-01-01");
  const run = async (houses: HouseEntry[]) => {
    const over = { presaleRights: [right] };
    setRates("2024-06-01");
    const calc = await postCalcBody(await captureCalcBody(calcForm(houses, over)));
    const judge = await runJudge(jForm(houses, over));
    return { tax: calc.r.totalTax as number, judgeExempt: judge.isExempt === true };
  };
  it("이농 ⑦ + §99의4 같은 행 + 입주권 → 대조(§99의4만)와 같다 141,966,000", async () => {
    const same = await run([N(), base("r", "2015-03-01", { ...farmExit, ...ce994() })]);
    const ctrl = await run([N(), base("r", "2015-03-01", ce994())]);
    expect(ctrl.tax).toBe(141_966_000);
    expect(same.tax).toBe(141_966_000);
    expect(same.judgeExempt).toBe(false);
  });
  it("국가유산 ⑥ + §99의4 같은 행 + 입주권 → 대조와 같다 141,966,000", async () => {
    const same = await run([N(), base("r", "2015-03-01", { ...ruralLoc, ...heritage6, ...ce994() })]);
    expect(same.tax).toBe(141_966_000);
    expect(same.judgeExempt).toBe(false);
  });
  it("직접 API: ⑪ 이농 선언이 §99의4 행을 가리키면 불성립 · 행 id 가 없으면 현행(레거시)", async () => {
    setRates("2024-06-01");
    const over = { presaleRights: [right] };
    const body = await captureCalcBody(calcForm([N(), base("r", "2015-03-01", ce994())], over));
    const decl = { kind: "farm_exit", isOutsideCapitalEupMyeon: true, ownerResidenceYears: 6, returnedToFarmExitHouse: false };
    expect((await postCalcBody({ ...body, ruralHouse: { ...decl, houseId: "r" } })).r.totalTax).toBe(141_966_000);
    expect((await postCalcBody({ ...body, ruralHouse: decl })).r.totalTax).toBe(0);
  });
});

describe("V-16 — 한쪽 대조만 재던 기대값의 반대쪽 대조 (수정 전후 불변이어야 하는 단일 제외 시료)", () => {
  it("N13-8 상속만 / §99의4만(조정 3주택) — 512,886,000", async () => {
    const REGS = { over: REG, rateDate: "2026-09-18", reg: true } as const;
    const inhOnly = await runScen({ houses: [XG("x", "2010-01-01"), base("r", "2015-03-01", { ...ruralLoc, ...inherited("2015-03-01"), ...R35 })], ...REGS });
    const only994 = await runScen({ houses: [XG("x", "2010-01-01"), base("r", "2015-03-01", { ...ce994(), ...R35 })], ...REGS });
    expect(inhOnly.calc.result.totalTax).toBe(512_886_000);
    expect(only994.calc.result.totalTax).toBe(512_886_000);
  });
  it("N12-5 ⑦만 / §99의4만(고가 15억) — 369,567,000", async () => {
    const o = { over: HV, rateDate: "2026-06-01" } as const;
    const only7 = await runScen({ houses: [X(), base("r", "2015-03-01", rural7)], ...o });
    const only994 = await runScen({ houses: [X(), base("r", "2015-03-01", ce994())], ...o });
    expect(only7.calc.result.totalTax).toBe(369_567_000);
    expect(only994.calc.result.totalTax).toBe(369_567_000);
  });
});
