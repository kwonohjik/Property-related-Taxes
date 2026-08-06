/**
 * E2E: §100③ 「구분 기재 가액이 안분가액과 30% 이상 차이 → 불분명 의제」 실플로우 (Phase 1-F).
 *
 * 계획서: `docs/02-design/features/general-building-sale-split-mode.plan.md` §12.11
 *
 * ## 무엇을 잡는가
 *
 * 엔진(E-1)·배관(E-2)·입력(⑤)·표시(U-9) anchor는 각 계층을 따로 검증한다. 이 spec은
 * **폼에 값이 있을 때 실제로 그 판정이 화면까지 도달하는가**를 한 번에 통과시킨다 — 어느
 * 계층이든 끊기면 여기서 드러난다.
 *
 * ## fixture — 계획서 §3.2 probe와 같은 자산
 *
 * 주택 15억 · 양도시 기준시가 토지 9억 / 건물 6억 ⇒ **안분값 9억 / 6억**.
 * 구분 기재를 **14억 / 1억**로 몰아주면 건물이 −83%로 벗어나 §100③이 발동한다.
 *
 * 대조군은 같은 자산에 **10억 / 5억**(이탈 11.1% · 16.7%)을 넣어 발동하지 않는 것을 본다 —
 * 「항상 뜨는 배너」가 아니라 **판정 결과**임을 그 대비가 증명한다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seedForm(landTransferPrice: string, buildingTransferPrice: string) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "housing",
            acquisitionCause: "purchase",
            // 토지·건물 취득일 분리 — 분리 축(§166⑥)이 활성화되는 조건
            hasSeperateLandAcquisitionDate: true,
            acquisitionDate: "2016-06-01",
            landAcquisitionDate: "2014-06-01",
            landAcqMode: "actual",
            buildingAcqMode: "actual",
            landAcquisitionPrice: "400000000",
            buildingAcquisitionPrice: "400000000",
            // 구분양도 — 이 축이 있어야 §100③ 비교가 성립한다
            saleSplitMode: "actual",
            landTransferPrice,
            buildingTransferPrice,
            // 양도시 기준시가 = 안분 basis (Phase 1-D부터 구분양도에서도 필수)
            landStandardPriceAtTransfer: "900000000",
            buildingStandardPriceAtTransfer: "600000000",
            actualSalePrice: "1500000000",
          },
        ],
        transferDate: "2024-06-01",
        filingDate: "2024-08-31",
        contractTotalPrice: "1500000000",
        householdHousingCount: "1",
        isOneHousehold: false,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seedAndCalc(page: Page, land: string, building: string) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(land, building),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 20_000 });
}

test.describe("§100③ 30% 의제 — 구분양도 실플로우 (Phase 1-F)", () => {
  test("토지 몰아주기(14억/1억) → 판정이 발동하고 안분가액이 적용된다", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page, "1400000000", "100000000");

    const block = page.getByTestId("sale-split-judgment");
    await expect(block).toBeVisible();
    await expect(block).toContainText("안분가액을 적용했습니다");
    // 적용 가액이 안분값(9억 / 6억)이다 — 구분 기재한 14억/1억이 아니다
    await expect(block).toContainText("900,000,000");
    await expect(block).toContainText("600,000,000");
    // 안분 basis를 밝힌다
    await expect(block).toContainText("양도시 기준시가");
  });

  test("적정범위(10억/5억) → 발동하지 않고 구분 기재 가액이 그대로 쓰인다", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page, "1000000000", "500000000");

    const block = page.getByTestId("sale-split-judgment");
    await expect(block).toBeVisible();
    // 「항상 뜨는 배너」가 아니라 판정 결과임을 이 대비가 증명한다
    await expect(block).toContainText("그대로 적용");
    await expect(block).not.toContainText("안분가액을 적용했습니다");
  });
});
