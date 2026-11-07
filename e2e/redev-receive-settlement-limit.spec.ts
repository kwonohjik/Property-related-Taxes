/**
 * E2E: 수령 청산금 상한 — 평가액(지분이면 그 지분 해당액) 이상이면 화면이 막고, 고치면 계산된다. 계획서 `docs/00-pm/redev-receive-settlement-limit.plan.md`.
 * 시료: 양도가액 30억 · 평가액 9억 · 종전 부동산 실지 3억.
 *
 *   RE-1. 입주권 단독 수령 10억: 차단 · POST 없음 → 8억으로 고치면 200 · 2,966,666,666
 *   RE-2. 축 A 50% 수령 5억(전체 평가액 미만 · 지분 평가액 4.5억 초과): 차단
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { seedWithDeclaredRoster } from "./_helpers/roster-for-declared-count";

const asset = (over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 9-9", assetKind: "right_to_move_in", redevSubject: "right",
  isSuccessorRightToMoveIn: false, redevIsSuccessorMember: "", acquisitionCause: "purchase", acquisitionDate: "2010-03-01",
  redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-05-01", redevOriginalAssetType: "housing", redevRightsValue: "900000000",
  redevSettlementDirection: "receive", redevSettlementAmount: "1000000000", redevPreApprovalExpenses: "0", useEstimatedAcquisition: false, redevActualAcquisitionPrice: "300000000",
  actualSalePrice: "3000000000", fixedAcquisitionPrice: "", ...over,
});
const LIMIT = /수령 청산금은 권리가액\(지분이면 권리가액의 지분 해당액\)보다 작아야 합니다/;

async function seed(page: Page, assets: unknown[]) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedWithDeclaredRoster({
    state: {
      formData: {
        assets, transferDate: "2024-06-01", filingDate: "2024-08-31", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false,
        householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  }));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  for (const n of [1, 2, 3] as const) if ((await page.locator(`[data-asset-card-index="0"] [data-asset-section="${n}"]`).count()) > 0) await expandAssetSection(page, n, 0);
}
const STEPS = ["보유 상황", "감면·공제", "가산세"];
async function clickToCalc(page: Page) {
  for (const step of STEPS) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
}
const settlementField = (page: Page) => page.locator('[data-asset-card-index="0"] [data-field="redevSettlementAmount"]');

test.describe("수령 청산금 상한", () => {
  test.setTimeout(240_000);

  test("RE-1: 단독 수령 10억 차단 → 8억으로 고치면 200 · 2,966,666,666", async ({ page }) => {
    let posts = 0;
    page.on("request", (r) => { if (r.url().includes("/api/calc/transfer") && r.method() === "POST") posts += 1; });
    await seed(page, [asset()]);
    await clickToCalc(page);
    await expect(page.getByText(LIMIT).first()).toBeVisible({ timeout: 20_000 });
    expect(posts).toBe(0);

    const input = settlementField(page).locator("input");
    // 사용자처럼 전체 선택 후 덮어쓴다 — 표시값이 콤마 서식이라 fill은 기존 값 뒤에 붙는다.
    await input.click();
    await input.press("ControlOrMeta+a");
    await input.pressSequentially("800000000");
    await expect(input).toHaveValue(/^800,?000,?000$/);
    await input.blur();
    const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
    await clickToCalc(page);
    const r = await res;
    expect(r.status(), await r.text()).toBe(200);
    expect((await r.json()).data.result.transferGain).toBe(2_966_666_666);
    await expect(page.locator("body")).toContainText("2,966,666,666");
  });

  test("RE-2: 축 A 50% 수령 5억 — 지분 평가액 초과는 전체 평가액 미만이어도 차단", async ({ page }) => {
    await seed(page, [asset({ ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes", redevSettlementAmount: "500000000" })]);
    await expect(settlementField(page)).toContainText("청산금 수령액 (지분 해당분)");
    await clickToCalc(page);
    await expect(page.getByText(LIMIT).first()).toBeVisible({ timeout: 20_000 });
  });
});
