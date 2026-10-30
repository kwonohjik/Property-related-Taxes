/**
 * 토지만 본인 × 같은 세대 — 합쳤다가 분가한 뒤 **다시 합친** 경우의 합가일 안내
 * (계획서 `docs/02-design/features/land-only-o11-o13-o14-o16-o17-measure.plan.md` O-13 · Q-2 a).
 *
 * 입력 칸은 «세대를 합친 날» 하나뿐이고 분가·재합가를 다룬 해석례는 찾지 못했다(재산46014-610은 «세대합가 이전기간» 제외만 말한다).
 * 그런데 입력 날짜에 따라 값이 크게 갈린다(같은 사실 · 합가 2018-01-01 → 비과세 0 / 마지막 합가 2023-12-01 → 총세액 159,775,000 · 20억 시료 38,109,500 ↔ 375,375,000).
 * 그래서 «양도일 현재까지 계속 같은 세대였던 기간의 시작일(마지막 합가일)»을 안내하고, 분가 기간 통산은 «해석을 찾지 못해 확인이 필요하다»고 병기한다. **값·엔진·입력 필드 불변.**
 *
 * 값 대조(기존 anchor `land-only-household-merge-date` M1과 같은 시료): 10억 · 합가 2023-12-01 → 산출 145,250,000 · 총세액 159,775,000(= 145,250,000 × 1.1 — 지방소득세 10% 포함, 독립 산식).
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { AssetOwnershipSplitSection } from "@/components/calc/transfer/AssetOwnershipSplitSection";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { LAND_ONLY_REPEATED_MERGE_NOTE } from "@/lib/tax-engine/land-only-owner-household";
import { landOnlyMergeDateAppurtenantCardNotice } from "@/lib/tax-engine/land-only-appurtenant-card-notice";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);

const rates = makeMockRates();
const D = (s: string) => new Date(s);

function house(S: number, landAcq: string, over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  const landT = Math.floor(S * 0.4);
  return baseTransferInput({
    propertyType: "housing", transferPrice: S, acquisitionPrice: 400_000_000,
    landTransferPrice: landT, buildingTransferPrice: S - landT, landStandardPriceAtTransfer: landT, buildingStandardPriceAtTransfer: S - landT,
    landAcquisitionPrice: 100_000_000, buildingAcquisitionPrice: 300_000_000,
    acquisitionDate: D("2014-09-01"), landAcquisitionDate: D(landAcq), transferDate: D("2024-06-01"),
    isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    residencePeriodMonths: 120, isOneHousehold: true, householdHousingCount: 1, expenses: 0, annualBasicDeductionUsed: 0,
    selfOwns: "land_only", buildingOwnerSameHousehold: true,
    ...over,
  } as Partial<TransferTaxInput>);
}
const merged = (date: string): Partial<TransferTaxInput> => ({ buildingOwnerHouseholdMerged: true, buildingOwnerHouseholdMergeDate: D(date) });
const calc = (i: TransferTaxInput) => calculateTransferTax(i, rates);

describe("O-13 상수 — 한 곳의 문장", () => {
  it("🔑 마지막 합가일 · 계속 같은 세대 · 분가 기간 통산은 해석 미확인(확인이 필요) · 근거 재산46014-610", () => {
    expect(LAND_ONLY_REPEATED_MERGE_NOTE).toContain("분가");
    expect(LAND_ONLY_REPEATED_MERGE_NOTE).toContain("마지막 합가일");
    expect(LAND_ONLY_REPEATED_MERGE_NOTE).toContain("계속 같은 세대");
    expect(LAND_ONLY_REPEATED_MERGE_NOTE).toContain("해석을 찾지 못");
    expect(LAND_ONLY_REPEATED_MERGE_NOTE).toContain("확인이 필요합니다");
    expect(LAND_ONLY_REPEATED_MERGE_NOTE).toContain("재산46014-610");
  });
});

describe("계산 고지 — 합가일이 계산을 바꾼 경우에 같은 문장을 단다", () => {
  it("🔑 N1 주 카드: 합가 2023-12-01(취득일들보다 늦음) → 합가일 고지 끝에 재합가 안내 · 값 불변 산출 145,250,000 · 총 159,775,000", () => {
    const r = calc(house(1_000_000_000, "2008-07-01", merged("2023-12-01")));
    const n = (r.warnings ?? []).find((w) => w.includes("입력하신 세대 합가일(2023-12-01)") && w.includes("재산46014-610 · 부동산거래관리과-515"));
    expect(n, "합가일 고지가 있어야 한다").toBeDefined();
    expect(n).toContain(LAND_ONLY_REPEATED_MERGE_NOTE);
    // 기존 문장은 그대로 앞에 있다
    expect(n!.indexOf("재산46014-610 · 부동산거래관리과-515")).toBeLessThan(n!.indexOf(LAND_ONLY_REPEATED_MERGE_NOTE));
    expect([r.isExempt, r.calculatedTax, r.totalTax]).toEqual([false, 145_250_000, 159_775_000]);
  });

  it("N2 합가일이 취득일들보다 이르면(값에 닿지 않음) 합가일 고지 자체가 없다 — 재합가 안내도 없다 · 비과세 0", () => {
    const r = calc(house(1_000_000_000, "2008-07-01", merged("2005-01-01")));
    expect((r.warnings ?? []).some((w) => w.includes("입력하신 세대 합가일"))).toBe(false);
    expect((r.warnings ?? []).some((w) => w.includes(LAND_ONLY_REPEATED_MERGE_NOTE))).toBe(false);
    expect(r.calculatedTax).toBe(0);
  });

  it("N3 함께 양도 부수토지 카드 고지에도 같은 문장 — 합가일이 카드 두 기준일보다 늦을 때만", () => {
    const base = { oneHouseUnitRole: "appurtenant_land", acquisitionDate: D("2010-01-01") } as unknown as TransferTaxInput;
    const late = { ...base, appurtenantHouseVerdict: { houseMergeDate: D("2023-12-01"), houseAcquisitionDate: D("2014-09-01") } } as unknown as TransferTaxInput;
    const early = { ...base, appurtenantHouseVerdict: { houseMergeDate: D("2005-01-01"), houseAcquisitionDate: D("2014-09-01") } } as unknown as TransferTaxInput;
    const msg = landOnlyMergeDateAppurtenantCardNotice(late);
    expect(msg).toContain("입력하신 세대 합가일(2023-12-01)");
    expect(msg).toContain(LAND_ONLY_REPEATED_MERGE_NOTE);
    expect(landOnlyMergeDateAppurtenantCardNotice(early)).toBeUndefined();
  });
});

describe("입력 화면 — «세대를 합친 날» 칸 안내", () => {
  const asset = (over: Record<string, unknown> = {}) =>
    ({ ...makeDefaultAsset(1), assetKind: "housing", selfOwns: "land_only", buildingOwnerSameHousehold: true, buildingOwnerHouseholdMerged: true, ...over }) as never;

  it("🔑 U1 «중간에 합침»을 고르면 합가일 칸 아래에 같은 문장이 보인다", () => {
    render(<AssetOwnershipSplitSection asset={asset()} onChange={() => {}} />);
    expect(screen.getByText(LAND_ONLY_REPEATED_MERGE_NOTE)).toBeTruthy();
    expect(screen.getByText("세대를 합친 날")).toBeTruthy();
  });

  it("U2 «처음부터 같은 세대»(합가 아님)이면 합가일 칸도 안내도 없다", () => {
    render(<AssetOwnershipSplitSection asset={asset({ buildingOwnerHouseholdMerged: false })} onChange={() => {}} />);
    expect(screen.queryByText(LAND_ONLY_REPEATED_MERGE_NOTE)).toBeNull();
    expect(screen.queryByText("세대를 합친 날")).toBeNull();
  });

  it("U3 다른 세대면 합가 질문 자체가 없다", () => {
    render(<AssetOwnershipSplitSection asset={asset({ buildingOwnerSameHousehold: false, buildingOwnerHouseholdMerged: undefined })} onChange={() => {}} />);
    expect(screen.queryByText(LAND_ONLY_REPEATED_MERGE_NOTE)).toBeNull();
  });
});
