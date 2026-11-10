/**
 * route anchor — 임대 세액감면 계열(§97 본문·§97 단서·§97의2·§97의5) 안 쌍이 직접 호출에서 «배열 첫 항목만 평가»되어
 * 순서로 세액이 갈리던 결함 + §97 단서 × §97의3·§97의4 쌍 고정 (V-6 미측정분).
 * 계획서 docs/00-pm/rental-97-v6-proviso-pairs.plan.md (Q-1 a · Q-2 b · Q-3 b · Q-4 a).
 *
 * `evaluateRental97TaxAmount`는 이 4개 id 중 첫 항목에서 return한다 — 같은 입력에 순서만 바꿔도 총세액이 달랐고
 * (`[단서, 본문]` 33,812,000 · `[본문, 단서]` 109,889,000), 앞 항목이 부적격이면 적격인 뒤 항목이 버려졌다.
 * 조특법 §127⑦은 «거주자가 선택하는 하나»라 자동 선택하지 않고 ⑧·⑫가 막는다(V-6과 같은 방침).
 * 본문×단서만 §127⑦이 아니라 §97① (한 항의 원칙과 예외 — 법제처 해석례 24-0009) 문구를 쓴다.
 * 세율표는 route 폴백이다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { validateStep2Reductions } from "@/lib/calc/transfer-tax-validate-reductions";
import { POST } from "@/app/api/calc/transfer/route";
import { captureBody } from "../calc/_one-house-pr3a-calc-route";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/rate-limit")>();
  return { ...actual, checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }) };
});
beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(async (_t, date) => loadFallbackTransferRates(date) as never);
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;
const CONFLICT_RE = /조특법 §127⑦ 중복배제/; // 트랙 교차 문구(`track127_7ConflictMessage`)
const STAT_5 = /\(조특법 §97의5②\)/;
const TA_127 = /중복하여 적용할 수 없습니다 \(조특법 §127⑦\)\. 하나만 선택하세요\./;
const TA_97 = /원칙과 예외라 함께 적용할 수 없습니다 \(조특법 §97①\)\. 하나만 선택하세요\./;

// ── 픽스처 (#3144 계획서 §3 프로브와 같은 시료) ─────────────────────────────────
const rentalCommon = {
  registrationDate: "2014-01-01", rentalStartDate: "2014-01-01", isTaxRegistered: true, taxRegistrationDate: "2014-01-01",
  rentIncreaseViolationMode: "none", rentalContinuesToTransfer: true, hasVacancyOverGrace: false,
  officialPriceAtStart: "300,000,000", isNationalHousingScale: true,
};
// 등록 2012-01-01 · 임대개시 1995-03-01 — §97의3·§97의4와 한 카드에서 동시에 적격인 일관 시료(취득 1995-02-01)
const CONS = { registrationDate: "2012-01-01", rentalStartDate: "1995-03-01", taxRegistrationDate: "2012-01-01" };
// 취득 1995-02-01 직후 등록·개시 — §97의5①1호 «3개월 이내 등록»을 채운다
const OLD = { registrationDate: "1995-03-01", rentalStartDate: "1995-03-01", taxRegistrationDate: "1995-03-01" };
// 신축 2000 시료 — §97의2와 같은 카드
const OLD2 = { registrationDate: "2000-07-01", rentalStartDate: "2000-07-01", taxRegistrationDate: "2000-07-01" };
const m97 = { constructionYear: "1995", isNationalHousing: true, hasMin5RentalUnits: true, isMultiUnitHousing: false, isUnoccupiedAt1986: true, isUnoccupiedAtAcquisition: true };
const proviso = (c: string, d: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ ...getReductionDefault("rental_97_proviso" as never), ...rentalCommon, ...d, ...m97, provisoCase: c, ...extra });
const main = (d: Record<string, unknown>) => ({ ...getReductionDefault("rental_97_main" as never), ...rentalCommon, ...d, ...m97 });
const r973 = (d: Record<string, unknown>) => ({ ...getReductionDefault("rental_97_3"), ...rentalCommon, ...d, stdPriceAtAcquisition: "100,000,000", stdPriceAtTransfer: "400,000,000" });
const r974 = (d: Record<string, unknown>) => ({ ...getReductionDefault("rental_97_4"), ...rentalCommon, ...d, rental974Category: "purchase_a", region: "capital" });
const r975 = (d: Record<string, unknown>) => ({ ...getReductionDefault("rental_97_5"), ...rentalCommon, ...d, isPurchaseRental: true });
const r972 = (d: Record<string, unknown>) => ({
  ...getReductionDefault("rental_97_2" as never), ...rentalCommon, ...d,
  rental972Type: "construction", isNationalHousing: true, hasNewRentalPlus2Units: true, isUnoccupiedAtAcquisition: true,
});

function card(n: number, reductions: unknown[], acq: string): AssetForm {
  return Object.assign({ ...makeDefaultAsset(n) }, x({
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: acq,
    actualSalePrice: "900,000,000", fixedAcquisitionPrice: "200,000,000",
    standardPriceAtAcq: "100,000,000", standardPriceAtTransfer: "400,000,000",
    assetContractDate: "", reductions: reductions as never,
  })) as AssetForm;
}
function form(assets: AssetForm[]): TransferFormData {
  return Object.assign(createDefaultTransferFormData(), {
    transferDate: "2025-08-01", contractTotalPrice: String(900_000_000 * assets.length), assets, isOneHousehold: false, householdHousingCount: "2",
  }) as TransferFormData;
}
async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body),
  }));
  const json = (await res.json()) as Any;
  return { status: res.status, fieldErrors: (json.error?.fieldErrors ?? {}) as Record<string, string[]>, result: json.data?.result ?? json.data };
}
const step8 = (f: TransferFormData) => validateStep2Reductions(2, f)?.message;

describe("§97 단서 × §97의3·§97의4 (Q-1 a) — 세 갈래 × 두 순서 12건, ⑧↔⑫ §127⑦ 일치", () => {
  const CASES: Array<[string, () => unknown[]]> = [];
  for (const c of ["a_construction", "b_purchase", "c_10years"]) {
    CASES.push([`${c} [단서, §97의3]`, () => [proviso(c, CONS), r973(CONS)]]);
    CASES.push([`${c} [§97의3, 단서]`, () => [r973(CONS), proviso(c, CONS)]]);
    CASES.push([`${c} [단서, §97의4]`, () => [proviso(c, CONS), r974(CONS)]]);
    CASES.push([`${c} [§97의4, 단서]`, () => [r974(CONS), proviso(c, CONS)]]);
  }
  it.each(CASES)("%s — ⑧이 §127⑦로 막고 ⑫도 같은 문구로 400", async (_n, mk) => {
    const f = form([card(1, mk(), "1995-02-01")]);
    const m8 = step8(f);
    expect(m8, "전제: ⑧이 막는다").toMatch(CONFLICT_RE);
    const r = await post(f);
    expect(r.status).toBe(400);
    expect(Object.values(r.fieldErrors).flat()).toContain(m8);
  });
  it.each(["a_construction", "b_purchase", "c_10years"])("전제: 단서 %s 단독은 200이고 적격이다", async (c) => {
    const f = form([card(1, [proviso(c, CONS)], "1995-02-01")]);
    expect(step8(f) ?? "").not.toMatch(CONFLICT_RE);
    const r = await post(f);
    expect(r.status).toBe(200);
    expect(r.result.rental97TaxDetail?.isEligible).toBe(true);
  });
});

describe("임대 세액감면 계열 안 쌍 (Q-2 b·Q-3 b) — 6쌍 × 두 순서, ⑧↔⑫ 같은 문구로 400", () => {
  // [이름, 시료 acq, 첫 항목, 둘째 항목, 기대 문구]
  type Mk = (d: Record<string, unknown>) => unknown;
  const mkProviso: Mk = (d) => proviso("b_purchase", d);
  const PAIRS: Array<[string, string, Record<string, unknown>, Mk, Mk, RegExp]> = [
    ["본문×단서", "1995-02-01", OLD, main, mkProviso, TA_97],
    ["본문×§97의2", "2000-06-01", OLD2, (d) => main({ ...d, constructionYear: "2000" }), r972, TA_127],
    ["본문×§97의5", "1995-02-01", OLD, main, r975, TA_127],
    ["단서×§97의2", "2000-06-01", OLD2, (d) => proviso("a_construction", d, { constructionYear: "2000" }), r972, TA_127],
    ["단서×§97의5", "1995-02-01", OLD, mkProviso, r975, TA_127],
    ["§97의2×§97의5", "2000-06-01", OLD2, r972, r975, TA_127],
  ];
  for (const [name, acq, d, mkA, mkB, re] of PAIRS) {
    it(`${name} [앞, 뒤]·[뒤, 앞] — ⑧이 막고 ⑫가 같은 문구로 400이며 오류 경로는 상대 항목의 type 칸`, async () => {
      for (const order of [0, 1]) {
        const reds = order === 0 ? [mkA(d), mkB(d)] : [mkB(d), mkA(d)];
        const f = form([card(1, reds, acq)]);
        const m8 = step8(f) ?? "";
        expect(m8, `${name} order${order} 전제: ⑧이 막는다`).toMatch(re);
        expect(m8).not.toMatch(CONFLICT_RE);
        const r = await post(f);
        expect(r.status, `${name} order${order}`).toBe(400);
        expect(Object.values(r.fieldErrors).flat(), `${name} order${order}`).toContain(m8);
        expect(Object.keys(r.fieldErrors).some((k) => /^reductions\.1\.type$/.test(k)), `${name} order${order} 경로`).toBe(true);
      }
    });
  }
  it("전제: 각 단독은 200이다 — 본문·단서·§97의2·§97의5", async () => {
    for (const [reds, acq] of [[[main(OLD)], "1995-02-01"], [[proviso("b_purchase", OLD)], "1995-02-01"], [[r972(OLD2)], "2000-06-01"], [[r975(OLD)], "1995-02-01"]] as const) {
      const f = form([card(1, [...reds], acq)]);
      expect(step8(f) ?? "").not.toMatch(/중복하여 적용할 수 없습니다/);
      expect((await post(f)).status).toBe(200);
    }
  });
  it("카드가 다르면 막지 않는다 — 카드 1 본문 + 카드 2 단서", async () => {
    const r = await post(form([card(1, [main(OLD)], "1995-02-01"), card(2, [proviso("b_purchase", OLD)], "1995-02-01")]));
    expect(r.status).toBe(200);
  });
});

describe("다른 판정과 섞일 때 — §127⑦ 트랙 교차가 먼저이고 ⑧↔⑫가 같은 문구를 낸다", () => {
  // 본문·단서·§97의2는 §97의3/4와 §127⑦ 트랙 교차, §97의5는 §97의3/4와 명문 배제(§97의5②) — 어느 조합이든 세액감면 계열 쌍 문구보다 앞선다.
  const MIXED: Array<[string, () => unknown[], string, RegExp]> = [
    ["[§97의3, §97의4, 본문]", () => [r973(CONS), r974(CONS), main(CONS)], "1995-02-01", CONFLICT_RE],
    ["[본문, §97의2, §97의3, §97의4]", () => [main(OLD2), r972(OLD2), r973(OLD2), r974(OLD2)], "2000-06-01", CONFLICT_RE],
    ["[본문, §97의5, §97의3]", () => [main(OLD), r975(OLD), r973(OLD)], "1995-02-01", CONFLICT_RE],
    ["[§97의5, §97의3, §97의4]", () => [r975(OLD), r973(OLD), r974(OLD)], "1995-02-01", STAT_5],
  ];
  it.each(MIXED)("%s — 세액감면 계열 쌍 문구가 아니라 앞선 판정 문구, ⑧=⑫", async (_n, mk, acq, re) => {
    const f = form([card(1, mk(), acq)]);
    const m8 = step8(f) ?? "";
    expect(m8).toMatch(re);
    expect(m8).not.toMatch(TA_127);
    expect(m8).not.toMatch(TA_97);
    const r = await post(f);
    expect(r.status).toBe(400);
    expect(Object.values(r.fieldErrors).flat()).toContain(m8);
  });
  it("[본문, 단서, §97의5] — 세 개: 첫 쌍(본문×단서, §97①)을 지목한다", async () => {
    const f = form([card(1, [main(OLD), proviso("b_purchase", OLD), r975(OLD)], "1995-02-01")]);
    const m8 = step8(f) ?? "";
    expect(m8).toMatch(TA_97);
    const r = await post(f);
    expect(r.status).toBe(400);
    expect(Object.values(r.fieldErrors).flat()).toContain(m8);
  });
});

describe("refine · 판정 함수 단위", () => {
  const run = async (types: string[]) => {
    const { refineReductionTrack127_7 } = await import("@/lib/api/transfer-tax-schema-reduction-refines");
    const issues: { path: (string | number)[]; message: string }[] = [];
    const ctx = { addIssue: (i: { path: (string | number)[]; message: string }) => issues.push(i) } as never;
    refineReductionTrack127_7(types.map((type) => ({ type })), "2003-03-01", "2025-08-01", ctx, ["reductions"]);
    return issues;
  };
  const SERIES = ["rental_97_main", "rental_97_proviso", "rental_97_2", "rental_97_5"];

  it("세액감면 계열 6쌍 × 두 순서 — 1건, 경로는 상대의 type 칸, 문구는 basis에 맞다", async () => {
    for (let i = 0; i < SERIES.length; i++) for (let j = i + 1; j < SERIES.length; j++) {
      for (const [a, b] of [[SERIES[i], SERIES[j]], [SERIES[j], SERIES[i]]]) {
        const out = await run([a, b]);
        expect(out, `${a}+${b}`).toHaveLength(1);
        expect(out[0].path, `${a}+${b}`).toEqual(["reductions", 1, "type"]);
        const pair97 = [a, b].every((t) => t === "rental_97_main" || t === "rental_97_proviso");
        expect(out[0].message, `${a}+${b}`).toMatch(pair97 ? TA_97 : TA_127);
      }
    }
  });
  it("판정 함수 — 주어는 먼저 고른 계열, basis는 본문×단서만 §97①", async () => {
    const { findRental97TaxAmountOverlap } = await import("@/lib/tax-engine/transfer-reductions/rental-97-tax-amount-overlap");
    expect(findRental97TaxAmountOverlap(["rental_97_proviso", "rental_97_main"])).toMatchObject({ subject: "rental_97_proviso", other: "rental_97_main", basis: "§97①" });
    expect(findRental97TaxAmountOverlap(["rental_97_5", "rental_97_2"])).toMatchObject({ subject: "rental_97_5", other: "rental_97_2", basis: "§127⑦" });
    expect(findRental97TaxAmountOverlap(["rental_97_main", "rental_97_5", "rental_97_proviso"])).toMatchObject({ subject: "rental_97_main", other: "rental_97_5", basis: "§127⑦" });
    expect(findRental97TaxAmountOverlap(["rental_97_main"])).toBeNull();
    expect(findRental97TaxAmountOverlap(["rental_97_main", "rental_97_main"])).toBeNull(); // 같은 id 둘은 이 판정의 대상이 아니다
    expect(findRental97TaxAmountOverlap(["rental_97_main", "rental_97_3", "new_99_3"])).toBeNull(); // §97의3·범주 밖은 다른 판정이 맡는다
  });
  it("§97의3/4가 낀 쌍은 이 판정이 아니라 기존 판정이 맡는다", async () => {
    // 명문 배제·§127⑦ 분류 충돌이 있으면 그 문구가 먼저이고 세액감면 쌍 문구는 나오지 않는다
    const stat = await run(["rental_97_5", "rental_97_3", "rental_97_4"]);
    expect(stat).toHaveLength(1);
    expect(stat[0].message).toMatch(STAT_5);
    const mixed = await run(["rental_97_3", "rental_97_5", "rental_97_main"]);
    expect(mixed).toHaveLength(1);
    expect(mixed[0].message).toMatch(CONFLICT_RE);
    const cross = await run(["rental_97_main", "rental_97_proviso", "new_99_3"]);
    expect(cross).toHaveLength(1);
    expect(cross[0].message).toMatch(CONFLICT_RE);
  });
});
