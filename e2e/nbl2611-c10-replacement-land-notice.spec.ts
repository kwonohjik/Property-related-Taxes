/**
 * 조특법 §77의2(대토보상) — 양도원인·사업인정고시일 ⑧ 차단 (NBL2611-C10)
 *
 * 법 §77의2①은 「사업인정고시일(…양도일)부터 소급하여 2년 이전에 취득한 토지등을 … 공익사업의 시행자에게 양도」다.
 * 종전에는 양도원인 «일반»·고시일 없음 + §77의2 행이 ⑧을 통과해 감면이 성립했다.
 *  - 「감면·공제」 단계에서 다음을 누르면 차단 메시지가 뜬다(양도원인 «일반» / 공익수용 + 고시일 공란).
 *  - 공익수용 + 고시일이 있으면 통과한다.
 *  - 고시일 입력칸이 ① 단계 «공익수용» 카드에 `data-field="expropriationNoticeDate"` 앵커로 실제 렌더된다(메시지가 가리키는 칸).
 *
 * worktree 실행: E2E_PORT=3101 npx playwright test e2e/nbl2611-c10-replacement-land-notice.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

async function ready(page: Page) {
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  // hydration 전 클릭은 조용히 유실된다(e2e/CLAUDE.md §6)
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}

async function seedAndOpen(page: Page, assetPatch: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const formData = {
    ...createDefaultTransferFormData(),
    transferDate: "2024-06-03",
    filingDate: "2024-08-31",
    contractTotalPrice: "1000000000",
    assets: [
      {
        ...makeDefaultAsset(1),
        assetKind: "land", acquisitionArea: "300", transferArea: "300", addressJibun: "서울 강남구 테스트동 1",
        acquisitionCause: "purchase", acquisitionDate: "2014-01-02", fixedAcquisitionPrice: "400000000",
        standardPriceAtTransfer: "500000000", actualSalePrice: "1000000000",
        reductions: [{ type: "replacement_land_comp", rlCashComp: "0", rlLandComp: "1000000000" }],
        ...assetPatch,
      },
    ],
  };
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    { state: { formData, currentStep: 0, pendingMigration: false }, version: 0 },
  );
  await page.reload();
  await ready(page);
}

const panel = (page: Page) => page.getByTestId("validation-issues");
const next = (page: Page) => page.getByRole("button", { name: "다음", exact: true });
const EXPR = { transferCause: "public_expropriation", isNonBusinessLand: true, nblUseDetailedJudgment: true, nblLandType: "other_land", nblZoneType: "residential", nblOtherStateHistoryMode: "unchanged" /* NBL-STATE-HISTORY-U1 — 기타토지는 건축물 이력 질문에 답해야 ⑧을 통과한다(이 스펙의 주제와 무관) */ };

test.describe("§77의2 대토보상 — 양도원인·고시일 ⑧ (NBL2611-C10)", () => {
  test("양도원인 «일반» + §77의2 → 차단 메시지(공익수용·협의매수 선택 안내)", async ({ page }) => {
    await seedAndOpen(page, {});
    await page.getByRole("button", { name: "감면·공제" }).first().click();
    await next(page).click();
    await expect(panel(page).getByText(/^대토보상\(§77의2\)은 공익사업 시행자에게 양도\(수용·협의매수\)한 경우에만 적용됩니다/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "감면 확인" })).toBeVisible();
  });

  test("공익수용 + 고시일 공란 → 차단 메시지(사업인정고시일 입력 안내)", async ({ page }) => {
    await seedAndOpen(page, { ...EXPR, expropriationNoticeDate: "" });
    await page.getByRole("button", { name: "감면·공제" }).first().click();
    await next(page).click();
    await expect(panel(page).getByText(/^대토보상\(§77의2\): 사업인정고시일을 입력하세요/)).toBeVisible();
  });

  test("공익수용 + 고시일 입력 → 통과해 다음 단계(가산세)로 간다", async ({ page }) => {
    await seedAndOpen(page, { ...EXPR, expropriationNoticeDate: "2020-01-01" });
    await page.getByRole("button", { name: "감면·공제" }).first().click();
    await next(page).click();
    await expect(page.getByRole("heading", { name: "가산세 입력" })).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
  });

  test("메시지가 가리키는 고시일 칸 — 「공익수용」 카드에 data-field 앵커가 실제로 렌더된다", async ({ page }) => {
    await seedAndOpen(page, { ...EXPR, expropriationNoticeDate: "" });
    const anchor = page.locator('[data-field="expropriationNoticeDate"]');
    await expect(anchor).toHaveCount(1);
    await expect(anchor.locator("input").first()).toBeAttached();
    await expect(page.getByTestId("expr-notice-date")).toHaveCount(1);
  });
});
