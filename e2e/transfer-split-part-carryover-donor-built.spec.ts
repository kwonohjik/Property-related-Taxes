/**
 * E2E — 주택 split 건물 파트 이월과세 × 증여자 신축·증축 「소득세법」 §114조의2 가산세 (PR-3: ⑤ 토글 · ④ body · ⑧ 차단 · ⑦ 결과)
 *
 * 계획서: docs/00-pm/carryover-donor-built-114-2.plan.md (PR-3)
 * 시드 — 건물만 이월과세(B) + 토지 매매: 건물 증여 2023-03-01 · 증여자 건물 2015-06-01 · 증여자 환산(취득 당시 건물 기준시가) · 증여자 신축 2021-01-01 ·
 * 토지 매매 2008-01-01 1.2억 · 양도 12억(토지 7억 + 건물 5억) · 양도일 2025-06-30.
 *   · A 채택(분자 4천만 / 양도시 건물 기준시가 5억): 건물 파트 환산취득가액 4천만 × 5% = 가산세 2,000,000 (토지 파트는 base 에 섞이지 않는다)
 *   · ②3호 B 채택(분자 9억): 가산세 0 + 중립 안내
 *
 * vitest 는 폼 → ④ → route → 4뷰를 함수로 잇는다. 여기서는 **브라우저 폼**에서 토글·입력이 요청 body 의 `buildingCarryoverPart.donorBuilt` 로 실리는지,
 * 결과 화면이 그것을 그리는지, ⑧이 미입력을 막고 그 칸으로 이동하는지 본다.
 *
 * 실행(워크트리): E2E_PORT=3283 npx playwright test e2e/transfer-split-part-carryover-donor-built.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "../lib/stores/calc-wizard-asset-carryover";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { calculate, formRow, num, seedWizard, stmtText } from "./_helpers/split-acq-display";

type Over = Record<string, unknown>;

const CARRYOVER = {
  ...CARRYOVER_DEFAULTS,
  giftRegistryDate: "2023-03-01",
  donorRelation: "lineal",
  donorSameHousehold: "no",
  donorAcquisitionDate: "2015-06-01",
  giftTaxCalculated: "20000000",
  giftTaxBase: "400000000",
  partEstimated: true,
  donorStandardPriceAtAcquisition: "40000000",
};
const DONOR_BUILT_NEW = { donorBuilt: true, donorBuiltType: "new", donorBuiltDate: "2021-01-01" };

const bAsset = (co: Over = {}, over: Over = {}): Over => ({
  ...makeDefaultAsset(1),
  ...DIRECT_RESIDENCE,
  addressJibun: "서울 강남구 테스트동 1-1",
  regionCode: "1168010100",
  assetKind: "housing",
  acquisitionCause: "carryover_gift",
  hasSeperateLandAcquisitionDate: true,
  landCauseHost: "carryover_gift",
  landAcquisitionCause: "purchase",
  landAcquisitionDate: "2008-01-01",
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  landAcquisitionPrice: "120000000",
  buildingAcquisitionPrice: "400000000",
  carryover: { ...CARRYOVER, ...co },
  actualSalePrice: "1200000000",
  saleSplitMode: "actual",
  landTransferPrice: "700000000",
  buildingTransferPrice: "500000000",
  landStandardPriceAtTransfer: "700000000",
  buildingStandardPriceAtTransfer: "500000000",
  ...over,
});

const seed = (assets: Over[]) => ({
  state: {
    formData: {
      assets,
      transferDate: "2025-06-30",
      filingDate: "2025-08-31",
      contractTotalPrice: "1200000000",
      householdHousingCount: "2",
      householdNoOtherHousesConfirmed: true,
      householdNoPresaleRightsConfirmed: true,
      isOneHousehold: false,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
});

type Wire = { buildingCarryoverPart?: { donorBuilt?: Record<string, unknown> }; landCarryoverPart?: { donorBuilt?: unknown } };

async function readStore(page: Page) {
  return page.evaluate(() => {
    const raw = sessionStorage.getItem("transfer-tax-wizard");
    return raw ? JSON.parse(raw)?.state?.formData?.assets?.[0]?.carryover : undefined;
  });
}

test.describe("split 건물 파트 이월과세 × 증여자 신축·증축 §114조의2", () => {
  test("DBP-E1 A 채택: body 의 buildingCarryoverPart.donorBuilt · 카드 가산세 · 신고서 2,000,000 · 토지 파트 미전송", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([bAsset(DONOR_BUILT_NEW)]));
    const body = (await calculate(page)) as Wire;
    expect(body.buildingCarryoverPart?.donorBuilt).toEqual({ buildingType: "new", constructionDate: "2021-01-01" });
    expect("landCarryoverPart" in body).toBe(false);
    const card = page.getByTestId("donor-built-penalty-card").first();
    await expect(card).toHaveAttribute("data-applied", "true");
    await expect(page.getByTestId("donor-built-window").first()).toHaveText("증여자 신축 취득일 2021-01-01부터 5년이 되는 날(2026-01-01)까지 양도하는 경우입니다.");
    await expect(page.getByTestId("donor-built-penalty-line").first()).toHaveText("가산세 2,000,000 = 40,000,000 × 5%");
    await expect(page.getByTestId("donor-built-notice").first()).toContainText("정면 해석례는 확인하지 못했습니다 — 확인 필요");
    // 신고서 가산세액 칸 + 상세명세서
    expect(num((await formRow(page, "가산세액"))[1])).toBe(2_000_000);
    expect(await stmtText(page, "가산세액")).toContain("증여자 신축·증축 환산취득가액 가산세 2,000,000");
  });

  test("DBP-E2 ②3호 B 채택: 가산세 없음 + 중립 안내 (「더했다」류 문구 없음)", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([bAsset({ ...DONOR_BUILT_NEW, donorStandardPriceAtAcquisition: "900000000" })]));
    await calculate(page);
    const card = page.getByTestId("donor-built-penalty-card").first();
    await expect(card).toHaveAttribute("data-applied", "false");
    await expect(page.getByTestId("donor-built-notice").first()).toHaveText(
      "이월과세를 적용하지 않아 수증자 취득가액을 증여 당시 평가액(실지거래가액)으로 계산했고, 증여자 신축분 소득세법 §114조의2 가산세는 붙지 않았습니다.",
    );
    await expect(card).not.toContainText(/같은 금액|더했/);
    expect(num((await formRow(page, "가산세액"))[1])).toBe(0);
  });

  test("DBP-E3 UI 입력 경로: 토글 ON → 구분·신축일 입력 → body 에 실린다 (신축일 자동 채움 없음)", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([bAsset()]));
    await expandAssetSection(page, 3);
    const toggle = page.getByTestId("donor-built-toggle");
    await expect(toggle).toBeVisible();
    await expect(page.getByTestId("donor-built-fields")).toHaveCount(0);
    await toggle.getByRole("switch").first().click();
    await expect(page.getByTestId("donor-built-fields")).toBeVisible();
    // 일체 주택 안분 칸은 없다 — 파트별 기준시가가 이미 나뉘어 있다
    await expect(page.getByTestId("donor-built-housing")).toHaveCount(0);
    expect(await readStore(page)).toMatchObject({ donorBuilt: true, donorBuiltType: "", donorBuiltDate: "" });
    await page.getByTestId("donor-built-type").getByRole("radio", { name: "신축" }).check();
    const dateScope = page.locator('[data-field="carryover.donorBuiltDate"]');
    const [y, m, d] = "2021-01-01".split("-");
    await dateScope.locator('input[type="text"][aria-label="연도"]').first().fill(y);
    await dateScope.locator('input[type="text"][aria-label="월"]').first().fill(m);
    await dateScope.locator('input[type="text"][aria-label="일"]').first().fill(d);
    expect(await readStore(page)).toMatchObject({ donorBuilt: true, donorBuiltType: "new", donorBuiltDate: "2021-01-01" });
    const body = (await calculate(page)) as Wire;
    expect(body.buildingCarryoverPart?.donorBuilt).toEqual({ buildingType: "new", constructionDate: "2021-01-01" });
    await expect(page.getByTestId("donor-built-penalty-line").first()).toHaveText("가산세 2,000,000 = 40,000,000 × 5%");
  });

  test("DBP-E4 ⑧ 차단: 토글 ON 인데 신축일이 비면 «다음» 이 막히고 그 칸으로 이동한다", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([bAsset({ donorBuilt: true, donorBuiltType: "new", donorBuiltDate: "" })]));
    await expandAssetSection(page, 3);
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => !!(document.activeElement as HTMLElement | null)?.closest('[data-field="carryover.donorBuiltDate"]')))
      .toBe(true);
    for (const key of ["carryover.donorBuilt", "carryover.donorBuiltType", "carryover.donorBuiltDate"]) {
      await expect(page.locator(`[data-field="${key}"]`), key).toHaveCount(1);
    }
  });

  test("DBP-E5 범위 밖은 칸이 없다 — 건물 파트 실가 입력 · 환산 토글을 켜야 나타난다", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([bAsset({ partEstimated: false, donorAcquisitionPrice: "100000000", donorStandardPriceAtAcquisition: "" })]));
    await expandAssetSection(page, 3);
    await expect(page.getByTestId("donor-built-toggle")).toHaveCount(0);
    await page.getByTestId("split-carryover-building-estimated").getByRole("switch").first().click();
    await expect(page.getByTestId("donor-built-toggle")).toBeVisible();
  });

  test("DBP-E6 증축: 구분을 증축으로 바꾸면 바닥면적·증축 부분 기준시가 칸이 열린다", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([bAsset(DONOR_BUILT_NEW)]));
    await expandAssetSection(page, 3);
    await expect(page.getByTestId("donor-built-ext-area")).toHaveCount(0);
    await page.getByTestId("donor-built-type").getByRole("radio", { name: "증축" }).check();
    await expect(page.getByTestId("donor-built-ext-area")).toBeVisible();
    await expect(page.getByTestId("donor-built-ext-std")).toBeVisible();
  });

  test("DBP-E7 C(토지·건물 모두 이월과세): 토지 환산도 켜도 토글은 건물 카드에만, 토지 파트 donorBuilt 는 body 에 없다", async ({ page }) => {
    test.setTimeout(180_000);
    const est = { ...CARRYOVER, partEstimated: true, donorStandardPriceAtAcquisition: "30000000" };
    const c: Over = {
      ...makeDefaultAsset(1),
      ...DIRECT_RESIDENCE,
      addressJibun: "서울 강남구 테스트동 1-1",
      regionCode: "1168010100",
      assetKind: "housing",
      acquisitionCause: "carryover_gift",
      carryoverDonorSplit: true,
      carryover: { ...est, giftTaxBase: "900000000", giftTaxCalculated: "30000000", ...DONOR_BUILT_NEW },
      landCarryover: { ...CARRYOVER_DEFAULTS, partEstimated: true, donorAcquisitionDate: "1995-03-01", donorStandardPriceAtAcquisition: "30000000" },
      landAcquisitionPrice: "240000000",
      buildingAcquisitionPrice: "660000000",
      actualSalePrice: "1200000000",
      saleSplitMode: "actual",
      landTransferPrice: "700000000",
      buildingTransferPrice: "500000000",
      landStandardPriceAtTransfer: "700000000",
      buildingStandardPriceAtTransfer: "500000000",
    };
    await seedWizard(page, seed([c]));
    await expandAssetSection(page, 3);
    await expect(page.getByTestId("donor-built-toggle")).toHaveCount(1);
    await expect(page.getByTestId("split-carryover-building-card").getByTestId("donor-built-toggle")).toHaveCount(1);
    await expect(page.getByTestId("split-carryover-land-card").getByTestId("donor-built-toggle")).toHaveCount(0);
    const body = (await calculate(page)) as Wire;
    expect(body.buildingCarryoverPart?.donorBuilt).toEqual({ buildingType: "new", constructionDate: "2021-01-01" });
    expect(body.landCarryoverPart?.donorBuilt).toBeUndefined();
  });
});
