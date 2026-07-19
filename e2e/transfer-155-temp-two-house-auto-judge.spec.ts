/**
 * 일시적 2주택 §155① 종전취득일 자동반영 + 요건 자동판정 카드 E2E.
 *
 * - 종전 주택 취득일 = 양도 자산(assets[0]) 취득일 자동반영(읽기전용 hint 노출).
 * - 신규 주택 취득일 입력 시 판정 카드(data-testid="temp-two-house-verdict")가 요건 A(1년)·B(3년) 자동판정.
 *   · 충족 / 미충족(1년 미경과) / 입력부족(pending) 3분기.
 *
 * 계획서: docs/02-design/features/transfer-temporary-two-house-155-auto-judge.plan.md §5-A·5-B(⑤).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seedForm(acquisitionDate: string, over: Record<string, unknown>) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate,
          },
        ],
        isOneHousehold: true,
        householdHousingCount: "2",
        temporaryTwoHouseSpecial: true,
        ...over,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function gotoHolding(page: Page, acquisitionDate: string, over: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(acquisitionDate, over),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).first().click();
}

test.describe("일시적 2주택 §155① 종전취득일 자동반영 + 요건 자동판정", () => {
  test("종전취득일 자동반영 hint 노출(읽기전용 단일소스)", async ({ page }) => {
    await gotoHolding(page, "2018-01-01", {
      transferDate: "2021-06-01",
      newHouseAcquisitionDate: "2020-01-01",
    });
    // 종전 주택 취득일 라벨 + 자동반영 안내(읽기전용 — 별도 입력 없음)
    await expect(page.getByText("종전 주택 취득일", { exact: true })).toBeVisible();
    await expect(page.getByText(/취득일에서 자동 반영/)).toBeVisible();
  });

  test("요건 충족: 1년 경과 + 3년내 → 충족 카드", async ({ page }) => {
    await gotoHolding(page, "2018-01-01", {
      transferDate: "2021-06-01",
      newHouseAcquisitionDate: "2020-01-01", // 종전+24개월, 3년내
    });
    const verdict = page.getByTestId("temp-two-house-verdict");
    await expect(verdict).toBeVisible();
    await expect(page.getByText("일시적 2주택 특례 요건 충족", { exact: true })).toBeVisible();
  });

  test("요건 미충족: 1년 미경과 → 미충족 카드(요건 A)", async ({ page }) => {
    await gotoHolding(page, "2020-01-01", {
      transferDate: "2022-06-01", // 보유 2.4년(보유요건은 통과)
      newHouseAcquisitionDate: "2020-06-01", // 종전+5개월 → 1년 미경과
    });
    await expect(page.getByText("일시적 2주택 특례 요건 미충족", { exact: true })).toBeVisible();
    await expect(page.getByTestId("temp-two-house-verdict")).toContainText("미충족 · 요건 A");
  });

  test("입력 부족(신규취득일 미입력) → 판정 대기 카드", async ({ page }) => {
    await gotoHolding(page, "2018-01-01", {
      transferDate: "2021-06-01",
      newHouseAcquisitionDate: "",
    });
    await expect(page.getByText("요건 자동 판정 대기", { exact: true })).toBeVisible();
  });
});
