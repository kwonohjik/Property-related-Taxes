/**
 * 승계 입주권 부담부증여 — 취득가액은 ③ 승계 블록 한 곳에서 받는다
 * (계획서 `docs/02-design/features/bg-successor-rtmi-acquisition-input.plan.md` Q-1 a · Q-2 a).
 *
 *   SR-E1 일반 양도 승계 입주권(승계취득가액 3억 + 추가분담금 1억)에서 「감정가액」을 고른 뒤 양도 유형 「부담부증여 (소령 §159)」 → 계산.
 *         종전: 부담부증여 카드 「종전 부동산 실지취득가액」을 ⑧이 요구했고(그 값만 계산에 쓰였다) 승계 블록 값은 쓰이지 않았다.
 *         지금: 카드 칸·라디오가 없고, 승계 블록 값으로 플래그 없이 시작한 부담부증여와 같은 세액.
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** 승계 입주권(인가 2018-06-01 · 취득 2020-01-01) · 부담부증여 입력(직계비속 · 채무 6억 · 기준시가 평가 3항)을 미리 채워 둔다. */
const RIGHT = {
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 9-9", assetKind: "right_to_move_in", redevSubject: "right",
  isSuccessorRightToMoveIn: true, acquisitionCause: "purchase", acquisitionDate: "2020-01-01",
  redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01",
  successorRightAcqPrice: "300000000", successorRightAddedContribution: "100000000",
  successorRightStdPaidAtAcq: "250000000", successorRightStdPremiumAtAcq: "50000000",
  bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "600000000",
  bgRightMemberRightsValue: "1200000000", bgRightPaidInstallments: "200000000", bgRightPremium: "100000000",
  bgActualAcquisitionTotal: "", actualSalePrice: "1500000000", fixedAcquisitionPrice: "500000000",
};
const form = (asset: unknown) => ({
  state: {
    formData: {
      assets: [asset], transferDate: "2026-02-16", filingDate: "2026-04-30", householdHousingCount: "2", contractTotalPrice: "1500000000",
      householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false, isRegulatedArea: false,
      wasRegulatedAtAcquisition: false, isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
});

async function seed(page: Page, asset: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((x) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(x)), form(asset));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  for (const n of [1, 2, 3] as const) await expandAssetSection(page, n);
}
const card = (page: Page) => page.locator('[data-asset-card-index="0"]');
const modeRadio = (page: Page, mode: string) => card(page).locator(`input[type="radio"][name^="successorAcqMode-"][value="${mode}"]`);
const storedAsset = (page: Page) =>
  page.evaluate(() => JSON.parse(sessionStorage.getItem("transfer-tax-wizard") || "{}").state?.formData?.assets?.[0]);

async function calcTax(page: Page): Promise<{ status: number; tax: number | undefined }> {
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const r = await res;
  const json = await r.json();
  return { status: r.status(), tax: json?.data?.result?.calculatedTax as number | undefined };
}

test.describe("승계 입주권 부담부증여 — 취득가액 입력 한 곳", () => {
  test.setTimeout(240_000);

  test("SR-E1: 일반 양도 「감정가액」 → 부담부증여 — 카드 칸·라디오 없이 대조와 같은 세액", async ({ page }) => {
    await seed(page, { ...RIGHT, transferType: "burdened_gift" });
    const control = await calcTax(page);

    await seed(page, { ...RIGHT, transferType: "regular" });
    await modeRadio(page, "appraisal").evaluate((el: HTMLInputElement) => el.click());
    await expect(modeRadio(page, "appraisal")).toBeChecked();
    await card(page).locator('[data-field="transferType"]').getByText("부담부증여 (소령 §159)", { exact: true }).first().click();
    await expect.poll(async () => {
      const a = await storedAsset(page);
      return [a?.transferType, a?.isAppraisalAcquisition];
    }).toEqual(["burdened_gift", true]); // 플래그는 남는다(보존) — 읽지 않을 뿐이다

    await expect(card(page).locator('input[type="radio"][name^="successorAcqMode-"]')).toHaveCount(0);
    await expect(card(page).locator('[data-field="bgActualAcquisitionTotal"]')).toHaveCount(0);
    await expect(card(page).getByTestId("bg-successor-right-acq-pointer")).toBeVisible();
    const after = await calcTax(page);

    expect(control.status).toBe(200);
    expect(control.tax).toBeGreaterThan(0);
    expect(after.status).toBe(200);
    expect(after.tax).toBe(control.tax);
  });
});
