/**
 * 함께 양도 컴패니언 주택 — 자기 소재지로 조정대상지역을 판정해 보낸다(주 자산 값 복사 금지).
 * 계획서 `docs/00-pm/regulated-companion-house-address.plan.md` (Q-1 b). 유닛: `__tests__/calc/companion-house-regulated-own-address.anchor.test.ts`.
 *
 * 비1세대 · 주 자산 포항(비규제) + 컴패니언 마포(규제) — 같은 날 양도 차단이 막지 못하던 경우. 종전에는 컴패니언도 일반 누진(175,740,000)이었다.
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { seedWithDeclaredRoster } from "./_helpers/roster-for-declared-count";

const house = (n: number, addr: string) => ({
  ...makeDefaultAsset(n),
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2018-06-01",
  fixedAcquisitionPrice: "300000000",
  actualSalePrice: "900000000",
  standardPriceAtTransfer: "500000000",
  addressJibun: addr,
  regionCode: "",
  residenceInputMode: "direct",
  residencePeriodMonthsAsset: "0",
  buildingFootprintArea: "100",
  appurtenantLandZone: "metropolitan_residential",
  isUrbanArea: true,
});

test("[RC-1] ★ 비1세대 · 주 자산 포항 + 컴패니언 마포 → 컴패니언 본문에 자기 소재지 값(양도 당시·취득 당시 조정)", async ({ page }) => {
  test.setTimeout(150_000);
  const seed = {
    state: {
      formData: {
        assets: [house(1, "경상북도 포항시 북구 테스트동 1"), house(2, "서울특별시 마포구 테스트동 1-1")],
        transferDate: "2026-06-01",
        contractTotalPrice: "1800000000",
        isOneHousehold: false,
        householdHousingCount: "2",
        householdNoOtherHousesConfirmed: true,
        householdNoPresaleRightsConfirmed: true,
        residencePeriodMonths: "0",
        houses: [],
        presaleRights: [],
      },
      pendingMigration: false,
    },
    version: 0,
  };
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedWithDeclaredRoster(seed));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  for (const step of ["감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  const response = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const res = await response;
  expect(res.status()).toBe(200);
  const body = res.request().postDataJSON() as {
    isRegulatedArea?: boolean;
    companionAssets?: { isRegulatedArea?: boolean; wasRegulatedAtAcquisition?: boolean }[];
  };
  expect(body.isRegulatedArea).toBe(false);
  expect(body.companionAssets?.[0]).toMatchObject({ isRegulatedArea: true, wasRegulatedAtAcquisition: true });
  await expect(page.getByText("결정세액").first()).toBeVisible({ timeout: 30_000 });
});
