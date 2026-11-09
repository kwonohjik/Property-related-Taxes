/**
 * route anchor — 리뷰 NH-41: 조특법 §127⑦ 트랙 교차(차감형 + 세액감면형) 차단이 ⑧·⑤에만 있어 직접 호출은 200 + 이중 혜택이었다.
 * 계획서 docs/00-pm/track-127-7-cross-nh41.plan.md (Q-1 a · Q-2 b).
 *
 * ⑫(Zod)가 ⑧과 같은 단일 소스 술어(`findTrack127_7Conflict`)·같은 문구로 같은 카드의 교차를 400으로 막는다.
 * «단서»(일부에 한 감면 → 남은 부분에 다른 감면)는 일괄양도 카드 분리로 표현되므로 카드가 다르면 막지 않는다.
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

function card(n: number, kind: string, reductions: unknown[]): AssetForm {
  return Object.assign({ ...makeDefaultAsset(n) }, x({
    assetKind: kind, acquisitionCause: "purchase", acquisitionDate: "2003-03-01",
    actualSalePrice: "900,000,000", fixedAcquisitionPrice: "200,000,000",
    standardPriceAtAcq: "100,000,000", standardPriceAtTransfer: "400,000,000",
    assetContractDate: "", reductions: reductions as never,
  })) as AssetForm;
}
function form(assets: AssetForm[]): TransferFormData {
  return Object.assign(createDefaultTransferFormData(), {
    transferDate: "2024-08-01", contractTotalPrice: String(900_000_000 * assets.length), assets, isOneHousehold: false, householdHousingCount: "2",
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

describe("NH-41 — 같은 카드 §99의3(차감형) + §77(세액감면형)", () => {
  it("⑧이 막는 입력은 ⑫도 같은 문구로 400이다", async () => {
    const f = form([card(1, "housing", [r993(), r77()])]);
    const m8 = step8(f);
    expect(m8, "전제: ⑧이 막는다").toMatch(CONFLICT_RE);
    const r = await post(f);
    expect(r.status).toBe(400);
    const all = Object.values(r.fieldErrors).flat();
    expect(all).toContain(m8);
  });

  it("각 단독은 200이다 — 차단이 단독 선택을 막지 않는다", async () => {
    for (const red of [[r993()], [r77()]]) {
      const r = await post(form([card(1, "housing", red)]));
      expect(r.status).toBe(200);
    }
  });

  it("카드 순서와 무관하다 — §77을 먼저 골라도 400", async () => {
    const r = await post(form([card(1, "housing", [r77(), r993()])]));
    expect(r.status).toBe(400);
    expect(r.errors).toMatch(CONFLICT_RE);
  });
});

describe("NH-41 — 단서: 카드가 다르면 막지 않는다(일괄양도)", () => {
  it("주택 카드 §99의3 + 토지 카드 §77 → 200, 카드별 값이 각 단독 대조와 같다", async () => {
    const d = await post(form([card(1, "housing", [r993()]), card(2, "land", [r77()])]));
    const e = await post(form([card(1, "housing", []), card(2, "land", [r77()])]));
    const g = await post(form([card(1, "housing", [r993()]), card(2, "land", [])]));
    for (const r of [d, e, g]) expect(r.status).toBe(200);
    const props = (r: typeof d) => (r.data?.aggregated?.properties ?? []) as { reductionAmount: number; determinedTax: number }[];
    expect(props(d)[0].determinedTax, "주택 카드 = §99의3 단독 대조").toBe(props(g)[0].determinedTax);
    expect(props(d)[1].reductionAmount, "토지 카드 = §77 단독 대조").toBe(props(e)[1].reductionAmount);
    expect(props(d)[1].reductionAmount).toBeGreaterThan(0);
  });

  it("컴패니언 카드 안에서 교차하면 companionAssets.0.reductions 400", async () => {
    const r = await post(form([card(1, "housing", []), card(2, "housing", [r993(), r77()])]));
    expect(r.status).toBe(400);
    const keys = Object.keys(r.fieldErrors).filter((k) => k.startsWith("companionAssets.0.reductions"));
    expect(keys.length).toBeGreaterThan(0);
    expect(r.fieldErrors[keys[0]][0]).toMatch(CONFLICT_RE);
  });

  it("주 자산은 교차, 컴패니언은 단독이면 주 자산 경로만 400", async () => {
    const r = await post(form([card(1, "housing", [r993(), r77()]), card(2, "land", [r77()])]));
    expect(r.status).toBe(400);
    expect(Object.keys(r.fieldErrors).some((k) => k.startsWith("reductions"))).toBe(true);
    expect(Object.keys(r.fieldErrors).some((k) => k.startsWith("companionAssets"))).toBe(false);
  });
});

describe("NH-41 — refine 단위: 하이브리드 5년 분기 · 세율·장특 특례 · 날짜 누락", () => {
  const run = async (types: string[], acq: unknown, tr: unknown) => {
    const { refineReductionTrack127_7 } = await import("@/lib/api/transfer-tax-schema-reduction-refines");
    const issues: { path: (string | number)[]; message: string }[] = [];
    const ctx = { addIssue: (i: { path: (string | number)[]; message: string }) => issues.push(i) } as never;
    refineReductionTrack127_7(types.map((type) => ({ type })), acq, tr, ctx, ["reductions"]);
    return issues;
  };

  it("§98의3(하이브리드) + §77 — 5년 이내는 둘 다 세액감면형이라 막지 않는다", async () => {
    expect(await run(["unsold_98_3", "public_expropriation"], "2022-01-01", "2024-01-01")).toHaveLength(0);
  });
  it("§98의3(하이브리드) + §77 — 5년 후는 차감형 + 세액감면형이라 막는다", async () => {
    const i = await run(["unsold_98_3", "public_expropriation"], "2015-01-01", "2024-01-01");
    expect(i).toHaveLength(1);
    expect(i[0].message).toMatch(CONFLICT_RE);
  });
  it("5년 경계 — 응당일 당일은 5년 이내, 다음 날은 5년 후", async () => {
    expect(await run(["unsold_98_3", "public_expropriation"], "2019-01-01", "2024-01-01")).toHaveLength(0);
    expect(await run(["unsold_98_3", "public_expropriation"], "2019-01-01", "2024-01-02")).toHaveLength(1);
  });
  it("§98 / §98의2(세율·장특 특례)는 보유연수와 무관하게 다른 감면과 막는다", async () => {
    for (const t of ["unsold_98", "unsold_98_2"]) {
      expect(await run([t, "public_expropriation"], "2022-01-01", "2024-01-01"), t).toHaveLength(1);
    }
  });
  it("날짜가 비어 5년 분기를 모르면 — 두 경우 모두 충돌일 때만 막는다", async () => {
    expect(await run(["unsold_98_3", "public_expropriation"], undefined, "2024-01-01"), "하이브리드는 분기에 따라 달라 통과").toHaveLength(0);
    expect(await run(["new_99_3", "public_expropriation"], "", "2024-01-01"), "분기와 무관한 충돌은 막는다").toHaveLength(1);
    // 5년 이내면 충돌(세액감면형 + 차감형) · 5년 후면 충돌 없음(둘 다 차감형) — 분기가 갈리므로 막지 않는다
    expect(await run(["unsold_98_3", "new_99_3"], undefined, "2024-01-01")).toHaveLength(0);
    expect(await run(["unsold_98_3", "new_99_3"], "2022-01-01", "2024-01-01"), "5년 이내로 확정되면 막는다").toHaveLength(1);
    expect(await run(["unsold_98_3", "new_99_3"], "2015-01-01", "2024-01-01"), "5년 후로 확정되면 둘 다 차감형").toHaveLength(0);
  });
  it("감면 1건 · 같은 트랙끼리 · 트랙 밖(§97의3)은 막지 않는다", async () => {
    expect(await run(["new_99_3"], "2003-03-01", "2024-08-01")).toHaveLength(0);
    expect(await run(["rental_97_main", "public_expropriation"], "2003-03-01", "2024-08-01")).toHaveLength(0);
    expect(await run(["rental_97_3", "new_99_3"], "2003-03-01", "2024-08-01"), "Q-2 b: §97의3은 별건").toHaveLength(0);
  });
  it("오류 경로는 충돌 상대 감면의 type 칸을 가리킨다", async () => {
    const i = await run(["new_99_3", "public_expropriation"], "2003-03-01", "2024-08-01");
    expect(i[0].path).toEqual(["reductions", 1, "type"]);
  });
});
