/**
 * 상속·증여 「토지·건물 소유자 다름」 — 화면에 없는 분리 입력(파트 금액·토지 취득일·분리 플래그) 잔존. 계획서
 * `docs/02-design/features/inherit-gift-owner-split-residue.plan.md`.
 *
 * 그 화면(`NonPurchaseSplitInputsBlock`)에는 파트 취득가액·매매사례가액·산정 방식·토지 취득일 칸이 없다. 상속·증여 자산의 취득시기는
 * 상속개시일·증여일 하나다(「소득세법 시행령」 제162조 제1항 제5호). 수정 전 ④는 남은 값을 그대로 읽었다(시료 · mock 세율):
 *   R-1 D2를 끈 뒤 남은 토지 금액 1억 — 토지만 본인 100,740,000 (대조 94,022,000)
 *   R-2 원인을 오간 D2 흔적(overlay `purchase`) + 감정 1억 — 98,804,640
 *   R-3 상속개시일·증여일을 고친 뒤 남은 옛 토지 취득일 — 2010 → 80,342,000 · 2020 → 108,420,000 · 화면 시료(2015 ↔ 2016-01-01) 94,022,000 (대조 96,900,000)
 *   R-4 남은 건물 금액 1억 — 건물만 본인 181,746,000 (대조 154,500,000)
 *   R-5 겸용을 켰다 끈 분리 플래그 + 다른 날짜 — ⑧ 「건물(토지) 취득가액을 입력하세요」(칸 0개) · 서버 400
 * 수정: 읽는 쪽 정규화(`nonPurchaseOwnerSplit` → `normalizeBuildingCauseInputs`) — 저장값은 그대로 둔다(D2 다시 켜면 복원 · C10).
 */
import { describe, expect, it, vi } from "vitest";

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
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { allIssues } from "../calc/_helpers/redev-one-house-route";
import { captureBody } from "../calc/_helpers/redev-one-house-route";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { migratePersistedTransferForm } from "@/lib/stores/calc-wizard-store";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { nonPurchaseOwnerSplit } from "@/lib/calc/transfer-land-part-cause";
import { normalizeBuildingCauseInputs } from "@/lib/calc/transfer-land-part-cause";
import { ownerSplitHousingNeedsBuildingStd } from "@/lib/calc/transfer-tax-split-acq-mode";
import { validateUsageConversion } from "@/lib/calc/transfer-tax-validate-usage-conversion";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

/** route body·응답 탐색용 느슨한 타입(기존 anchor와 같은 관례) */
type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const HH = {
  transferDate: "2023-02-16", filingDate: "2023-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false,
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};
/** 2015 상속 주택 · 평가액 3억 · 양도 12억 · 소유자 분리 — 기준시가 칸은 그 화면에 있다 */
const INH: Loose = {
  addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", buildingOwnerSameHousehold: true, buildingOwnerHouseholdMerged: false, acquisitionCause: "inheritance", acquisitionDate: "2015-01-01",
  decedentAcquisitionDate: "2005-01-01", actualSalePrice: "1,200,000,000", publishedValueAtInheritance: "300,000,000",
  inheritanceValuationMethod: "supplementary", fixedAcquisitionPrice: "", acquisitionArea: "100", transferArea: "100",
  standardPricePerSqmAtTransfer: "5600000", buildingStandardPriceAtTransfer: "840000000", standardPricePerSqmAtAcq: "2400000",
  standardPriceAtAcq: "480000000", buildingStandardPriceAtAcq: "360000000", standardPriceAtTransfer: "1400000000",
};
/** 같은 물건 · 증여(신고가액 3억 · 제3자) */
const GIFT: Loose = {
  ...INH, acquisitionCause: "gift", publishedValueAtInheritance: "", inheritanceValuationMethod: "", decedentAcquisitionDate: "",
  fixedAcquisitionPrice: "300,000,000", donorAcquisitionDate: "2005-01-01", giftDonorRelation: "other", giftSameHousehold: "no",
};
const CONTROL = { building_only: 154_500_000, land_only: 94_022_000 } as const;

const form = (a: Loose): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    ...HH, contractTotalPrice: String(a.actualSalePrice).replace(/,/g, ""), assets: [{ ...makeDefaultAsset(1), ...a } as AssetForm],
  }) as TransferFormData;
const restored = (a: Loose): Loose => migratePersistedTransferForm(form(a)).assets[0] as unknown as Loose;

async function run(a: Loose) {
  const f = form(a);
  const body = (await captureBody(f)) as Loose;
  const r = await postTransfer(body);
  return {
    fields: allIssues(f).map((i) => i.field),
    status: r.status,
    tax: (r.result as Loose | undefined)?.calculatedTax as number | undefined,
    body,
  };
}

describe.each([["상속", INH], ["증여", GIFT]] as const)("OS — %s 소유자 분리 · 화면에 없는 분리 입력", (_n, B) => {
  it.each(["building_only", "land_only"] as const)("OS-0 대조 %s", async (owns) => {
    const r = await run({ ...B, selfOwns: owns });
    expect([r.fields, r.status, r.tax]).toEqual([[], 200, CONTROL[owns]]);
  });

  it("R-1 D2를 끈 뒤 남은 토지 금액 → 토지만 본인: 대조와 같다(수정 전 100,740,000)", async () => {
    const r = await run({ ...B, selfOwns: "land_only", landAcquisitionPrice: "100,000,000" });
    expect([r.fields, r.status, r.tax]).toEqual([[], 200, CONTROL.land_only]);
  });

  it("R-2 원인을 오간 D2 흔적(토지 감정 1억) → 토지만 본인: 대조와 같고 저장값은 그대로(C10)", async () => {
    const residue = { ...B, selfOwns: "land_only", landAcquisitionCause: "purchase", landCauseHost: "", landAcqMode: "appraisal", landAcquisitionPrice: "100,000,000" };
    const r = await run(residue);
    expect([r.fields, r.status, r.tax]).toEqual([[], 200, CONTROL.land_only]);
    const kept = restored(residue);
    expect([kept.landAcquisitionCause, kept.landAcqMode, kept.landAcquisitionPrice]).toEqual(["purchase", "appraisal", "100,000,000"]);
  });

  it.each([["2010-01-01"], ["2020-01-01"]] as const)("R-3 남은 옛 토지 취득일 %s(분리 꺼짐) → 토지만 본인: 대조와 같다 · ④가 상속개시일·증여일을 싣는다", async (landDate) => {
    const r = await run({ ...B, selfOwns: "land_only", landAcquisitionDate: landDate });
    expect([r.fields, r.status, r.tax]).toEqual([[], 200, CONTROL.land_only]);
    expect(r.body.landAcquisitionDate).toBe("2015-01-01");
  });

  it("R-3 화면 시료 — 저장 폼을 열고 날짜만 고친 상태(토지 2015-01-01 · 취득일 2016-01-01): 96,900,000(수정 전 94,022,000)", async () => {
    const edited = { ...B, selfOwns: "land_only", acquisitionDate: "2016-01-01", landAcquisitionDate: "2015-01-01" };
    const control = await run({ ...edited, landAcquisitionDate: "2016-01-01" });
    const r = await run(edited);
    expect([control.status, control.tax]).toEqual([200, 96_900_000]);
    expect([r.fields, r.status, r.tax]).toEqual([[], 200, 96_900_000]);
  });

  it("R-4 남은 건물 금액 1억 → 건물만 본인: 대조와 같다(수정 전 181,746,000)", async () => {
    const r = await run({ ...B, selfOwns: "building_only", buildingAcquisitionPrice: "100,000,000" });
    expect([r.fields, r.status, r.tax]).toEqual([[], 200, CONTROL.building_only]);
  });

  it.each(["building_only", "land_only"] as const)("R-5 겸용 왕복이 남긴 분리 플래그 + 다른 토지 취득일 → %s: ⑧ 통과 · 200 · 대조(수정 전 ⑧ 파트 취득가액 막다른 길)", async (owns) => {
    const r = await run({ ...B, selfOwns: owns, hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2010-01-01" });
    expect([r.fields, r.status, r.tax]).toEqual([[], 200, CONTROL[owns]]);
  });

  /**
   * 리뷰 게이트가 찾은 사본 밖 소비처(⑧ 날짜 정합 · ⑧ 용도변경 병용 · ⑦ 신고서 토지 열) — 종전 `hasStaleSplitInput`·원본 토지 취득일을 읽어
   * ⑧만 막고 서버는 200이거나, 신고서 토지 열이 계산(④·엔진 echo)과 다른 날짜·보유기간을 보였다.
   */
  it("⑧ 날짜 정합 — 남은 분리 플래그 + 양도일보다 늦은 옛 토지 취득일: 칸 없는 「토지 취득일」 오류 없이 200 · 대조", async () => {
    const r = await run({ ...B, selfOwns: "land_only", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2023-06-01" });
    expect([r.fields, r.status, r.tax]).toEqual([[], 200, CONTROL.land_only]);
  });

  it("⑧ 용도변경 병용 — 남은 분리 플래그는 「서로 다른 시점에 취득」으로 막지 않는다(매매 별개 취득은 그대로 막는다)", () => {
    const conv = { hasNonHousingConversion: true, residentialUseStartDate: "2018-01-01", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2010-01-01" };
    const a = { ...makeDefaultAsset(1), ...B, selfOwns: "land_only", ...conv } as AssetForm;
    expect(validateUsageConversion(a, "자산") ?? "").not.toContain("서로 다른 시점");
    expect(validateUsageConversion({ ...a, acquisitionCause: "purchase", selfOwns: "both" } as AssetForm, "자산") ?? "").toContain("서로 다른 시점");
  });

  it.each([[false], [true]] as const)("⑦ 신고서 토지 열 — 남은 옛 토지 취득일(분리 플래그 %s)이 아니라 계산과 같은 날짜·보유기간", async (sep) => {
    const pick = async (a: Loose) => {
      const f = form(a);
      const r = await postTransfer((await captureBody(f)) as Loose);
      const rows = buildRows(r.result as never, "split-2col", f, f.assets[0]);
      return [rows[1].values.land, rows.find((x) => x.label === "보유기간")?.values.land];
    };
    const control = await pick({ ...B, selfOwns: "land_only" });
    const stale = await pick({ ...B, selfOwns: "land_only", hasSeperateLandAcquisitionDate: sep, landAcquisitionDate: "2010-01-01" });
    expect(control[0]).toContain("2015");
    expect(stale).toEqual(control);
  });

  it("⑤ 취득시 건물 기준시가 칸 — 남은 건물 금액이 있어도 닫히지 않는다(비율 안분의 분모 · ④·⑧과 같은 사본)", () => {
    const a = { ...makeDefaultAsset(1), ...B, selfOwns: "building_only" } as AssetForm;
    expect(ownerSplitHousingNeedsBuildingStd(a)).toBe(true);
    expect(ownerSplitHousingNeedsBuildingStd({ ...a, buildingAcquisitionPrice: "100,000,000" })).toBe(true);
  });
});

describe("OS — 정규화 범위", () => {
  const base = { ...makeDefaultAsset(1), ...INH, selfOwns: "land_only", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2010-01-01",
    landAcqMode: "appraisal", buildingAcqMode: "estimated", landAcquisitionPrice: "1", buildingAcquisitionPrice: "2", landSalesCaseValue: "3", buildingSalesCaseValue: "4" } as AssetForm;

  it("상속·증여 소유자 분리 사본 — 분리 꺼짐 · 토지 취득일 = 상속개시일 · 두 파트 실거래가 · 파트 금액 4종 비움 · 원본 불변", () => {
    const n = normalizeBuildingCauseInputs(base);
    expect([n.hasSeperateLandAcquisitionDate, n.landAcquisitionDate, n.landAcqMode, n.buildingAcqMode]).toEqual([false, "2015-01-01", "actual", "actual"]);
    expect([n.landAcquisitionPrice, n.buildingAcquisitionPrice, n.landSalesCaseValue, n.buildingSalesCaseValue]).toEqual(["", "", "", ""]);
    expect([base.landAcquisitionDate, base.landAcquisitionPrice]).toEqual(["2010-01-01", "1"]);
  });

  it.each([
    ["소유자 분리 없음", { selfOwns: "both" }],
    ["매매", { acquisitionCause: "purchase" }],
    ["부담부증여", { acquisitionCause: "gift", transferType: "burdened_gift" }],
    ["겸용", { isMixedUseHouse: true }],
    ["일반건물", { assetKind: "general_building" }],
    // 화면은 소유자 분리와 D2를 상호 잠금하지만 저장값은 둘 다 켜질 수 있다 — D2 토지 매매 파트 값은 정당한 입력이라 사본을 만들지 않는다
    ["D2 유효(건물 상속 + 토지 매매)", { landAcquisitionCause: "purchase", landCauseHost: "inheritance", buildingAcqMode: "actual" }],
  ] as const)("%s → 대상 아님", (_n, over) => {
    const a = { ...base, ...over } as AssetForm;
    expect(nonPurchaseOwnerSplit(a)).toBe(false);
  });

  it("함께 양도 자산(컴패니언)도 같은 분리 payload를 거친다 — 남은 토지 금액·옛 토지 취득일이 총세액을 바꾸지 않는다", async () => {
    const two = (c: Loose) =>
      Object.assign(createDefaultTransferFormData(), {
        ...HH, contractTotalPrice: "1700000000",
        assets: [
          { ...makeDefaultAsset(1), ...INH, actualSalePrice: "500,000,000", acquisitionArea: "", transferArea: "" } as AssetForm,
          { ...makeDefaultAsset(2), ...INH, selfOwns: "land_only", ...c } as AssetForm,
        ],
      }) as TransferFormData;
    const total = async (c: Loose) => {
      const f = two(c);
      const r = await postTransfer((await captureBody(f)) as Loose);
      return { fields: allIssues(f).map((i) => i.field), status: r.status, tax: r.json?.data?.aggregated?.totalTax as number | undefined };
    };
    const control = await total({});
    const stale = await total({ landAcquisitionPrice: "100,000,000", landAcquisitionDate: "2010-01-01" });
    expect(control.status).toBe(200);
    expect(control.tax).toBeGreaterThan(0);
    expect([stale.fields, stale.status, stale.tax]).toEqual([control.fields, 200, control.tax]);
  });
});
