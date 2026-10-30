/**
 * E2E: 증여받은 자산의 §163⑨ 취득가액 의제 — 결과 카드 문구. 계획서 `docs/02-design/features/successor-right-carryover-contribution.plan.md` §13.
 *
 *   GF-E1. 증여 승계 입주권 — 카드 산식 「증여세 신고가액(증여일 현재 상증법 평가액) 300,000,000 적용」 · 「상속세 신고가액」·배지 「보충적평가액 (공시가격)」 없음
 *          (종전 「보충적평가액 300,000,000원 (상속세 신고가액) 적용」 + 배지)
 *   GF-E2. 상속(가드) — 종전 문구·배지 그대로
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

async function calcCard(page: Page, over: Record<string, unknown>) {
  await seed(page, [succ(over)]);
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  expect((await res).status()).toBe(200);
  // 카드 바깥 상자 — 머리글 줄의 가장 가까운 `rounded-lg` 조상
  const card = page.getByText("상속·증여 취득가액 의제 계산", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
  await expect(card).toBeVisible();
  return card;
}

test("GF-E1: 증여 — 카드 산식 「증여세 신고가액」 · 평가방법 배지 없음", async ({ page }) => {
  test.setTimeout(240_000);
  const card = await calcCard(page, GIFT);
  await expect(card).toContainText("증여세 신고가액(증여일 현재 상증법 평가액) 300,000,000 적용");
  await expect(card).not.toContainText("상속세 신고가액");
  await expect(card.getByText("보충적평가액 (공시가격)", { exact: true })).toHaveCount(0);
});

test("GF-E2: 상속(가드) — 종전 문구·배지", async ({ page }) => {
  test.setTimeout(240_000);
  const card = await calcCard(page, INH);
  await expect(card).toContainText("보충적평가액 300,000,000원 (상속세 신고가액) 적용");
  await expect(card.getByText("보충적평가액 (공시가격)", { exact: true })).toHaveCount(1);
});
