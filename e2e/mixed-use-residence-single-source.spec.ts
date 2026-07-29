/**
 * 겸용주택 거주기간 단일 소스화 — 자산목록 ④ 거주 입력 위젯 제거 회귀 E2E.
 *
 * 계획서: docs/02-design/features/mixed-use-residence-single-source.plan.md
 * 변경: 자산목록 ④ 거주기간(mixedUseResidencePeriodYears, MixedUseResidencyInput) 제거
 *        → 거주기간은 보유상황(입주일·퇴거일) 단일 소스.
 *
 * 도출 정확성(보유상황 거주개월 → residencePeriodYears=floor(개월/12))은
 *   unit anchor(__tests__/lib/calc/mixed-use-residence-single-source.anchor.test.ts)가 실제 store→API 경로로 커버.
 *   residencePeriodYears → 표2는 엔진 테스트(mixed-use-house.test.ts)가 커버.
 * 여기서는 브라우저에서 ① 겸용 자산 카드에 ④ 거주 위젯이 사라졌고, ② 겸용 계산 흐름이 깨지지 않음을 확인.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

// 겸용주택(§97 직접환산) — mixed-use-filing-form-4col.spec.ts와 동일한 known-valid 시드.
function seedForm() {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          assetKind: "housing",
          acquisitionCause: "purchase",
          acquisitionDate: "2010-03-15",
          isOneHousehold: false,
          isMixedUseHouse: true,
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
        }],
        transferDate: "2026-02-16",
        filingDate: "2026-04-30",
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

async function seed(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => {
    sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s));
  }, seedForm());
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

test.describe("겸용주택 거주기간 단일 소스 — 자산목록 ④ 거주 위젯 제거", () => {
  test("겸용 자산 카드에 ④ 거주 위젯 없음 + 계산 흐름 무회귀", async ({ page }) => {
    test.setTimeout(60_000);
    await seed(page);

    // ① 겸용 확장 패널(isMixedUseHouse=true)이 열린 상태 — 제거된 ④ 위젯의 고유 배지 부재
    await expect(
      page.getByText("1세대1주택 비과세·표2 공제 판정에 사용", { exact: false }),
    ).toHaveCount(0);

    // ② 계산 흐름 무회귀 — 결과(신고서 양식) 정상 렌더
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 20000 });
    await expect(page.locator('[data-print-section="form-table"]').first()).toBeVisible();
  });
});
