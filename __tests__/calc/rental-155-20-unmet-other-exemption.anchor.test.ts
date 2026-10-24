/**
 * anchor(화면 경로 ⑧→④→⑫⑭→엔진) — §155⑳ **불성립**이어도 임대주택을 센 판정이 다른 특례(일시적 2주택)로 낸 비과세를 싣는다.
 *
 * 계획서 `docs/00-pm/rental-155-20-unmet-blocks-155-1.plan.md` · 사용자 결정 2026-10-24 Q-1~Q-4 (a).
 * 근거: 영 §155⑳은 불성립이면 「국내에 1개의 주택을 소유하고 있는 것으로 보아」가 없을 뿐 다른 특례를 배제하지 않는다 ·
 * 영 §155①은 신규 주택이 임대등록 주택인지를 요건으로 두지 않는다 · 불성립 임대주택은 주택 수에 들어간다(서울행정법원-2019-구단-64771).
 *
 * 시료: 거주주택 2008-01-01 취득 · 거주 2019-06~2024-06 · 2024-06-01 양도. 명부에 임대주택 1채(2023-01-01 취득 = §155① 신규 주택 · 장기임대 표시).
 * 불성립 사유는 임대개시 당시 기준시가 7억(가액 요건 초과 — ⑧이 막지 않는 사유)으로 만든다.
 *
 * | # | 입력 | 종전 | 지금 |
 * |---|---|---|---|
 * | UO-1 | A 불성립 · 10억 | 과세 60,621,000 | 비과세 0 (= 특례 미선언 짝) |
 * | UO-2 | A 불성립 · 15억 | 14,124,000 | 불변(정상 경로 부분 비과세) · 불성립 고지 추가 |
 * | UO-3 | B 불성립 · 10억 | 과세 60,621,000 | 50,171,000 — 영 §154⑩ 안분(= ⑳ 성립 짝 · b-154-10 Q-1 (a), 종전 F-1 결과 0 정정) |
 * | UO-3b | B 불성립 · 15억 | — | 141,966,000 — §161② 안분(= ⑳ 성립 짝) |
 * | UO-4 | 명부 없음(주택 수 1 · 2) | 124,366,000 | 불변 — 과다 비과세 미부활(STEP 0.96이 판정 전에 되돌림) |
 * | UO-5 | 임대 행 2007 취득(일시적 2주택 아님) | 124,366,000 | 불변 |
 * | UO-6 | UO-1 안내 | — | 불성립 고지 1건 · ㉒ 사후 추징 안내(「특례를 적용했습니다」) 없음 · 판정 확인 필요 고지(부칙 마목·바목)는 유지 / 성립 짝은 ㉒ 유지 |
 * | UO-6b | ㉑ 통과 호 + 불성립 호 | — | ㉒ 안내 없음 |
 * | UO-7 | 명부 없음 · 주택 수 1 고지 | 「주택 수로 직접 입력」 | 「보유 주택 목록」에 취득일과 함께 넣으라는 처방 · 과세 결론 문장 유지 |
 * | UO-9 | 부담부증여(증여세 계산기) 같은 사실 | — | 특례 미선언 짝과 같은 비과세 |
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
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
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { runCalc, redevAptForm, houseRow } from "./_helpers/redev-one-house-route";
import { gift } from "../api/_gift-burdened-pr7-harness";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => vi.unstubAllGlobals());

const NR = "4682025021";
const unit = (price = "700,000,000") => ({
  ...makeDefaultRentalUnit(),
  businessRegistrationDate: "2023-02-01",
  rentalRegistrationDate: "2023-02-01",
  standardPriceAtRentalStart: price,
  rentalInputMode: "direct" as const,
  rentalMonths: "16",
  requirementsConfirmed: true,
});
const RHE_A = (price?: string) => ({ applyException: true, scenario: "A", rentalUnits: [unit(price)], priorRentalExemptionHistory: "none" });
const RHE_B = {
  ...RHE_A(),
  scenario: "B",
  priorResidenceTransferDate: "2020-01-01",
  postRegistrationResidenceMonths: "30",
  standardPriceAtAcquisitionForPhrp: "100,000,000",
  standardPriceAtPriorTransfer: "200,000,000",
  standardPriceAtTransferForPhrp: "300,000,000",
};
const rentalRow = (acq = "2023-01-01", isLongTermRental = true) =>
  houseRow("r1", acq, { region: "non_capital", regionCode: NR, officialPrice: "100000000", isApartment: false, acquisitionOrigin: "general", isLongTermRental } as never);

function form(o: { price?: string; count?: string; houses?: ReturnType<typeof rentalRow>[]; rhe?: object | null }) {
  return redevAptForm({
    kind: "housing",
    price: o.price ?? "1000000000",
    count: o.count ?? "2",
    houses: o.houses ?? [rentalRow("2023-01-01", o.rhe !== null)],
    assetOver: o.rhe === null ? {} : { rentalHousingException: o.rhe ?? RHE_A() },
  });
}
const UNMET = "장기임대주택 거주주택 특례(소득세법 시행령 §155⑳)는 요건을 충족하지 못해 적용하지 않았습니다";
const unmetNotices = (w: string[] | undefined) => (w ?? []).filter((x) => x.startsWith(UNMET));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const labels = (r: any) => ((r.result?.steps ?? []) as { label: string }[]).map((s) => s.label);

describe("§155⑳ 불성립 × 일시적 2주택(§155①) — 계산기 화면 경로", () => {
  it("UO-1 ★ A 불성립 · 10억 → 비과세 0 — 특례를 선언하지 않은 같은 사실과 같다 (종전 과세 60,621,000)", async () => {
    const r = await runCalc(form({}));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.result.isExempt).toBe(true);
    expect(r.result.exemptReason).toBe("일시적 2주택 비과세");
    expect(r.result.totalTax).toBe(0);
    const none = await runCalc(form({ rhe: null }));
    expect(none.result.isExempt).toBe(true);
    expect(none.result.totalTax).toBe(r.result.totalTax);
  });

  it("UO-2 A 불성립 · 15억 → 부분 비과세 14,124,000 불변 · 불성립 고지가 적용한 특례를 말한다", async () => {
    const r = await runCalc(form({ price: "1500000000" }));
    expect(r.issues).toEqual([]);
    expect(r.result.isPartialExempt).toBe(true);
    expect(r.result.totalTax).toBe(14_124_000);
    const n = unmetNotices(r.result.warnings);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatch(/적용한 비과세는 「일시적 2주택 고가주택」입니다\.$/);
  });

  /**
   * B(직전거주주택보유주택)는 ⑳이 불성립이어도 일시적 2주택으로 1세대1주택이 되면 영 §154⑩이 「제1항에 따른 1세대 1주택」에 걸어
   * 직전거주주택 양도일 후 기간분만 비과세한다(§161① 안분) — `rental-155-20-b-154-10-and-q4.plan.md` Q-1 (a)·Q-2 (b).
   * F-1(#2513)은 이 경우를 안분 없는 비과세 0으로 냈다(F-1 Q-2 — 초판 판정 정정).
   */
  it("UO-3 ★ B 불성립 · 10억 → 영 §154⑩ 안분 50,171,000 = ⑳ 성립 짝 (종전 과세 60,621,000 → F-1 0 → 정정)", async () => {
    const r = await runCalc(form({ rhe: RHE_B }));
    expect(r.issues).toEqual([]);
    expect(r.result.isExempt).toBe(false);
    expect(r.result.totalTax).toBe(50_171_000);
    expect(labels(r)).toContain("직전거주주택보유주택 — 영 §154⑩ 안분");
    const n = (r.result.warnings ?? []).filter((x: string) => x.includes("§154⑩에 따라 직전거주주택 양도일 후 기간분만 비과세로 계산했습니다"));
    expect(n).toHaveLength(1);
    expect(n[0]).toContain("다른 특례(「일시적 2주택 비과세」)에 따라 1세대1주택이 되지만");
    expect(n[0]).toContain("1호 임대개시일 기준시가 6억원 초과");
    // ⑳이 서지 않았으므로 ㉒ 사후 추징 안내는 없다
    expect((r.result.warnings ?? []).some((w: string) => w.includes("§155㉒"))).toBe(false);
    const met = await runCalc(form({ rhe: { ...RHE_B, rentalUnits: [unit("250,000,000")] } }));
    expect(met.result.totalTax).toBe(r.result.totalTax);
  });

  it("UO-3b B 불성립 · 15억 → §161② 안분 141,966,000 = ⑳ 성립 짝", async () => {
    const r = await runCalc(form({ rhe: RHE_B, price: "1500000000" }));
    expect(r.issues).toEqual([]);
    expect(r.result.totalTax).toBe(141_966_000);
    expect((r.result.warnings ?? []).some((x: string) => x.includes("다른 특례(「일시적 2주택 고가주택」)"))).toBe(true);
    const met = await runCalc(form({ rhe: { ...RHE_B, rentalUnits: [unit("250,000,000")] }, price: "1500000000" }));
    expect(met.result.totalTax).toBe(r.result.totalTax);
  });

  it("UO-4 명부 없음 → 과세 124,366,000 불변 — 주택 수 1은 STEP 0.96이 되돌리고, 2는 일시적 2주택 사실이 없다(과다 비과세 미부활)", async () => {
    for (const count of ["1", "2"]) {
      const r = await runCalc(form({ count, houses: [] }));
      expect(r.issues).toEqual([]);
      expect(r.result.isExempt).toBe(false);
      expect(r.result.totalTax).toBe(124_366_000);
      expect(unmetNotices(r.result.warnings)).toEqual([]);
    }
  });

  it("UO-5 임대 행 2007 취득(일시적 2주택 아님) → 과세 124,366,000 — 게이트를 좁혀도 다른 특례가 없으면 과세", async () => {
    const r = await runCalc(form({ houses: [rentalRow("2007-01-01")] }));
    expect(r.issues).toEqual([]);
    expect(r.result.isExempt).toBe(false);
    expect(r.result.totalTax).toBe(124_366_000);
    expect(unmetNotices(r.result.warnings)).toEqual([]);
  });

  it("UO-6 안내 — 불성립은 불성립 고지 1건 · ㉒(적용 전제) 없음 · 확인 필요 고지는 유지(STEP 2.5 적용 불가 경로와 같다) · 성립 짝은 ㉒ 유지", async () => {
    const r = await runCalc(form({}));
    const w: string[] = r.result.warnings ?? [];
    const n = unmetNotices(w);
    expect(n).toHaveLength(1);
    expect(n[0]).toContain("임대주택을 세대 주택 수에 넣어 판정했고, 적용한 비과세는 「일시적 2주택 비과세」입니다.");
    expect(w.some((x) => x.includes("§155㉒"))).toBe(false);
    // 판정 보류·확인 필요 고지는 불성립의 원인일 수 있어 남긴다 — 판정 메뉴 카드도 불성립에서 같은 고지를 보여준다
    expect(w.some((x) => x.includes("현행 문언대로 인정했습니다"))).toBe(true);

    const ok = await runCalc(form({ rhe: RHE_A("250,000,000") }));
    const okW: string[] = ok.result.warnings ?? [];
    expect(ok.result.isExempt).toBe(true);
    expect(unmetNotices(okW)).toEqual([]);
    expect(okW.some((x) => x.includes("§155㉒"))).toBe(true);
  });

  it("UO-6b ㉑로 통과한 호가 있어도 다른 호가 불성립이면 ㉒ 안내(「특례를 적용했습니다」)를 싣지 않는다", async () => {
    const r = await runCalc(form({ rhe: { ...RHE_A(), rentalUnits: [unit("250,000,000"), unit()] } }));
    expect(r.issues).toEqual([]);
    expect(r.result.isExempt).toBe(true);
    const w: string[] = r.result.warnings ?? [];
    expect(unmetNotices(w)).toHaveLength(1);
    expect(w.some((x) => x.includes("§155㉒"))).toBe(false);
  });

  it("UO-7 명부 없음 · 주택 수 1 고지 — 처방은 「보유 주택 목록」에 취득일과 함께 넣기 · 과세 결론 문장 유지", async () => {
    const r = await runCalc(form({ count: "1", houses: [] }));
    const w = ((r.result.warnings ?? []) as string[]).find((x) => x.includes("세대 주택 수에 넣어(2주택)")) ?? "";
    expect(w).toContain("1세대1주택 비과세·12억 초과분 안분·장기보유특별공제 표2를 적용하지 않습니다");
    expect(w).toContain("「보유 주택 목록」에 임대주택을 취득일과 함께 넣어야 판정합니다");
    expect(w).not.toContain("주택 수로 직접 입력");
  });
});

describe("UO-9 부담부증여(증여세 계산기 → 양도세 route) — 같은 엔진", () => {
  const BGT = {
    acquisitionDate: new Date("2016-01-10"),
    residencePeriodMonths: 60,
    householdHousingCount: 2,
    standardPriceAtAcquisition: 500_000_000,
    temporaryTwoHouse: { previousAcquisitionDate: new Date("2016-01-10"), newAcquisitionDate: new Date("2023-01-01") },
  };
  const opts = { standardPrice: 1_000_000_000, debt: 300_000_000 };
  it("§155⑳ 불성립이어도 특례 미선언 짝과 같은 일시적 2주택 비과세", async () => {
    const none = await gift("2025-06-01", BGT as never, opts);
    expect(none.isExempt).toBe(true);
    const unmet = await gift("2025-06-01", { ...BGT, rentalHousingException: RHE_A() } as never, opts);
    expect(unmet.isExempt).toBe(true);
    expect(unmet.exemptReason).toBe(none.exemptReason);
    expect(unmet.totalTax).toBe(none.totalTax);
    expect(unmetNotices(unmet.warnings as string[])).toHaveLength(1);
  });
});
