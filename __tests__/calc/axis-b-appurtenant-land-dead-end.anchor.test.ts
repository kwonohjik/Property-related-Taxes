/**
 * anchor — 축 B(같은 물건 지분 분할) × 주택부수토지: 둘째 지분 카드는 주택이 아니다(1주택 코드 리뷰 별건 ①).
 *
 * 계획서 `docs/00-pm/axis-b-appurtenant-land-dead-end.plan.md` v0.2 (Q-1 (a) · Q-2 (a)).
 *
 * 화면이 만든 둘째 카드(`makeDefaultAsset(2)`)는 저장 자산 종류가 기본값 `housing`이고 ① 기본정보가 숨겨져 바꿀 수 없다.
 * 종전에는 ⑧ 묶음 규칙 2곳이 그 저장값을 읽어
 *  - F1 «주택부수토지를 첫 자산으로 … 주택을 첫 자산으로 입력하세요»(역방향) — 교환 버튼은 축 B에서 숨겨져 막다른 길
 *  - F2 토지 성격 필수(단건 토지는 필수가 아님) + «주택·입주권과 함께 일괄양도» 사유
 * 를 냈다. ④는 둘째 카드를 첫 카드 종류(`land`)로 보내므로 계산은 같은 토지 100% 단건과 같다(막힘만 오탐).
 *
 * 사용자가 고른 모드(`assetSplitMode === "fractional"` — #2246이 저장)일 때만 푼다. 저장 필드가 없는 종전 세션은 종전대로(Q-1 (a)).
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
import { runCalc, allIssues } from "./_helpers/redev-one-house-route";
import { LAND, household, blocked } from "./_helpers/g1-reverse-appurtenant-fixtures";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { reverseAppurtenantSwapPatch } from "@/lib/calc/reverse-appurtenant-swap";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

/** 카드마다 입력하는 취득 사실 — 금액은 물건 전체(④·엔진이 지분율을 곱한다). */
const PER_SHARE = { acquisitionCause: "purchase", acquisitionDate: "2014-01-02", fixedAcquisitionPrice: "150000000" };
const HALF = { ownershipNumerator: "50", ownershipDenominator: "100" };
const BLANK = { ownershipNumerator: "", ownershipDenominator: "" };
/** 같은 토지 100% 단건 총세액(mock 세율) — 지분 합계가 이것과 같아야 한다. */
const SINGLE_TOTAL = 25_943_500;

/** 화면이 만드는 축 B 2지분 — 둘째 카드는 `makeDefaultAsset(2)`(저장 종류 `housing`) + 취득 3칸 + 지분율. */
function axisB(opts: { mode?: "fractional" | "companion"; nature?: string; share?: Record<string, string> } = {}): TransferFormData {
  const { mode = "fractional", nature = "appurtenant", share = HALF } = opts;
  const first = { ...makeDefaultAsset(1), ...LAND("l1", 300), landNature: nature, ...PER_SHARE, ...share };
  const sib = { ...makeDefaultAsset(2), ...PER_SHARE, ...share };
  return {
    ...createDefaultTransferFormData(),
    ...household,
    contractTotalPrice: "300000000",
    assetSplitMode: mode,
    assets: [first, sib],
  } as unknown as TransferFormData;
}

const LAND_NATURE_REQUIRED = "토지 성격(부수토지 / 독립 나대지)을 선택하세요";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const totalOf = (r: any) => r.json.data.aggregated.totalTax as number;

describe("별건 ① — 축 B 부수토지: 둘째 지분 카드를 짝 주택으로 세지 않는다", () => {
  it("전제 — 둘째 카드의 저장 종류는 기본값 `housing`이다(화면이 만드는 상태)", () => {
    expect(axisB().assets[1].assetKind).toBe("housing");
  });

  it("AB-1 «같은 물건 지분 분할» · 부수토지 — ⑧ 오류 없음 · 총세액 = 같은 토지 100% 단건", async () => {
    const r = await runCalc(axisB());
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(totalOf(r)).toBe(SINGLE_TOTAL);
  });

  it("AB-2 같음 · 토지 성격 빈칸 — 단건 토지처럼 필수가 아니다(F2) · 총세액 같음", async () => {
    const f = axisB({ nature: "" });
    expect(allIssues(f).filter((i) => i.message.includes(LAND_NATURE_REQUIRED))).toEqual([]);
    const r = await runCalc(f);
    expect(r.issues).toEqual([]);
    expect(totalOf(r)).toBe(SINGLE_TOTAL);
  });

  it("AB-3 같음 · 「주택을 첫 자산으로 바꾸기」 leaf — 패치가 없다(⑧과 같은 판정)", () => {
    expect(reverseAppurtenantSwapPatch(axisB())).toBeNull();
  });

  it("AB-4 «함께 양도» · 부수토지 + 기본값 주택 카드(진짜 역방향) — 차단·교환 패치 유지, 토지 성격 필수 유지", () => {
    const f = axisB({ mode: "companion" });
    expect(blocked(allIssues(f))).toHaveLength(1);
    expect(reverseAppurtenantSwapPatch(f)).not.toBeNull();
    expect(allIssues(axisB({ mode: "companion", nature: "" })).some((i) => i.message.includes(LAND_NATURE_REQUIRED))).toBe(true);
  });

  it("AB-5 저장 필드 없음(종전 세션) · 지분 채움 — 종전대로 차단(Q-1 (a) · #2246 Q-2 A «필드 없으면 현행 유지»)", () => {
    const f = { ...axisB(), assetSplitMode: undefined } as TransferFormData;
    expect(blocked(allIssues(f))).toHaveLength(1);
  });

  it("AB-6 «같은 물건 지분 분할» · 진입 직후 전 자산 지분율 빈칸 — 역방향 차단 없음(종전 가드 그대로)", () => {
    const f = axisB({ share: BLANK });
    expect(blocked(allIssues(f))).toEqual([]);
    expect(reverseAppurtenantSwapPatch(f)).toBeNull();
  });
});
