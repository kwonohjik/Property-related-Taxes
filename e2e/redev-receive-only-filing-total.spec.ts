/**
 * 청산금 수령분 단독 신고(사례 46) — 결과탭 「신고서 양식」 합계 열 회귀 E2E.
 *
 * 결함: 신고 대상은 청산금 수령분뿐인데 합계 열이 폼의 자산-수준 양도가액(신축APT 양도가)과
 *   폼 양도일을 그대로 읽어 ①+②+③ 파트 합과 어긋났다.
 *   → 양도가액 525,000,000(파트 합 114,000,000) · 취득가액 456,600,000(파트 합 45,600,000)
 *
 * 계획서: docs/02-design/features/redev-receive-only-display-total-mismatch.plan.md (E-1)
 *
 * 단위 anchor(`__tests__/components/redev-receive-only-filing-total.anchor.test.ts`)는
 * buildRows/buildStatementItems를 직접 호출한다. 본 spec은 그 보정이 **실제 결과뷰에 도달하는지**를
 * 지킨다(memory `feedback_transfer_result_view_is_not_one` — 양도세 결과뷰는 하나가 아니다).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { seedWithDeclaredRoster } from "./_helpers/roster-for-declared-count";

function seedForm(assetPatch: Record<string, string | boolean> = {}) {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1), ...DIRECT_RESIDENCE, addressJibun: "서울 강남구 테스트동 1-1",
          assetKind: "redevelopment_apt",
          acquisitionCause: "purchase",
          acquisitionDate: "2002-04-09",
          fixedAcquisitionPrice: "200000000",
          useEstimatedAcquisition: false,
          // 실가 모드 — 인가전 분 종전 주택 취득가액 (§166①1호 · validate 필수)
          redevActualAcquisitionPrice: "200000000",
          redevSubject: "apt",
          redevApprovalLawBasis: "urban_renovation_art_74",
          redevOriginalAssetType: "housing",
          redevSettlementDirection: "receive",
          redevReceiveOnlyMode: "yes",            // 청산금 수령분 단독 신고
          redevExemptionEligibleAtApproval: "no",
          redevApprovalDate: "2009-10-23",
          redevRightsValue: "500000000",
          redevSettlementAmount: "114000000",
          redevSettlementSaleDate: "2024-01-26",  // 소유권이전 고시일(2024-01-25) 익일
          redevPreApprovalExpenses: "0",
          redevPostApprovalExpenses: "0",
          ...assetPatch,
        }],
        // 폼에 남은 신축APT 양도가 — receiveOnly에서는 신고 대상이 아니다. 양도일은 고시일 다음날이어야 ⑧을 지난다.
        transferDate: "2024-01-26",
        filingDate: "2024-03-31",
        contractTotalPrice: "525000000",
        householdHousingCount: "2",
        // roster-required PR-B(재개발APT): 명부 0행 + 미확정이면 ⑧이 차단한다 — houses가 비어
        // 있으므로(D-4) 확정만 켜면 스칼라 선언값이 그대로 쓰인다(세액 영향 없음, PR-1 패턴 재사용).
        householdNoOtherHousesConfirmed: true,
        householdNoPresaleRightsConfirmed: true, // roster-required PR-D
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seedAndCalc(page: Page, assetPatch: Record<string, string | boolean> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedWithDeclaredRoster(seedForm(assetPatch)));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 20000 });
}

test.describe("청산금 수령분 단독 신고 — 신고서 합계 열", () => {
  test("합계 양도가액 = 청산금 114,000,000 · 취득가액 = 안분 45,600,000 (신축APT 양도가 아님)", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page);

    await expect(page.getByRole("row", { name: /양도가액.*114,000,000/ }).first()).toBeVisible();
    await expect(page.getByRole("row", { name: /취득가액.*45,600,000/ }).first()).toBeVisible();

    // 결함 값(폼 양도가액 그대로 · 역산 취득가액)이 화면에 없어야 한다.
    await expect(page.getByText("525,000,000")).toHaveCount(0);
    await expect(page.getByText("456,600,000")).toHaveCount(0);
  });

  /**
   * 양도소득세 집행기준 100-166-10 — (취득가액 + 필요경비 등) × 청산금 ÷ 평가액.
   * 필요경비 10,000,000(인가전 분 4,000,000 + 자본적지출 5,000,000 + 양도비 1,000,000) × 114,000,000 ÷ 500,000,000 = 2,280,000
   * 양도차익 = 114,000,000 − 45,600,000 − 2,280,000 = 66,120,000
   */
  test("필요경비 칸이 폼→API→엔진을 거쳐 청산금 비율로 안분된다", async ({ page }) => {
    test.setTimeout(60_000);
    const requestPromise = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
    await seedAndCalc(page, { redevPreApprovalExpenses: "4000000", capitalExpenditure: "5000000", transferExpense: "1000000" });
    const body = (await requestPromise).postDataJSON();
    expect(body.redevelopment.preApprovalExpenses).toBe(4_000_000);
    expect(body.redevelopment.postApprovalExpenses).toBe(5_000_000);
    expect(body.redevelopment.transferExpense).toBe(1_000_000);

    await expect(page.getByRole("row", { name: /필요경비.*2,280,000/ }).first()).toBeVisible();
    await expect(page.getByRole("row", { name: /양도차익.*66,120,000/ }).first()).toBeVisible();
    await expect(page.getByRole("row", { name: /취득가액.*45,600,000/ }).first()).toBeVisible();
  });

  /**
   * 「소득세법」 §97②2호 단서 — 환산취득가액 100,000,000 + 개산공제 3,000,000 < 자본적지출·양도비 200,000,000.
   * 필요경비 = 200,000,000 × 114,000,000 ÷ 500,000,000 = 45,600,000 · 양도차익 = 114,000,000 − 45,600,000 = 68,400,000
   * 환산이면 숨는 인가전 분 칸의 저장값(4,000,000)은 나목에 들어가지 않는다.
   */
  test("환산 — 자본적지출·양도비가 더 크면 환산취득가액 대신 그 합계를 안분해 공제한다", async ({ page }) => {
    test.setTimeout(60_000);
    const requestPromise = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
    await seedAndCalc(page, {
      useEstimatedAcquisition: true,
      redevActualAcquisitionPrice: "",
      redevAcquisitionHousingPrice: "100000000",
      redevManagementDisposalHousingPrice: "500000000",
      redevPreApprovalExpenses: "4000000",
      capitalExpenditure: "190000000",
      transferExpense: "10000000",
    });
    const body = (await requestPromise).postDataJSON();
    expect(body.redevelopment.preApprovalExpenses).toBe(0);
    expect(body.redevelopment.postApprovalExpenses).toBe(190_000_000);
    expect(body.redevelopment.transferExpense).toBe(10_000_000);

    await expect(page.getByRole("row", { name: /필요경비.*45,600,000/ }).first()).toBeVisible();
    await expect(page.getByRole("row", { name: /양도차익.*68,400,000/ }).first()).toBeVisible();
    await expect(page.getByTestId("redev-receive-only-proviso")).toContainText("103,000,000");
  });
  /**
   * 결과 카드 한 칸 구조(사용자 결정 2026-11-12 a) — 제목 · 인가전/인가후 칸 없음 · 「안분 필요경비 등」 행.
   * 필요경비 10,000,000 × 114,000,000 ÷ 500,000,000 = 2,280,000 → 114,000,000 − 45,600,000 − 2,280,000 = 66,120,000
   */
  test("결과 카드 — 단독 신고 한 칸 · 안분 필요경비 등 2,280,000", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page, { redevPreApprovalExpenses: "4000000", capitalExpenditure: "5000000", transferExpense: "1000000" });
    const title = page.getByRole("heading", { name: "청산금 수령분 단독 신고 양도차익" });
    await expect(title).toBeVisible();
    await expect(page.getByText("재개발/재건축 양도차익 3분할")).toHaveCount(0);
    await expect(page.getByText("미신고 — 청산금 수령분 단독 신고")).toHaveCount(0);
    await expect(page.getByText(/안분 필요경비 등/).first()).toBeVisible();
    await expect(page.locator("div").filter({ hasText: /^안분 필요경비 등.*2,280,000$/ }).first()).toBeVisible();
  });
  /**
   * 동시신고(수령) — 결과 카드 세 열마다 필요경비 행(2026-11-12). 인가 전 실비 4,000,000 · 자본적지출 5,000,000.
   * ① 4,000,000 × 386,000,000 ÷ 500,000,000 = 3,088,000 · ② 인가후 5,000,000 · ③ 4,000,000 − 3,088,000 = 912,000
   */
  test("결과 카드 — 동시신고 세 열 필요경비 행", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page, { redevReceiveOnlyMode: "no", redevPreApprovalExpenses: "4000000", capitalExpenditure: "5000000" });
    await expect(page.getByRole("heading", { name: "재개발/재건축 양도차익 3분할" })).toBeVisible();
    await expect(page.locator("div").filter({ hasText: /^안분 필요경비\(=필요경비 × .*3,088,000$/ }).first()).toBeVisible();
    await expect(page.locator("div").filter({ hasText: /^인가후 필요경비5,000,000$/ }).first()).toBeVisible();
    await expect(page.locator("div").filter({ hasText: /^안분 필요경비 등\(=인가전 필요경비 등 × .*912,000$/ }).first()).toBeVisible();
  });
});
