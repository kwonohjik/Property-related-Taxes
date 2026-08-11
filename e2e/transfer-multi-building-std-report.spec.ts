/**
 * E2E: 다건(multi) 결과뷰 — 「건물 기준시가 계산서」 출력
 *
 * ## 🔴 결함 (2026-08-11)
 *
 * 계산서 섹션(`BuildingStdPriceReportSection`)이 단건·겸용·상속·증여에만 배선돼 있었고,
 * 다건 결과뷰(`MultiTransferTaxResultView`)와 그 출력 레지스트리
 * (`lib/print/multi-transfer-print-sections.ts`)에는 leaf 자체가 없었다.
 * ⇒ 「건물 기준시가 계산」 모달로 스냅샷을 저장해도 다건에서는 화면·인쇄·PDF 어디에도
 *    나오지 않았다. (일반건물 bundled 뷰의 같은 결함은 PR #1203에서 해소)
 *
 * ## 판정 방식
 *
 * 스냅샷은 **실제 배치 모달이 저장하는 것과 같은 함수**(`phdBatchToSnapshots`)로 만들어 심는다.
 * 소속 판정은 스냅샷 키의 assetId가 건별 form의 자산 목록에 등장하는지로 이뤄지므로,
 * 시드 자산에 그 assetId를 넣는다.
 */
import { test, expect, type Page } from "@playwright/test";

import { putCalculationRecord } from "./_helpers/history-seed";
import { openHistoryModal } from "./_helpers/navigation";
import { phdBatchToSnapshots } from "../lib/calc/phd-batch-snapshots";

/** 스냅샷 소속 판정 대상 — 건1의 자산 id */
const ASSET_ID = "multi-bsp-asset-1";

function landAsset(assetId: string) {
  return {
    assetId,
    assetKind: "land",
    acquisitionDate: "2015-01-01",
    acquisitionArea: "1000",
    useEstimatedAcquisition: false,
    isAppraisalAcquisition: false,
    isSalesCaseAcquisition: false,
    fixedAcquisitionPrice: "400000000",
    directExpenses: "0",
    isNonBusinessLand: false,
    reductions: [],
  };
}

function propertyForm(assetId: string, price: string, transferDate: string) {
  return {
    assets: [landAsset(assetId)],
    transferDate,
    filingDate: "",
    contractTotalPrice: price,
    householdHousingCount: "1",
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isOneHousehold: false,
  };
}

const MULTI_RECORD = {
  id: "e2e-multi-bsp-report",
  userId: "local-user",
  taxType: "transfer",
  title: "다건 기준시가 계산서 (E2E)",
  inputData: {
    __multiTransfer: true,
    taxYear: 2026,
    properties: [
      { propertyId: "np1", propertyLabel: "건1", completionPercent: 100, form: propertyForm(ASSET_ID, "826000000", "2026-01-01") },
      { propertyId: "np2", propertyLabel: "건2", completionPercent: 100, form: propertyForm("multi-bsp-asset-2", "325000000", "2026-03-01") },
    ],
    activePropertyIndex: 0,
    activeStep: "settings",
    annualBasicDeductionUsed: "0",
    basicDeductionAllocation: "MAX_BENEFIT",
  },
  resultData: { determinedTax: 0, totalTax: 0, properties: [{ propertyId: "np1" }, { propertyId: "np2" }] },
  taxLawVersion: "2026",
  linkedCalculationId: null,
  clientId: null,
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

/** 「2시점 건물기준시가 일괄 계산」 적용 시 저장되는 것과 동일한 스냅샷 */
function seedSnapshots() {
  const snapshots = phdBatchToSnapshots(
    {
      building: {
        builtYear: 2010,
        parts: [{
          floorArea: 300,
          category: "housing",
          acquisition: { structureKey: "rc", usageNo: 2 },
          transfer: { structureKey: "rc", usageNo: 2 },
        }],
      },
      acquisition: { year: 2015, landPricePerM2: 2_000_000 },
      transfer: { year: 2026, landPricePerM2: 4_000_000 },
    },
    `bsp-${ASSET_ID}-gb`,
  );
  return { state: { snapshots }, version: 0 };
}

async function loadAndCalculate(page: Page) {
  await page.goto("/calc/transfer-tax/multi");
  // 스냅샷 스토어는 sessionStorage persist — 결과뷰가 재유도에 쓴다.
  // ⚠️ zustand persist 하이드레이션은 **스토어 생성 시 1회**다. 심은 뒤 reload하지 않으면
  //    메모리 스토어는 빈 채로 남아 계산서가 안 뜬다(실사용은 마법사에서 모달로 저장하므로 무관).
  await page.evaluate(
    (snaps) => sessionStorage.setItem("building-std-snapshots", JSON.stringify(snaps)),
    seedSnapshots(),
  );
  await page.reload();

  await openHistoryModal(
    page,
    page.getByTestId("multi-load-history-btn").first(),
    page.getByText("다건 기준시가 계산서 (E2E)"),
  );
  await page.getByTestId(`load-record-${MULTI_RECORD.id}`).click();

  const respPromise = page.waitForResponse(
    (r) => r.url().includes("/api/calc/transfer/multi") && r.request().method() === "POST",
    { timeout: 15000 },
  );
  await page.getByRole("button", { name: "세액 계산" }).click();
  expect((await respPromise).status()).toBe(200);
  await expect(page.getByText("건별 상세").first()).toBeVisible({ timeout: 15000 });
}

test.describe("다건 결과뷰 — 건물 기준시가 계산서", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/history");
    await putCalculationRecord(page, MULTI_RECORD);
  });

  test("🔑 계산서 서식이 렌더되고 출력 항목으로 선택할 수 있다", async ({ page }) => {
    test.setTimeout(120_000);
    await loadAndCalculate(page);

    // 출력 선택 패널에 leaf 노출 (레지스트리 + availablePrintIds 배선)
    await expect(page.getByTestId("print-selection-panel")).toBeVisible();
    await expect(page.getByLabel("건물 기준시가 계산서")).toBeVisible();

    // 국세청 서식 자체
    const section = page.locator('[data-print-id="building-std-report"]');
    await expect(section.getByTestId("nts-bsp-report").first()).toBeVisible({ timeout: 15000 });
  });
});
