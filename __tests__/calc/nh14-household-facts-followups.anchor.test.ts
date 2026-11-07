/**
 * NH-14 후속 anchor — 첫 자산이 토지인 함께 양도 묶음에서 함께 양도 주택이 **세대 사실 전체**로 판정받는다(같은 사실 = 주택 먼저와 같은 세액).
 *
 * 계획서: `docs/00-pm/nh14-companion-household-followups.plan.md`. 실측(수정 전, mock 세율): ② 명부 행 ⑥ 감면주택 · ③ 일시적 2주택 —
 * 주택 먼저 18,628,500(비과세) ↔ 토지 먼저 154,286,000(과세, 135,657,500 과대). 기대값은 같은 입력의 「주택 먼저」 계산에서 얻는다(출력 베끼기 아님).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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
import { runCalc, houseRow } from "./_helpers/redev-one-house-route";
import { HOUSE, LAND, form, aggOf } from "./_helpers/g1-reverse-appurtenant-fixtures";
import { householdFactsFormView, householdViewOnChange, householdFactsCompanionAssetId } from "@/lib/calc/household-facts-view";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

/** 독립 나대지 — G1(부수토지 + 일반 주택 1건) 차단 대상이 아니다. */
const SL = (id: string) => ({ ...LAND(id, 300), landNature: "standalone" });
const houseFirst = () => form(HOUSE(0), SL("l1"));
const landFirst = () => form(SL("l1"), HOUSE(0));
const withFacts = (f: unknown, over: Partial<TransferFormData>) => ({ ...(f as object), ...over }) as never;
/** 주택 카드 id — 주택 먼저면 주 자산(`primary`), 토지 먼저면 컴패니언 `h1` */
const totalOf = async (f: never, houseId: "primary" | "h1") => {
  const r = await runCalc(f);
  return { r, total: aggOf(r)?.totalTax, houseExempt: aggOf(r)?.properties?.find((p: { propertyId: string }) => p.propertyId === houseId)?.isExempt };
};

/** ② 명부 행 = §98의3 감면주택(주택 수 제외 선언) */
const SPECIAL_ROW: Partial<TransferFormData> = {
  houses: [
    {
      ...houseRow("o1", "2009-08-01"),
      countExclusion: {
        kind: "special",
        special: { article: "unsold_98_3", houseAcquisitionDate: "", houseContractDate: "2009-06-01", isNationalHousing: false, requirementsConfirmed: true },
      },
    } as never,
  ],
  householdHousingCount: "2",
  householdNoOtherHousesConfirmed: false,
  householdNoPresaleRightsConfirmed: true,
};
/** ③ 명부 행 = 일시적 2주택 신규 주택(양도 주택 2014 취득 · 신규 2024 취득 · 경위 일반 취득) */
const TEMP2_ROW: Partial<TransferFormData> = {
  houses: [{ ...houseRow("o1", "2024-06-01"), acquisitionOrigin: "general" } as never],
  householdHousingCount: "2",
  householdNoOtherHousesConfirmed: false,
  householdNoPresaleRightsConfirmed: true,
};

describe("NH-14 후속 ② — 명부 행 ⑥ 조특법 주택 수 제외", () => {
  it("P-1: 🔴 토지 먼저 = 주택 먼저 (감면주택 행을 주택 수에서 뺀다) · ④ 본문에 행 선언이 실린다", async () => {
    const hf = await totalOf(withFacts(houseFirst(), SPECIAL_ROW), "primary");
    const lf = await totalOf(withFacts(landFirst(), SPECIAL_ROW), "h1");
    expect(hf.r.issues).toEqual([]);
    expect(lf.r.issues).toEqual([]);
    expect(hf.houseExempt).toBe(true);
    expect(lf.houseExempt).toBe(true);
    expect(lf.total).toBe(hf.total);
    expect((lf.r.body.specialHouseExclusions as { article: string }[]).map((e) => e.article)).toEqual(["unsold_98_3"]);
  });
});

describe("NH-14 후속 ③ — 일시적 2주택", () => {
  it("P-2: 🔴 토지 먼저 = 주택 먼저 (§155① 일시적 2주택 비과세)", async () => {
    const hf = await totalOf(withFacts(houseFirst(), TEMP2_ROW), "primary");
    const lf = await totalOf(withFacts(landFirst(), TEMP2_ROW), "h1");
    expect(hf.r.issues).toEqual([]);
    expect(lf.r.issues).toEqual([]);
    expect(hf.houseExempt).toBe(true);
    expect(lf.houseExempt).toBe(true);
    expect(lf.total).toBe(hf.total);
  });

  it("P-2b: 신규 주택 경위를 답하지 않으면 두 순서 모두 ⑧이 묻는다", async () => {
    const unanswered = { ...TEMP2_ROW, houses: [houseRow("o1", "2024-06-01") as never] };
    const msg = (r: { issues: { message: string }[] }) => r.issues.some((i) => i.message.includes("일시적 2주택의 신규 주택으로 판정된 주택"));
    expect(msg(await runCalc(withFacts(houseFirst(), unanswered)))).toBe(true);
    expect(msg(await runCalc(withFacts(landFirst(), unanswered)))).toBe(true);
  });
});

describe("NH-14 후속 — 세대 기준 폼 뷰", () => {
  it("P-3: 뷰는 기준 주택을 맨 앞으로 돌리고, 뷰의 assets patch는 원래 순서로 저장된다 (양도 주택 경위가 토지 카드에 저장되던 결함)", () => {
    const f = landFirst() as unknown as TransferFormData;
    const v = householdFactsFormView(f);
    expect(v.assets.map((a) => a.assetId)).toEqual(["h1", "l1"]);
    expect(householdFactsCompanionAssetId(f)).toBe("h1");
    let saved: Partial<TransferFormData> | undefined;
    householdViewOnChange(f, (p) => (saved = p))({ assets: v.assets.map((a, i) => (i === 0 ? { ...a, sellingHouseOrigin: "general" } : a)) as never });
    expect(saved?.assets?.map((a) => a.assetId)).toEqual(["l1", "h1"]);
    expect((saved?.assets?.[1] as unknown as { sellingHouseOrigin?: string }).sellingHouseOrigin).toBe("general");
    expect((saved?.assets?.[0] as unknown as { sellingHouseOrigin?: string }).sellingHouseOrigin).toBeUndefined();
  });

  it("P-4: 대조군 — 주택 먼저는 뷰 = 원래 폼(같은 객체) · id 없음", () => {
    const f = houseFirst() as unknown as TransferFormData;
    expect(householdFactsFormView(f)).toBe(f);
    expect(householdFactsCompanionAssetId(f)).toBeUndefined();
  });
});
