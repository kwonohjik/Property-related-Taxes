/**
 * E2E — 주택 split 파트 이월과세(소득세법 §97의2) P3 A: 토지만 이월과세 + 건물 매매·신축.
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.ui.design.md §4 · §9.2
 *
 * vitest는 폼 → ④ body를 함수로 만든다. 여기서는 **브라우저 폼**에서 새 키(`carryoverGiftEvent`·`landCarryoverPart`)가 실제로 요청에 실리고,
 * 결과 4뷰가 토지 파트만 이월과세로 그리는지(건물은 매수·신축 취득일 그대로) 본다.
 * 시드 수치는 엔진 anchor SPCO-T1과 같다 — 건물 매매 2021-03-01 4억 · 토지 증여 2023-03-01(평가 3억) · 토지 증여자 2000-01-01 1억 ·
 * 증여세 산출 2천만 / 과세가액 3억 · 양도 12억(토지 7억 + 건물 5억) · 양도일 2025-06-30.
 *
 * 실행(워크트리): E2E_PORT=3274 npx playwright test e2e/transfer-split-part-carryover-a.spec.ts
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "../lib/stores/calc-wizard-asset-carryover";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { calculate, formRow, num, seedWizard, stmtText, stmtValue, won } from "./_helpers/split-acq-display";

type Over = Record<string, unknown>;

const LAND_CARRYOVER = {
  ...CARRYOVER_DEFAULTS,
  giftRegistryDate: "2023-03-01",
  donorRelation: "lineal",
  donorAcquisitionDate: "2000-01-01",
  donorAcquisitionPrice: "100000000",
  giftTaxCalculated: "20000000",
  giftTaxBase: "300000000",
};

const aAsset = (host: "purchase" | "newConstruction" = "purchase", over: Over = {}): Over => ({
  ...makeDefaultAsset(1),
  ...DIRECT_RESIDENCE,
  addressJibun: "서울 강남구 테스트동 1-1",
  regionCode: "1168010100",
  assetKind: "housing",
  ...(host === "purchase"
    ? { acquisitionCause: "purchase", acquisitionDate: "2021-03-01", buildingAcquisitionPrice: "400000000" }
    : { acquisitionCause: "newConstruction", occupancyApprovalDate: "2021-03-01", acquisitionDate: "2021-03-01", fixedAcquisitionPrice: "400000000" }),
  hasSeperateLandAcquisitionDate: true,
  landCauseHost: host,
  landAcquisitionCause: "carryover_gift",
  landAcquisitionDate: "2023-03-01",
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  landAcquisitionPrice: "300000000",
  landCarryover: { ...LAND_CARRYOVER },
  actualSalePrice: "1200000000",
  saleSplitMode: "actual",
  landTransferPrice: "700000000",
  buildingTransferPrice: "500000000",
  landStandardPriceAtTransfer: "700000000",
  buildingStandardPriceAtTransfer: "500000000",
  ...over,
});

const aSeed = (assets: Over[] = [aAsset()], formOver: Over = {}) => ({
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
      ...formOver,
    },
    pendingMigration: false,
  },
  version: 0,
});

async function fillDate(scope: Locator, ymd: string) {
  const [y, m, d] = ymd.split("-");
  await scope.locator('input[type="text"][aria-label="연도"]').first().fill(y);
  await scope.locator('input[type="text"][aria-label="월"]').first().fill(m);
  await scope.locator('input[type="text"][aria-label="일"]').first().fill(d);
}

async function expectResult(page: Page, body: Record<string, unknown>, host: "purchase" | "newConstruction") {
  expect(body.carryoverGiftEvent).toMatchObject({ giftRegistryDate: "2023-03-01", giftTaxCalculated: 20_000_000, giftTaxBase: 300_000_000, donorRelation: "lineal" });
  expect(body.landCarryoverPart).toEqual({ donorAcquisitionDate: "2000-01-01", donorAcquisitionPrice: 100_000_000 });
  expect(body.landAcquisitionCause).toBe("carryover_gift");
  expect(body.acquisitionCause).toBe(host);
  expect(body.landAcquisitionDate).toBe("2023-03-01");
  expect(body.acquisitionDate).toBe("2021-03-01");
  expect(body.isSeparateAcquisition).toBe(true);
  for (const k of ["buildingCarryoverPart", "carryoverTaxation", "landDecedentAcquisitionDate", "landSec164Value", "preHousingDisclosure"]) expect(k in body, k).toBe(false);

  // ⑦ 카드 — 토지만 이월과세 판정, 건물 카드 없음
  await expect(page.getByTestId("split-carryover-card").first()).toBeVisible();
  await expect(page.getByTestId("split-carryover-land").first()).toHaveAttribute("data-judgment", "applied");
  await expect(page.getByTestId("split-carryover-building")).toHaveCount(0);
  await expect(page.getByTestId("split-card-lthd-start-land").first()).toContainText("2000-01-01");

  // ⑦ 신고서 — 합계 = 토지(증여자 취득가액 1억) + 건물(4억), 필요경비 = 토지 증여세 상당액 2천만, 취득일자 합계·건물 = 건물 취득일
  const acqRow = await formRow(page, "취득가액");
  const expRow = await formRow(page, "필요경비");
  const gainRow = await formRow(page, "전체 양도차익");
  expect([num(acqRow[1]), num(acqRow[2]), num(acqRow[3])]).toEqual([500_000_000, 100_000_000, 400_000_000]);
  expect([num(expRow[1]), num(expRow[2]), num(expRow[3])]).toEqual([20_000_000, 20_000_000, 0]);
  expect(1_200_000_000 - num(acqRow[1]) - num(expRow[1])).toBe(num(gainRow[1]));
  const acqDate = await formRow(page, "취득일자");
  expect(acqDate.slice(1, 4).map((x) => x.split("\n")[0])).toEqual(["2021-03-01", "2000-01-01", "2021-03-01"]);

  // ⑦ 상세명세서 — 값 = 신고서 합계 · 토지 이월과세 태그
  expect(await stmtValue(page, "취득가액")).toBe(500_000_000);
  expect(await stmtValue(page, "필요경비")).toBe(20_000_000);
  expect(await stmtText(page, "취득가액")).toContain(`토지(이월과세 — 증여자 취득가액) ${won(100_000_000)}`);
}

test.describe("P3 A — 토지만 이월과세 + 건물 매매·신축", () => {
  for (const host of ["purchase", "newConstruction"] as const) {
    test(`${host}: 시드 → 카드 → 계산 → 요청 body 새 키 → 결과 4뷰`, async ({ page }) => {
      test.setTimeout(180_000);
      await seedWizard(page, aSeed([aAsset(host)]));
      await expandAssetSection(page, 3);
      await expect(page.getByTestId("land-carryover-card")).toBeVisible();
      await expect(page.getByTestId("land-acq-cause").getByRole("radio", { name: "이월과세(증여)", exact: true })).toBeChecked();
      // 앵커 각 1개(⑧ 이동 불능 0)
      for (const key of [
        "landCarryover.giftRegistryDate", "landCarryover.donorAcquisitionDate", "landCarryover.donorAcquisitionPrice", "landCarryover.giftTaxBase",
        "landCarryover.giftTaxCalculated", "landCarryover.donorRelation", "landAcquisitionPrice", "landAcquisitionDate", "landAcquisitionCause",
      ]) {
        await expect(page.locator(`[data-field="${key}"]`), key).toHaveCount(1);
      }
      // 토지 취득일 칸 = 증여 등기접수일(읽기 전용) + N7
      await expect(page.getByTestId("acq-date-land").locator('input[aria-label="연도"]')).toBeDisabled();
      await expect(page.getByTestId("acq-date-land").locator('input[aria-label="연도"]')).toHaveValue("2023");
      await expect(page.getByTestId("land-carryover-date-note")).toHaveCount(1);
      await expect(page.getByText("취득 당시 개별주택가격 미공시")).toHaveCount(0);
      await expect(page.getByText("증여자와 같은 세대 여부")).toHaveCount(0);
      const body = await calculate(page);
      await expectResult(page, body, host);
    });
  }

  test("UI 입력(매매): 토지 원인 «증여» → «이월과세(증여)» → 카드 입력 → 계산 · 다시 «증여»면 새 키 소멸", async ({ page }) => {
    test.setTimeout(240_000);
    await seedWizard(page, aSeed([aAsset("purchase", { landAcquisitionCause: "gift", landAcquisitionDate: "2019-05-05", landCarryover: { ...CARRYOVER_DEFAULTS } })]));
    await expandAssetSection(page, 3);
    await expect(page.getByTestId("land-gift-carryover-notice")).toContainText("「이월과세(증여)」를 선택하세요");
    await page.getByTestId("land-acq-cause").getByRole("radio", { name: "이월과세(증여)", exact: true }).check();
    const card = page.getByTestId("land-carryover-card");
    await expect(card).toBeVisible();
    // ⑧ — 빈 카드로 「다음」 → 첫 칸(증여 등기접수일)으로 이동
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => !!(document.activeElement as HTMLElement | null)?.closest('[data-field="landCarryover.giftRegistryDate"]')))
      .toBe(true);
    // 위 → 아래 입력
    await fillDate(page.getByTestId("land-carryover-gift-date"), "2023-03-01");
    await expect(page.getByTestId("acq-date-land").locator('input[aria-label="연도"]')).toHaveValue("2023");
    await fillDate(page.getByTestId("split-carryover-land-donor-date"), "2000-01-01");
    await page.getByTestId("split-carryover-land-donor-price").fill("100000000");
    await page.getByTestId("split-carryover-gift-tax-calculated").fill("20000000");
    await page.getByTestId("split-carryover-gift-tax-base").fill("300000000");
    await card.getByRole("radio", { name: "직계존비속", exact: true }).check();
    const body = await calculate(page);
    await expectResult(page, body, "purchase");

    // 다시 «증여» — 이월과세 키가 하나도 실리지 않는다(값은 보존 — 되돌리면 복원)
    await page.getByRole("button", { name: "자산 목록" }).first().click();
    await expandAssetSection(page, 3);
    await page.getByTestId("land-acq-cause").getByRole("radio", { name: "증여", exact: true }).check();
    const body2 = await calculate(page);
    for (const k of ["carryoverGiftEvent", "landCarryoverPart"]) expect(k in body2, k).toBe(false);
    expect(body2.landAcquisitionCause).toBe("gift");
  });

  test("P6 환산: 토글 ON → 증여자 취득 당시 기준시가 입력 → 계산 → 요청 body에 useEstimatedAcquisition·분자(가액 없음) → 결과에 환산 산식", async ({ page }) => {
    test.setTimeout(240_000);
    await seedWizard(page, aSeed([aAsset("purchase", { landCarryover: { ...LAND_CARRYOVER, donorAcquisitionPrice: "" } })]));
    await expandAssetSection(page, 3);
    // 앵커 — 토글 1개, 가액 칸 1개, 분자 칸 없음 → 토글 ON → 분자 칸 1개, 가액 칸 없음
    await expect(page.locator('[data-field="landCarryover.partEstimated"]')).toHaveCount(1);
    await expect(page.locator('[data-field="landCarryover.donorStandardPriceAtAcquisition"]')).toHaveCount(0);
    // ⑧ — 가액을 모르는데 토글을 안 켜면 «환산취득가액을 켜서» 안내로 막고 가액 칸으로 이동한다
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => !!(document.activeElement as HTMLElement | null)?.closest('[data-field="landCarryover.donorAcquisitionPrice"]')))
      .toBe(true);
    await page.getByTestId("split-carryover-land-estimated").getByRole("switch").click();
    await expect(page.locator('[data-field="landCarryover.donorStandardPriceAtAcquisition"]')).toHaveCount(1);
    await expect(page.locator('[data-field="landCarryover.donorAcquisitionPrice"]')).toHaveCount(0);
    await expect(page.getByText("아직 지원하지 않")).toHaveCount(0);
    await page.getByTestId("split-carryover-land-donor-std-price").fill("30000000");
    const body = await calculate(page);
    expect(body.landCarryoverPart).toEqual({ donorAcquisitionDate: "2000-01-01", useEstimatedAcquisition: true, donorStandardPriceAtAcquisition: 30_000_000 });
    // 결과 — 카드: 환산취득가액 산식(토지 양도가액 × 분자 ÷ 분모) · 개산공제 · 건물 §114조의2 고지 없음(토지 환산)
    const est = page.getByTestId("split-carryover-land-estimated").first();
    await expect(est).toContainText("토지 양도가액 700,000,000");
    await expect(est).toContainText("증여자 취득 당시 기준시가 30,000,000");
    await expect(est).toContainText("양도 당시 기준시가 700,000,000");
    await expect(est).toContainText("개산공제 = 증여자 취득 당시 기준시가 30,000,000 × 3% = 900,000");
    await expect(page.getByTestId("split-carryover-card").first()).not.toContainText("§114조의2");
    // 신고서·상세명세서 — 취득가액 = 토지 환산 3천만 + 건물 4억 · 필요경비 = 증여세 상당액 2천만 + 개산공제 90만
    const acqRow = await formRow(page, "취득가액");
    const expRow = await formRow(page, "필요경비");
    const gainRow = await formRow(page, "전체 양도차익");
    expect([num(acqRow[1]), num(acqRow[2]), num(acqRow[3])]).toEqual([430_000_000, 30_000_000, 400_000_000]);
    expect([num(expRow[1]), num(expRow[2]), num(expRow[3])]).toEqual([20_900_000, 20_900_000, 0]);
    expect(1_200_000_000 - num(acqRow[1]) - num(expRow[1])).toBe(num(gainRow[1]));
    expect(await stmtText(page, "취득가액")).toContain("토지(이월과세 — 증여자 취득 당시 기준시가 환산)");
    expect(await stmtText(page, "취득가액")).toContain("토지 환산취득가액 = 토지 양도가액 700,000,000");
  });

  test("P5 1세대1주택 — 토지 증여 1년(증여자 2000 취득) · 건물 매매 2021: 이월과세를 적용해야 토지분이 비과세 → §97의2②2호로 토지 미적용 · 세대 키 없음", async ({ page }) => {
    test.setTimeout(180_000);
    // 강남구 주소 = 취득 당시 조정대상지역 — 거주 36개월(직접 입력)로 건물 쪽 거주요건을 채운다. 토지(나중 취득 · 1년)는 미적용 세계에서만 보유요건 미달(G-3)이다.
    const asset = aAsset("purchase", {
      landAcquisitionDate: "2024-06-15",
      landCarryover: { ...LAND_CARRYOVER, giftRegistryDate: "2024-06-15" },
      residencePeriodMonthsAsset: "36",
    });
    await seedWizard(page, aSeed([asset], { isOneHousehold: true, householdHousingCount: "1" }));
    const respP = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST");
    const body = await calculate(page);
    expect(body.isOneHousehold).toBe(true);
    for (const k of ["donorSameHouseholdContinuous", "spouseGiftOneHouseAtGiftDate"]) expect(k in (body.carryoverGiftEvent as object), k).toBe(false);
    const json = await (await respP).json();
    expect(json.data?.result, JSON.stringify(json.error ?? {})).toBeTruthy();
    expect(json.data.result.splitDetail.carryoverEvent.oneHouseExclusion).toBe(true);
    expect(json.data.result.splitDetail.land.carryover.exclusionReason).toBe("one_house_exemption");
    await expect(page.getByTestId("split-carryover-land").first()).toHaveAttribute("data-judgment", "excluded");
  });

  test("모바일 375px: 토지 이월과세 카드가 가로 스크롤 없이 렌더된다", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 375, height: 800 });
    await seedWizard(page, aSeed());
    await expandAssetSection(page, 3);
    const card = page.getByTestId("land-carryover-card");
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeVisible();
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await card.screenshot({ path: "e2e/_artifacts/spco-a-mobile-card.png" });
  });
});
