/**
 * anchor — 피상속인 취득일 후속 3건. 계획서 `docs/02-design/features/decedent-date-hint-followups.plan.md`.
 *
 *   Q-1 일반건물: 「§95④·§104②1호 단기보유 통산」 인용 → §104②1호. 일반건물은 가업상속 입력이 없어(`transfer-fb-gate.ts`)
 *       §95④ 단서가 쓰일 길이 없다. 공용 안내의 가업상속 문장도 가업상속 입력이 열린 자산에서만 보인다.
 *   Q-2 건물만 상속(D2): 「건물 피상속인 취득일」 안내에 조특법 §77⑨(엔진 실측 — 계획서 §1.2).
 *   Q-3 날짜 순서 오류 4종(B1·B2·B4·B5)에 칸 키 — 오류를 누르면 그 칸으로 간다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CompanionAcqInheritanceBlock } from "@/components/calc/transfer/CompanionAcqInheritanceBlock";
import { GeneralBuildingAcquisitionCards } from "@/components/calc/transfer/GeneralBuildingAcquisitionCards";
import { BuildingCauseMixBlock } from "@/components/calc/transfer/BuildingCauseMixBlock";
import { validateGbDecedentDates } from "@/lib/calc/transfer-tax-validate-gb-required";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup); // RTL 자동 cleanup 미설정 — 수동

const noop = () => {};
const FB = "장기보유특별공제 기산일(소득세법 §95④ 단서)";
const inh = (over: Record<string, unknown>): AssetForm =>
  ({ ...makeDefaultAsset(1), acquisitionCause: "inheritance", acquisitionDate: "2015-01-01", inheritanceStartDate: "2015-01-01", ...over }) as AssetForm;

describe("Q-1 ③ 공용 안내 — 가업상속 문장은 가업상속 입력이 열린 자산에서만", () => {
  for (const kind of ["housing", "land"] as const) {
    it(`${kind}: 가업상속 문장이 있다`, () => {
      render(<CompanionAcqInheritanceBlock asset={inh({ assetKind: kind })} onChange={noop} />);
      expect(screen.getByTestId("decedent-acq-date-uses").textContent).toContain(FB);
    });
  }
  it("일반건물: 가업상속 문장이 없다 · 나머지 쓰임은 그대로", () => {
    render(<CompanionAcqInheritanceBlock asset={inh({ assetKind: "general_building" })} onChange={noop} />);
    const text = screen.getByTestId("decedent-acq-date-uses").textContent ?? "";
    expect(text).not.toContain("§95④");
    expect(text).toContain("세율의 보유기간 기산일입니다(소득세법 §104②1호");
    expect(text).toContain("수용 감면의 취득일(조특법 §77⑨)");
  });
});

describe("Q-1 ①② 일반건물 건물 피상속인 취득일 — §104②1호만", () => {
  const gb = (landCause: "inheritance" | "purchase") =>
    ({
      ...makeDefaultAsset(1), assetKind: "general_building", hasSeperateLandAcquisitionDate: true, acquisitionCause: landCause,
      gbBuildingAcquisitionCause: "inheritance", acquisitionDate: "2015-01-01", landAcquisitionDate: "2010-01-01",
    }) as unknown as AssetForm;
  for (const landCause of ["inheritance", "purchase"] as const) {
    it(`토지 ${landCause}: 건물 칸 안내`, () => {
      render(<GeneralBuildingAcquisitionCards asset={gb(landCause)} onChange={noop} transferDate="2024-03-01" />);
      const hint = screen.getByText(/피상속인이 이 건물을 취득한 날/).textContent ?? "";
      expect(hint).toContain("세율의 보유기간 기산일입니다 (소득세법 §104②1호)");
      expect(hint).not.toContain("§95④");
    });
  }
  it("⑧ 문구 — 토지·건물 모두 §104②1호", () => {
    const land = validateGbDecedentDates(gb("inheritance"), "자산") ?? "";
    expect(land).toBe("자산: 피상속인 취득일을 입력하세요. 상속받은 토지의 세율 보유기간 기산일입니다 (소득세법 §104②1호).");
    const bld = validateGbDecedentDates(gb("purchase"), "자산") ?? "";
    expect(bld).toBe("자산: 건물 피상속인 취득일을 입력하세요. 상속받은 건물의 세율 보유기간 기산일입니다 (소득세법 §104②1호).");
  });
});

describe("Q-2 D2 건물 피상속인 취득일 — 수용 감면 §77⑨", () => {
  it("안내에 §104②1호와 §77⑨가 함께 있다", () => {
    const a = inh({
      assetKind: "housing", hasSeperateLandAcquisitionDate: true, landCauseHost: "inheritance", landAcquisitionCause: "purchase",
      landAcquisitionDate: "2010-01-01",
    });
    render(<BuildingCauseMixBlock asset={a} onChange={noop} />);
    const hint = screen.getByText(/건물의 세율 판정 보유기간을 피상속인이 취득한 날부터 통산합니다/).textContent ?? "";
    expect(hint).toContain("「소득세법」 제104조 제2항 제1호");
    expect(hint).toContain("「조세특례제한법」 제77조 제9항");
  });
});

describe("Q-3 날짜 순서 오류 — 칸 키", () => {
  const form = (a: Record<string, unknown>): TransferFormData =>
    Object.assign(createDefaultTransferFormData(), {
      transferDate: "2024-03-01", filingDate: "2024-05-31", contractTotalPrice: "500000000", householdHousingCount: "0",
      householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false,
      assets: [{ ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", actualSalePrice: "500000000",
        fixedAcquisitionPrice: "300000000", standardPriceAtTransfer: "400000000", ...a }],
    }) as TransferFormData;
  const INH = { acquisitionCause: "inheritance", acquisitionDate: "2015-01-01", inheritanceStartDate: "2015-01-01",
    publishedValueAtInheritance: "300000000", inheritanceValuationMethod: "supplementary", fixedAcquisitionPrice: "" };
  const CASES: [string, Record<string, unknown>, RegExp, string][] = [
    ["B1 취득일≥양도일", { acquisitionDate: "2024-03-01" }, /취득일은 양도일보다 이전이어야/, "acquisitionDate"],
    ["B2 피상속인≥상속개시일", { ...INH, decedentAcquisitionDate: "2015-01-01" }, /피상속인 취득일은 상속개시일보다 이전이어야/, "decedentAcquisitionDate"],
    ["B4 동일세대 개시일≥상속개시일", { ...INH, decedentAcquisitionDate: "2005-01-01", decedentSameHouseholdBeforeInheritance: true,
      decedentCohabitationHoldingStartDate: "2015-06-01" }, /동일세대 거주·보유 개시일은 상속개시일/, "decedentCohabitationHoldingStartDate"],
    ["B5 동일세대 개시일<피상속인 취득일", { ...INH, decedentAcquisitionDate: "2005-01-01", decedentSameHouseholdBeforeInheritance: true,
      decedentCohabitationHoldingStartDate: "2004-01-01" }, /피상속인 취득일보다 빠릅니다/, "decedentCohabitationHoldingStartDate"],
  ];
  for (const [name, a, msg, field] of CASES) {
    it(`${name} → ${field}`, () => {
      const issue = collectStepIssues(0, form(a)).find((i) => msg.test(i.message));
      expect(issue?.message).toMatch(/^자산: /);
      expect(issue?.field).toBe(field);
      expect(issue?.assetIndex).toBe(0);
    });
  }
});
