/**
 * 의제취득일 전 상속 재개발 종전자산 — ③ = §166③ 게이트 ⑧↔⑫ 정합 (계획서 inheritance-pre-deemed-clause-b-revisit.plan.md §12).
 *
 * 재개발 종전자산의 ③은 §166③이고 엔진은 ⑤ 「환산」일 때만 쓴다. ①② 없이 ⑤ 「실가」면 취득가액 0이 되므로
 * ⑧(`redevPreDeemedEstimatedRequiredError`)과 ⑫(`refinePreDeemedAcquisitionSource` 재개발 분기)가 함께 막는다.
 * 격자: 원인(상속·증여) × ①(있음·없음) × ⑤(실가·환산) — 선언은 ①이 없을 때 항상 켠다(E-1과 분리).
 * 기대값 정본은 ⑫ route 응답(status)과 ⑧ `collectStepIssues` 0·1단계 차단 여부 — 같은 폼으로 나란히 돌린다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { cForm, bodyOf, routeOf, issuesOf } from "@/__tests__/calc/_helpers/split-carryover-c-form";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const REDEV_166_3 = {
  redevSubject: "apt",
  redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2009-10-23",
  redevRightsValue: "219,218,500",
  redevSettlementDirection: "pay",
  redevSettlementAmount: "92,781,500",
  redevCompletionDate: "2012-09-01",
  redevManagementDisposalHousingPrice: "132,000,000",
  redevAcquisitionHousingPrice: "85,034,988",
};

function redevAsset(cause: "inheritance" | "gift", reported: boolean, estimated: boolean): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "redevelopment_apt",
    acquisitionCause: cause,
    acquisitionDate: "1980-01-01",
    actualSalePrice: "525,000,000",
    ...(cause === "inheritance"
      ? {
          inheritanceStartDate: "1980-01-01",
          decedentAcquisitionDate: "1970-01-01",
          inheritanceAssetKind: "house_individual",
          publishedValueAtInheritance: reported ? "100,000,000" : "",
        }
      : { donorAcquisitionDate: "1970-01-01", inheritanceAssetKind: "house_individual", fixedAcquisitionPrice: reported ? "100,000,000" : "" }),
    preDeemedClauseAUnconfirmed: !reported,
    ...REDEV_166_3,
    useEstimatedAcquisition: estimated,
    redevActualAcquisitionPrice: estimated ? "" : "77,777,777",
  } as unknown as AssetForm;
}

async function both(asset: AssetForm) {
  const form = cForm({ transferDate: "2026-02-16", filingDate: "2026-04-30", contractTotalPrice: "525000000" } as never, asset);
  const i8 = issuesOf(form);
  const r = await routeOf(POST as never, await bodyOf(form));
  return { i8, st12: r.status, keys12: Object.keys(r.fieldErrors), json: r.json };
}

const GATE_8 = /§166③ 환산취득가액으로 계산합니다/;

describe("상속 재개발 pre-deemed — ①② 없이 ⑤ 실가면 ⑧ 차단 ∧ ⑫ 400", () => {
  it("★ 상속 · ① 없음(선언) · ⑤ 실가 → ⑧ useEstimatedAcquisition 차단 · ⑫ 400 useEstimatedAcquisition", async () => {
    const r = await both(redevAsset("inheritance", false, false));
    expect(r.i8.some((i) => GATE_8.test(i.message))).toBe(true);
    expect(r.st12).toBe(400);
    expect(r.keys12).toContain("useEstimatedAcquisition");
  });

  const PASS: Array<[string, "inheritance" | "gift", boolean, boolean]> = [
    ["상속 · ① 없음(선언) · ⑤ 환산 → ③ = §166③", "inheritance", false, true],
    ["상속 · ① 있음 · ⑤ 실가 → ① 단독", "inheritance", true, false],
    ["상속 · ① 있음 · ⑤ 환산 → max(①, §166③)", "inheritance", true, true],
    ["증여 · ① 있음 · ⑤ 환산", "gift", true, true],
    ["증여 · ① 없음(선언) · ⑤ 환산", "gift", false, true],
  ];
  for (const [id, cause, reported, est] of PASS) {
    it(`${id}: ⑧ 이 게이트 없음 ∧ ⑫ 200`, async () => {
      const r = await both(redevAsset(cause, reported, est));
      expect(r.i8.filter((i) => GATE_8.test(i.message))).toEqual([]);
      expect(r.i8, JSON.stringify(r.i8)).toEqual([]);
      expect(r.st12, JSON.stringify(r.keys12)).toBe(200);
    });
  }

  it("승계조합원(리뷰 FAIL-2) · ① 없음(선언) · ⑤ 실가 → 이 게이트 없음(⑧ 술어 · ⑫ refine 모두 승계 제외)", async () => {
    const { redevPreDeemedEstimatedRequiredError, isRedev166_3PreDeemedAsset } = await import("@/lib/calc/transfer-tax-validate-clause-a");
    const { refinePreDeemedAcquisitionSource } = await import("@/lib/api/transfer-tax-schema-required-refines-2a");
    const a = { ...redevAsset("inheritance", false, false), redevIsSuccessorMember: "yes" } as AssetForm;
    expect(isRedev166_3PreDeemedAsset(a)).toBe(false);
    const right = { ...redevAsset("inheritance", false, false), assetKind: "right_to_move_in", redevSubject: "right" } as AssetForm;
    expect(isRedev166_3PreDeemedAsset(right)).toBe(true); // 원조합원 입주권
    expect(isRedev166_3PreDeemedAsset({ ...right, isSuccessorRightToMoveIn: true } as AssetForm)).toBe(false); // 승계 입주권
    expect(redevPreDeemedEstimatedRequiredError(a, "자산 1")).toBeNull();
    const issues: unknown[] = [];
    const ctx = { addIssue: (i: unknown) => issues.push(i) } as never;
    const base = { inheritedAcquisition: { mode: "pre-deemed" }, acquisitionCause: "inheritance", useEstimatedAcquisition: false };
    refinePreDeemedAcquisitionSource({ ...base, redevelopment: { isSuccessorMember: true } } as never, ctx);
    refinePreDeemedAcquisitionSource({ ...base, redevelopment: {}, isSuccessorRightToMoveIn: true } as never, ctx);
    expect(issues).toEqual([]);
    refinePreDeemedAcquisitionSource({ ...base, redevelopment: {} } as never, ctx);
    expect(issues.length).toBe(1); // 대조군 — 원조합원이면 막는다
  });

  it("상속 · ① 1억 · ⑤ 환산 → 결과 카드 ③ = §166③ 141,221,534 채택 (route 결과)", async () => {
    const r = await both(redevAsset("inheritance", true, true));
    const d = r.json.data.result.inheritedAcquisitionDetail;
    expect(d.preDeemedBreakdown.convertedAmount).toBe(141_221_534);
    expect(d.preDeemedBreakdown.convertedBasis).toBe("redevelopment_166_3");
    expect(d.preDeemedBreakdown.selectedMethod).toBe("converted");
    expect(r.json.data.result.redevelopmentDetail.preApproval.apportionedAcquisition).toBe(141_221_534);
  });
});
