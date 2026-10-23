/**
 * E2E: 공유지분 주택 구분양도 §100③ — 계약서(100%) 금액으로 판정하고 결론만 지분에 적용.
 *
 * 계획서: `docs/00-pm/sale-split-100-3-share-scale-judgment.plan.md` PR-2 (Q-1 a · Q-3 a).
 * vitest anchor(`__tests__/calc/split-sale-split-contract-judgment.anchor.test.ts`)가 판정·세액을, 이 spec이 실제 화면을 잡는다.
 *
 * 시료: 1/3 지분 · 총 15억 · 양도시 기준시가 토지 10억 / 건물 5억 · 계약서 토지 8.5억 / 건물 6.5억 — 건물 정확히 +30%.
 * 100% 판정은 「불분명」인데 종전에는 지분 몫으로 줄여 판정해 「30% 미만」이 됐다.
 *
 * 실행(워크트리): E2E_PORT=3128 npx playwright test e2e/split-sale-split-contract-judgment.spec.ts
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const TOTAL = 1_500_000_000;

function seed() {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "housing",
            addressJibun: "서울 강남구 역삼동 9",
            acquisitionCause: "purchase",
            hasSeperateLandAcquisitionDate: true,
            landAcquisitionDate: "2003-05-01",
            acquisitionDate: "2024-03-01",
            landAcqMode: "actual",
            buildingAcqMode: "actual",
            landAcquisitionPrice: "300000000",
            buildingAcquisitionPrice: "200000000",
            fixedAcquisitionPrice: "200000000",
            landStandardPriceAtTransfer: "1000000000",
            buildingStandardPriceAtTransfer: "500000000",
            actualSalePrice: String(TOTAL),
            saleSplitMode: "actual",
            landTransferPrice: "850000000",
            buildingTransferPrice: "650000000",
            ownershipNumerator: "1",
            ownershipDenominator: "3",
            ownershipRemainderThirdParty: "yes",
          },
        ],
        transferDate: "2026-02-16",
        filingDate: "2026-05-31",
        contractTotalPrice: String(TOTAL),
        householdHousingCount: "1",
        // ⑧ 보유 상황 — 다른 주택·분양권 없음 확정(`transfer-tax-validate-step1.ts`).
        householdNoOtherHousesConfirmed: true,
        householdNoPresaleRightsConfirmed: true,
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

test("SSJ-2: 주택 구분양도 1/3 지분 · 계약서 정확히 +30% → 「불분명」 · 판정 표는 계약서 금액 · 「지분 33.33% 적용 가액」 행", async ({ page }) => {
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
  await expect(block).toContainText("850,000,000");
  await expect(block).toContainText("650,000,000");
  await expect(block).toContainText("지분 33.33% 적용 가액");
});
