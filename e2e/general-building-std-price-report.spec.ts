/**
 * E2E: 일반건물(bundled) 결과뷰 — 「건물 기준시가 계산서」 출력
 *
 * ## 🔴 결함 (2026-08-11 사용자 제보)
 *
 * 일반건물은 토지·건물 카드로 분해돼 **`mode: "bundled"`** 결과(`BundledAllocationCard`)로
 * 렌더된다. 그런데 계산서 섹션(`BuildingStdPriceReportSection`)은 단건(`TransferTaxResultView`)·
 * 겸용·상속·증여 뷰에만 배선돼 있어, **일반건물에서는 화면·인쇄·PDF 어디에도 나오지 않았다**
 * (「2시점 건물기준시가 일괄 계산」으로 스냅샷이 저장돼 있어도 마찬가지).
 *
 * ## 판정 방식
 *
 * 스냅샷을 **실제 배치 모달이 저장하는 것과 같은 함수**(`phdBatchToSnapshots`)로 만들어 심고,
 * 계산까지 진행해 국세청 서식(`nts-bsp-report`)이 렌더되는지 본다.
 * 「없음」이 아니라 「있음」을 단언하므로 대상이 다른 이유로 사라져도 통과하지 않는다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { phdBatchToSnapshots } from "../lib/calc/phd-batch-snapshots";

const ASSET_ID = "gb-std-report-asset";

/** 사용자 사례 — 신축(자가건축) · 토지 2008 취득 · 건물 2022 취득 · 양쪽 환산 */
function seedForm() {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          assetId: ASSET_ID,
          assetKind: "general_building",
          acquisitionCause: "purchase",
          gbBuildingAcquisitionCause: "self_built",
          hasSeperateLandAcquisitionDate: true,
          landAcquisitionDate: "2008-03-17",
          acquisitionDate: "2022-03-31",
          landAcqMode: "estimated",
          buildingAcqMode: "estimated",
          useEstimatedAcquisition: true,
          gbLandArea: "200",
          gbBuildingArea: "300",
          gbBuildingFootprintArea: "150",
          gbAcqLandPricePerSqm: "3000000",
          gbTransferLandPricePerSqm: "5000000",
          gbAcqBuildingValue: "150000000",
          gbTransferBuildingValue: "250000000",
          gbZoneType: "commercial",
          actualSalePrice: "1620000000",
        }],
        transferDate: "2026-02-19",
        filingDate: "2026-04-30",
        contractTotalPrice: "1620000000",
        householdHousingCount: "1",
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

/** 배치 모달이 「적용」 시 저장하는 것과 동일한 스냅샷 (prefix = `bsp-{assetId}-gb`) */
function seedSnapshots() {
  const snapshots = phdBatchToSnapshots(
    {
      building: {
        builtYear: 2022,
        parts: [{
          floorArea: 300,
          category: "housing",
          acquisition: { structureKey: "rc", usageNo: 2 },
          transfer: { structureKey: "rc", usageNo: 2 },
        }],
      },
      acquisition: { year: 2022, landPricePerM2: 3_000_000 },
      transfer: { year: 2026, landPricePerM2: 5_000_000 },
    },
    `bsp-${ASSET_ID}-gb`,
  );
  return { state: { snapshots }, version: 0 };
}

async function seed(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    ([form, snaps]) => {
      sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(form));
      sessionStorage.setItem("building-std-snapshots", JSON.stringify(snaps));
    },
    [seedForm(), seedSnapshots()] as const,
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

test.describe("일반건물 결과뷰 — 건물 기준시가 계산서", () => {
  test("🔴 계산서 서식이 결과 화면에 렌더된다 (bundled 모드)", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page);

    // 시드 상태에서 마지막 단계까지 이동 후 계산
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: /다음/ }).first().click();
      await page.waitForTimeout(300);
    }
    await page.getByRole("button", { name: /계산하기|계산 실행|세금 계산/ }).first().click();

    // 결과 도착 — 신고서 양식(자산-분할)이 뜨는 bundled 뷰
    await expect(page.getByText("신고서 양식").first()).toBeVisible({ timeout: 30_000 });

    // 🔑 국세청 「건물 기준시가 계산서」 서식
    await expect(page.getByTestId("nts-bsp-report").first()).toBeVisible();

    // 🔑 출력 항목 선택 패널 — bundled 뷰에는 패널 자체가 없어 인쇄·PDF를 고를 수 없었다
    await expect(page.getByTestId("print-selection-panel")).toBeVisible();
    await expect(page.getByLabel("건물 기준시가 계산서")).toBeVisible();
    await expect(page.getByTestId("print-selected-button")).toBeVisible();

    // 🔑 같은 화면의 신고서 양식 — 토지 열 취득일자가 **토지 취득일**이어야 한다
    //    (종전에는 건물 취득일 2022-03-31이 토지 열에도 찍혔다.
    //     단위 anchor: __tests__/components/gb-filing-form-land-acq-date.anchor.test.ts)
    await expect(page.getByText("2008-03-17").first()).toBeVisible();
  });
});
