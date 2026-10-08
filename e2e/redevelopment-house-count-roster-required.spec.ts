/**
 * 명부 필수화(PR-1) 확장 — 재개발APT(PR-B, 2026-10-05).
 *
 * 계획서: `docs/00-pm/roster-required-other-assets.plan.md` §4-2.
 *
 * `transfer-house-count-divergence.spec.ts`가 `"housing"`에서 고정한 세 가지 주장을
 * `redevelopment_apt`에도 그대로 고정한다 — 종전에는 F1 게이트가 `=== "housing"` 리터럴뿐이라
 * 재개발APT는 명부를 입력해도 §154① 판정이 스칼라로 계산됐다(계획서 §2-1 결함).
 *
 * worktree 실행: E2E_PORT=3101 npx playwright test e2e/redevelopment-house-count-roster-required.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";

const REDEV_166 = {
  redevSubject: "apt",
  redevApprovalLawBasis: "urban_renovation_art_74",
  redevOriginalAssetType: "housing",
  redevSettlementDirection: "pay",
  redevApprovalDate: "2009-10-23",
  redevRightsValue: "219218500",
  redevSettlementAmount: "92781500",
  redevActualAcquisitionPrice: "180000000",
  redevPreApprovalExpenses: "0",
  redevPostApprovalExpenses: "0",
};

function seedForm(over: Record<string, unknown>) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1), ...DIRECT_RESIDENCE,
            addressJibun: "서울 강남구 테스트동 1-1",
            assetKind: "redevelopment_apt",
            acquisitionCause: "purchase",
            acquisitionDate: "2005-04-09",
            useEstimatedAcquisition: false,
            ...REDEV_166,
          },
        ],
        transferDate: "2026-02-16",
        filingDate: "2026-04-30",
        contractTotalPrice: "525000000",
        isOneHousehold: true,
        houses: [],
        householdNoPresaleRightsConfirmed: true, // roster-required PR-D
        ...over,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function gotoStep4(page: Page, over: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedForm(over));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).first().click();
}

test.describe("재개발APT — 명부 필수화(PR-B)", () => {
  test("[PRB-E1] 스칼라 버튼이 없고, 명부 2행이면 선언값(1채)을 무시한 도출값(3채)을 보여준다", async ({ page }) => {
    await gotoStep4(page, {
      householdHousingCount: "1", // 어긋난 선언 — 도출값이 이겨야 한다
      houses: [
        { id: "h1", region: "capital", acquisitionDate: "2018-01-01", officialPrice: "300000000" },
        { id: "h2", region: "capital", acquisitionDate: "2019-01-01", officialPrice: "300000000" },
      ],
    });
    // 종전 「1/2/3+」 스칼라 버튼 위젯이 사라졌다
    await expect(page.getByTestId("household-house-count-buttons")).toHaveCount(0);
    // 읽기 전용 도출값 — housing과 같은 testid를 공유
    await expect(page.getByTestId("household-house-count-derived")).toContainText("3채");
  });

  test("[PRB-E2] 명부 0행 + 미확정 — 「다른 보유 주택이 없습니다」 확정 토글이 뜨고 계산을 막는다", async ({ page }) => {
    await gotoStep4(page, { houses: [], householdNoOtherHousesConfirmed: false });
    const toggle = page.getByText("다른 보유 주택이 없습니다");
    await expect(toggle).toBeVisible();

    for (const step of ["감면·공제", "가산세"]) {
      await page.getByRole("button", { name: step }).first().click();
    }
    await page.getByRole("button", { name: /계산하기/ }).click();
    // 차단 — 「보유 상황」 탭에 그대로 머문다(계산 API가 호출되지 않는다)
    await expect(page.getByRole("button", { name: "보유 상황", exact: true })).toHaveAttribute(
      "aria-current",
      "step",
    );
    await expect(page.getByText(/다른 보유 주택이 없는지 확인/).first()).toBeVisible();
  });

  test("[PRB-E3] 확정 토글을 켜면 계산이 끝까지 간다", async ({ page }) => {
    await gotoStep4(page, { houses: [], householdNoOtherHousesConfirmed: false });
    await page.getByRole("switch", { name: /^다른 보유 주택이 없습니다/ }).click();

    for (const step of ["감면·공제", "가산세"]) {
      await page.getByRole("button", { name: step }).first().click();
    }
    const rp = page.waitForResponse(
      (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: /계산하기/ }).click();
    const resp = await rp;
    expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
  });
});
