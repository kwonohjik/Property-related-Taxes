/**
 * 결과뷰 리뷰 후속(2026-11-23) 화면 확인 — #3624 · #3626 · #3627
 *
 * - FU-1 #3624: 지분율 % 칸에 소수 9자리 → 「지분율은 소수점 아래 8자리까지 입력하세요.」(⑤ 경고)
 * - FU-2 #3626: 일괄 §77 카드 ④가 「기본공제 전」으로 적힌다(종전 「(보상분 소득 − 기본공제)」에 0을 뺐다)
 * - FU-3 #3627: 상세명세서 가산세액 행 배지 — 국기법 가산세만 있으면 국세기본법 조문만
 *
 * 폼은 sessionStorage 시드로 채운다(`bundled-reduction-detail-cards.spec.ts`와 같은 방식).
 * worktree 실행: E2E_PORT=3261 npx playwright test e2e/result-view-followups-2026-11-23.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { seedWithDeclaredRoster } from "./_helpers/roster-for-declared-count";
import { expandAssetSection } from "./_helpers/expandAssetSection";

type Obj = Record<string, unknown>;

async function seed(page: Page, formData: Obj) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedWithDeclaredRoster({
      state: {
        formData: {
          householdNoOtherHousesConfirmed: true,
          householdNoPresaleRightsConfirmed: true,
          houses: [],
          presaleRights: [],
          householdHousingCount: "0",
          ...formData,
        },
        pendingMigration: false,
      },
      version: 0,
    }),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}

async function calculate(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const rp = page.waitForResponse(
    (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const resp = await rp;
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
  return resp.json();
}

const land = (i: number, over: Obj = {}) => ({
  ...makeDefaultAsset(i),
  assetKind: "land",
  landNature: "standalone",
  addressJibun: `서울 강남구 테스트동 ${i}`,
  acquisitionCause: "purchase",
  acquisitionArea: "300",
  transferArea: "300",
  ...over,
});

test.describe("결과뷰 리뷰 후속 2026-11-23 — 화면 확인", () => {
  test("FU-1 #3624 지분율 소수 9자리 → 8자리 제한 경고", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page, {
      assets: [land(1, { acquisitionDate: "2014-01-02", fixedAcquisitionPrice: "400,000,000", actualSalePrice: "1,000,000,000", ownershipNumerator: "33.333333333", ownershipDenominator: "100" })],
      transferDate: "2026-09-18",
      filingDate: "2026-11-30",
    });
    await expandAssetSection(page, 1);
    await expect(page.getByText("지분율은 소수점 아래 8자리까지 입력하세요.").first()).toBeVisible();
  });

  test("FU-2 #3626 일괄 §77 카드 ④ — 「기본공제 전」", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, {
      assets: [
        land(1, {
          acquisitionDate: "2014-01-02",
          fixedAcquisitionPrice: "400,000,000",
          actualSalePrice: "1,000,000,000",
          transferCause: "public_expropriation",
          expropriationNoticeDate: "2020-01-01",
          reductions: [{ type: "public_expropriation", expropriationCash: "1000000000", expropriationBond: "0", expropriationBondHoldingYears: "none", expropriationApprovalDate: "2024-01-01" }],
        }),
        land(2, { acquisitionDate: "2010-01-01", fixedAcquisitionPrice: "100,000,000", actualSalePrice: "300,000,000" }),
      ],
      transferDate: "2026-09-18",
      filingDate: "2026-11-30",
      contractTotalPrice: "1300000000",
      bundledSaleMode: "actual",
      isOneHousehold: true,
    });
    const body = await calculate(page);
    expect(body.data.mode).toBe("bundled");
    const card = page.getByText("공익사업 수용 감면 상세 (조특법 §77)").first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("④ 자산별 감면금액 = 보상분 소득 × 감면율 (기본공제 전)").first()).toBeVisible();
    await expect(page.getByText("④ 자산별 감면금액 = (보상분 소득 − 기본공제) × 감면율")).toHaveCount(0);
    await expect(page.getByText(/기본공제\(「소득세법」 §90①의 C\)를 자산별로 빼지 않고/).first()).toBeVisible();
  });

  test("FU-3 #3627 가산세액 행 배지 — 국기법 가산세만이면 국세기본법만", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, {
      assets: [land(1, { acquisitionDate: "2010-03-27", fixedAcquisitionPrice: "300,000,000", actualSalePrice: "1,000,000,000" })],
      transferDate: "2023-05-01",
      filingDate: "2024-05-31",
      contractTotalPrice: "1000000000",
      enablePenalty: true,
      filingType: "none",
      paymentDeadline: "2023-07-31",
      actualPaymentDate: "2024-01-31",
    });
    const body = await calculate(page);
    const r = body.data.result ?? body.data;
    expect((r.penaltyDetail?.totalPenalty ?? 0) + (r.penaltyTax ?? 0), "가산세가 실재해야 구별력이 있다").toBeGreaterThan(0);
    const statementToggle = page.getByRole("button", { name: /상세 계산 명세서|계산 명세서/ }).first();
    if (await statementToggle.count()) await statementToggle.click();
    await expect(page.getByRole("button", { name: "국세기본법 §47의2·§47의3·§47의4 ↗" }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /소득세법 §114조의2 \/ 국세기본법/ })).toHaveCount(0);
  });
});
