/**
 * route anchor — 조특법 §97의3·§97의4(장기보유특별공제 특례)가 §127⑦ 중복배제 분류 밖이라
 * 신축주택(§99의3)·수용 감면(§77)·§98의2와 같은 카드에서 이중 적용되던 결함 (NH-41 Q-2 b 후속).
 * 계획서 docs/00-pm/rental-97-3-4-track-127-7.plan.md (Q-1 a · Q-2 a · Q-3 a).
 *
 * 조심 2024서2915: §97의4 추가공제율도 §127⑦의 «감면규정». §97의3은 직접 재결이 없어 같은 구조로 본다(유추 — 계획서 V-1).
 * ⑤·⑧·⑫는 `findTrack127_7Conflict` 한 함수를 쓰므로 여기서는 ⑧↔⑫ 문구 일치와 현행 고정 동작(임대 범주 안 쌍)을 본다.
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
import { findTrack127_7Conflict, track127_7EffectLabel } from "@/lib/tax-engine/transfer-reductions/income-deduction-router";
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

const r993 = () => ({
  ...getReductionDefault("new_99_3"),
  acquisitionType993: "from_builder", contractDate993: "2003-03-01", exclusiveAreaSqm993: "84", houseType993: "", firstContract993: "yes",
  region993: "outside_speculation",
  standardPriceAtAcquisition993: "100,000,000", standardPriceAt5Years: "150,000,000", standardPriceAtTransfer993: "400,000,000",
});
const r77 = () => ({ ...getReductionDefault("public_expropriation" as never), expropriationCash: "500,000,000", expropriationApprovalDate: "2023-01-01" });
const rentalCommon = {
  registrationDate: "2014-01-01", rentalStartDate: "2014-01-01", isTaxRegistered: true, taxRegistrationDate: "2014-01-01",
  rentIncreaseViolationMode: "none", rentalContinuesToTransfer: true, hasVacancyOverGrace: false,
  officialPriceAtStart: "300,000,000", isNationalHousingScale: true,
};
const r973 = () => ({ ...getReductionDefault("rental_97_3"), ...rentalCommon, stdPriceAtAcquisition: "100,000,000", stdPriceAtTransfer: "400,000,000" });
const r974 = () => ({ ...getReductionDefault("rental_97_4"), ...rentalCommon, rental974Category: "purchase_a", region: "capital" });
const r982 = () => ({
  ...getReductionDefault("unsold_98_2" as never),
  isNonCapitalUnsold982: true, isFirstOrFcfsContract982: true, occupiedAtContract982: "no", contractDate982: "2009-06-01",
});

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

describe("§97의3·§97의4 × 차감형·세액감면형 — 같은 카드", () => {
  const CASES: Array<[string, () => unknown[]]> = [
    ["§97의4 + §99의3", () => [r974(), r993()]],
    ["§97의3 + §99의3", () => [r973(), r993()]],
    ["§97의4 + §77", () => [r974(), r77()]],
    ["§97의3 + §77", () => [r973(), r77()]],
  ];

  it.each(CASES)("%s — ⑧이 막고 ⑫도 같은 문구로 400이다", async (_n, mk) => {
    const f = form([card(1, "housing", mk())]);
    const m8 = step8(f);
    expect(m8, "전제: ⑧이 막는다").toMatch(CONFLICT_RE);
    const r = await post(f);
    expect(r.status).toBe(400);
    expect(Object.values(r.fieldErrors).flat()).toContain(m8);
  });

  it.each(CASES)("%s — 고르는 순서와 무관하게 400", async (_n, mk) => {
    const r = await post(form([card(1, "housing", [...mk()].reverse())]));
    expect(r.status).toBe(400);
    expect(r.errors).toMatch(CONFLICT_RE);
  });

  it("각 단독은 200이다 — 차단이 단독 선택을 막지 않는다", async () => {
    for (const red of [[r973()], [r974()], [r993()], [r77()]]) {
      const f = form([card(1, "housing", red)]);
      expect(step8(f) ?? "").not.toMatch(CONFLICT_RE);
      expect((await post(f)).status).toBe(200);
    }
  });

  it("문구가 조문을 맞게 가리킨다 — §97의3은 70%, §97의4는 추가공제율", async () => {
    expect(step8(form([card(1, "housing", [r973(), r993()])]))).toContain("장기보유특별공제율 70% 특례");
    expect(step8(form([card(1, "housing", [r974(), r993()])]))).toContain("장기보유특별공제 추가공제율 특례");
  });
});

describe("단서 — 카드가 다르면 막지 않는다(일괄양도)", () => {
  it("카드 1 §97의4 + 카드 2 §99의3 → 200, 카드별 값이 각 단독 대조와 같다", async () => {
    const d = await post(form([card(1, "housing", [r974()]), card(2, "housing", [r993()])]));
    const e = await post(form([card(1, "housing", [r974()]), card(2, "housing", [])]));
    const g = await post(form([card(1, "housing", []), card(2, "housing", [r993()])]));
    for (const r of [d, e, g]) expect(r.status).toBe(200);
    const props = (r: typeof d) => (r.data?.aggregated?.properties ?? []) as { determinedTax: number; longTermHoldingDeduction?: number }[];
    expect(props(d)[0].determinedTax, "카드 1 = §97의4 단독 대조").toBe(props(e)[0].determinedTax);
    expect(props(d)[1].determinedTax, "카드 2 = §99의3 단독 대조").toBe(props(g)[1].determinedTax);
  });

  it("컴패니언 카드 안에서 교차하면 companionAssets.0.reductions 400", async () => {
    const r = await post(form([card(1, "housing", []), card(2, "housing", [r974(), r993()])]));
    expect(r.status).toBe(400);
    const keys = Object.keys(r.fieldErrors).filter((k) => k.startsWith("companionAssets.0.reductions"));
    expect(keys.length).toBeGreaterThan(0);
    expect(r.fieldErrors[keys[0]][0]).toMatch(CONFLICT_RE);
  });
});

describe("§97의3·§97의4 × §98의2(장특 표2 특례) — Q-2 a", () => {
  it("§97의4 + §98의2 — ⑧·⑫ 모두 막는다(종전: §98의2가 이기고 §97의4 에코는 적용으로 남음)", async () => {
    const f = form([card(1, "housing", [r974(), r982()], "2009-06-15")], "2020-08-01");
    expect(step8(f)).toMatch(CONFLICT_RE);
    const r = await post(f);
    expect(r.status).toBe(400);
    expect(r.errors).toMatch(CONFLICT_RE);
  });
  it("§97의3 + §98의2 — 막는다(§97의3 적격 여부와 무관한 분류)", async () => {
    const r = await post(form([card(1, "housing", [r973(), r982()], "2009-06-15")], "2020-08-01"));
    expect(r.status).toBe(400);
  });
  it("각 단독은 200", async () => {
    expect((await post(form([card(1, "housing", [r982()], "2009-06-15")], "2020-08-01"))).status).toBe(200);
    expect((await post(form([card(1, "housing", [r974()], "2009-06-15")], "2020-08-01"))).status).toBe(200);
  });
});

// 임대 범주 안의 쌍(§97의3×§97의4 · ×§97의5 · ×§97 본문·§97의2)은 V-6에서 막도록 바뀌었다 — transfer.route.rental-97-overlap-v6.anchor.test.ts 가 고정한다.

describe("refine 단위 — 분류 · 임대 범주 제외 · 날짜 무관", () => {
  const run = async (types: string[], acq: unknown, tr: unknown) => {
    const { refineReductionTrack127_7 } = await import("@/lib/api/transfer-tax-schema-reduction-refines");
    const issues: { path: (string | number)[]; message: string }[] = [];
    const ctx = { addIssue: (i: { path: (string | number)[]; message: string }) => issues.push(i) } as never;
    refineReductionTrack127_7(types.map((type) => ({ type })), acq, tr, ctx, ["reductions"]);
    return issues;
  };
  const OTHERS = ["new_99_3", "new_99", "public_expropriation", "gb_designated_land", "self_farming", "unsold_98", "unsold_98_2"];

  it.each(["rental_97_3", "rental_97_4"])("%s는 임대 범주 밖 어떤 분류 조문과도 막는다", async (rental) => {
    for (const o of OTHERS) {
      expect(await run([rental, o], "2003-03-01", "2025-08-01"), `${rental}+${o}`).toHaveLength(1);
    }
  });
  it("보유연수와 무관하다 — 날짜가 비어도, 5년 이내여도 막는다", async () => {
    expect(await run(["rental_97_4", "new_99_3"], undefined, undefined)).toHaveLength(1);
    expect(await run(["rental_97_3", "public_expropriation"], "2024-01-01", "2025-01-01")).toHaveLength(1);
  });
  it("하이브리드(§98의3)도 5년 이내·후 모두 막는다", async () => {
    expect(await run(["rental_97_4", "unsold_98_3"], "2024-01-01", "2025-01-01")).toHaveLength(1);
    expect(await run(["rental_97_4", "unsold_98_3"], "2015-01-01", "2025-01-01")).toHaveLength(1);
  });
  it("단독과 세액감면형끼리(§97 본문·단서·§97의2·§97의5)는 막지 않는다 (명문 배제·§127⑦ 쌍은 V-6 anchor)", async () => {
    for (const pair of [["rental_97_main", "rental_97_2"], ["rental_97_proviso", "rental_97_5"], ["rental_97_main", "rental_97_5"]]) {
      expect(await run(pair, "2003-03-01", "2025-08-01"), pair.join("+")).toHaveLength(0);
    }
    expect(await run(["rental_97_4"], "2003-03-01", "2025-08-01")).toHaveLength(0);
  });
  it("임대 범주 쌍이 섞여도 범주 밖 상대가 있으면 그 상대를 지목한다", async () => {
    const i = await run(["rental_97_5", "rental_97_4", "new_99_3"], "2003-03-01", "2025-08-01");
    expect(i).toHaveLength(1);
    expect(i[0].path).toEqual(["reductions", 2, "type"]);
  });
  it("오류 경로는 충돌 상대(임대 특례가 아닌 쪽)의 type 칸을 가리킨다", async () => {
    expect((await run(["rental_97_4", "new_99_3"], "2003-03-01", "2025-08-01"))[0].path).toEqual(["reductions", 1, "type"]);
    expect((await run(["new_99_3", "rental_97_4"], "2003-03-01", "2025-08-01"))[0].path).toEqual(["reductions", 0, "type"]);
  });
  it("종래 분류는 그대로 — §99의3 + §77은 여전히 막고, 같은 트랙끼리는 막지 않는다", async () => {
    expect(await run(["new_99_3", "public_expropriation"], "2003-03-01", "2025-08-01")).toHaveLength(1);
    expect(await run(["new_99_3", "new_99"], "2003-03-01", "2025-08-01")).toHaveLength(0);
  });
  it("판정 함수와 표기 — 종류별 효과 문구", () => {
    const c = findTrack127_7Conflict(["rental_97_3", "new_99_3"], false);
    expect(c?.first.kind).toBe("rental_lthd");
    expect(track127_7EffectLabel("rental_97_3", "rental_lthd")).toBe("장기보유특별공제율 70% 특례");
    expect(track127_7EffectLabel("rental_97_4", "rental_lthd")).toBe("장기보유특별공제 추가공제율 특례");
  });
});
