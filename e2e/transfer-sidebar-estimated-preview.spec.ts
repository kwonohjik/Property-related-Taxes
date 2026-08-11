/**
 * 사이드바 **환산 프리뷰 = 계산 결과** 동일성 (2026-08-11).
 *
 * 일반건물·상가는 전용 환산 산식을 써서 공통 §176의2② 식으로 미리 계산할 수 없었고, 그래서
 * 계산 전에는 «계산 후 표시»에 머물렀다. `lib/calc/transfer-estimated-preview.ts`가 route와
 * 같은 엔진 함수를 불러 그 값을 미리 산출한다.
 *
 * ## 이 spec이 지키는 것
 *
 * 프리뷰의 유일한 실패 양식은 **「그럴듯하지만 실제 세액과 다른 값」**이다. 값이 나오는지만
 * 보는 테스트는 그것을 잡지 못한다. 그래서 여기서는 **같은 물건으로 계산 전·후 사이드바를
 * 각각 읽어 문자열이 같은지** 본다 — 계산 후 값은 API·엔진 전체를 거친 실제 값이므로,
 * 두 값이 같다는 것은 프리뷰가 엔진과 같은 답을 낸다는 실증이다
 * (memory `feedback_ui_engine_dual_truth_avoidance`).
 *
 * 산식 자체는 vitest anchor(`__tests__/lib/transfer-estimated-preview.test.ts` C-1~C-10)가 고정한다.
 *
 * 비-worktree 실행: npx playwright test e2e/transfer-sidebar-estimated-preview.spec.ts
 * worktree 실행: E2E_PORT=3102 npx playwright test e2e/transfer-sidebar-estimated-preview.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/** 일반건물 환산 (사례 31 — `general-building-97-2-swap.spec.ts`와 같은 물건). */
function gbSeed() {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          assetKind: "general_building",
          acquisitionCause: "purchase",
          acquisitionDate: "1999-05-24",
          useEstimatedAcquisition: true,
          gbLandArea: "85",
          gbBuildingArea: "180.96",
          gbBuildingFootprintArea: "90.48",
          gbTransferLandPricePerSqm: "10830000",
          gbTransferBuildingValue: "20629440",
          gbAcqLandPricePerSqm: "2800000",
          gbAcqBuildingValue: "28144700",
          gbBuildingAcquisitionCause: "purchase",
          gbZoneType: "commercial",
          gbIsMetropolitan: true,
        }],
        transferDate: "2023-02-19",
        filingDate: "2023-04-30",
        contractTotalPrice: "925000000",
        householdHousingCount: "1",
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

/** 상가·오피스텔 환산 (호별고시 후 취득 — §176의2②2호). */
function cbSeed() {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          assetKind: "commercial_building",
          acquisitionCause: "purchase",
          acquisitionDate: "2010-05-24",
          useEstimatedAcquisition: true,
          actualSalePrice: "925000000",
          cbExclusiveArea: "100",
          cbSharedArea: "50",
          cbLandArea: "30",
          cbUnitPriceAtTransfer: "3000000",
          cbUnitPriceAtFirstOrAcq: "1200000",
          cbLandPricePerSqmAtTransfer: "5000000",
          cbLandPricePerSqmAtAcq: "2000000",
        }],
        transferDate: "2023-02-19",
        filingDate: "2023-04-30",
        contractTotalPrice: "925000000",
        householdHousingCount: "1",
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seed(page: Page, s: unknown) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((v) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(v)), s);
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

/** 사이드바에서 라벨이 붙은 줄의 금액 텍스트. */
async function sidebarAmount(page: Page, label: string): Promise<string> {
  const row = page
    .locator('[data-slot="wizard-sidebar"]')
    .locator("div.text-sm", { has: page.getByText(label, { exact: true }) })
    .first();
  await expect(row).toBeVisible();
  return ((await row.textContent()) ?? "").replace(label, "").trim();
}

/** 계산 실행 후 입력 단계로 복귀 — 결과 화면에는 사이드바가 없다(`TransferTaxCalculator.tsx:484`). */
async function calcAndReturn(page: Page) {
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "이전" }).first().click();
  await expect(page.locator('[data-slot="wizard-sidebar"]')).toBeVisible();
}

test.describe("환산 프리뷰 = 계산 결과", () => {
  test("일반건물 환산 — 계산 전 표시값이 계산 후와 같다", async ({ page }) => {
    await seed(page, gbSeed());

    // ── 계산 전(프리뷰) ──
    const acqBefore = await sidebarAmount(page, "취득가액");
    const expBefore = await sidebarAmount(page, "필요경비");
    // 프리뷰가 실제로 나왔는지 — 안 나오면 아래 비교가 «계산 후 표시»끼리 같아 통과해 버린다.
    expect(acqBefore).toMatch(/[0-9]{1,3}(,[0-9]{3})+/);
    expect(acqBefore).not.toContain("계산 후 표시");
    expect(expBefore).toMatch(/[0-9]{1,3}(,[0-9]{3})+/);

    // ── 계산 후(엔진 실제값) ──
    await calcAndReturn(page);
    expect(await sidebarAmount(page, "취득가액")).toBe(acqBefore);
    expect(await sidebarAmount(page, "필요경비")).toBe(expBefore);
  });

  test("상가 환산 — 계산 전 표시값이 계산 후와 같다", async ({ page }) => {
    await seed(page, cbSeed());

    const acqBefore = await sidebarAmount(page, "취득가액");
    const expBefore = await sidebarAmount(page, "필요경비");
    expect(acqBefore).toMatch(/[0-9]{1,3}(,[0-9]{3})+/);
    expect(acqBefore).not.toContain("계산 후 표시");
    expect(expBefore).toMatch(/[0-9]{1,3}(,[0-9]{3})+/);

    await calcAndReturn(page);
    expect(await sidebarAmount(page, "취득가액")).toBe(acqBefore);
    expect(await sidebarAmount(page, "필요경비")).toBe(expBefore);
  });
});
