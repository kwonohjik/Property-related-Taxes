/**
 * route anchor — 임대 범주 안 쌍(§97의3·§97의4 중심)이 직접 호출에서 선택 순서에 따라 갈리거나 둘 다 적용되던 결함 (V-6).
 * 계획서 docs/00-pm/rental-97-overlap-v6.plan.md (Q-1 a · Q-2 a · Q-3 a).
 *
 * 쌍 1 §97의3×§97의4 — 법 §97의3②(승자 규칙 없음 → 자동 선택하지 않고 막는다)
 * 쌍 2 §97의3/4×§97의5 — 법 §97의5②(⑧은 막았고 ⑫가 통과시키던 쌍)
 * 쌍 3 §97 본문·§97의2×§97의3/4 — 명문 배제 없음 → 일반 규정 §127⑦
 * 세율표는 route 폴백이다(정본 세액).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { validateStep2Reductions } from "@/lib/calc/transfer-tax-validate-reductions";
import { findTrack127_7Conflict } from "@/lib/tax-engine/transfer-reductions/income-deduction-router";
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

const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;
const CONFLICT_RE = /조특법 §127⑦ 중복배제/;

const rentalCommon = {
  registrationDate: "2014-01-01", rentalStartDate: "2014-01-01", isTaxRegistered: true, taxRegistrationDate: "2014-01-01",
  rentIncreaseViolationMode: "none", rentalContinuesToTransfer: true, hasVacancyOverGrace: false,
  officialPriceAtStart: "300,000,000", isNationalHousingScale: true,
};
const r973 = () => ({ ...getReductionDefault("rental_97_3"), ...rentalCommon, stdPriceAtAcquisition: "100,000,000", stdPriceAtTransfer: "400,000,000" });
const r974 = () => ({ ...getReductionDefault("rental_97_4"), ...rentalCommon, rental974Category: "purchase_a", region: "capital" });

function card(n: number, kind: string, reductions: unknown[], acq = "2003-03-01"): AssetForm {
  return Object.assign({ ...makeDefaultAsset(n) }, x({
    assetKind: kind, acquisitionCause: "purchase", acquisitionDate: acq,
    actualSalePrice: "900,000,000", fixedAcquisitionPrice: "200,000,000",
    standardPriceAtAcq: "100,000,000", standardPriceAtTransfer: "400,000,000",
    assetContractDate: "", reductions: reductions as never,
  })) as AssetForm;
}
function form(assets: AssetForm[], td = "2025-08-01"): TransferFormData {
  return Object.assign(createDefaultTransferFormData(), {
    transferDate: td, contractTotalPrice: String(900_000_000 * assets.length), assets, isOneHousehold: false, householdHousingCount: "2",
  }) as TransferFormData;
}

type Json = {
  error?: { fieldErrors?: Record<string, string[]> };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
};
async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body),
  }));
  const json = (await res.json()) as Json;
  return { status: res.status, fieldErrors: json.error?.fieldErrors ?? {}, errors: JSON.stringify(json.error?.fieldErrors ?? {}), data: json.data };
}
const step8 = (f: TransferFormData) => validateStep2Reductions(2, f)?.message;


const SHORT = { registrationDate: "2018-01-01", rentalStartDate: "2018-01-01", taxRegistrationDate: "2018-01-01" };
const r973s = () => ({ ...r973(), ...SHORT });
const r974s = () => ({ ...r974(), ...SHORT });
const OLD = { registrationDate: "1995-03-01", rentalStartDate: "1995-03-01", taxRegistrationDate: "1995-03-01" };
const r97main = () => ({
  ...getReductionDefault("rental_97_main" as never), ...rentalCommon, ...OLD,
  constructionYear: "1995", isNationalHousing: true, hasMin5RentalUnits: true, isMultiUnitHousing: false, isUnoccupiedAt1986: true, isUnoccupiedAtAcquisition: true,
});
const OLD2 = { registrationDate: "2000-07-01", rentalStartDate: "2000-07-01", taxRegistrationDate: "2000-07-01" };
const r972 = () => ({
  ...getReductionDefault("rental_97_2" as never), ...rentalCommon, ...OLD2,
  rental972Type: "construction", isNationalHousing: true, hasNewRentalPlus2Units: true, isUnoccupiedAtAcquisition: true,
});
const STAT_3 = /\(조특법 §97의3②\)/;
const STAT_5 = /\(조특법 §97의5②\)/;

describe("쌍 1 — §97의3 × §97의4 (법 §97의3②): 순서로 갈리던 동작을 막는다", () => {
  const CASES: Array<[string, () => unknown[]]> = [
    ["긴 임대 [§97의3, §97의4]", () => [r973(), r974()]],
    ["긴 임대 [§97의4, §97의3]", () => [r974(), r973()]],
    ["짧은 임대 [§97의3, §97의4]", () => [r973s(), r974s()]],
    ["짧은 임대 [§97의4, §97의3]", () => [r974s(), r973s()]],
  ];
  it.each(CASES)("%s — ⑧이 막고 ⑫도 같은 문구로 400이다", async (_n, mk) => {
    const f = form([card(1, "housing", mk())]);
    const m8 = step8(f);
    expect(m8, "전제: ⑧이 막는다").toMatch(STAT_3);
    expect(m8).not.toMatch(CONFLICT_RE);
    const r = await post(f);
    expect(r.status).toBe(400);
    expect(Object.values(r.fieldErrors).flat()).toContain(m8);
  });
  it("문구가 조문을 맞게 가리킨다 — 먼저 고른 조문이 주어, 다른 쪽이 상대", () => {
    expect(step8(form([card(1, "housing", [r973(), r974()])]))).toMatch(/^§97의3 적용: §97의4 .*중복하여 적용할 수 없습니다/);
    expect(step8(form([card(1, "housing", [r974(), r973()])]))).toMatch(/^§97의4 적용: §97의3 .*중복하여 적용할 수 없습니다/);
  });
  it("각 단독은 200이다 — 짧은 임대 §97의4 단독도 적용된다", async () => {
    for (const red of [[r973()], [r974()], [r974s()]]) {
      const f = form([card(1, "housing", red)]);
      expect(step8(f) ?? "").not.toMatch(/중복하여 적용할 수 없습니다/);
      expect((await post(f)).status).toBe(200);
    }
  });
  it("컴패니언 카드 안 쌍 1은 companionAssets.0.reductions 400", async () => {
    const r = await post(form([card(1, "housing", []), card(2, "housing", [r973(), r974()])]));
    expect(r.status).toBe(400);
    const keys = Object.keys(r.fieldErrors).filter((k) => k.startsWith("companionAssets.0.reductions"));
    expect(keys.length).toBeGreaterThan(0);
    expect(r.fieldErrors[keys[0]][0]).toMatch(STAT_3);
  });
});

describe("쌍 2 — §97의3/4 × §97의5 (법 §97의5②): ⑧과 ⑫ 정합", () => {
  const r975b = () => ({ ...getReductionDefault("rental_97_5"), ...rentalCommon, isPurchaseRental: true });
  const CASES: Array<[string, () => unknown[]]> = [
    ["[§97의3, §97의5]", () => [r973(), r975b()]],
    ["[§97의5, §97의3]", () => [r975b(), r973()]],
    ["[§97의4, §97의5]", () => [r974(), r975b()]],
    ["[§97의5, §97의4]", () => [r975b(), r974()]],
  ];
  it.each(CASES)("%s — ⑧ 문구(§97의5②, 종전과 같음) 그대로 ⑫도 400", async (_n, mk) => {
    const f = form([card(1, "housing", mk())]);
    const m8 = step8(f) ?? "";
    expect(m8).toMatch(STAT_5);
    expect(m8).toMatch(/§97의5 세액감면과 중복하여 적용할 수 없습니다/);
    expect(m8).not.toMatch(CONFLICT_RE);
    const r = await post(f);
    expect(r.status).toBe(400);
    expect(Object.values(r.fieldErrors).flat()).toContain(m8);
  });
  it("§97의3·§97의4·§97의5 세 개 — §97의5 문구가 우선한다(⑧ 종전과 같음)", async () => {
    const f = form([card(1, "housing", [r973(), r974(), r975b()])]);
    expect(step8(f)).toMatch(STAT_5);
    expect((await post(f)).status).toBe(400);
  });
});

describe("쌍 3 — §97 본문·§97의2 × §97의3/4 (명문 배제 없음 → §127⑦)", () => {
  const CASES: Array<[string, () => unknown[], string]> = [
    ["[§97 본문, §97의4]", () => [r97main(), r974()], "1995-02-01"],
    ["[§97의4, §97 본문]", () => [r974(), r97main()], "1995-02-01"],
    ["[§97 본문, §97의3]", () => [r97main(), r973()], "1995-02-01"],
    ["[§97의2, §97의4]", () => [r972(), r974()], "2000-06-01"],
  ];
  it.each(CASES)("%s — ⑧이 §127⑦로 막고 ⑫도 같은 문구로 400", async (_n, mk, acq) => {
    const f = form([card(1, "housing", mk(), acq)]);
    const m8 = step8(f);
    expect(m8, "전제: ⑧이 막는다").toMatch(CONFLICT_RE);
    const r = await post(f);
    expect(r.status).toBe(400);
    expect(Object.values(r.fieldErrors).flat()).toContain(m8);
  });
  it("각 단독은 200이다", async () => {
    for (const [red, acq] of [[[r97main()], "1995-02-01"], [[r972()], "2000-06-01"], [[r974()], "1995-02-01"]] as const) {
      const f = form([card(1, "housing", [...red], acq)]);
      expect(step8(f) ?? "").not.toMatch(CONFLICT_RE);
      expect((await post(f)).status).toBe(200);
    }
  });
  it("세액감면형끼리(§97 본문 + §97의2)는 §127⑦ 트랙 교차가 아니라 세액감면 계열 쌍 문구로 막는다 (V-6 미측정분 · #3144 — 종전에는 200이었다)", async () => {
    const f = form([card(1, "housing", [r97main(), r972()], "1995-02-01")]);
    const m8 = step8(f) ?? "";
    expect(m8).not.toMatch(CONFLICT_RE);
    expect(m8).toMatch(/\(조특법 §127⑦\)\. 하나만 선택하세요\./);
    const r = await post(f);
    expect(r.status).toBe(400);
    expect(Object.values(r.fieldErrors).flat()).toContain(m8);
  });
  it("카드가 다르면 막지 않는다 — 카드 1 §97의4 + 카드 2 §97 본문", async () => {
    const r = await post(form([card(1, "housing", [r974()]), card(2, "housing", [r97main()], "1995-02-01")]));
    expect(r.status).toBe(200);
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

  it("명문 배제 3쌍은 막고 오류 경로는 상대 조문의 type 칸이다", async () => {
    // [목록, 상대 조문의 위치] — 주어는 먼저 고른 §97의3/§97의4, 상대는 그 짝
    const CASES: Array<[string[], number]> = [
      [["rental_97_3", "rental_97_4"], 1], [["rental_97_4", "rental_97_3"], 1],
      [["rental_97_3", "rental_97_5"], 1], [["rental_97_5", "rental_97_4"], 0],
    ];
    for (const [pair, idx] of CASES) {
      const i = await run(pair);
      expect(i, pair.join("+")).toHaveLength(1);
      expect(i[0].message).toMatch(/중복하여 적용할 수 없습니다/);
      expect(i[0].path, pair.join("+")).toEqual(["reductions", idx, "type"]);
    }
  });
  it("§97 본문·단서·§97의2와 §97의3/4는 §127⑦로 막는다", async () => {
    for (const other of ["rental_97_main", "rental_97_proviso", "rental_97_2"]) {
      for (const lthd of ["rental_97_3", "rental_97_4"]) {
        const i = await run([lthd, other]);
        expect(i, `${lthd}+${other}`).toHaveLength(1);
        expect(i[0].message).toMatch(CONFLICT_RE);
      }
    }
  });
  it("단독과, 임대 세액감면 계열 ↔ 다른 계열 세액감면(§77)은 막지 않는다 (임대 계열 안 쌍은 rental-97-tax-amount-pairs anchor)", async () => {
    for (const pair of [["rental_97_4"], ["rental_97_main"], ["rental_97_main", "public_expropriation"], ["rental_97_5", "public_expropriation"]]) {
      expect(await run(pair), pair.join("+")).toHaveLength(0);
    }
  });
  it("§127⑦ 충돌이 있으면 그 문구가 먼저다(⑧과 같은 순서) — 한 번에 하나만 보고한다", async () => {
    const i = await run(["rental_97_4", "rental_97_5", "new_99_3"]);
    expect(i).toHaveLength(1);
    expect(i[0].message).toMatch(CONFLICT_RE);
    expect(i[0].path).toEqual(["reductions", 2, "type"]);
  });
  it("판정 함수 — 명문 배제 3쌍만, 상대와 근거 조문을 돌려준다", async () => {
    const { findRental97StatutoryOverlap } = await import("@/lib/tax-engine/transfer-reductions/rental-97-statutory-overlap");
    expect(findRental97StatutoryOverlap(["rental_97_3", "rental_97_4"])).toMatchObject({ subject: "rental_97_3", other: "rental_97_4", basis: "§97의3②" });
    expect(findRental97StatutoryOverlap(["rental_97_4", "rental_97_3"])).toMatchObject({ subject: "rental_97_4", other: "rental_97_3", basis: "§97의3②" });
    expect(findRental97StatutoryOverlap(["rental_97_4", "rental_97_5"])).toMatchObject({ subject: "rental_97_4", other: "rental_97_5", basis: "§97의5②" });
    expect(findRental97StatutoryOverlap(["rental_97_3", "rental_97_4", "rental_97_5"])).toMatchObject({ subject: "rental_97_3", other: "rental_97_5", basis: "§97의5②" });
    expect(findRental97StatutoryOverlap(["rental_97_main", "rental_97_4"])).toBeNull();
    expect(findRental97StatutoryOverlap(["rental_97_5", "rental_97_main"])).toBeNull();
    expect(findRental97StatutoryOverlap(["rental_97_3"])).toBeNull();
  });
  it("분류 — 명문 배제 3쌍은 §127⑦ 분류 충돌에서 빠지고, §97 본문·§97의2 쌍은 들어간다", () => {
    expect(findTrack127_7Conflict(["rental_97_3", "rental_97_4"], false)).toBeNull();
    expect(findTrack127_7Conflict(["rental_97_4", "rental_97_5"], false)).toBeNull();
    expect(findTrack127_7Conflict(["rental_97_4", "rental_97_main"], false)?.second.type).toBe("rental_97_main");
    expect(findTrack127_7Conflict(["rental_97_3", "rental_97_2"], true)?.second.type).toBe("rental_97_2");
    expect(findTrack127_7Conflict(["rental_97_main", "rental_97_2"], false)).toBeNull();
  });
});
