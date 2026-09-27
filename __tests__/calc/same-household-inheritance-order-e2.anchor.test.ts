/**
 * E-2 — §154⑧3호 동일세대 상속 통산 개시일 **순서 검사**가 계산기 ⑧·⑤와 판정 메뉴 ⑧에 같이 걸린다.
 * 계획서: docs/00-pm/one-house-exemption-fix.plan.md §9.3 E-2.
 *
 * 「소득세법 시행령」 §154⑧3호(실독 2026-09-27 · MST 286211): 「상속받은 주택으로서 상속인과 피상속인이
 * 상속개시 당시 동일세대인 경우에는 **상속개시 전에** 상속인과 피상속인이 동일세대로서 거주하고
 * **보유한** 기간」. ⇒ 개시일 ∈ [피상속인 취득일, 상속개시일).
 *
 * 수정 전: 판정 메뉴(C2 · PR #1794)만 두 경계를 막았고 계산기는 **존재만** 봤다. 엔진
 * (`resolveExemptionHoldingStartDate`)은 상속개시일 이후 값은 조용히 버리고, 피상속인 취득 전 값은
 * **그대로 기산일로 쓴다**(보유기간 과다).
 *
 * 🔑 경계는 ±1일 짝으로 고정한다(`feedback_range_assertion_misses_spec_violation`).
 */
import { describe, it, expect } from "vitest";
import { validateStep3 } from "@/lib/calc/one-house-exemption-validate";
import { validateAssetEntry, getAssetDateOrderError } from "@/lib/calc/transfer-tax-validate-asset";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 피상속인 2005-01-01 취득 → 2023-12-01 상속개시(= 상속인 취득일). */
const SAME_HOUSEHOLD: Partial<AssetForm> = {
  assetKind: "housing",
  acquisitionCause: "inheritance",
  acquisitionDate: "2023-12-01",
  decedentAcquisitionDate: "2005-01-01",
  decedentSameHouseholdBeforeInheritance: true,
  decedentCohabitationHoldingStartDate: "2010-01-01",
  decedentCohabitationResidenceMonths: "150",
  // ⑧의 다른 필수값 — 순서 검사 **외의** 사유로 막히지 않게 채운다(긍정 짝이 「전부 통과」를 본다).
  publishedValueAtInheritance: "300,000,000",
  addressRoad: "서울특별시 강남구 테헤란로 1",
};

const asset = (over: Partial<AssetForm> = {}) =>
  ({ ...makeDefaultAsset(1), ...SAME_HOUSEHOLD, ...over }) as AssetForm;

function calcError(a: AssetForm): string | null {
  const f = createDefaultTransferFormData();
  f.transferDate = "2024-06-01";
  f.contractTotalPrice = "900,000,000";
  f.assets = [a];
  // 필터하지 않는다 — 긍정 짝은 ⑧ **전체**가 통과해야 한다(다른 사유가 순서 검사를 가리지 않게).
  return validateAssetEntry(a, 0, f);
}

function judgmentError(a: AssetForm): string | null {
  const f = {
    ...createInitialOneHouseJudgmentForm(),
    assets: [a],
    transferDate: "2024-06-01",
    contractTotalPrice: "900000000",
    isOneHousehold: true,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    houses: [],
    presaleRights: [],
  } as unknown as OneHouseJudgmentFormData;
  const hit = validateStep3(f).find(
    (e) => e.severity === "error" && e.message.includes("동일세대 거주·보유 개시일"),
  );
  return hit?.message ?? null;
}

describe("E-2 ⑧ — 개시일 경계 (±1일)", () => {
  it.each([
    ["2023-11-30", false, "상속개시 전날 — 통과"],
    ["2023-12-01", true, "상속개시일 당일 — 「상속개시 전」 아님"],
    ["2005-01-01", false, "피상속인 취득일 당일 — 통과"],
    ["2004-12-31", true, "피상속인 취득 전날 — 「보유한 기간」 아님"],
  ])("E2-1 계산기 ⑧ 개시일 %s → 차단=%s (%s)", (start, blocked) => {
    const m = calcError(asset({ decedentCohabitationHoldingStartDate: start }));
    expect(m !== null).toBe(blocked);
  });

  it("E2-2 계산기 ⑤ 인라인 경고(`getAssetDateOrderError`)가 ⑧과 같은 문구다 — 단일 진실", () => {
    for (const start of ["2023-12-01", "2004-12-31"]) {
      const a = asset({ decedentCohabitationHoldingStartDate: start });
      const warn = getAssetDateOrderError(a, "2024-06-01");
      expect(warn).not.toBeNull();
      expect(calcError(a)).toBe(`자산: ${warn}`);
    }
  });

  it("E2-3 계산기 ⑧ 문구 = 판정 메뉴 ⑧ 문구 (같은 leaf)", () => {
    for (const start of ["2023-11-30", "2023-12-01", "2005-01-01", "2004-12-31", "2030-01-01"]) {
      const a = asset({ decedentCohabitationHoldingStartDate: start });
      const c = calcError(a);
      expect(c?.replace(/^자산: /, "") ?? null).toBe(judgmentError(a));
    }
  });
});

describe("E-2 게이트 — 화면에 칸이 없으면 묻지 않는다 (⑤와 같은 게이트)", () => {
  it("E2-4 동일세대가 아니면 · 상속이 아니면 · 주택이 아니면 순서 검사를 하지 않는다", () => {
    const bad = { decedentCohabitationHoldingStartDate: "2004-12-31" };
    expect(calcError(asset({ ...bad, decedentSameHouseholdBeforeInheritance: false }))).toBeNull();
    // 토지 — ⑤(`CompanionAcqInheritanceBlock`)는 주택일 때만 동일세대 토글을 연다.
    expect(getAssetDateOrderError(asset({ ...bad, assetKind: "land" }), "2024-06-01")).toBeNull();
    expect(
      getAssetDateOrderError(
        asset({ ...bad, acquisitionCause: "purchase", decedentAcquisitionDate: "" }),
        "2024-06-01",
      ),
    ).toBeNull();
  });
});
