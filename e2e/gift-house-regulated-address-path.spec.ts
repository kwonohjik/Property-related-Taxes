/**
 * 증여받은 주택 × 조정대상지역 — 법정동코드 없이 주소 문자열만 있어도 코드 경로와 같은 세대 사실 규칙으로 판정한다.
 * 계획서 `docs/00-pm/gift-house-regulated-address-path.plan.md` (Q-1~Q-3 a). 유닛: `__tests__/calc/gift-house-regulated-address-path.anchor.test.tsx`.
 *
 * 같은 세대 계속 · 세대 보유 시작일 2023-06-01(마포 미지정) · 증여 2025-11-01(지정) — 코드 경로는 「둘 다 지정 중일 때만」이라 해당 없음(비과세).
 * 종전 주소 경로는 증여일 하나만 봐 해당(과세 460,075,000)이었다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const HOUSE = {
  assetKind: "housing",
  acquisitionCause: "gift",
  acquisitionDate: "2025-11-01",
  donorAcquisitionDate: "2010-01-01",
  giftDonorRelation: "lineal",
  giftSameHousehold: "yes",
  giftHouseholdHoldingStartDate: "2023-06-01",
  fixedAcquisitionPrice: "300000000",
  actualSalePrice: "900000000",
  regionCode: "",
  residenceInputMode: "direct",
  residencePeriodMonthsAsset: "0",
  buildingFootprintArea: "100",
  appurtenantLandZone: "metropolitan_residential",
  isUrbanArea: true,
  standardPriceAtTransfer: "600000000",
};

async function seed(page: Page, address: string) {
  const state = {
    state: {
      formData: {
        assets: [{ ...makeDefaultAsset(1), ...HOUSE, addressJibun: address }],
        transferDate: "2026-06-01",
        contractTotalPrice: "900000000",
        isOneHousehold: true,
        householdHousingCount: "1",
        householdNoOtherHousesConfirmed: true,
        householdNoPresaleRightsConfirmed: true,
        residencePeriodMonths: "0",
        houses: [],
        presaleRights: [],
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), state);
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

async function calc(page: Page) {
  for (const step of ["감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  const response = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const res = await response;
  expect(res.status()).toBe(200);
  return res.request().postDataJSON() as { wasRegulatedAtAcquisition?: boolean };
}

test("[RA-5] ★ 마포 주소 문자열 · 보유 상황 미방문 → 취득 당시 「아님」으로 계산(코드 경로와 같다)", async ({ page }) => {
  test.setTimeout(150_000);
  await seed(page, "서울특별시 마포구 테스트동 1-1");
  const body = await calc(page);
  expect(body.wasRegulatedAtAcquisition).toBe(false);
  await expect(page.getByText("결정세액").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("regulated-area-assumption-line")).toHaveCount(0);
});

test("[RA-6] 보유 상황을 열면 토글·안내 줄이 결론을 정한 날(세대 보유 시작일)을 보인다", async ({ page }) => {
  test.setTimeout(150_000);
  await seed(page, "서울특별시 마포구 테스트동 1-1");
  await page.getByRole("button", { name: "보유 상황" }).first().click();
  const was = page.getByTestId("transfer-was-regulated").getByRole("switch");
  await expect(was).toHaveAttribute("aria-checked", "false", { timeout: 30_000 });
  await expect(page.getByText("세대 보유 시작일(2023-06-01)")).toBeVisible();
});
