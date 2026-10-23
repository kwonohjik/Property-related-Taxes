/**
 * E2E: 공유지분 일반건물 §100③ — 계약서(100%) 금액으로 판정하고 결론만 지분에 적용.
 *
 * 계획서: `docs/00-pm/sale-split-100-3-share-scale-judgment.plan.md` (Q-1 a · Q-3 a) — PR-1(일반건물).
 * vitest anchor(`__tests__/components/gb-sale-split-contract-judgment.anchor.test.tsx`)가 판정·세액을, 이 spec이 실제 화면을 잡는다.
 *
 * 시료: 1/3 지분 · 계약서 토지 1,212,167,733 / 건물 387,832,267(총 16억). 100% 판정은 「불분명」인데 종전에는 지분 몫으로
 * 줄여 판정해 「30% 미만」이 됐다.
 *
 * 실행(워크트리): E2E_PORT=3128 npx playwright test e2e/gb-sale-split-contract-judgment.spec.ts
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const TOTAL = 1_600_000_000;
const LAND = 1_212_167_733;

function seed() {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "general_building",
            addressJibun: "서울 강남구 역삼동 1",
            gbAcqLandPricePerSqm: "1000000",
            gbAcqBuildingValue: "150000000",
            gbLandArea: "205",
            gbBuildingArea: "300",
            gbBuildingFootprintArea: "135",
            gbZoneType: "general_residential",
            gbTransferLandPricePerSqm: "5514000",
            gbTransferBuildingValue: "259072400",
            actualSalePrice: String(TOTAL),
            ownershipNumerator: "1",
            ownershipDenominator: "3",
            ownershipRemainderThirdParty: "yes",
            acquisitionCause: "purchase",
            gbBuildingAcquisitionCause: "purchase",
            hasSeperateLandAcquisitionDate: true,
            landAcquisitionDate: "2005-05-01",
            acquisitionDate: "2021-05-01",
            landAcqMode: "actual",
            buildingAcqMode: "actual",
            landAcquisitionPrice: "400000000",
            buildingAcquisitionPrice: "200000000",
            saleSplitMode: "actual",
            landTransferPrice: String(LAND),
            buildingTransferPrice: String(TOTAL - LAND),
          },
        ],
        transferDate: "2026-02-16",
        filingDate: "2026-05-31",
        contractTotalPrice: String(TOTAL),
        householdHousingCount: "0",
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

test("SSJ-1: 1/3 지분 · 계약서 정확히 30% 근처 → 판정 표는 계약서 금액 · 「불분명」 · 「지분 33.33% 적용 가액」 행", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seed());
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const calc = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await calc;
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()} ${await resp.text()}`).toBe(true);

  const block = page.getByTestId("sale-split-judgment");
  await expect(block).toBeVisible({ timeout: 15_000 });
  await expect(block).toContainText("구분 기재 가액을 인정하지 않고 안분가액을 적용했습니다");
  await expect(block).toContainText(LAND.toLocaleString("ko-KR"));
  await expect(block).toContainText((TOTAL - LAND).toLocaleString("ko-KR"));
  await expect(block).toContainText("지분 33.33% 적용 가액");
});
