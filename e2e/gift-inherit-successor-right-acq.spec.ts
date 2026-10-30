/**
 * E2E: 증여·상속 승계 입주권(이월과세·부담부증여 아님)의 취득가액 축 — 계획서 `docs/02-design/features/successor-right-carryover-contribution.plan.md` Q-2 (a).
 *
 * 시료: 승계 입주권(관리처분 인가 2020-01-10) · 상속개시일·증여일 2023-06-01 · 평가액 300,000,000 · 양도 2026-02-16 · 1,300,000,000.
 *
 *   GI-E1. 상속 · 승계취득가액 빈칸 — 계산된다 · ④ 취득가액 = 상속개시일 평가액 300,000,000(종전 「승계취득가액을 입력하세요」)
 *   GI-E2. ⑤ — 증여는 산정 방식·승계취득가액 칸 대신 §163⑨ 안내(매매는 칸이 있다)
 *   GI-E3. 증여 · 추가분담금 50,000,000 — ⑧이 막는다(종전 조용히 빠져 세액 불변)
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const succ = (over: Record<string, unknown>) => ({
  ...makeDefaultAsset(1),
  addressJibun: "서울 강남구 테스트동 3-1", assetKind: "right_to_move_in", redevSubject: "right", redevOriginalAssetType: "housing", redevApprovalLawBasis: "urban_renovation_art_74",
  fixedSalePrice: "1,300,000,000", actualSalePrice: "1,300,000,000", transferType: "regular",
  isSuccessorRightToMoveIn: true, redevApprovalDate: "2020-01-10", successorRightAcqPrice: "", successorRightAddedContribution: "",
  ...over,
});
const GIFT = { acquisitionCause: "gift", acquisitionDate: "2023-06-01", donorAcquisitionDate: "2021-01-01", fixedAcquisitionPrice: "300000000" };
const INH = { acquisitionCause: "inheritance", acquisitionDate: "2023-06-01", inheritanceStartDate: "2023-06-01", decedentAcquisitionDate: "2021-01-01", publishedValueAtInheritance: "300000000" };

async function seed(page: Page, assets: unknown[]) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          assets, contractTotalPrice: "1300000000", transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false,
          householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
        },
        pendingMigration: false,
      },
      version: 0,
    },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

test("GI-E1: 상속 · 승계취득가액 빈칸 — 계산된다 · 취득가액 = 상속개시일 평가액", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, [succ(INH)]);
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const r = await res;
  expect(r.status(), await r.text()).toBe(200);
  const body = r.request().postDataJSON();
  expect(body.acquisitionPrice).toBe(300_000_000);
});

test("GI-E2: 증여는 산정 방식·승계취득가액 칸 대신 §163⑨ 안내 — 매매는 칸이 있다", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, [succ(GIFT)]);
  await page.getByRole("button", { name: /3\s*취득/ }).first().click();
  await expect(page.getByTestId("deemed-successor-right-note")).toBeVisible();
  await expect(page.locator('[data-field="successorRightAcqPrice"]')).toHaveCount(0);
  await expect(page.locator('input[type="radio"][name^="successorAcqMode-"]')).toHaveCount(0);
  await expect(page.locator('[data-field="successorRightAddedContribution"]')).toHaveCount(1);
  await seed(page, [succ({ acquisitionCause: "purchase", acquisitionDate: "2023-06-01", successorRightAcqPrice: "300000000" })]);
  await page.getByRole("button", { name: /3\s*취득/ }).first().click();
  await expect(page.locator('[data-field="successorRightAcqPrice"]')).toHaveCount(1);
  await expect(page.locator('input[type="radio"][name^="successorAcqMode-"]')).toHaveCount(4);
});

test("GI-E3: 증여 · 추가분담금 50,000,000 — ⑧이 막는다(종전 조용히 빠짐)", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, [succ({ ...GIFT, successorRightAddedContribution: "50000000" })]);
  let posted = false;
  page.on("request", (r) => { if (r.url().includes("/api/calc/transfer") && r.method() === "POST") posted = true; });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  await expect(page.getByText(/상속·증여로 받은 조합원입주권은 취득 후 납입한 추가분담금을/).first()).toBeVisible();
  expect(posted).toBe(false);
});
