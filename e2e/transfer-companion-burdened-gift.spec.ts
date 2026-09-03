/**
 * E2E: 컴패니언(다른 물건) × 부담부증여(소령 §159) — 계산·표시 실검증.
 *
 * 계획서: `docs/02-design/features/transfer-companion-burdened-gift.plan.md`
 *
 * 유닛 anchor(`__tests__/calc/companion-burdened-gift-plumbing.anchor.test.ts`)가 배관 각 층을
 * 보지만, **화면에서 실제로 열리는지**(⑧ Gate-B 해제)와 **증여계약 전체 §159 카드가 뜨는지**는
 * 여기서만 확인된다. 축 B 개방 때도 유닛은 전건 통과했는데 **세션 복원 경로만 갈라졌다** —
 * 화면 경유가 유일한 판별이었다.
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 * 실행: E2E_PORT=<worktree 포트> npx playwright test e2e/transfer-companion-burdened-gift.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/**
 * 물건1 평가 10억(취득 5억)·채무 4억 + 물건2 평가 6억(취득 3억)·**채무 0**.
 * ΣA = 16억, B = 4억 ⇒ debtRatio = 0.25. 물건2 채무 0은 의도된 픽스처다
 * (근저당이 한 물건에만 설정된 정상 케이스 — 「입력 채무 × 비율」로는 몫이 사라진다).
 */
function seedForm() {
  const bg = {
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_standard",
    bgDonorRelation: "lineal_descendant",
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
            useEstimatedAcquisition: false,
            ...bg,
            bgLendingDepositTotal: "200000000",
            bgMortgageDebtAmount: "200000000",
            standardPriceAtTransfer: "1000000000",
            standardPriceAtAcq: "500000000",
          },
          {
            ...makeDefaultAsset(2),
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2009-03-01",
            useEstimatedAcquisition: false,
            ...bg,
            bgLendingDepositTotal: "0",
            bgMortgageDebtAmount: "0",
            standardPriceAtTransfer: "600000000",
            standardPriceAtAcq: "300000000",
          },
        ],
        transferDate: "2024-03-01",
        filingDate: "2024-05-31",
        contractTotalPrice: "1600000000",
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

async function advanceAndCalculate(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
}

test.describe("컴패니언 × 부담부증여 (소령 §159)", () => {
  test("계산이 열리고 채무가 자산가액 비율로 재배분된다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page);

    // ⑤ 규약 안내 — 축 A(지분 인수분)·축 B(물건 전체)와 **또 다른 제3의 규약**이라
    //    침묵하면 사용자가 총액을 각 카드에 넣어 자산 수만큼 곱해진다.
    //    ⚠️ 자산 카드의 「양도정보」는 접혀 있다 — 열지 않으면 DOM에는 있어도 hidden이다.
    await page.getByRole("button", { name: /양도정보/ }).first().click();
    await expect(page.getByText(/이 물건에 설정된 금액/).first()).toBeVisible({ timeout: 20_000 });
    // 축 B 안내가 함께 뜨면 **정반대 지시**가 된다(물건 전체 vs 이 물건).
    await expect(page.getByText(/물건 전체\(100%\) 기준/)).toHaveCount(0);

    await advanceAndCalculate(page);

    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: /계산하기/ }).click();
    const resp = await calcResponse;
    expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);

    const sent = resp.request().postDataJSON() as {
      burdenedGiftInfo?: Record<string, number>;
      burdenedGiftWholeInfo?: Record<string, number>;
      companionAssets?: { burdenedGiftInfo?: Record<string, number>; transferType?: string }[];
    };
    // Bᵢ = 4억 × Aᵢ/16억
    expect(sent.burdenedGiftInfo?.assumedDebtOverride).toBe(250_000_000);
    expect(sent.companionAssets?.[0].burdenedGiftInfo?.assumedDebtOverride).toBe(150_000_000);
    expect(sent.companionAssets?.[0].transferType).toBe("burdened_gift");
    // 합산 info — 증여세 1회용 (ΣA = 16억, 총채무 4억)
    expect(sent.burdenedGiftWholeInfo?.buildingStdPriceAtTransfer).toBe(1_600_000_000);
    expect(sent.burdenedGiftWholeInfo?.lendingDepositTotal).toBe(200_000_000);

    const body = await resp.json();
    expect(body.data.mode).toBe("bundled");
    expect(
      body.data.aggregated.properties.map((p: { transferGain: number }) => p.transferGain),
    ).toEqual([121_250_000, 72_750_000]);
    expect(body.data.aggregated.totalTax).toBe(35_830_300);
  });

  test("결과 화면에 증여계약 전체 기준 §159 카드가 뜬다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page);
    await advanceAndCalculate(page);
    await page.getByRole("button", { name: /계산하기/ }).click();

    await expect(page.getByText(/부담부증여/).first()).toBeVisible({ timeout: 20_000 });
    // 채무액 = 증여계약 전체 4억 (카드별 2.5억/1.5억으로 쪼개지지 않는다)
    await expect(page.getByText(/400,000,000/).first()).toBeVisible();
    // 🔑 증여세가 **증여계약 단위 1회** — 과세표준 11.5억 기준
    await expect(page.getByText("291,000,000").first()).toBeVisible();
  });
});
