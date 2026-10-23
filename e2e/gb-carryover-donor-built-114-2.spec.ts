/**
 * E2E — 일반건물 건물 파트 이월과세 × 증여자 신축·증축 「소득세법」 §114조의2 가산세 (PR-5a: ⑤ 토글 · ④ body · ⑧ 차단 · ⑦ 결과)
 *
 * 계획서: docs/00-pm/gb-card-built-penalty-114-2.plan.md §3.2
 * 시드 — 토지·건물 모두 이월과세(분리 OFF) · 양도 10억 · 양도시 기준시가 토지 2억·건물 2억 · 증여 2024-05-01 · 증여자 취득 2015-01-01 ·
 * 증여자 취득 당시 기준시가 건물 1억(토지 5천만) · 증여자 신축 2022-01-10 · 양도일 2026-03-01.
 *   · A 채택: 건물 환산취득가액 5억 × 1억/2억 = 250,000,000 → 가산세 12,500,000 (토지 파트는 대상이 아니다)
 *   · ②3호 B 채택(증여 당시 평가액 1억): 가산세 0 + 중립 안내
 *
 * vitest(`transfer.route.gb-carryover-donor-built.*`)는 폼 → ④ → route → 4뷰를 함수로 잇는다. 여기서는 **브라우저 폼**에서 토글·입력이 요청 body 의
 * `generalBuildingValuation.buildingCarryoverTaxation.donorBuilt` 로 실리는지, 결과 화면이 그것을 그리는지, ⑧이 미입력을 막고 그 칸으로 이동하는지 본다.
 *
 * 실행(워크트리): E2E_PORT=3296 npx playwright test e2e/gb-carryover-donor-built-114-2.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "../lib/stores/calc-wizard-asset-carryover";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { calculate, formRow, num, seedWizard, stmtText } from "./_helpers/split-acq-display";

type Over = Record<string, unknown>;

const LAND_CARRYOVER = {
  ...CARRYOVER_DEFAULTS,
  giftRegistryDate: "2024-05-01",
  donorAcquisitionDate: "2015-01-01",
  giftDateValuation: "400000000",
  useEstimatedAcquisition: true,
  estimationMode: "general",
  donorStandardPriceAtAcquisition: "50000000",
};
const BUILDING_CARRYOVER = {
  ...CARRYOVER_DEFAULTS,
  giftRegistryDate: "2024-05-01",
  donorAcquisitionDate: "2015-01-01",
  giftDateValuation: "800000000",
  useEstimatedAcquisition: true,
  estimationMode: "general",
  donorStandardPriceAtAcquisition: "100000000",
};
const DONOR_BUILT_NEW = { donorBuilt: true, donorBuiltType: "new", donorBuiltDate: "2022-01-10" };

const gbAsset = (bco: Over = {}, over: Over = {}): Over => ({
  ...makeDefaultAsset(1),
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "general_building",
  acquisitionCause: "carryover_gift",
  gbBuildingAcquisitionCause: "carryover_gift",
  acquisitionDate: "2024-05-01",
  useEstimatedAcquisition: true,
  landAcqMode: "estimated",
  buildingAcqMode: "estimated",
  gbLandArea: "100",
  gbBuildingArea: "200",
  gbBuildingFootprintArea: "50",
  gbTransferLandPricePerSqm: "2000000",
  gbTransferBuildingValue: "200000000",
  gbZoneType: "general_residential",
  gbAcqLandPricePerSqm: "1000000",
  gbAcqBuildingValue: "100000000",
  actualSalePrice: "1000000000",
  carryover: LAND_CARRYOVER,
  buildingCarryover: { ...BUILDING_CARRYOVER, ...bco },
  ...over,
});

const seed = (assets: Over[]) => ({
  state: {
    formData: {
      assets,
      transferDate: "2026-03-01",
      filingDate: "2026-05-31",
      contractTotalPrice: "1000000000",
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

type Wire = {
  generalBuildingValuation?: {
    buildingCarryoverTaxation?: { donorBuilt?: Record<string, unknown> };
    buildingCarryoverPart?: { donorBuilt?: Record<string, unknown> };
    landCarryoverTaxation?: { donorBuilt?: unknown };
    landCarryoverPart?: { donorBuilt?: unknown };
  };
};
const donorBuiltOf = (b: Wire) =>
  b.generalBuildingValuation?.buildingCarryoverTaxation?.donorBuilt ?? b.generalBuildingValuation?.buildingCarryoverPart?.donorBuilt;

async function readBuildingStore(page: Page) {
  return page.evaluate(() => {
    const raw = sessionStorage.getItem("transfer-tax-wizard");
    return raw ? JSON.parse(raw)?.state?.formData?.assets?.[0]?.buildingCarryover : undefined;
  });
}

test.describe("일반건물 건물 파트 이월과세 × 증여자 신축·증축 §114조의2", () => {
  test("GBDB-E1 A 채택: body 의 건물 파트 donorBuilt · 카드 가산세 · 신고서 12,500,000 · 토지 파트 미전송", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([gbAsset(DONOR_BUILT_NEW)]));
    const body = (await calculate(page)) as Wire;
    expect(donorBuiltOf(body)).toEqual({ buildingType: "new", constructionDate: "2022-01-10" });
    expect(body.generalBuildingValuation?.landCarryoverTaxation?.donorBuilt).toBeUndefined();
    expect(body.generalBuildingValuation?.landCarryoverPart?.donorBuilt).toBeUndefined();
    const card = page.getByTestId("donor-built-penalty-card").first();
    await expect(card).toHaveAttribute("data-applied", "true");
    await expect(page.getByTestId("donor-built-window").first()).toHaveText("증여자 신축 취득일 2022-01-10부터 5년이 되는 날(2027-01-10)까지 양도하는 경우입니다.");
    await expect(page.getByTestId("donor-built-penalty-line").first()).toHaveText("가산세 12,500,000 = 250,000,000 × 5%");
    await expect(page.getByTestId("donor-built-notice").first()).toContainText("정면 해석례는 확인하지 못했습니다 — 확인 필요");
    // 합산 신고서 가산세액 칸 + 각주 / 상세명세서
    expect(num((await formRow(page, "가산세액"))[1])).toBe(12_500_000);
    await expect(page.locator('[data-print-id="form-table"]').first()).toContainText("증여자 신축 건물 가산세 12,500,000");
    expect(await stmtText(page, "가산세액")).toContain("증여자 신축·증축 환산취득가액 가산세 12,500,000");
  });

  test("GBDB-E2 ②3호 B 채택: 가산세 없음 + 중립 안내 (「더했다」류 문구 없음)", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([gbAsset({ ...DONOR_BUILT_NEW, giftDateValuation: "100000000" })]));
    await calculate(page);
    const card = page.getByTestId("donor-built-penalty-card").first();
    await expect(card).toHaveAttribute("data-applied", "false");
    await expect(page.getByTestId("donor-built-notice").first()).toHaveText(
      "이월과세를 적용하지 않아 수증자 취득가액을 증여 당시 평가액(실지거래가액)으로 계산했고, 증여자 신축분 소득세법 §114조의2 가산세는 붙지 않았습니다.",
    );
    await expect(card).not.toContainText(/같은 금액|더했/);
    expect(num((await formRow(page, "가산세액"))[1])).toBe(0);
  });

  test("GBDB-E3 UI 입력 경로: 건물 파트 블록에서 토글 ON → 구분·신축일 입력 → body 에 실린다 (신축일 자동 채움 없음)", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([gbAsset()]));
    await expandAssetSection(page, 3);
    const toggle = page.getByTestId("donor-built-toggle");
    // 토지 블록에는 없고 건물 파트 블록에만 있다 — 화면 전체에서 1개
    await expect(toggle).toHaveCount(1);
    await expect(toggle).toBeVisible();
    await expect(page.getByTestId("donor-built-fields")).toHaveCount(0);
    await toggle.getByRole("switch").first().click();
    await expect(page.getByTestId("donor-built-fields")).toBeVisible();
    // 일체 주택 안분 칸은 없다 — 토지·건물이 카드로 이미 나뉘어 있다
    await expect(page.getByTestId("donor-built-housing")).toHaveCount(0);
    // 켠 것만으로 구분·일자가 채워지지 않는다 — 증여자 취득일(2015-01-01)을 신축일로 대신 채우지 않는다
    expect(await readBuildingStore(page)).toMatchObject({ donorBuilt: true, donorBuiltType: "", donorBuiltDate: "" });
    await page.getByTestId("donor-built-type").getByRole("radio", { name: "신축" }).check();
    const dateScope = page.locator('[data-field="buildingCarryover.donorBuiltDate"]');
    const [y, m, d] = "2022-01-10".split("-");
    await dateScope.locator('input[type="text"][aria-label="연도"]').first().fill(y);
    await dateScope.locator('input[type="text"][aria-label="월"]').first().fill(m);
    await dateScope.locator('input[type="text"][aria-label="일"]').first().fill(d);
    expect(await readBuildingStore(page)).toMatchObject({ donorBuilt: true, donorBuiltType: "new", donorBuiltDate: "2022-01-10" });
    const body = (await calculate(page)) as Wire;
    expect(donorBuiltOf(body)).toEqual({ buildingType: "new", constructionDate: "2022-01-10" });
    await expect(page.getByTestId("donor-built-penalty-line").first()).toHaveText("가산세 12,500,000 = 250,000,000 × 5%");
  });

  test("GBDB-E4 ⑧ 차단: 토글 ON 인데 신축일이 비면 «다음» 이 막히고 그 칸으로 이동한다 · 앵커 각 1개", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([gbAsset({ donorBuilt: true, donorBuiltType: "new", donorBuiltDate: "" })]));
    await expandAssetSection(page, 3);
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => !!(document.activeElement as HTMLElement | null)?.closest('[data-field="buildingCarryover.donorBuiltDate"]')))
      .toBe(true);
    for (const key of ["buildingCarryover.donorBuilt", "buildingCarryover.donorBuiltType", "buildingCarryover.donorBuiltDate"]) {
      await expect(page.locator(`[data-field="${key}"]`), key).toHaveCount(1);
    }
  });

  test("GBDB-E6 분리 ON(건물만 이월과세·토지 매매): 건물 카드의 토글로 같은 body·같은 가산세", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(
      page,
      seed([
        gbAsset(DONOR_BUILT_NEW, {
          acquisitionCause: "purchase",
          hasSeperateLandAcquisitionDate: true,
          landAcquisitionDate: "2015-03-01",
          carryover: { ...CARRYOVER_DEFAULTS },
        }),
      ]),
    );
    await expandAssetSection(page, 3);
    await expect(page.getByTestId("donor-built-toggle")).toHaveCount(1);
    const body = (await calculate(page)) as Wire;
    expect(donorBuiltOf(body)).toEqual({ buildingType: "new", constructionDate: "2022-01-10" });
    expect(body.generalBuildingValuation?.landCarryoverTaxation).toBeUndefined();
    await expect(page.getByTestId("donor-built-penalty-line").first()).toHaveText("가산세 12,500,000 = 250,000,000 × 5%");
    expect(num((await formRow(page, "가산세액"))[1])).toBe(12_500_000);
  });

  test("GBDB-E5 범위 밖은 칸이 없고 stale 토글은 보내지도 요구하지도 않는다 — 실가 승계", async ({ page }) => {
    test.setTimeout(180_000);
    // 건물 파트 실지거래가액 승계 + 토글만 켜 둔 stale(구분·신축일 비어 있음)
    await seedWizard(
      page,
      seed([gbAsset({ useEstimatedAcquisition: false, estimationMode: null, donorAcquisitionPrice: "100000000", donorStandardPriceAtAcquisition: "", donorBuilt: true, donorBuiltType: "", donorBuiltDate: "" })]),
    );
    await expandAssetSection(page, 3);
    await expect(page.getByTestId("donor-built-toggle")).toHaveCount(0);
    // ⑧이 신축 칸을 요구하지 않는다 — 계산이 막히지 않고 body 에도 실리지 않는다
    const body = (await calculate(page)) as Wire;
    expect(donorBuiltOf(body)).toBeUndefined();
    expect(num((await formRow(page, "가산세액"))[1])).toBe(0);
  });
});
