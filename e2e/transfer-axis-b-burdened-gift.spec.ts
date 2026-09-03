/**
 * E2E: 축 B(지분 분할 취득) × 부담부증여(소령 §159) — 계산·표시 실검증.
 *
 * 계획서: `docs/02-design/features/transfer-axis-b-burdened-gift.plan.md`
 *
 * 배관이 여섯 층(④⑧⑩⑫⑬⑭)이라 하나만 빠져도 **침묵 strip**이 되어 그 지분만 §159를
 * 타지 않는다. 유닛 anchor가 각 층을 보지만, **화면에서 실제로 열리는지**와
 * **물건 전체 §159 카드가 뜨는지**는 여기서만 확인된다.
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 * 실행: E2E_PORT=<worktree 포트> npx playwright test e2e/transfer-axis-b-burdened-gift.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/** 물건 전체 채무 6억 · 기준시가 10억/5억. 60% + 40% 2회 취득(취득일 동일 — 단건과 대조 가능). */
function seedForm() {
  const bg = {
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_standard",
    bgDonorRelation: "lineal_descendant",
    bgLendingDepositTotal: "300000000",
    bgMortgageDebtAmount: "300000000",
    standardPriceAtTransfer: "1000000001",
    standardPriceAtAcq: "500000001",
  };
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2009-03-01",
            ownershipNumerator: "60",
            ownershipDenominator: "100",
            useEstimatedAcquisition: false,
            ...bg,
          },
          {
            ...makeDefaultAsset(2),
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2009-03-01",
            ownershipNumerator: "40",
            ownershipDenominator: "100",
            useEstimatedAcquisition: false,
            ...bg,
          },
        ],
        transferDate: "2024-03-01",
        filingDate: "2024-05-31",
        contractTotalPrice: "1000000000",
        householdHousingCount: "2",
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

async function seedAndOpen(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

test.describe("축 B × 부담부증여 (소령 §159)", () => {
  test("계산이 열리고 지분별 §159가 적용된다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page);

    for (const step of ["보유 상황", "감면·공제", "가산세"]) {
      await page.getByRole("button", { name: step }).first().click();
    }
    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: /계산하기/ }).click();
    const resp = await calcResponse;
    expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);

    // ⑬ 채무가 자산별 지분율로 안분돼 실렸는가
    const sent = resp.request().postDataJSON() as {
      burdenedGiftInfo?: Record<string, number>;
      burdenedGiftWholeInfo?: Record<string, number>;
      companionAssets?: { burdenedGiftInfo?: Record<string, number>; transferType?: string }[];
    };
    expect(sent.burdenedGiftInfo?.lendingDepositTotal).toBe(180_000_000); // 3억 × 0.6
    expect(sent.companionAssets?.[0].burdenedGiftInfo?.lendingDepositTotal).toBe(120_000_000);
    expect(sent.companionAssets?.[0].transferType).toBe("burdened_gift");
    // 물건 전체 info는 미안분 — 증여세 1회용
    expect(sent.burdenedGiftWholeInfo?.lendingDepositTotal).toBe(300_000_000);

    const body = await resp.json();
    expect(body.data.mode).toBe("bundled");
    // 지분별 §159 — 차익이 지분율에 정비례한다
    expect(body.data.aggregated.properties.map((p: { transferGain: number }) => p.transferGain)).toEqual([
      174_600_000, 116_400_000,
    ]);
    // 합계는 단건 100%와 일치 (취득일이 같은 픽스처)
    expect(body.data.aggregated.totalTax).toBe(64_600_360);
  });

  test("결과 화면에 물건 전체 기준 §159 카드가 뜬다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page);

    for (const step of ["보유 상황", "감면·공제", "가산세"]) {
      await page.getByRole("button", { name: step }).first().click();
    }
    await page.getByRole("button", { name: /계산하기/ }).click();

    // 일반건물 부담부증여가 쓰던 §159 명세 슬롯을 축 B가 재사용한다.
    await expect(page.getByText(/부담부증여/).first()).toBeVisible({ timeout: 20_000 });
    // 채무비율 = 물건 전체 6억 ÷ 증여가액 10억 (지분별로 쪼개지지 않는다)
    await expect(page.getByText(/600,000,000/).first()).toBeVisible();
    // 🔑 증여세가 **물건 단위 1회** — 카드별 합산이면 38,800,000이 뜬다
    await expect(page.getByText("58,200,000").first()).toBeVisible();
  });
});
