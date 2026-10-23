/**
 * anchor — 재개발 완공APT × 「소득세법 시행령」 §155⑳ 장기임대주택 보유자 거주주택 특례
 * (`docs/00-pm/redev-apt-rental-residence-155-20.plan.md` D-1~D-5 · Q-1~Q-4 (a)).
 *
 * 국세청: 거주주택이 재건축·재개발된 뒤 양도해도 특례를 적용하고 멸실 전·신축 주택 거주를 통산한다(부동산납세과-827 ·
 * 서면-2015-부동산-1491). 입주권 양도에는 적용하지 않는다(서면-2017-법령해석재산-1581). 종전에는 완공APT가 입력·엔진 모두에서 빠져
 * 같은 사실에서 일반 주택 0 · 완공APT 124,366,000이었다.
 *
 * 시료(하네스 기본): 원조합원 완공APT · 종전주택 2008-01-01 · 인가 2016-06-01 · 거주 2019-06-01~2024-06-01 · 2024-06-01 10억 양도 ·
 * §155⑳ 시나리오 A · 장기임대 1호(2015-01-01 등록 · 장기일반).
 *
 * | # | 주장 |
 * |---|---|
 * | RR-1 | 계산기 화면 · 원조합원 · 명부 없음(주택 수 1) — ④가 특례를 싣고 비과세 0 · 일반 주택 짝도 0 |
 * | RR-2 | 명부에 장기임대 행(주택 수 2) — 임대주택을 뺀 주택 수로 판정해 비과세 |
 * | RR-3 | 20억 — 부분과세 = 특례 없는 순수 1주택 완공APT와 같은 세액(12억 초과 안분·표2를 기존 §166 경로가 처리) |
 * | RR-4 | 거주 통산(827) — 종전주택 1년 + 신축 1년 = 비과세 · 신축 1년만이면 ⑧ 차단 + 엔진 과세 124,366,000 · 되돌림 고지 |
 * | RR-5 | 승계조합원 — 사용승인 후 거주 3년 · 비과세 |
 * | RR-6 | 세대 구성 초과(다른 일반주택 2채) — 과세 124,366,000 · 구성 불성립 고지 |
 * | RR-7 | 시나리오 B — ⑧ 차단(Q-2 (a)) · API 직접이면 비과세를 거두고 확인 필요 고지 |
 * | RR-8 | 조합원입주권 양도 — 카드를 닫아 ④가 싣지 않는다(Q-4 (a) · 1581) |
 * | RR-9 | 강남 20억 · 2026-08-01(한시 배제 종료 뒤) — 다주택 중과 없이 부분과세 · 순수 1주택과 같은 세액 |
 * | RR-11 | 재개발 카드의 분리 입력(종전 12 + 신축 12개월)만으로 거주 — ⑧이 엔진과 같은 leaf로 세어 통과 · 비과세 |
 * | RR-10 | §155⑳ 불성립(API 직접 · 요건 확인 OFF)이어도 명부의 임대주택이 일시적 2주택의 신규 주택이면 §155①으로 비과세 — 판정 메뉴처럼 무조건 거두지 않는다 |
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { REDEV_APT_RENTAL_SCENARIO_B_NOTICE } from "@/lib/tax-engine/transfer-tax-redevelopment-apt-rental-residence";
import { runCalc, postTransfer, redevAptForm, houseRow } from "./_helpers/redev-one-house-route";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const NR = "4682025021";
const unit = (months = "110") => ({
  ...makeDefaultRentalUnit(),
  businessRegistrationDate: "2015-01-01",
  rentalRegistrationDate: "2015-01-01",
  standardPriceAtRentalStart: "250,000,000",
  rentalInputMode: "direct" as const,
  rentalMonths: months,
  requirementsConfirmed: true,
});
const rhe = (scenario: "A" | "B" = "A", months?: string) => ({
  applyException: true,
  scenario,
  rentalUnits: [unit(months)],
  priorRentalExemptionHistory: "none",
});
const other = (id: string, acq: string, over = {}) =>
  houseRow(id, acq, { region: "non_capital", regionCode: NR, officialPrice: "100000000", isApartment: false, acquisitionOrigin: "general", ...over } as never);
const SUCCESSOR = {
  acquisitionDate: "2019-06-01",
  redevIsSuccessorMember: "yes",
  redevApprovalDate: "2019-03-15",
  redevCompletionDate: "2021-02-15",
  redevActualAcquisitionPrice: "100000000",
  fixedAcquisitionPrice: "100000000",
  redevSettlementAmount: "0",
};
const UNMET_TEXT = /장기임대주택 거주주택 특례\(소득세법 시행령 §155⑳\)가 .*임대주택 1호를 세대 주택 수에 넣어/;
const rentalStep = (r: Awaited<ReturnType<typeof runCalc>>) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((r.result?.steps ?? []) as any[]).filter((s) => /장기임대주택 거주주택 비과세 특례/.test(s.label)).map((s) => s.label as string);

describe("완공APT × §155⑳ — 화면 경로", () => {
  it("RR-1 원조합원 · 명부 없음 — 비과세 0 · 일반 주택 짝도 0", async () => {
    const r = await runCalc(redevAptForm({ price: "1000000000", assetOver: { rentalHousingException: rhe() } }));
    expect(r.issues).toEqual([]);
    expect(r.body.rentalHousingException).toMatchObject({ applyException: true, scenario: "A" });
    expect(r.result.isExempt).toBe(true);
    expect(r.result.totalTax).toBe(0);
    expect(rentalStep(r)).toEqual(["장기임대주택 거주주택 비과세 특례"]);
    const h = await runCalc(redevAptForm({ kind: "housing", price: "1000000000", assetOver: { rentalHousingException: rhe() } }));
    expect(h.result.totalTax).toBe(0);
  });

  it("RR-2 명부에 장기임대 행(주택 수 2) — 임대주택을 뺀 주택 수로 판정 · 비과세", async () => {
    const r = await runCalc(
      redevAptForm({ price: "1000000000", count: "2", houses: [other("r1", "2007-01-01", { isLongTermRental: true })], assetOver: { rentalHousingException: rhe() } }),
    );
    expect(r.issues).toEqual([]);
    expect(r.body.householdHousingCount).toBe(2);
    expect(r.result.isExempt).toBe(true);
    expect(r.result.totalTax).toBe(0);
  });

  it("RR-3 20억 — 부분과세 · 특례 없는 순수 1주택 완공APT와 같은 세액", async () => {
    const withRental = await runCalc(redevAptForm({ price: "2000000000", assetOver: { rentalHousingException: rhe() } }));
    const plain = await runCalc(redevAptForm({ price: "2000000000" }));
    expect(withRental.result.isPartialExempt).toBe(true);
    expect(withRental.result.totalTax).toBe(84_697_800);
    expect(withRental.result.totalTax).toBe(plain.result.totalTax);
  });

  it("RR-4 거주 통산 — 종전 1년 + 신축 1년 비과세 · 신축 1년만이면 ⑧ 차단 + 엔진 과세", async () => {
    const both = await runCalc(
      redevAptForm({
        price: "1000000000",
        assetOver: { rentalHousingException: rhe(), residencePeriods: [{ moveInDate: "2015-01-01", moveOutDate: "2016-01-01" }, { moveInDate: "2023-06-01", moveOutDate: "2024-06-01" }] },
      }),
    );
    expect(both.issues).toEqual([]);
    expect(both.result.isExempt).toBe(true);
    const newOnly = await runCalc(
      redevAptForm({ price: "1000000000", assetOver: { rentalHousingException: rhe(), residencePeriods: [{ moveInDate: "2023-06-01", moveOutDate: "2024-06-01" }] } }),
    );
    expect(newOnly.issues.map((i) => i.field)).toContain("residencePeriods");
    expect(newOnly.result.isExempt).toBe(false);
    expect(newOnly.result.totalTax).toBe(124_366_000);
    expect((newOnly.result.warnings as string[]).filter((w) => UNMET_TEXT.test(w))).toHaveLength(1);
    expect(rentalStep(newOnly)).toEqual(["장기임대주택 거주주택 비과세 특례 — 적용 불가"]);
  });

  it("RR-5 승계조합원 — 사용승인 후 거주 3년 · 비과세", async () => {
    const r = await runCalc(
      redevAptForm({ price: "1000000000", assetOver: { ...SUCCESSOR, rentalHousingException: rhe(), residencePeriods: [{ moveInDate: "2021-02-15", moveOutDate: "2024-06-01" }] } }),
    );
    expect(r.issues).toEqual([]);
    expect(r.result.isExempt).toBe(true);
  });

  it("RR-6 세대 구성 초과(다른 일반주택 2채) — 과세 · 구성 불성립 고지", async () => {
    const r = await runCalc(
      redevAptForm({ price: "1000000000", count: "3", houses: [other("o1", "2010-01-01"), other("o2", "2011-01-01")], assetOver: { rentalHousingException: rhe() } }),
    );
    expect(r.result.isExempt).toBe(false);
    expect(r.result.totalTax).toBe(124_366_000);
    expect((r.result.warnings as string[]).some((w) => /세대 구성 요건/.test(w))).toBe(true);
  });

  it("RR-7 시나리오 B — ⑧ 차단 · API 직접이면 비과세를 거두고 확인 필요", async () => {
    const r = await runCalc(redevAptForm({ price: "1000000000", assetOver: { rentalHousingException: rhe("B") } }));
    expect(r.issues.map((i) => i.message).join("\n")).toMatch(/직전거주주택보유주택\(시나리오 B/);
    const a = await runCalc(redevAptForm({ price: "1000000000", assetOver: { rentalHousingException: rhe() } }));
    const res = await postTransfer({
      ...a.body,
      rentalHousingException: {
        ...(a.body.rentalHousingException as object),
        scenario: "B",
        priorResidenceTransferDate: "2016-08-25T00:00:00.000Z",
        standardPriceAtAcquisitionForPhrp: 300_000_000,
        standardPriceAtPriorTransfer: 450_000_000,
        standardPriceAtTransferForPhrp: 500_000_000,
        postRegistrationResidenceMonths: 60,
      },
    });
    expect(res.status).toBe(200);
    expect(res.result.isExempt).toBe(false);
    expect(res.result.warnings).toContain(REDEV_APT_RENTAL_SCENARIO_B_NOTICE);
  });

  it("RR-8 조합원입주권 양도 — 카드를 닫아 ④가 싣지 않는다", async () => {
    const r = await runCalc(
      redevAptForm({ price: "1000000000", assetOver: { assetKind: "right_to_move_in", redevSubject: "right", rentalHousingException: rhe() } }),
    );
    expect(r.issues).toEqual([]);
    expect(r.body.rentalHousingException).toBeUndefined();
  });

  it("RR-9 강남 20억 · 2026-08-01 — 중과 없이 부분과세 · 순수 1주택과 같은 세액", async () => {
    vi.mocked(preloadTaxRates).mockImplementation(async (_t, date) => loadFallbackTransferRates(date as Date) as never);
    const form = (withRental: boolean) =>
      redevAptForm({
        price: "2000000000",
        assetOver: {
          regionCode: "1168010100",
          residencePeriods: [{ moveInDate: "2019-06-01", moveOutDate: "2026-07-31" }],
          ...(withRental ? { rentalHousingException: rhe("A", "130") } : {}),
        },
        formOver: { transferDate: "2026-08-01", filingDate: "2026-09-30", isRegulatedArea: true } as never,
      });
    const r = await runCalc(form(true));
    expect(r.issues).toEqual([]);
    expect(r.result.isPartialExempt).toBe(true);
    expect(r.result.surchargeType).toBeUndefined();
    expect(r.result.appliedRate).toBe(0.38);
    expect(r.result.totalTax).toBe(65_302_600);
    const plain = await runCalc(form(false));
    expect(plain.result.totalTax).toBe(r.result.totalTax);
  });

  it("RR-10 §155⑳ 불성립이어도 임대주택이 §155① 신규 주택이면 일시적 2주택 비과세", async () => {
    const newUnit = { ...unit("16"), businessRegistrationDate: "2023-02-01", rentalRegistrationDate: "2023-02-01" };
    const base = await runCalc(
      redevAptForm({
        price: "1000000000",
        count: "2",
        houses: [other("r1", "2023-01-01", { isLongTermRental: true })],
        assetOver: { rentalHousingException: { ...rhe(), rentalUnits: [newUnit] } },
      }),
    );
    expect(base.body.temporaryTwoHouse).toMatchObject({ previousAcquisitionDate: "2008-01-01", newAcquisitionDate: "2023-01-01" });
    const rh = base.body.rentalHousingException as { rentalUnits: object[] };
    const r = await postTransfer({ ...base.body, rentalHousingException: { ...rh, rentalUnits: rh.rentalUnits.map((u) => ({ ...u, requirementsConfirmed: false })) } });
    expect(r.status).toBe(200);
    expect(r.result.isExempt).toBe(true);
    expect(r.result.exemptReason).toBe("일시적 2주택 비과세");
  });

  it("RR-11 재개발 카드 분리 입력(종전 12 + 신축 12)만으로 거주 — ⑧ 통과 · 비과세", async () => {
    const r = await runCalc(
      redevAptForm({
        price: "1000000000",
        assetOver: { rentalHousingException: rhe(), residencePeriods: [], redevPriorHouseResidenceMonths: "12", redevNewHouseResidenceMonths: "12" },
      }),
    );
    expect(r.issues).toEqual([]);
    expect(r.result.isExempt).toBe(true);
  });
});
