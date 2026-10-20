/**
 * 겸용주택 일괄양도 — 양도가액 안분 기준(감정가액) · 상가건물 감가상각비 · 건물 귀속 양도비 UI E2E
 *
 * 계획서: docs/00-pm/mixed-use-sale-split-basis.plan.md §1(사례 p.772) · §4.4
 * 짝 anchor(vitest): __tests__/tax-engine/transfer-tax/mixed-use-sale-split-basis.anchor.test.ts ·
 *   __tests__/api/transfer.route.mixed-use-sale-split-basis.anchor.test.ts · __tests__/calc/mixed-use-sale-split-client.test.ts
 *
 * 시드는 sessionStorage 복원(`migrateAsset`)을 경유한다. 안분 방식·감정가액·감가상각비·철거비는 **화면에서 입력**한다(⑤→④ 경로 증명).
 *
 * worktree 실행: E2E_PORT=3120 npx playwright test e2e/mixed-use-sale-split-basis.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** 사례 p.772 — 주택 30㎡ · 상가 70㎡ 단층 · 부수토지 400㎡(도시지역 밖). 토지 2020-12-01 / 건물 2023-03-20 별개 취득 · 양쪽 실거래가. */
function caseAsset(over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(1),
    assetId: "sb1",
    addressJibun: "경기 테스트군 테스트면 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    isMixedUseHouse: true,
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: "2020-12-01",
    acquisitionDate: "2023-03-20",
    residentialFloorArea: "30",
    nonResidentialFloorArea: "70",
    mixedUseTotalLandArea: "400",
    buildingFootprintArea: "100",
    mixedZoneType: "agriculture_forest",
    mixedIsMetropolitanArea: false,
    mixedTransferHousingPrice: "57000000",
    mixedTransferLandPricePerSqm: "250000",
    mixedTransferCommercialBuildingPrice: "63000000",
    mixedTransferHousingBuildingStdPrice: "27000000",
    mixedAcqHousingPrice: "30000000",
    mixedAcqLandPricePerSqm: "100000",
    mixedAcqLandPricePerSqmAtBuildingAcq: "100000",
    mixedAcqCommercialBuildingPrice: "42000000",
    mixedAcqHousingBuildingStdPrice: "18000000",
    mixedAcqPerPartMode: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "50000000",
    buildingAcquisitionPrice: "70000000",
    actualSalePrice: "200000000",
    ...over,
  } as Record<string, unknown>;
}

function formOf(assets: Record<string, unknown>[]) {
  return {
    ...createDefaultTransferFormData(),
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    assets,
    transferDate: "2026-07-01",
    filingDate: "2026-09-30",
    contractTotalPrice: "200000000",
    householdHousingCount: "1",
    // 상가분 양도소득금액(52,137,000)은 주택분 비과세 여부와 무관하다 — 1세대 판정이 요구하는 거주 구간 입력을 피한다.
    isOneHousehold: false,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
  };
}

async function seedForm(page: Page, formData: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    { state: { formData, currentStep: 0, pendingMigration: false }, version: 0 },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}

async function setAmount(page: Page, testid: string, v: string) {
  const input = page.getByTestId(testid);
  await input.fill("");
  await input.fill(v);
}

interface MixedBody {
  landAppraisalAtTransfer?: number;
  buildingAppraisalAtTransfer?: number;
  landTransferPrice?: number;
  commercialBuildingDepreciation?: number;
  buildingDirectTransferExpense?: number;
}
async function calcAndCapture(page: Page): Promise<{ top: Record<string, unknown>; mixed: MixedBody }> {
  const reqPromise = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const req = await reqPromise;
  const body = req.postDataJSON() as Record<string, unknown> & { mixedUse?: MixedBody };
  return { top: body, mixed: body.mixedUse as MixedBody };
}

test.describe("겸용 일괄양도 — 감정가액 안분 · 감가상각 · 철거비 (사례 p.772)", () => {
  test("SB-E1 화면 입력 → 겸용 페이로드로만 전송 → 상가 양도소득금액 52,137,000", async ({ page }) => {
    test.setTimeout(180_000);
    await seedForm(page, formOf([caseAsset()]));

    // ② 양도 — 안분 방식(기본 = 기준시가) → 감정평가가액
    await expandAssetSection(page, 2);
    const mode = page.getByTestId("mixed-sale-split-mode");
    await expect(mode).toBeVisible();
    await mode.getByText("감정평가가액으로 안분").click();
    await setAmount(page, "sale-appraisal-land", "150000000");
    await setAmount(page, "sale-appraisal-building", "100000000");

    // ③ 취득 — 상가건물 감가상각비
    await expandAssetSection(page, 3);
    await setAmount(page, "depreciation-amount", "2250000");

    // ④ 필요경비 — 건물 귀속 양도비(철거비)
    await expandAssetSection(page, 4);
    await setAmount(page, "mixed-building-direct-transfer-expense", "1000000");

    const { top, mixed } = await calcAndCapture(page);
    expect(mixed.landAppraisalAtTransfer).toBe(150_000_000);
    expect(mixed.buildingAppraisalAtTransfer).toBe(100_000_000);
    expect(mixed.commercialBuildingDepreciation).toBe(2_250_000);
    expect(mixed.buildingDirectTransferExpense).toBe(1_000_000);
    // R-4 — 같은 폼 키가 최상위 split 페이로드로 새지 않는다(별개 취득이라 split 축이 활성인데도)
    expect(top.landAppraisalAtTransfer).toBeUndefined();
    expect(top.depreciationAmount).toBeUndefined();

    const result = page.getByTestId("mixed-sale-split-result");
    await expect(result).toBeVisible({ timeout: 30_000 });
    await expect(result).toContainText("56,000,000");
    await expect(result).toContainText("84,000,000");
    await expect(page.getByTestId("mixed-building-extras")).toContainText("2,250,000");
    await expect(page.getByText("52,137,000").first()).toBeVisible();
  });

  test("SB-E2 기준시가 모드(기본) — 안내만 있고 새 키를 보내지 않는다 · 결과는 종전 표", async ({ page }) => {
    test.setTimeout(150_000);
    await seedForm(page, formOf([caseAsset()]));
    await expandAssetSection(page, 2);
    await expect(page.getByTestId("mixed-sale-apportioned-note")).toBeVisible();
    const { mixed } = await calcAndCapture(page);
    expect(mixed.landAppraisalAtTransfer).toBeUndefined();
    expect(mixed.landTransferPrice).toBeUndefined();
    await expect(page.getByText("양도시 개별주택공시가격").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("mixed-sale-split-result")).toHaveCount(0);
  });

  test("SB-E3 감정가액 한쪽만 → ⑧ 차단(계산 요청 없음)", async ({ page }) => {
    test.setTimeout(150_000);
    await seedForm(page, formOf([caseAsset()]));
    await expandAssetSection(page, 2);
    await page.getByTestId("mixed-sale-split-mode").getByText("감정평가가액으로 안분").click();
    await setAmount(page, "sale-appraisal-land", "150000000");
    let posted = false;
    page.on("request", (r) => {
      if (r.url().includes("/api/calc/transfer") && r.method() === "POST") posted = true;
    });
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    await expect(page.getByText(/양쪽 모두 필요합니다/).first()).toBeVisible();
    expect(posted).toBe(false);
  });
});
