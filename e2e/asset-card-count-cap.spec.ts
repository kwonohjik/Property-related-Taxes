/**
 * E2E: 자산 카드 수 상한 — ⑤ 「+ 추가」 버튼 · ⑧ 차단 (`lib/calc/asset-card-count-cap.ts`)
 *
 *   CAP-E1. 일반건물 지분 9장 → 「+ 지분 추가」 1회 → 10장 · 버튼 비활성 · 한도 안내 «지분 카드 10건»
 *   CAP-E2. 함께 양도 토지 10장 → 「+ 자산 추가」 1회 → 11장 · 버튼 비활성 · 한도 안내 «11건»
 *   CAP-E3. 일반건물 지분 11장(저장된 이력 등) → 「다음」에서 ⑧ 차단 문구 (종전: ⑧ 통과 → 계산 단계 ⑫ 400)
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { seedWithDeclaredRoster } from "./_helpers/roster-for-declared-count";

const gbShare = (i: number, n: number) => ({
  ...makeDefaultAsset(i + 1),
  assetId: `g${i}`, addressJibun: "제주특별자치도 강남구 테스트동 1-1", assetKind: "general_building",
  ownershipNumerator: "1", ownershipDenominator: String(n),
});
const land = (i: number) => ({
  ...makeDefaultAsset(i + 1),
  assetId: `l${i}`, addressJibun: `제주특별자치도 강남구 테스트동 ${i + 1}`, assetKind: "land",
});

async function seedAndOpen(page: Page, assets: unknown[], assetSplitMode: "fractional" | "companion") {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedWithDeclaredRoster({
    state: {
      formData: {
        assets, assetSplitMode, transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0",
        householdHousingCount: "2", isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
        isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  }));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

test("CAP-E1: 일반건물 지분 10장째에서 「+ 지분 추가」 비활성 · 한도 안내", async ({ page }) => {
  test.setTimeout(180_000);
  await seedAndOpen(page, Array.from({ length: 9 }, (_, i) => gbShare(i, 10)), "fractional");
  const add = page.getByRole("button", { name: "+ 지분 추가" });
  await expect(add).toBeEnabled();
  await expect(page.getByTestId("asset-card-cap-notice")).toHaveCount(0);
  await add.click();
  await expect(add).toBeDisabled();
  await expect(page.getByTestId("asset-card-cap-notice")).toContainText("지분 카드 10건까지");
});

test("CAP-E2: 함께 양도 11장째에서 「+ 자산 추가」 비활성 · 한도 안내", async ({ page }) => {
  test.setTimeout(180_000);
  await seedAndOpen(page, Array.from({ length: 10 }, (_, i) => land(i)), "companion");
  const add = page.getByRole("button", { name: "+ 자산 추가" });
  await expect(add).toBeEnabled();
  await add.click();
  await expect(add).toBeDisabled();
  await expect(page.getByTestId("asset-card-cap-notice")).toContainText("주 자산을 포함해 11건까지");
});

test("CAP-E3: 일반건물 지분 11장 — 「다음」에서 ⑧ 차단", async ({ page }) => {
  test.setTimeout(180_000);
  await seedAndOpen(page, Array.from({ length: 11 }, (_, i) => gbShare(i, 11)), "fractional");
  await expect(page.getByRole("button", { name: "+ 지분 추가" })).toBeDisabled();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByTestId("validation-issues")).toContainText("일반건물 지분 분할 취득은 지분 카드 10건까지 계산할 수 있습니다.");
});
