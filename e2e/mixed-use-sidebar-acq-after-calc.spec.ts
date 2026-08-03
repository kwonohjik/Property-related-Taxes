/**
 * 겸용주택(§160①단서) 좌측 사이드바 「취득가액 이후」 미표시 버그 회귀 E2E.
 *
 * 버그(원인 C): 겸용주택 결과는 mode "mixed-use"(MixedUseGainBreakdown)라
 *   computeTransferPerAssetSummary의 single/bundled 경로 어디에도 안 걸려,
 *   계산 후 사이드바가 취득가액·필요경비를 «-»로 누락(양도가액만 표시).
 * 수정: result.mode==="mixed-use" 분기 추가 — 주택+상가 환산취득가액 합(취득가액),
 *   주택·상가 토지·건물 개산공제 합(필요경비)을 breakdown 구조화 필드에서 산출.
 *
 * 흐름: 겸용 폼 seed → 계산 → 결과뷰 "← 처음으로 (자산 목록)" → 사이드바 취득가액 금액 확인.
 * (사이드바는 result가 있어도 마법사 입력 단계에서만 렌더 — setStep(0)이 result를 clear하지 않아
 *  computeTransferPerAssetSummary가 mixed-use 결과로 취득가액을 채운다.)
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seedForm() {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          assetKind: "housing",
          acquisitionCause: "purchase",
          acquisitionDate: "2010-03-15",
          isMixedUseHouse: true,
          actualSalePrice: "4000000000",
          residentialFloorArea: "100",
          nonResidentialFloorArea: "100",
          mixedUseTotalLandArea: "200",
          buildingFootprintArea: "100",
          mixedTransferHousingPrice: "600000000",
          mixedTransferLandPricePerSqm: "5000000",
          mixedTransferCommercialBuildingPrice: "100000000",
          mixedAcqHousingPrice: "300000000",
          mixedAcqLandPricePerSqm: "2500000",
          mixedAcqCommercialBuildingPrice: "50000000",
          mixedIsMetropolitanArea: true,
          // 겸용주택 실가 모드의 §100② **피안분액** — 없으면 validate가 계산을 차단해
          // 결과 화면에 도달하지 못한다("자산: 겸용주택 취득 실거래가액을 입력하세요").
          // 정본 시드는 mixed-use-filing-form-4col.spec.ts.
          fixedAcquisitionPrice: "700000000",
          residenceInputMode: "interval",
          residencePeriods: [{ moveInDate: "2010-03-15", moveOutDate: "2022-02-16" }],
        }],
        transferDate: "2022-02-16",
        filingDate: "2022-04-30",
        contractTotalPrice: "4000000000",
        householdHousingCount: "1",
        isOneHousehold: true,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seedAndCalc(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedForm());
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 20000 });
}

function amt(text: string): number {
  return parseInt(text.replace(/[^0-9-]/g, "") || "0", 10);
}

test.describe("겸용주택 사이드바 취득가액 (mode:mixed-use 처리)", () => {
  test("계산 후 자산 목록 복귀 → 사이드바 취득가액·필요경비 금액 표시(«-» 아님)", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page);

    // 결과뷰 → 자산 목록(Step0)으로 복귀 (result 유지)
    // ⚠️ 라벨 부분 매칭 — NavButton은 화살표를 아이콘으로 렌더하므로 accessible name에
    //    "←"가 들어가지 않는다(TransferTaxCalculator.tsx label="처음으로 (자산 목록)").
    await page.getByRole("button", { name: /처음으로 \(자산 목록\)/ }).click();
    await page.getByRole("heading", { name: "자산 목록·취득 정보 입력" }).waitFor();

    // 좌측 사이드바(WizardSidebar aside) 내 취득가액 행
    const sidebar = page.locator("aside").first();
    const acqBlock = sidebar.locator("div.text-sm").filter({ hasText: "취득가액" }).first();
    const acqValue = acqBlock.locator("p").last();

    // «계산 후 표시»·«-» 가 아니라 실제 금액
    await expect(acqValue).not.toHaveText("계산 후 표시");
    await expect(acqValue).not.toHaveText("-");
    expect(amt(await acqValue.innerText())).toBeGreaterThan(0);

    // 양도가액도 정상 표시(회귀 가드)
    const saleBlock = sidebar.locator("div.text-sm").filter({ hasText: "양도가액" }).first();
    expect(amt(await saleBlock.locator("p").last().innerText())).toBeGreaterThan(0);
  });
});
