/**
 * 입주권 부담부증여 × 축 B(같은 물건 지분 분할) — 첫 카드(승계)에서 원조합원 지분의 종전 부동산 실지취득가액을 받는다
 * (계획서 `docs/02-design/features/bg-axis-b-right-share-inputs.plan.md`).
 *
 *   AB-E1 첫 카드 승계(3억 + 1억) · 둘째 지분 원조합원(50% · 청산금 지분분 1억). 첫 카드 칸 「원조합원 지분의 종전 부동산 실지취득가액」에
 *         3억을 넣고 계산 → 합계세액 146,718,000(route anchor와 같은 시료 · 평가 3항은 첫 카드에서 병합).
 *         종전(#2635): 첫 카드가 승계면 칸이 없어 둘째 지분 ⑧에 막혔다. 평가 3항 미병합이던 때는 같은 입력에서 둘째 평가가 작게 잡혔다.
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const HALF = { ownershipNumerator: "50", ownershipDenominator: "100" };
const FIRST = {
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 9-9", assetKind: "right_to_move_in", redevSubject: "right", ...HALF,
  isSuccessorRightToMoveIn: true, acquisitionCause: "purchase", acquisitionDate: "2020-01-01",
  redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01",
  successorRightAcqPrice: "300000000", successorRightAddedContribution: "100000000",
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "600000000",
  bgRightMemberRightsValue: "1200000000", bgRightPaidInstallments: "200000000", bgRightPremium: "100000000", bgActualAcquisitionTotal: "",
};
const SHARE = {
  ...makeDefaultAsset(2), ...HALF, acquisitionCause: "purchase", isSuccessorRightToMoveIn: false, acquisitionDate: "2009-07-01",
  redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", redevOriginalAssetType: "housing", redevRightsValue: "900000000",
  redevSettlementDirection: "pay", redevSettlementAmount: "100000000", redevPreApprovalExpenses: "0",
};
const form = {
  state: {
    formData: {
      assets: [FIRST, SHARE], assetSplitMode: "fractional", contractTotalPrice: "1500000000",
      transferDate: "2026-02-16", filingDate: "2026-04-30", householdHousingCount: "2",
      householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false, isRegulatedArea: false,
      wasRegulatedAtAcquisition: false, isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
};

async function seed(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((x) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(x)), form);
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  for (const n of [1, 2, 3] as const) await expandAssetSection(page, n);
}

test("AB-E1: 축 B 첫 카드(승계)에서 원조합원 지분의 종전 부동산 실지취득가액을 받아 계산한다", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page);
  const first = page.locator('[data-asset-card-index="0"]');
  const field = first.locator('[data-field="bgActualAcquisitionTotal"] input');
  await expect(first.getByText("원조합원 지분의 종전 부동산 실지취득가액", { exact: true })).toBeVisible();
  await field.fill("300000000");
  await expect.poll(() =>
    page.evaluate(() => JSON.parse(sessionStorage.getItem("transfer-tax-wizard") || "{}").state?.formData?.assets?.[0]?.bgActualAcquisitionTotal),
  ).toBe("300000000");

  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const r = await res;
  const json = await r.json();
  expect(r.status()).toBe(200);
  expect(json?.data?.aggregated?.totalTax).toBe(146_718_000);
});

/**
 * AB-E2 둘째 지분(원조합원) 권리가액 8억 ≠ 첫 카드(원조합원) 권리가액 9억 → 그 칸에 경고(막지 않는다 · 계획서 §9.2).
 *       권리가액은 §166④1호 「정하여진 가격」(물건 전체)이라 같은 물건이면 같아야 한다. 같은 값(9억)으로 고치면 사라진다.
 */
test("AB-E2: 둘째 지분 권리가액이 첫 카드 권리가액과 다르면 경고한다", async ({ page }) => {
  test.setTimeout(240_000);
  const ORIG_FIRST = {
    ...FIRST, isSuccessorRightToMoveIn: false, acquisitionDate: "2009-07-01", successorRightAcqPrice: "", successorRightAddedContribution: "",
    redevOriginalAssetType: "housing", redevRightsValue: "900000000", redevSettlementDirection: "pay", redevSettlementAmount: "100000000",
    redevPreApprovalExpenses: "0", bgActualAcquisitionTotal: "300000000",
  };
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate(
    (x) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(x)),
    { ...form, state: { ...form.state, formData: { ...form.state.formData, assets: [ORIG_FIRST, { ...SHARE, redevRightsValue: "800000000" }] } } },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await expandAssetSection(page, 3, 1);
  const second = page.locator('[data-asset-card-index="1"]');
  const warning = second.getByTestId("redev-rights-value-mismatch-warning");
  await expect(warning).toBeVisible();
  await expect(warning).toContainText("(900,000,000)");
  const input = second.locator('[data-field="redevRightsValue"] input');
  // hydration 전 입력은 React 상태에 닿지 않는다(e2e/CLAUDE.md §6) — 리스너가 붙은 뒤 지우고 친다.
  await expect.poll(() => input.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__react")))).toBe(true);
  await input.click();
  await input.press("ControlOrMeta+a");
  await input.press("Backspace");
  await input.pressSequentially("900000000");
  await expect.poll(() =>
    page.evaluate(() => JSON.parse(sessionStorage.getItem("transfer-tax-wizard") || "{}").state?.formData?.assets?.[1]?.redevRightsValue),
  ).toBe("900000000");
  await expect(warning).toHaveCount(0);
});
