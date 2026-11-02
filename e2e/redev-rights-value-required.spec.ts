/**
 * E2E: 권리가액 필수 — 토지 출자도 권리가액을 비우면 화면이 막고, 채우면 계산된다. 계획서 `docs/00-pm/redev-receive-settlement-limit.plan.md` §6.
 * 시료: 토지 출자 완공 아파트 · 양도가액 30억 · 종전 토지 실지 3억 · 납부 청산금 0.
 *
 *   RV-E1. 권리가액 비움: 차단 · POST 없음(수정 전 −300,000,000 · 세액 0으로 통과) → 9억 입력 시 200 · 2,700,000,000
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const asset = {
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 9-9", assetKind: "redevelopment_apt", redevSubject: "apt",
  isSuccessorRightToMoveIn: false, redevIsSuccessorMember: "", acquisitionCause: "purchase", acquisitionDate: "2010-03-01",
  redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-05-01", redevCompletionDate: "2023-06-01", redevOriginalAssetType: "land", redevRightsValue: "",
  redevSettlementDirection: "pay", redevSettlementAmount: "0", redevPreApprovalExpenses: "0", redevReceiveOnlyMode: "no", useEstimatedAcquisition: false, redevActualAcquisitionPrice: "300000000",
  actualSalePrice: "3000000000", standardPriceAtTransfer: "1000000000", fixedAcquisitionPrice: "",
};
const REQUIRED = /권리가액을 입력하세요\. 관리처분계획에서 정한 종전 부동산 평가액입니다/;

async function seed(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), {
    state: {
      formData: {
        assets: [asset], transferDate: "2024-06-01", filingDate: "2024-08-31", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false,
        householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  for (const n of [1, 2, 3] as const) if ((await page.locator(`[data-asset-card-index="0"] [data-asset-section="${n}"]`).count()) > 0) await expandAssetSection(page, n, 0);
}
const STEPS = ["보유 상황", "감면·공제", "가산세"];
async function clickToCalc(page: Page) {
  for (const step of STEPS) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
}

test.describe("권리가액 필수", () => {
  test.setTimeout(240_000);

  test("RV-E1: 토지 출자 완공 권리가액 비움 차단 → 9억 입력 시 200 · 2,700,000,000", async ({ page }) => {
    let posts = 0;
    page.on("request", (r) => { if (r.url().includes("/api/calc/transfer") && r.method() === "POST") posts += 1; });
    await seed(page);
    await clickToCalc(page);
    await expect(page.getByText(REQUIRED).first()).toBeVisible({ timeout: 20_000 });
    expect(posts).toBe(0);

    const input = page.locator('[data-asset-card-index="0"] [data-field="redevRightsValue"] input');
    await input.click();
    await input.press("ControlOrMeta+a");
    await input.pressSequentially("900000000");
    await expect(input).toHaveValue(/^900,?000,?000$/);
    await input.blur();
    const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
    await clickToCalc(page);
    const r = await res;
    expect(r.status(), await r.text()).toBe(200);
    expect((await r.json()).data.result.transferGain).toBe(2_700_000_000);
    await expect(page.locator("body")).toContainText("2,700,000,000");
  });
});
