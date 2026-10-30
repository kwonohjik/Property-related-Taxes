/**
 * E2E: 원조합원 입주권(비부담부증여) × 이월과세 — 종전 부동산 취득가액을 「확인할 수 있는가」는 이월과세 「환산취득가 사용」 한 곳이 정한다.
 * 계획서 `docs/02-design/features/redev-carryover-estimation-toggle-sync.plan.md`(Q-1 a · Q-2 a · Q-3 a).
 *
 * 시료: 입주권(종전 주택 · 인가일 2024-01-10 · 권리가액 900,000,000 · 청산금 납부 200,000,000) · 양도가액 1,300,000,000 · 증여자 2012-01-01 취득 ·
 * §166③ 인가일 개별주택공시가격 500,000,000 · 취득당시 20,000,000.
 *
 *   CV-E1. 이월과세 실가(증여자 100,000,000) + ⑤ 라디오에 환산이 남은 저장 입력 — 증여자 취득가액으로 계산(전체 양도차익 1,000,000,000 · 종전 §166③ 환산 1,063,400,000) · ⑤ 라디오 없음
 *   CV-E2. 이월과세 「환산취득가 사용」을 화면에서 켠다(⑤는 실가로 남아 있다) — ⑤에 §166③ 안내가 뜨고 계산이 된다(종전 서버 400) · 전체 양도차익 1,063,400,000
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const asset = (over: Record<string, unknown>, car: Record<string, unknown>) => ({
  ...makeDefaultAsset(1),
  addressJibun: "서울 강남구 테스트동 3-1", assetKind: "right_to_move_in", redevSubject: "right", redevOriginalAssetType: "housing", redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2024-01-10", redevRightsValue: "900000000", redevSettlementDirection: "pay", redevSettlementAmount: "200000000", redevPreApprovalExpenses: "0",
  redevManagementDisposalHousingPrice: "500000000", redevAcquisitionHousingPrice: "20000000", redevActualAcquisitionPrice: "",
  fixedSalePrice: "1,300,000,000", actualSalePrice: "1,300,000,000", transferType: "regular", acquisitionCause: "carryover_gift", acquisitionDate: "2023-06-01",
  carryover: {
    giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2012-01-01", donorAcquisitionCause: "purchase", donorAcquisitionPrice: "100000000", useEstimatedAcquisition: false, estimationMode: null,
    donorRelation: "lineal", giftTaxAmount: "0", donorCapitalExpenditure: "0", giftDateValuation: "300000000", exclusionDeclared: {}, donorHouseholdHoldingStartDate: "2012-01-01", ...car,
  },
  ...over,
});

async function seed(page: Page, a: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          assets: [a], contractTotalPrice: "1300000000", transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false,
          householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
        },
        pendingMigration: false,
      },
      version: 0,
    },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

async function calc(page: Page) {
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const r = await res;
  expect(r.status(), await r.text()).toBe(200);
}

const sectionText = (page: Page, id: string) => page.locator(`[data-print-id="${id}"]`).first().evaluate((el) => (el.textContent ?? "").replace(/\s+/g, " "));

test("CV-E1: 이월과세 실가 + ⑤에 환산이 남은 입력 — 증여자 취득가액으로 계산 · ⑤ 라디오 없음", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, asset({ useEstimatedAcquisition: true }, {}));
  await expect(page.getByTestId("redev-carryover-acq-notice")).toContainText("이월과세 자산은 당초 증여자의 취득가액을 이월과세 「증여자 취득가액」에서 입력합니다");
  await expect(page.locator('[data-field="useEstimatedAcquisition"]')).toHaveCount(0);
  await calc(page);
  expect(await sectionText(page, "form-table")).toContain("전체 양도차익1,000,000,000");
});

test("CV-E2: 이월과세 「환산취득가 사용」을 켜면 ⑤에 §166③ 안내가 뜨고 계산된다(⑤는 실가로 남아 있다)", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, asset({ useEstimatedAcquisition: false }, {}));
  await page.getByRole("button", { name: /3\s*취득/ }).first().click(); // ③ 취득 섹션 열기
  await page.locator('span:text-is("환산취득가 사용"):visible').first().click();
  await expect(page.getByTestId("redev-carryover-acq-notice")).toContainText("이월과세 「환산취득가 사용」을 켰습니다");
  await expect(page.getByTestId("carryover-redev-sec166-3-notice")).toBeVisible();
  await calc(page);
  expect(await sectionText(page, "form-table")).toContain("전체 양도차익1,063,400,000");
});
