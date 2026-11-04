/**
 * 겸용주택 · 동일세대 상속 — 화면에서 「상속개시 당시 피상속인과 동일세대」를 켜고 보유 개시일을 넣으면
 * 요청 body에 실리고 결과가 비과세다(`docs/00-pm/mixed-use-inherit-same-household-holding.plan.md` V-6).
 * 세액·경계는 anchor(`__tests__/calc/mixed-use-inherit-same-household-holding.anchor.test.tsx`)가 고정한다.
 * 종전: 같은 입력이 「건물 보유기간 0년 11개월 … 주택분도 과세」(173,866,000 — mock 세율 anchor).
 */
import { test, expect } from "@playwright/test";
import { gotoTransferHoldingsStep } from "./_helpers/transfer-seed";
import { withMixedHousingStd } from "./_helpers/mixed-housing-std-seed";

const NC = "4682025021";

test("[MIH-1] ★ 겸용 · 동일세대 상속 — 화면 입력이 body에 실리고 결과가 비과세", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoTransferHoldingsStep(page, {
    houses: [],
    assetOver: withMixedHousingStd({
      addressJibun: "경상남도 고성군 테스트리 1",
      regionCode: NC,
      acquisitionCause: "inheritance",
      acquisitionDate: "2022-10-01",
      inheritanceStartDate: "2022-10-01",
      inheritanceAssetKind: "house_individual",
      decedentAcquisitionDate: "2015-01-01",
      decedentSameHouseholdBeforeInheritance: false,
      actualSalePrice: "1000000000",
      fixedAcquisitionPrice: "600000000",
      publishedValueAtInheritance: "600000000",
      isMixedUseHouse: true,
      residentialFloorArea: "100",
      nonResidentialFloorArea: "60",
      mixedUseTotalLandArea: "200",
      buildingFootprintArea: "100",
      mixedTransferHousingPrice: "600000000",
      mixedTransferLandPricePerSqm: "5000000",
      mixedTransferCommercialBuildingPrice: "100000000",
      mixedAcqHousingPrice: "300000000",
      mixedAcqLandPricePerSqm: "2500000",
      mixedAcqCommercialBuildingPrice: "50000000",
      mixedIsMetropolitanArea: true,
    }),
    formOver: { transferDate: "2023-09-18", filingDate: "2023-11-30", contractTotalPrice: "1000000000" },
  });

  // ① 자산 목록으로 돌아가 동일세대 카드를 켜고 보유 개시일을 넣는다(⑤ 화면 입력 경로).
  await page.getByRole("button", { name: "자산 목록" }).first().click();
  // ③ 취득정보 섹션은 접혀 있다 — 펼친다.
  await page.getByRole("button", { name: /^취득정보/ }).first().click();
  const toggle = page.getByRole("switch", { name: /상속개시 당시 피상속인과 동일세대/ });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(toggle).toBeChecked();
  // DateInput은 연·월·일 세 칸이다.
  const start = page.locator('[data-field="decedentCohabitationHoldingStartDate"]');
  await start.getByLabel("연도", { exact: true }).fill("2015");
  await start.getByLabel("월", { exact: true }).fill("01");
  await start.getByLabel("일", { exact: true }).fill("01");
  await start.getByLabel("일", { exact: true }).press("Tab");

  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const response = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const res = await response;
  expect(res.ok(), `계산 API 비정상 응답 ${res.status()}`).toBe(true);

  // ② body — 통산 사실이 실린다(④⑬).
  const body = res.request().postDataJSON() as Record<string, unknown>;
  expect(body.propertyType).toBe("mixed-use-house");
  expect(body.decedentSameHouseholdBeforeInheritance).toBe(true);
  expect(body.decedentCohabitationHoldingStartDate).toBe("2015-01-01");

  // ③ 결과 — 주택분 비과세 · 종전 과세 사유 문장이 없다.
  const { result } = ((await res.json()) as { data: { result: { housingPart?: { isExempt: boolean } } } }).data;
  expect(result.housingPart?.isExempt).toBe(true);
  await expect(page.getByText(/상가 부분까지 1세대1주택 비과세입니다/).first()).toBeVisible();
  await expect(page.getByText(/미충족으로 주택분도 과세됩니다/)).toHaveCount(0);
});
