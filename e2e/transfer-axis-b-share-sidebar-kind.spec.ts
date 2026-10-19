/**
 * E2E: 축 B(같은 물건 지분 분할) 둘째 지분 — 사이드바·카드가 저장값 «주택»이 아니라 첫 카드 자산 종류를 따른다.
 * 계획서: `docs/00-pm/sidebar-axis-b-share-asset-kind.plan.md`
 *
 * 단위·RTL은 `sidebar-axis-b-share-asset-kind.anchor.test.ts` · `axis-b-share-card-section-summary.ui.anchor.test.tsx`가 고정한다.
 * 여기서만 관측되는 것은 실제 화면의 사이드바 문구와 카드 ⑤ 섹션 유무다(종전: «자산 2 — 주택» · 필요경비 1,500,000 · 빈 ⑤ 섹션).
 *
 * 실행: E2E_PORT=<worktree 포트> npx playwright test e2e/transfer-axis-b-share-sidebar-kind.spec.ts
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const HALF = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "" };
const PER_CARD = {
  acquisitionCause: "purchase",
  acquisitionDate: "2014-01-02",
  useEstimatedAcquisition: true,
  standardPriceAtAcq: "100000000",
  standardPriceAtTransfer: "200000000",
  ...HALF,
};

test("[AXB-1] 첫 카드 분양권 — 사이드바 «자산 2 — 분양권» · 개산공제 1% 500,000 · 둘째 카드에 ⑤ 거주주택 특례 섹션 없음", async ({ page }) => {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (v) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(v)),
    {
      state: {
        formData: {
          transferDate: "2026-02-16",
          filingDate: "2026-04-30",
          contractTotalPrice: "300000000",
          assetSplitMode: "fractional",
          assets: [
            { ...makeDefaultAsset(1), assetKind: "presale_right", actualSalePrice: "300000000", addressJibun: "서울 테스트동 1", ...PER_CARD },
            // 둘째 카드는 화면이 만드는 그대로 — 저장 자산 종류 기본값
            { ...makeDefaultAsset(2), ...PER_CARD },
          ],
        },
        pendingMigration: false,
      },
      version: 0,
    },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  const side = page.locator("aside").first();
  await expect(side.getByText("자산 2 — 분양권")).toBeVisible();
  await expect(side.getByText("자산 2 — 주택")).toHaveCount(0);
  // 두 지분 모두 같은 개산공제(취득시 기준시가 1억 × 50% × 1%)
  await expect(side.getByText("500,000")).toHaveCount(2);
  await expect(page.locator("main").getByText("장기임대 거주주택 특례")).toHaveCount(0);
});
