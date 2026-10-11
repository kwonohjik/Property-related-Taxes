/**
 * S01-1 anchor — 「소득세법 시행령」 §156의2⑤ 대체주택 특례는 **양도일 현재** 세대 구성도 본다.
 * 대체주택 취득 **뒤**에 취득해 양도일까지 보유한 주택·조합원입주권·분양권이 있으면 특례가 성립하지 않는다.
 *
 * 근거(원문 확인 — taxlaw.nts.go.kr · KoreanLaw MCP 2026-10-11):
 *   - 사전-2024-법규재산-0614 [법규과-2895, 2024.11.21.] — 대체주택(B) 취득 후 분양권(C)을 추가 취득하고 B를 양도하면
 *     「제156조의2 제5항과 같은 법 시행령 156조의3 제2항을 중첩 적용하여 … 제154조 제1항을 적용할 수 없는 것」.
 *   - 서면-2024-법규재산-3166 [법규과-589, 2025.3.24.] — 위 해석을 참조하라고 회신, 요지 「양도소득세가 과세됨」.
 *   - 조심2011중2759 (2011.10.18. 기각) — 대체주택 양도 12일 전 주택을 취득해 「양도당시 3주택을 소유한 것으로 나타나므로」
 *     비과세특례를 적용하기 어렵다.
 *
 * 경계(법적 근거 없이 불리하게 하지 않는다): 주택 수에서 빠지는 행(§155②③ 상속주택 등 — 엔진 제외 leaf
 * `knownHouseExclusionHouseIds`)·양도일 당일 이후 취득 행은 세지 않는다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { newForm, hrow, runCalc, type Form } from "./_one-house-pr3a-calc-route";
import { observeCase, type RulingCase } from "./one-house-rulings/harness";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date("2026-06-15")) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});

const ID = "156-2-5-replacement-house";
const repl = { replacementHouseSpecial: true, replResidenceMonths: "60", replWillResideNewHouse: true };
const mk = (today: string, form: RulingCase["form"]): RulingCase => ({
  id: "a", docNo: "-", docDate: "-", basis: "era", today, summary: "", bucket: "match", form,
});

/** 사전-2024-법규재산-0614 사실관계 — A(1988 취득, 2016 사업시행인가) · B 대체주택(2018-01-22) · C 분양권(2024-04-24) · B 2024-07-19 양도 */
const P1 = (extra: Partial<RulingCase["form"]> = {}): RulingCase["form"] => ({
  isOneHousehold: true, transferDate: "2024-07-19", contractTotalPrice: "800000000",
  asset: { assetKind: "housing", acquisitionDate: "2018-01-22" },
  houses: [{ id: "A", acquisitionDate: "1988-05-17", region: "capital" }],
  ...repl, replBusinessApprovalDate: "2016-08-08", replCompletionDate: "2023-10-23",
  ...extra,
} as RulingCase["form"]);
const C_RIGHT = { id: "C", type: "presale_right", acquisitionDate: "2024-04-24", region: "capital" };

/** 일반주택 축 — A 2012 · B 대체주택 2020-04-15 · (C) · 2026-06-15 양도 */
type FormHouses = NonNullable<RulingCase["form"]>["houses"];
const P2 = (rows: FormHouses): RulingCase["form"] => ({
  isOneHousehold: true, transferDate: "2026-06-15", contractTotalPrice: "800000000",
  asset: { assetKind: "housing", acquisitionDate: "2020-04-15" },
  houses: rows,
  ...repl, replBusinessApprovalDate: "2019-06-15", replCompletionDate: "2024-03-15",
} as RulingCase["form"]);
const A_ROW = { id: "A", acquisitionDate: "2012-03-15", region: "capital" as const };

describe("S01-1 판정 메뉴 — 대체주택 취득 뒤 취득해 양도일까지 보유한 구성은 불성립", () => {
  it("0614 사실관계(대체주택 뒤 분양권 C 보유) → 과세 · 156-2-5 미적용", async () => {
    const o = await observeCase(mk("2024-07-20", P1({ presaleRights: [C_RIGHT] } as never)));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(false);
    expect(o.appliedExceptions).not.toContain(ID);
  });
  it("양성 짝 — 분양권 C가 없으면 비과세(156-2-5 적용)", async () => {
    const o = await observeCase(mk("2024-07-20", P1()));
    expect(o.isExempt).toBe(true);
    expect(o.appliedExceptions).toContain(ID);
  });
  it("조심2011중2759 — 대체주택 뒤 취득한 일반주택 C를 양도일까지 보유 → 과세", async () => {
    const o = await observeCase(mk("2026-06-16", P2([A_ROW, { id: "C", acquisitionDate: "2021-05-15", region: "capital" as const }])));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(false);
    expect(o.appliedExceptions).not.toContain(ID);
  });
  it("양성 짝 — C가 없으면 비과세", async () => {
    const o = await observeCase(mk("2026-06-16", P2([A_ROW])));
    expect(o.isExempt).toBe(true);
    expect(o.appliedExceptions).toContain(ID);
  });
  it("경계 — C를 양도일 당일 취득(양도 후 취득으로 본다)하면 양도일 현재 보유가 아니다 → 비과세", async () => {
    const o = await observeCase(mk("2026-06-16", P2([A_ROW, { id: "C", acquisitionDate: "2026-06-15", region: "capital" as const }])));
    expect(o.isExempt).toBe(true);
    expect(o.appliedExceptions).toContain(ID);
  });
  it("경계 — 대체주택 뒤 취득한 주택이 §155② 상속주택(별도세대 상속)이면 주택 수에서 빠진다 → 비과세 유지", async () => {
    const o = await observeCase(
      mk("2026-06-16", P2([A_ROW, { id: "C", acquisitionDate: "2021-05-15", region: "capital" as const, isInherited: true, inheritedDate: "2021-05-15" }])),
    );
    expect(o.excludedHouses.map((x) => x.houseId)).toContain("C");
    expect(o.isExempt).toBe(true);
    expect(o.appliedExceptions).toContain(ID);
  });
});

describe("S01-1 판정 메뉴 — 사업 대상이 조합원입주권일 때(주택 수 2)도 대체주택 뒤 취득한 주택은 센다", () => {
  /** 평가셋 G123 사실(입주권 A + 대체주택 B 2011-11-16 · 2019-12-23 양도 · 신축주택 준공 예정) + 대체주택 뒤 취득한 주택 C */
  const G = (houses: FormHouses): RulingCase["form"] => ({
    isOneHousehold: true, transferDate: "2019-12-23", contractTotalPrice: "800000000",
    asset: { assetKind: "housing", acquisitionDate: "2011-11-16" },
    presaleRights: [
      { id: "A", type: "redevelopment_right", acquisitionDate: "2000-08-02", region: "capital", managementDisposalApprovalDate: "2016-10-13", memberOrigin: "original_house" },
    ],
    houses,
    ...repl, replBusinessApprovalDate: "2011-09-07", replCompletionDate: "2021-03-31", replResidenceMonths: "97",
  } as unknown as RulingCase["form"]);
  it("대체주택 뒤(2015) 취득해 보유한 일반주택 C → 주택 수가 2뿐이어도 과세", async () => {
    const o = await observeCase(mk("2019-12-24", G([{ id: "C", acquisitionDate: "2015-05-15", region: "capital" as const }])));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(false);
    expect(o.appliedExceptions).not.toContain(ID);
  });
  it("양성 짝 — C가 없으면 비과세(G123)", async () => {
    const o = await observeCase(mk("2019-12-24", G([])));
    expect(o.isExempt).toBe(true);
    expect(o.appliedExceptions).toContain(ID);
  });
});

describe("S01-1 계산기 — ④→⑫→⑭ route", () => {
  const T = "2026-06-15";
  function calcForm(houses: ReturnType<typeof hrow>[], count: string): Form {
    const f = newForm();
    f.isOneHousehold = true;
    Object.assign(f.assets[0], {
      assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2020-04-15",
      fixedAcquisitionPrice: "400,000,000", addressJibun: "테스트 주소 1", regionCode: "1168010100",
      residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "0",
    });
    return Object.assign(f, {
      transferDate: T, contractTotalPrice: "800,000,000", residencePeriodMonths: "0",
      householdNoPresaleRightsConfirmed: true, householdNoOtherHousesConfirmed: false,
      householdHousingCount: count, houses,
      replacementHouseSpecial: true, replBusinessApprovalDate: "2019-06-15", replCompletionDate: "2024-03-15",
      replResidenceMonths: "60", replWillResideNewHouse: true,
    });
  }
  const A = () => hrow({ id: "A", acquisitionDate: "2012-03-15", region: "capital" });
  const C = () => hrow({ id: "C", acquisitionDate: "2021-05-15", region: "capital" });

  it("명부 A + C(대체주택 뒤) + 선언 → 과세(세액 > 0)", async () => {
    const r = await runCalc(calcForm([A(), C()], "3"));
    expect(r.status).toBe(200);
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBeGreaterThan(0);
  });
  it("양성 짝 — 명부 A만 + 선언 → 비과세 0원", async () => {
    const r = await runCalc(calcForm([A()], "2"));
    expect(r.status).toBe(200);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });
  it("스칼라 경로(명부 없이 주택 수 4) + 선언 → 과세 — 엔진 입력에 명부가 없어도 양도일 현재 3주택 이상이면 불성립", async () => {
    const f = calcForm([], "4");
    f.householdNoOtherHousesConfirmed = false;
    const r = await runCalc(f);
    expect(r.status).toBe(200);
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBeGreaterThan(0);
  });
});
