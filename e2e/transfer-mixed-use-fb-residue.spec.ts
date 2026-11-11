/**
 * 겸용주택에 남은 가업상속공제(§97의2④) 입력 — ⑧이 해제를 요구하고, 토글로 끌 수 있다(2026-11-11 · 사용자 결정 a).
 * 종전에는 토글이 비활성이라 끌 수 없었고 ④가 값을 실어 함께 양도 파트 카드 세액이 바뀌었다
 * (route anchor `__tests__/api/transfer.route.mixed-use-fb-residue.anchor.test.ts`).
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { housing, seedWizard, singleSeed } from "./_helpers/split-acq-display";

const MSG = "겸용주택은 가업상속공제 의제취득가액(§97의2④)을 지원하지 않습니다";

test("MF-E1: 겸용 잔재 — 다음 단계에서 해제 요구 · 토글 OFF 후 안내가 사라진다", async ({ page }) => {
  test.setTimeout(180_000);
  await seedWizard(
    page,
    singleSeed([
      housing({
        isMixedUseHouse: true, residentialFloorArea: "100", nonResidentialFloorArea: "60", buildingFootprintArea: "100", mixedUseTotalLandArea: "200",
        mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
        mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000",
        mixedAcqHousingBuildingStdPrice: "50000000", mixedTransferHousingBuildingStdPrice: "100000000", mixedIsMetropolitanArea: false,
        inheritanceAssetKind: "house_individual", publishedValueAtInheritance: "600000000",
        acquisitionCause: "inheritance",
        acquisitionDate: "2022-10-01",
        inheritanceStartDate: "2022-10-01",
        decedentAcquisitionDate: "2015-01-01",
        familyBusinessInheritance: { decedentAcquisitionPrice: 100_000_000, inheritanceMarketValue: 600_000_000, fbDeductionAppliedRate: 1, inheritanceDate: "2022-10-01" },
      }),
    ]),
  );
  await expandAssetSection(page, 3);
  const sw = page.getByRole("switch", { name: /가업상속공제 적용 자산/ });
  await expect(sw).toBeChecked();
  await expect(sw).toBeEnabled();

  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByTestId("validation-issues")).toContainText(MSG);

  await sw.click();
  await expect(sw).not.toBeChecked();
  await expect(sw).toBeDisabled(); // 다시 켜지는 못한다(미지원 안내)
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByText(MSG)).toHaveCount(0);
});
