/**
 * PR-9 anchor (2026-11 리뷰 D-12 · D-14 · 결정 Q-8) — 입력 상한.
 *
 * - D-12: §154⑧3호 「상속개시 전에 상속인과 피상속인이 동일세대로서 거주하고 보유한 기간」 개월에 상한이 없어 999개월로 거주요건을 채웠다
 *   (피상속인 2015 취득 · 동일세대 개시 2022-01-01 · 상속개시 2022-03-01 · 양도 2024-06-01 · 조정 · 상속 후 거주 0 → 가능한 상한 2개월).
 *   엔진 클램프 · ⑧(판정 메뉴·계산기·증여) · ⑫ refine이 같은 상한(`maxPriorResidenceMonthsBetween`).
 * - D-14: §156의2⑤ 대체주택 거주개월에 상한이 없었다(보유 5개월 + 12개월 → 비과세). 보유기간 상한 + 양도 주택 거주 위젯과 다르면 경고(Q-8).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
vi.mock("@/lib/db/tax-rates", async (o) => ({ ...(await o<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { cohabitationResidenceMonthsCap, consolidateResidenceMonths } from "@/lib/tax-engine/one-house/residence-months";
import { cohabitationResidenceMonthsError } from "@/lib/calc/same-household-inheritance-order";
import { replacementResidenceMonthsCapMessage } from "@/lib/calc/residence-interval-validate";
import { validateStep2 } from "@/lib/calc/one-house-exemption-validate";
import { runCalc } from "./_one-house-pr3a-calc-route";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
const D = (s: string) => new Date(s);

describe("D-12 상속개시 전 동일세대 거주 개월 상한", () => {
  const asset = (months: string) => ({
    acquisitionCause: "inheritance" as const,
    acquisitionDate: "2022-03-01",
    decedentSameHouseholdBeforeInheritance: true,
    decedentCohabitationHoldingStartDate: "2022-01-01",
    decedentCohabitationResidenceMonths: months,
  });
  it("상한 2개월 — 엔진은 자르고 ⑧은 막는다(2는 통과)", () => {
    expect(cohabitationResidenceMonthsCap(D("2022-01-01"), D("2022-03-01"))).toBe(2);
    const opts = { acquisitionCause: "inheritance" as const, decedentSameHouseholdBeforeInheritance: true, decedentCohabitationResidenceMonths: 999 };
    expect(consolidateResidenceMonths(0, { ...opts, cohabitationCap: 2 })).toBe(2);
    expect(cohabitationResidenceMonthsError(asset("24") as never)).toContain("(2개월)");
    expect(cohabitationResidenceMonthsError(asset("2") as never)).toBeNull();
  });
  it("계산기 route — 24개월은 ⑧·⑫가 막고(400), 2개월은 과세(거주 2년 미달)", async () => {
    const f = (months: string) => {
      const x = createDefaultTransferFormData();
      Object.assign(x, { transferDate: "2024-06-01", contractTotalPrice: "900000000", isOneHousehold: true, householdHousingCount: "1",
        householdNoPresaleRightsConfirmed: true, householdNoOtherHousesConfirmed: true });
      Object.assign(x.assets[0], {
        assetKind: "housing", addressJibun: "서울 강남구 테스트동 1", regionCode: "1168010100", publishedValueAtInheritance: "500000000",
        decedentAcquisitionDate: "2015-01-01", residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "0",
        ...asset(months),
      });
      return x;
    };
    const over = await runCalc(f("24"));
    expect(JSON.stringify(over.issues)).toContain("(2개월)");
    expect(over.status).toBe(400);
    const ok = await runCalc(f("2"));
    expect(ok.status).toBe(200);
    expect(ok.isExempt).toBe(false);
  });
});

describe("D-14 대체주택 거주개월 상한 · 위젯과 다르면 경고(Q-8)", () => {
  it("보유 5개월 — 12·999개월은 막고 5개월은 통과", () => {
    expect(replacementResidenceMonthsCapMessage(12, "2023-01-01", "2023-06-01")).toContain("5개월을 넘습니다");
    expect(replacementResidenceMonthsCapMessage(999, "2023-01-01", "2023-06-01")).not.toBeNull();
    expect(replacementResidenceMonthsCapMessage(5, "2023-01-01", "2023-06-01")).toBeNull();
  });
  const jf = (repl: string, widget: string) =>
    ({
      ...createInitialOneHouseJudgmentForm(),
      transferDate: "2025-06-01",
      isOneHousehold: true,
      assets: [{ ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2022-01-01", residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: widget }],
      // 대체주택 칸은 2주택 이상 또는 조합원입주권 보유일 때 열린다(`judgmentReplacementHouseVisible`)
      presaleRights: [{ id: "p1", type: "redevelopment_right", acquisitionDate: "2021-01-01" }],
      replacementHouseSpecial: true,
      replBusinessApprovalDate: "2021-06-01",
      replSoldBeforeCompletion: true,
      replResidenceMonths: repl,
      replWillResideNewHouse: true,
    }) as unknown as OneHouseJudgmentFormData;
  const issues = (f: OneHouseJudgmentFormData) => validateStep2(f).filter((e) => e.field === "replResidenceMonths");
  it("⑧ — 상한 초과는 오류 · 위젯과 다르면 경고만 · 같으면 없음", () => {
    expect(issues(jf("999", "24")).map((e) => e.severity)).toEqual(["error"]);
    expect(issues(jf("12", "24")).map((e) => e.severity)).toEqual(["warning"]);
    expect(issues(jf("24", "24"))).toEqual([]);
  });
});
