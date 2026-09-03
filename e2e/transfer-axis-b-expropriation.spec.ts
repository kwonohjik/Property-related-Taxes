/**
 * E2E: 축 B(지분 분할 취득) × 공익수용 — 계산이 열리고 §164⑨ 특례가 전 지분에 적용된다.
 *
 * 종전 차단 사유는 「지분 분할 양도가액 = 총양도가 × 지분율이라 **보상가액**과 비양립」이었다.
 * 틀렸다 — 양도가액은 총계약가를 그대로 쓰고, 보상 필드는 §164⑨1호 **환산 분모** 전용이라
 * 분자(취득시 기준시가)와 **약분**된다.
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 * 실행: E2E_PORT=<worktree 포트> npx playwright test e2e/transfer-axis-b-expropriation.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/** 토지 60% + 40%(취득일 동일) · 수용 per-sqm 트랙 · §77 감면(현금6:채권4) */
function seedForm() {
  const common = {
    assetKind: "land",
    landNature: "independent",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-01-01",
    transferCause: "public_expropriation",
    expropriationNoticeDate: "2023-01-01",
    useEstimatedAcquisition: true,
    standardPriceAtTransfer: "300000000",
    standardPriceAtAcq: "100000000",
    standardPricePerSqmAtTransfer: "3000000",
    transferArea: "100",
    compensationPerSqm: "2800000",
    compensationBasisStdPrice: "2500000",
    reductions: [
      {
        type: "public_expropriation",
        expropriationCash: "600000000",
        expropriationBond: "400000000",
        expropriationBondHoldingYears: "none",
        expropriationApprovalDate: "2023-01-01",
      },
    ],
  };
  return {
    state: {
      formData: {
        assets: [
          { ...makeDefaultAsset(1), ...common, ownershipNumerator: "60", ownershipDenominator: "100" },
          { ...makeDefaultAsset(2), ...common, ownershipNumerator: "40", ownershipDenominator: "100" },
        ],
        transferDate: "2024-06-01",
        filingDate: "2024-08-31",
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

test.describe("축 B × 공익수용", () => {
  test("계산이 열리고 §164⑨ 특례가 **전 지분**에 적용된다", async ({ page }) => {
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

    // ⑬ 보상 필드가 컴패니언에도 실렸는가
    const sent = resp.request().postDataJSON() as {
      transferCause?: string;
      companionAssets?: { transferCause?: string; compensationPerSqm?: number }[];
    };
    expect(sent.transferCause).toBe("public_expropriation");
    expect(sent.companionAssets?.[0].transferCause).toBe("public_expropriation");
    expect(sent.companionAssets?.[0].compensationPerSqm).toBe(2_800_000);

    const body = await resp.json();
    expect(body.data.mode).toBe("bundled");
    const props = body.data.aggregated.properties as Record<string, unknown>[];
    expect(props).toHaveLength(2);
    // 🔑 「일치」만으로는 「양쪽 다 미발동」과 구별되지 않는다 — 발동을 직접 단언한다
    for (const p of props) {
      expect(p.expropriationValuationDetail, "전 지분에서 §164⑨ 특례가 발동해야 한다").toBeTruthy();
    }
    // §77 감면이 실제로 걸렸다
    expect(body.data.aggregated.totalReductionAmount ?? props.reduce((s, p) => s + ((p.reductionAmount as number) ?? 0), 0)).toBeGreaterThan(0);
  });

  test("🔴 차단 메시지가 더 이상 뜨지 않는다 (회귀 가드)", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndOpen(page);
    for (const step of ["보유 상황", "감면·공제", "가산세"]) {
      await page.getByRole("button", { name: step }).first().click();
    }
    await page.getByRole("button", { name: /계산하기/ }).click();
    await expect(page.getByText(/지분 분할 취득과 함께 계산할 수 없습니다/)).toHaveCount(0);
  });
});
