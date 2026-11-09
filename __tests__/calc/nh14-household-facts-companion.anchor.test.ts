/**
 * NH-14 / Q-24 재결정 — 첫 자산이 토지·건물(주택이 아님)이어도 **함께 양도하는 주택**이 있으면 보유 상황 단계의
 * «세대·주택 현황»(1세대 여부 · 세대 보유 주택 명부 · 분양권·입주권 목록)을 연다.
 *
 * 종전: 그 칸이 첫 자산이 주택 계열일 때만 열려, 함께 양도 주택이 숨은 기본값(1세대 해당 · 세대 주택 1채 · 분양권 없음)으로
 * 1세대1주택 비과세를 받았다(독립 나대지 먼저 18,628,500 ↔ 주택 먼저 154,286,000 — 세대에 다른 주택 1채가 있는 사실을 넣을 길이 없었다).
 * ⑧ 차단을 넓히는 방식은 철회됐다 — 칸을 열고, 칸의 필수 답이 비면 **기존** ⑧(다른 보유 주택 없음 확인 · 분양권·입주권 없음 확인)이 막는다.
 *
 * 술어 한 곳(`household-facts-asset.ts`)이 ⑤ `Step4` 표시 · ④ `transfer-tax-api.ts` 전송 · ⑧ `transfer-tax-validate-step1.ts`의 게이트다(3중 패턴).
 * UI 표시는 `nh14-household-facts-step4.ui.test.tsx`.
 *
 * 세율: mock(`makeMockRates`) — 정본 세액이 아니다. 양도 2026-02-16 · 중과 한시배제 창 안 · 주택 2014 취득.
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
import { runCalc, allIssues, captureBody, houseRow } from "./_helpers/redev-one-house-route";
import { HOUSE, LAND, form, aggOf } from "./_helpers/g1-reverse-appurtenant-fixtures";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { householdFactsKindOf, householdFactsOpenedByCompanion } from "@/lib/calc/household-facts-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const a = (o: Record<string, unknown>) => ({ ...makeDefaultAsset(1), ...o }) as never;
/** 독립 나대지 — G1(부수토지 + 일반 주택 1건)의 ⑧ 차단 대상이 아니다. */
const SL = (id: string) => ({ ...LAND(id, 300), landNature: "standalone" });
const withForm = (f: unknown, over: Partial<TransferFormData>) => ({ ...(f as object), ...over }) as never;
/** 보유 상황 단계를 «채우기 전» 상태 — 확인 토글이 꺼져 있다(`createDefaultTransferFormData` 기본값). */
const UNANSWERED: Partial<TransferFormData> = { householdNoOtherHousesConfirmed: false, householdNoPresaleRightsConfirmed: false };
/** 세대에 다른 주택 1채(명부) — 분양권·입주권은 «없음» 확인. 명부 행이 «다른 보유 주택 없음» 확인을 대신한다. */
const ROSTER: Partial<TransferFormData> = { houses: [houseRow("o1", "2010-01-01")], householdHousingCount: "2", householdNoOtherHousesConfirmed: false, householdNoPresaleRightsConfirmed: true };
const step1Messages = (f: never) => allIssues(f).filter((i) => i.step === 1).map((i) => i.message);
const NO_OTHER = "다른 보유 주택이 없는지 확인하세요.";
const NO_PRESALE = "세대가 보유한 분양권·입주권이 없는지 확인하세요.";

describe("NH-14 술어 — 현황 칸의 기준 자산", () => {
  it("첫 자산이 주택 계열이면 첫 자산 그대로 · 토지·건물이면 함께 양도 주택(일반 · 겸용 · 재개발 완공주택)", () => {
    expect(householdFactsKindOf([a({ assetKind: "housing" }), a(SL("l1"))])).toBe("housing");
    expect(householdFactsKindOf([a(SL("l1")), a(HOUSE(0))])).toBe("housing");
    expect(householdFactsKindOf([a(SL("l1")), a({ ...HOUSE(0), isMixedUseHouse: true })])).toBe("housing");
    expect(householdFactsKindOf([a({ assetKind: "general_building" }), a({ assetKind: "redevelopment_apt" })])).toBe("redevelopment_apt");
    // 첫 자산이 입주권·분양권·재개발 완공주택이면 종전과 같다(첫 자산이 기준)
    expect(householdFactsKindOf([a({ assetKind: "right_to_move_in" }), a(HOUSE(0))])).toBe("right_to_move_in");
    expect(householdFactsKindOf([a({ assetKind: "presale_right" }), a(HOUSE(0))])).toBe("presale_right");
  });

  it("짝 — 함께 양도 주택·입주권이 없으면(토지·건물만 · 분양권 컴패니언) 첫 자산 종류 그대로 = 칸 숨김 유지", () => {
    expect(householdFactsKindOf([a(SL("l1")), a(SL("l2"))])).toBe("land");
    expect(householdFactsKindOf([a(SL("l1"))])).toBe("land");
    expect(householdFactsKindOf([a(SL("l1")), a({ assetKind: "presale_right" })])).toBe("land");
    expect(householdFactsKindOf([])).toBe("");
  });

  // 🔄 2026-11-09 컴패니언 입주권 4호 열기 PR-3 — 종전 «토지 + 입주권 컴패니언 = 칸 숨김»(`"land"`)을 뒤집었다.
  //   §89①4호 가목이 요구하는 세대 사실(다른 주택·분양권 미보유)을 입력할 칸이 없어 컴패니언 입주권의 4호가 화면에서 열리지 않았다.
  it("🔑 함께 양도 주택이 없고 조합원입주권이 있으면 그 입주권이 기준 자산 — 칸이 열린다", () => {
    expect(householdFactsKindOf([a(SL("l1")), a({ assetKind: "right_to_move_in" })])).toBe("right_to_move_in");
    expect(householdFactsKindOf([a(SL("l1")), a({ assetKind: "presale_right" }), a({ assetKind: "right_to_move_in" })])).toBe("right_to_move_in");
  });

  it("짝 — 주택과 입주권이 함께 있으면 주택이 기준(입주권은 후순위) · 지분 분할(축 B)은 입주권이어도 첫 자산 그대로", () => {
    expect(householdFactsKindOf([a(SL("l1")), a({ assetKind: "right_to_move_in" }), a(HOUSE(0))])).toBe("housing");
    expect(householdFactsKindOf([a(SL("l1")), a({ assetKind: "right_to_move_in" })], "fractional")).toBe("land");
  });

  it("지분 분할(축 B) 묶음은 같은 물건의 다른 지분이라 함께 양도 주택이 아니다", () => {
    expect(householdFactsKindOf([a(SL("l1")), a(HOUSE(0))], "fractional")).toBe("land");
    const blank = { ownershipNumerator: "", ownershipDenominator: "" };
    expect(householdFactsKindOf([a({ ...SL("l1"), ...blank }), a({ ...HOUSE(0), ...blank })])).toBe("land");
  });

  it("🔑 선택이 저장되지 않은 종전 세션·이력의 지분 분할(전 자산 지분 < 1 · 형제는 기본값 «주택»)도 축 B로 읽는다 — 사용자가 «함께 양도»를 골랐으면 아니다", () => {
    const frac = (n: string) => ({ ownershipNumerator: n, ownershipDenominator: "100" });
    const bundle = [a({ assetKind: "general_building", ...frac("60") }), a({ assetKind: "housing", ...frac("40") })];
    expect(householdFactsKindOf(bundle)).toBe("general_building");
    expect(householdFactsKindOf(bundle, "fractional")).toBe("general_building");
    expect(householdFactsKindOf(bundle, "companion")).toBe("housing");
  });

  it("고지 판정 — 첫 자산이 주택이 아닌데 함께 양도 주택 때문에 열린 구성만 참", () => {
    const f = (...assets: unknown[]) => ({ assets, assetSplitMode: undefined }) as never;
    expect(householdFactsOpenedByCompanion(f(a(SL("l1")), a(HOUSE(0))))).toBe(true);
    expect(householdFactsOpenedByCompanion(f(a(HOUSE(0)), a(SL("l1"))))).toBe(false);
    expect(householdFactsOpenedByCompanion(f(a(SL("l1")), a(SL("l2"))))).toBe(false);
  });
});

describe("NH-14 ⑧ — 칸의 필수 답이 비면 기존 검증이 막는다 (주택 먼저와 같은 문구)", () => {
  it("🔑 독립 나대지 먼저 + 주택 함께 양도 · 보유 상황 미입력 → 다른 보유 주택·분양권 확인 2건 (종전: 통과)", () => {
    const rv = step1Messages(withForm(form(SL("l1"), HOUSE(0)), UNANSWERED));
    expect(rv).toContain(NO_OTHER);
    expect(rv).toContain(NO_PRESALE);
    // 주택 먼저와 같은 문구 — ⑧↔⑫가 아니라 ④·⑤·⑧ 동일 게이트
    expect(step1Messages(withForm(form(HOUSE(0), SL("l1")), UNANSWERED))).toEqual(rv);
  });

  it("짝 — 함께 양도 주택이 없으면(토지만) 칸이 숨은 채로 통과한다", () => {
    const f = withForm(form(SL("l1"), SL("l2")), UNANSWERED);
    expect(step1Messages(f)).not.toContain(NO_OTHER);
    expect(step1Messages(f)).not.toContain(NO_PRESALE);
  });

  it("답을 하면(명부 행 또는 «없음» 확인) 통과 — 명부 행은 ⑧ 행 검증도 같이 받는다", () => {
    expect(step1Messages(form(SL("l1"), HOUSE(0)))).toEqual([]); // fixture `household`: 두 확인 켬
    const rows = step1Messages(withForm(form(SL("l1"), HOUSE(0)), { houses: [houseRow("o1", "")], householdNoPresaleRightsConfirmed: true } as never));
    expect(rows.some((m) => m.includes("보유 주택 1: 취득일을 입력하세요"))).toBe(true);
  });

  it("G1(주택부수토지 먼저 + 주택 1건)의 ⑧ 차단은 그대로다 — 이번 변경이 차단을 넓히거나 풀지 않는다", () => {
    const g1 = allIssues(form(LAND("l1", 300), HOUSE(0)));
    expect(g1.some((i) => i.message.includes("주택부수토지를 첫 자산으로 넣고 주택을 함께 양도하는 자산으로 넣으면"))).toBe(true);
    expect(allIssues(form(HOUSE(0), LAND("l1", 300))).filter((i) => i.step !== 1)).toEqual([]);
  });
});

describe("NH-14 ④ — 칸 표시 조건과 같은 조건으로 엔진에 닿는다 · 주택 먼저와 같은 세액", () => {
  it("🔑 세대에 다른 주택 1채(명부) — 나대지 먼저 = 주택 먼저 154,286,000 (종전: 나대지 먼저는 명부를 보내지 않아 18,628,500)", async () => {
    const fw = await runCalc(withForm(form(HOUSE(0), SL("l1")), ROSTER));
    const rv = await runCalc(withForm(form(SL("l1"), HOUSE(0)), ROSTER));
    expect(fw.status).toBe(200);
    expect(rv.status).toBe(200);
    expect(aggOf(fw).totalTax).toBe(154_286_000);
    expect(aggOf(rv).totalTax).toBe(154_286_000);
    // 주택은 비과세가 아니다 — 주택 먼저의 primary / 나대지 먼저의 h1
    expect(aggOf(rv).properties.find((p) => p.propertyId === "h1")?.isExempt).toBe(false);
    // ⑧을 통과한다(명부 행이 있어 «없음» 확인이 필요 없다)
    expect(rv.issues.filter((i) => i.step === 1)).toEqual([]);
  });

  it("명부 행만 두고 스칼라는 1로 둬도(칸이 명부에서 도출) 엔진 주택 수는 2 — 양도 주택 행은 첫 자산(토지)이 아니라 함께 양도 주택의 취득일", async () => {
    const f = withForm(form(SL("l1"), HOUSE(0)), { houses: [houseRow("o1", "2010-01-01")], householdHousingCount: "1", ...UNANSWERED } as never);
    const body = await captureBody(f);
    expect(body.householdHousingCount).toBe(2);
    expect(body.sellingHouseId).toBe("selling");
    const rows = body.houses as { id: string; acquisitionDate: string }[];
    expect(rows).toHaveLength(2);
    expect(rows.find((h) => h.id === "selling")?.acquisitionDate).toBe("2014-01-02"); // HOUSE 취득일 — 토지(SL) 취득일도 같은 날이라 아래에서 따로 가른다
  });

  it("양도 주택 행의 취득일은 함께 양도 주택의 것이다 — 토지와 다른 날이면 갈린다", async () => {
    const f = withForm(form({ ...SL("l1"), acquisitionDate: "2001-05-05" }, HOUSE(0)), ROSTER);
    const rows = (await captureBody(f)).houses as { id: string; acquisitionDate: string }[];
    expect(rows.find((h) => h.id === "selling")?.acquisitionDate).toBe("2014-01-02");
  });

  it("«다른 보유 주택 없음» 확인 — 나대지 먼저 = 주택 먼저 18,628,500 (사용자가 사실을 답한 결과이지 숨은 기본값이 아니다)", async () => {
    const fw = await runCalc(form(HOUSE(0), SL("l1")));
    const rv = await runCalc(form(SL("l1"), HOUSE(0)));
    expect(aggOf(fw).totalTax).toBe(18_628_500);
    expect(aggOf(rv).totalTax).toBe(18_628_500);
    expect(rv.issues.filter((i) => i.step === 1)).toEqual([]);
    expect(aggOf(rv).properties.find((p) => p.propertyId === "h1")?.isExempt).toBe(true);
  });

  it("짝 — 함께 양도 주택이 없으면(토지 + 토지) 명부를 보내지 않는다 · 첫 자산 종류 규약 그대로", async () => {
    const body = await captureBody(withForm(form(SL("l1"), SL("l2")), ROSTER));
    expect(body.houses).toBeUndefined();
    expect(body.sellingHouseId).toBeUndefined();
  });

  it("짝 — 주택 먼저(종전 경로)는 양도 주택 행이 첫 자산 그대로", async () => {
    const body = await captureBody(withForm(form(HOUSE(0), SL("l1")), ROSTER));
    const rows = body.houses as { id: string; acquisitionDate: string }[];
    expect(rows.find((h) => h.id === "selling")?.acquisitionDate).toBe("2014-01-02");
    expect(body.householdHousingCount).toBe(2);
  });
});
