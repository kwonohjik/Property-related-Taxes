/**
 * E2E — 주택 split 파트 이월과세(소득세법 §97의2) P4 B: 건물만 이월과세 + 토지 매매.
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.ui.design.md §5 · §9.2
 *
 * vitest는 폼 → ④ body를 함수로 만든다. 여기서는 **브라우저 폼**에서 새 키(`carryoverGiftEvent`·`buildingCarryoverPart`, 토지 overlay `purchase`)가 실제로 요청에 실리고,
 * 결과 4뷰가 건물 파트만 이월과세로 그리는지(토지는 매매 취득일 그대로) 본다.
 * 시드 수치는 엔진 anchor SPCO-T5와 같다 — 건물 증여 2023-03-01(증여 신고가액 4억) · 건물 증여자 2015-06-01 1억 · 증여세 산출 2천만 / 과세가액 4억 ·
 * 토지 매매 2008-01-01 1.2억 · 양도 12억(토지 7억 + 건물 5억) · 양도일 2025-06-30.
 *
 * 실행(워크트리): E2E_PORT=3274 npx playwright test e2e/transfer-split-part-carryover-b.spec.ts
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "../lib/stores/calc-wizard-asset-carryover";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { calculate, formRow, num, seedWizard, stmtText, stmtValue, won } from "./_helpers/split-acq-display";

type Over = Record<string, unknown>;

const CARRYOVER = {
  ...CARRYOVER_DEFAULTS,
  giftRegistryDate: "2023-03-01",
  donorRelation: "lineal",
  donorSameHousehold: "no", // P5 — 건물(주택)을 증여받은 B·C는 세대 사실이 필수 질문이다
  donorAcquisitionDate: "2015-06-01",
  donorAcquisitionPrice: "100000000",
  giftTaxCalculated: "20000000",
  giftTaxBase: "400000000",
};

const bAsset = (over: Over = {}): Over => ({
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
  carryover: { ...CARRYOVER },
  actualSalePrice: "1200000000",
  saleSplitMode: "actual",
  landTransferPrice: "700000000",
  buildingTransferPrice: "500000000",
  landStandardPriceAtTransfer: "700000000",
  buildingStandardPriceAtTransfer: "500000000",
  ...over,
});

/** 토글 OFF — 자산 전체 이월과세(증여자 취득일·가액 1벌 + 증여 당시 평가액). */
const offAsset = (over: Over = {}): Over =>
  bAsset({
    hasSeperateLandAcquisitionDate: false,
    landCauseHost: "",
    landAcquisitionCause: "",
    landAcquisitionDate: "",
    landAcqMode: "",
    buildingAcqMode: "",
    landAcquisitionPrice: "",
    buildingAcquisitionPrice: "",
    carryover: { ...CARRYOVER, giftTaxAmount: "20000000", giftDateValuation: "520000000", donorSameHousehold: "no" },
    ...over,
  });

const seed = (assets: Over[] = [bAsset()], formOver: Over = {}) => ({
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

const toggle = (p: Page) => p.getByTestId("land-part-cause-building-cause").getByRole("switch").first();

async function expectResult(page: Page, body: Record<string, unknown>) {
  expect(body.carryoverGiftEvent).toMatchObject({ giftRegistryDate: "2023-03-01", giftTaxCalculated: 20_000_000, giftTaxBase: 400_000_000, donorRelation: "lineal" });
  expect(body.buildingCarryoverPart).toEqual({ donorAcquisitionDate: "2015-06-01", donorAcquisitionPrice: 100_000_000 });
  expect(body.landAcquisitionCause).toBe("purchase");
  expect(body.acquisitionCause).toBe("carryover_gift");
  expect(body.acquisitionDate).toBe("2023-03-01");
  expect(body.landAcquisitionDate).toBe("2008-01-01");
  expect(body.isSeparateAcquisition).toBe(true);
  for (const k of ["landCarryoverPart", "carryoverTaxation", "landDecedentAcquisitionDate", "buildingSec164Value", "preHousingDisclosure"]) expect(k in body, k).toBe(false);

  // ⑦ 카드 — 건물만 이월과세 판정, 토지 카드 없음 · 원인 행
  await expect(page.getByTestId("split-carryover-card").first()).toBeVisible();
  await expect(page.getByTestId("split-carryover-building").first()).toHaveAttribute("data-judgment", "applied");
  await expect(page.getByTestId("split-carryover-land")).toHaveCount(0);
  await expect(page.getByTestId("split-card-lthd-start-building").first()).toContainText("2015-06-01");

  // ⑦ 신고서 — 합계 = 토지(1.2억) + 건물(증여자 취득가액 1억), 필요경비 = 건물 증여세 상당액 2천만, 취득일자 합계 = 증여 등기접수일 · 토지 = 매매일 · 건물 = 증여자 취득일
  const acqRow = await formRow(page, "취득가액");
  const expRow = await formRow(page, "필요경비");
  const gainRow = await formRow(page, "전체 양도차익");
  expect([num(acqRow[1]), num(acqRow[2]), num(acqRow[3])]).toEqual([220_000_000, 120_000_000, 100_000_000]);
  expect([num(expRow[1]), num(expRow[2]), num(expRow[3])]).toEqual([20_000_000, 0, 20_000_000]);
  expect(1_200_000_000 - num(acqRow[1]) - num(expRow[1])).toBe(num(gainRow[1]));
  const acqDate = await formRow(page, "취득일자");
  expect(acqDate.slice(1, 4).map((x) => x.split("\n")[0])).toEqual(["2023-03-01", "2008-01-01", "2015-06-01"]);

  // ⑦ 상세명세서 — 값 = 신고서 합계 · 건물 이월과세 태그
  expect(await stmtValue(page, "취득가액")).toBe(220_000_000);
  expect(await stmtValue(page, "필요경비")).toBe(20_000_000);
  expect(await stmtText(page, "취득가액")).toContain(`건물(이월과세 — 증여자 취득가액) ${won(100_000_000)}`);
}

test.describe("P4 B — 건물만 이월과세 + 토지 매매", () => {
  test("시드 → 패널 → 계산 → 요청 body 새 키 → 결과 4뷰", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed());
    await expandAssetSection(page, 3);
    await expect(toggle(page)).toBeChecked();
    await expect(page.getByTestId("building-carryover-card")).toBeVisible();
    // 자산 전체 이월과세 블록 칸은 없다
    await expect(page.locator('[data-field="carryover.giftDateValuation"]')).toHaveCount(0);
    await expect(page.getByTestId("carryover-donor-split-toggle")).toHaveCount(0);
    // 앵커 각 1개(⑧ 이동 불능 0)
    for (const key of [
      "carryover.giftRegistryDate", "carryover.donorAcquisitionDate", "carryover.donorAcquisitionPrice", "carryover.giftTaxBase",
      "carryover.giftTaxCalculated", "carryover.donorRelation", "landAcquisitionPrice", "buildingAcquisitionPrice", "landAcquisitionDate", "landAcquisitionCause",
    ]) {
      await expect(page.locator(`[data-field="${key}"]`), key).toHaveCount(1);
    }
    // 건물 취득일 칸 = 증여 등기접수일(읽기 전용) · 토지 취득일 칸은 입력 · 건물 고정 칩
    await expect(page.getByTestId("acq-date-building").locator('input[aria-label="연도"]')).toBeDisabled();
    await expect(page.getByTestId("acq-date-building").locator('input[aria-label="연도"]')).toHaveValue("2023");
    await expect(page.getByTestId("acq-date-land").locator('input[aria-label="연도"]')).toBeEnabled();
    await expect(page.getByTestId("building-carryover-date-note")).toHaveCount(1);
    await expect(page.getByTestId("part-acq-mode-building-fixed")).toContainText("이월과세 건물");
    // P5 — 건물이 증여받은 주택이라 «증여자와 같은 세대 여부»를 묻는다(건물 이월과세 카드 안 한 곳)
    await expect(page.locator('[data-field="carryover.donorSameHousehold"]')).toHaveCount(1);
    const body = await calculate(page);
    await expectResult(page, body);
  });

  test("UI 입력: 자산 전체 이월과세 → 토글 ON → 토지 칸 입력 → 계산 · 다시 OFF면 새 키 소멸(자산 전체 이월과세로)", async ({ page }) => {
    test.setTimeout(240_000);
    await seedWizard(page, seed([offAsset()]));
    await expandAssetSection(page, 3);
    await expect(toggle(page)).not.toBeChecked();
    await expect(page.locator('[data-field="carryover.giftDateValuation"]')).toHaveCount(1);
    await toggle(page).click();
    await expect(page.getByTestId("building-carryover-card")).toBeVisible();
    // ⑧ — 토지 칸이 빈 채 「다음」 → 건물 증여 신고가액 칸(파트 루프)부터 이동
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => !!(document.activeElement as HTMLElement | null)?.closest('[data-field="buildingAcquisitionPrice"]')))
      .toBe(true);
    await page.getByTestId("split-building-acq-price").fill("400000000");
    await fillDate(page.getByTestId("acq-date-land"), "2008-01-01");
    await page.getByTestId("split-land-acq-price").fill("120000000");
    const body = await calculate(page);
    await expectResult(page, body);

    // 다시 OFF — 파트 이월과세 키가 하나도 실리지 않고 자산 전체 이월과세(값 보존)로 계산된다
    await page.getByRole("button", { name: "자산 목록" }).first().click();
    await expandAssetSection(page, 3);
    await toggle(page).click();
    const body2 = await calculate(page);
    for (const k of ["carryoverGiftEvent", "buildingCarryoverPart", "landAcquisitionCause", "landAcquisitionDate"]) expect(k in body2, k).toBe(false);
    expect(body2.carryoverTaxation).toMatchObject({ giftRegistryDate: "2023-03-01", donorAcquisitionDate: "2015-06-01" });
  });

  test("P6 환산: 건물 토글 ON → 증여자 취득 당시 기준시가 입력 → 계산 → body 환산 키 → 결과 환산 산식 + §114조의2 확인 필요", async ({ page }) => {
    test.setTimeout(240_000);
    await seedWizard(page, seed([bAsset({ carryover: { ...CARRYOVER, donorAcquisitionPrice: "" } })]));
    await expandAssetSection(page, 3);
    await expect(page.locator('[data-field="carryover.partEstimated"]')).toHaveCount(1);
    await expect(page.locator('[data-field="carryover.donorStandardPriceAtAcquisition"]')).toHaveCount(0);
    await page.getByTestId("split-carryover-building-estimated").getByRole("switch").click();
    await expect(page.locator('[data-field="carryover.donorStandardPriceAtAcquisition"]')).toHaveCount(1);
    await expect(page.locator('[data-field="carryover.donorAcquisitionPrice"]')).toHaveCount(0);
    await expect(page.getByText("아직 지원하지 않")).toHaveCount(0);
    await page.getByTestId("split-carryover-building-donor-std-price").fill("40000000");
    const body = await calculate(page);
    expect(body.buildingCarryoverPart).toEqual({ donorAcquisitionDate: "2015-06-01", useEstimatedAcquisition: true, donorStandardPriceAtAcquisition: 40_000_000 });
    const est = page.getByTestId("split-carryover-building-estimated").first();
    await expect(est).toContainText("건물 양도가액 500,000,000");
    await expect(est).toContainText("증여자 취득 당시 기준시가 40,000,000");
    await expect(est).toContainText("양도 당시 기준시가 500,000,000");
    await expect(page.getByTestId("split-carryover-card").first()).toContainText("소득세법 §114조의2");
    // 신고서 — 취득가액 = 토지 실가 1.2억 + 건물 환산 4천만 · 필요경비 = 증여세 상당액 2천만 + 개산공제 120만
    const acqRow = await formRow(page, "취득가액");
    const expRow = await formRow(page, "필요경비");
    expect([num(acqRow[1]), num(acqRow[2]), num(acqRow[3])]).toEqual([160_000_000, 120_000_000, 40_000_000]);
    expect(num(expRow[1])).toBe(21_200_000);
    expect(await stmtText(page, "취득가액")).toContain("건물(이월과세 — 증여자 취득 당시 기준시가 환산)");
  });

  test("P5 1세대1주택 — 건물 증여 1년(증여자 2015 취득): 이월과세를 적용해야 비로소 비과세 → §97의2②2호로 건물 미적용 · 결과 카드 사유", async ({ page }) => {
    test.setTimeout(180_000);
    const gift = { ...CARRYOVER, giftRegistryDate: "2024-06-15" };
    // 주소(강남구)가 취득 당시 조정대상지역이라 거주 2년이 필요하다 — 거주 36개월(직접 입력). 「취득 당시」는 증여일(2024)로 판정한다(P5-Q5).
    await seedWizard(page, seed([bAsset({ carryover: gift, residencePeriodMonthsAsset: "36" })], { isOneHousehold: true, householdHousingCount: "1" }));
    const respP = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST");
    const body = await calculate(page);
    expect(body.isOneHousehold).toBe(true);
    expect(body.carryoverGiftEvent).toMatchObject({ giftRegistryDate: "2024-06-15", donorSameHouseholdContinuous: false });
    expect("spouseGiftOneHouseAtGiftDate" in (body.carryoverGiftEvent as object)).toBe(false);
    const json = await (await respP).json();
    expect(json.data?.result, JSON.stringify(json.error ?? {})).toBeTruthy();
    expect(json.data.result.splitDetail.carryoverEvent.oneHouseExclusion).toBe(true);
    expect(json.data.result.splitDetail.building.carryover.exclusionReason).toBe("one_house_exemption");
    await expect(page.getByTestId("split-carryover-building").first()).toHaveAttribute("data-judgment", "excluded");
    await expect(page.getByTestId("split-carryover-card").first()).toContainText("§97조의2 ② 2호");
  });

  test("모바일 375px: 건물 이월과세 카드가 가로 스크롤 없이 렌더된다", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 375, height: 800 });
    await seedWizard(page, seed());
    await expandAssetSection(page, 3);
    const card = page.getByTestId("building-carryover-card");
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeVisible();
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await card.screenshot({ path: "e2e/_artifacts/spco-b-mobile-card.png" });
  });
});
