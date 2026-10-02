/**
 * §97③ 감가상각비 — 입력(③ 취득정보) → 계산 → 신고서·명세서 취득가액이 **공제 후** 값이다.
 *
 * 계획서: docs/00-pm/transfer-depreciation-and-capex-display.plan.md (Phase B)
 *
 * 취득 300,000,000 · 감가상각비 40,000,000 · 자본적지출 10,000,000 · 양도비 2,000,000 · 양도 500,000,000
 *   → 취득가액 260,000,000 · 필요경비 12,000,000 · 양도차익 228,000,000.
 *
 * 입력은 폼에 **직접 타이핑**한다(시드로 채우지 않는다) — 칸이 실제로 열려 있고 값이 store → ④ → route
 * → 결과까지 닿는지가 이 spec의 대상이다(⑫⑭ 침묵 strip은 화면 끝에서만 보인다).
 *
 * ⚠️ substring 단언(`toContainText`)을 쓰지 않는다 — "1,700,000"은 "700,000"을 품는다.
 *
 * worktree 실행: E2E_PORT=3217 npx playwright test e2e/transfer-depreciation-97-3.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const seed = (assetOver: Record<string, unknown> = {}) => ({
  state: {
    formData: {
      assets: [
        {
          ...makeDefaultAsset(1),
          addressJibun: "서울 강남구 테스트동 1-1",
          assetKind: "building",
          acquisitionCause: "purchase",
          acquisitionDate: "2019-09-10",
          actualSalePrice: "500000000",
          fixedAcquisitionPrice: "300000000",
          capitalExpenditure: "10000000",
          transferExpense: "2000000",
          ...assetOver,
        },
      ],
      transferDate: "2026-06-03",
      filingDate: "2026-08-31",
      contractTotalPrice: "500000000",
      householdHousingCount: "0",
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
});

async function open(page: Page, assetOver: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seed(assetOver));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

const filingCell = (page: Page, label: string) =>
  page.getByRole("row").filter({ hasText: new RegExp(`^${label}`) }).first().getByRole("cell").last();
const statementValue = (page: Page, label: string) =>
  page.locator(`[data-statement-row="${label}"] [data-statement-value]`).first();

async function calculate(page: Page) {
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 20000 });
}

test.describe("§97③ 감가상각비 — 취득가액에서 공제", () => {
  test("③ 취득정보에서 입력하면 신고서·명세서 취득가액이 공제 후 값이다", async ({ page }) => {
    test.setTimeout(90_000);
    await open(page);
    await expandAssetSection(page, 3);
    const input = page.getByTestId("depreciation-amount");
    await expect(input, "건물 자산이면 감가상각비 칸이 열려 있다").toBeVisible();
    await input.fill("40000000");
    await expect(input).toHaveValue("40000000");

    await calculate(page);

    // 취득가액 셀에는 공제 고지가 같은 칸에 붙는다 — 금액은 앞에서부터 정확히 일치해야 한다(뒤에 숫자·쉼표가 이어지면 안 됨).
    await expect(filingCell(page, "취득가액"), "300,000,000 − 40,000,000").toHaveText(/^260,000,000(?![\d,])/);
    await expect(filingCell(page, "필요경비"), "자본적지출 10,000,000 + 양도비 2,000,000").toHaveText("12,000,000");
    await expect(filingCell(page, "전체 양도차익")).toHaveText("228,000,000");
    await expect(page.getByText("감가상각비 40,000,000을 공제한 취득가액입니다").first()).toBeVisible();

    await expect(statementValue(page, "취득가액")).toHaveText("260,000,000");
    await expect(statementValue(page, "필요경비")).toHaveText("12,000,000");
    await expect(statementValue(page, "전체 양도차익")).toHaveText("228,000,000");
    await expect(page.locator('[data-statement-row="취득가액"]')).toContainText("감가상각비 40,000,000");
  });

  test("긍정 짝 — 입력하지 않으면 종전 값(취득가액 300,000,000)", async ({ page }) => {
    test.setTimeout(90_000);
    await open(page);
    await calculate(page);
    await expect(filingCell(page, "취득가액")).toHaveText("300,000,000");
    await expect(filingCell(page, "전체 양도차익")).toHaveText("188,000,000");
  });

  test("건물이 없는 자산(토지)에는 칸도 안내도 없다", async ({ page }) => {
    test.setTimeout(60_000);
    await open(page, { assetKind: "land", landNature: "independent" });
    await expandAssetSection(page, 3);
    await expect(page.getByTestId("depreciation-amount")).toHaveCount(0);
    await expect(page.getByTestId("depreciation-unsupported")).toHaveCount(0);
  });

  test("받을 수 없는 구조(이월과세)에서는 칸 대신 이유를 알린다", async ({ page }) => {
    test.setTimeout(60_000);
    await open(page, { acquisitionCause: "carryover_gift" });
    await expandAssetSection(page, 3);
    await expect(page.getByTestId("depreciation-amount")).toHaveCount(0);
    await expect(page.getByTestId("depreciation-unsupported")).toContainText("이월과세");
  });
});
