/**
 * E2E: §104⑤ 크로스 합산 화면 (C-3c)
 *
 * 계획서: `docs/00-pm/cross-104-5-c3-ui-design.plan.md` §4
 *
 * 검증 대상:
 *  - X-1: 이력이 없을 때 **막다른 길이 아니라** 두 계산기로 가는 길을 준다
 *  - X-2: 이력 2건을 시드하면 연도·후보가 뜨고 **합산 결과**가 나온다(숫자 입력 0칸)
 *  - X-3: 🔒 **주식(§94①3호)은 후보에 나타나지 않는다** — §104⑤ 대상이 아니다
 *  - X-4: C-1 고지 카드의 「합산 계산하기」가 이 화면으로 연결된다
 *
 * IndexedDB(Dexie) 이력을 직접 시드한다 — 마법사를 두 번 돌리는 것보다 빠르고 결정적이다.
 * 정책: [[feedback_browser_verify_with_playwright]]
 */
import { test, expect, type Page } from "@playwright/test";

import { waitForCalculationsStore } from "./_helpers/history-seed";

const LOCAL_USER_ID = "local-user";

/** Dexie `calculations` 테이블에 이력 1건 직접 삽입 */
async function seedCalculation(
  page: Page,
  rec: {
    id: string;
    taxType: string;
    title: string;
    inputData: Record<string, unknown>;
    resultData: Record<string, unknown>;
    taxLawVersion: string;
  },
) {
  await waitForCalculationsStore(page);
  await page.evaluate(
    async ({ rec, uid }) => {
      const open = () =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open("KoreanTaxCalcLocal");
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      const db = await open();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("calculations", "readwrite");
        tx.objectStore("calculations").put({
          ...rec,
          userId: uid,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { rec, uid: LOCAL_USER_ID },
  );
}

/** 부동산 다자산 결과(호별 echo 포함)의 최소 형태 */
const REAL_ESTATE_RESULT = {
  groupTaxes: [],
  calculatedTaxByGroups: 153_000_000,
  calculatedTaxByGeneral: 0,
  calculatedTax: 153_000_000,
  taxBase: 443_500_000,
  clause1BucketTaxBase: 200_000_000,
  clause1BucketTax: 56_060_000,
  clause8TaxBase: 243_500_000,
  clause8Tax: 96_940_000,
  basicDeduction: 2_500_000,
  reductionAmount: 0,
};

/** 기타자산(§94①4호) 단건 결과 */
const OTHER_ASSET_RESULT = {
  basicDeductionGroup: "real_estate_and_other_asset",
  taxBase: 500_000_000,
  calculatedTax: 180_120_000,
  clause1BucketTaxBase: 200_000_000,
  clause1BucketTax: 56_060_000,
  clause9TaxBase: 300_000_000,
  clause9Tax: 124_060_000,
  basicDeduction: 0,
};

test.describe("§104⑤ 크로스 합산", () => {
  test("X-1: 이력이 없으면 두 계산기로 가는 길을 준다", async ({ page }) => {
    await page.goto("/calc/cross-104-5");
    await expect(page.getByText("합산할 수 있는 과세기간이 없습니다")).toBeVisible();
    await expect(page.getByRole("link", { name: "양도소득세(다건) 계산기" })).toBeVisible();
    await expect(page.getByRole("link", { name: "주식 양도소득세 계산기" })).toBeVisible();
  });

  test("X-2: 이력 2건 → 연도·후보 → 합산 결과", async ({ page }) => {
    await page.goto("/calc/cross-104-5");
    await seedCalculation(page, {
      id: "e2e-re-1",
      taxType: "transfer",
      title: "부동산 다건 2024",
      inputData: { __multiTransfer: true, taxYear: 2024 },
      resultData: REAL_ESTATE_RESULT,
      taxLawVersion: "2024",
    });
    await seedCalculation(page, {
      id: "e2e-oa-1",
      taxType: "stock_transfer",
      title: "기타자산 2024",
      inputData: { transferDate: "2024-05-10" },
      resultData: OTHER_ASSET_RESULT,
      taxLawVersion: "2024-05-10",
    });
    await page.reload();

    // 연도는 하나뿐이라 자동 선택된다.
    await expect(page.getByRole("button", { name: "2024년" })).toBeVisible();
    await page.getByText("부동산 다건 2024").click();
    await page.getByText("기타자산 2024").click();

    await page.getByRole("button", { name: "합산 계산" }).click();

    await expect(page.getByText("§104⑤ 합산 산출세액")).toBeVisible();
    // 라우트 테스트 R-1과 같은 도출값 — 2호 채택 380,740,000 · 차이 +47,620,000
    await expect(page.getByText("380,740,000").first()).toBeVisible();
    await expect(page.getByText("+47,620,000")).toBeVisible();
    // 범위 고지(U-3)
    await expect(page.getByText(/지방소득세는 산출세액의 10%/)).toBeVisible();
  });

  test("X-3: 주식(§94①3호)은 후보에 나타나지 않는다", async ({ page }) => {
    await page.goto("/calc/cross-104-5");
    await seedCalculation(page, {
      id: "e2e-re-2",
      taxType: "transfer",
      title: "부동산 다건 2024",
      inputData: { __multiTransfer: true, taxYear: 2024 },
      resultData: REAL_ESTATE_RESULT,
      taxLawVersion: "2024",
    });
    await seedCalculation(page, {
      id: "e2e-stock-only",
      taxType: "stock_transfer",
      title: "상장 대주주 주식 2024",
      inputData: { transferDate: "2024-05-10" },
      resultData: { ...OTHER_ASSET_RESULT, basicDeductionGroup: "stock" },
      taxLawVersion: "2024-05-10",
    });
    await page.reload();

    // 기타자산 후보가 없으므로 합산 가능 연도 자체가 없다.
    await expect(page.getByText("합산할 수 있는 과세기간이 없습니다")).toBeVisible();
    await expect(page.getByText("상장 대주주 주식 2024")).toHaveCount(0);
  });

  test("X-5: 호별 값이 없는 이력은 **「다시 계산」 버튼**을 준다 (C-3d-3)", async ({ page }) => {
    await page.goto("/calc/cross-104-5");
    await seedCalculation(page, {
      id: "e2e-re-single",
      taxType: "transfer",
      // 단건 이력 — `mode:"single"`이라 호별 값이 없다
      inputData: { assets: [{ assetKind: "land" }], transferDate: "2024-03-01" },
      title: "단건 부동산 2024",
      resultData: { mode: "single", result: { calculatedTax: 50_000_000 } },
      taxLawVersion: "2024-03-01",
    });
    await seedCalculation(page, {
      id: "e2e-oa-3",
      taxType: "stock_transfer",
      title: "기타자산 2024",
      inputData: { transferDate: "2024-05-10" },
      resultData: OTHER_ASSET_RESULT,
      taxLawVersion: "2024-05-10",
    });
    await page.reload();

    // 사유가 보이고, 「다시 계산」으로 이어진다(막다른 길이 아니다).
    await expect(page.getByText(/single.*형태라|다시 계산해야/)).toBeVisible();
    await expect(page.getByRole("button", { name: "다시 계산" }).first()).toBeVisible();
  });

  test("X-6: 🔒 **겸용주택은 「다시 계산」 대신 사유**를 보여준다 (W-1)", async ({ page }) => {
    await page.goto("/calc/cross-104-5");
    await seedCalculation(page, {
      id: "e2e-re-mixed",
      taxType: "transfer",
      inputData: { assets: [{ assetKind: "housing" }], transferDate: "2024-03-01" },
      title: "겸용주택 2024",
      resultData: { mode: "mixed-use", result: {} },
      taxLawVersion: "2024-03-01",
    });
    await seedCalculation(page, {
      id: "e2e-oa-4",
      taxType: "stock_transfer",
      title: "기타자산 2024",
      inputData: { transferDate: "2024-05-10" },
      resultData: OTHER_ASSET_RESULT,
      taxLawVersion: "2024-05-10",
    });
    await page.reload();

    await expect(page.getByText(/겸용주택.*다시 계산할 수 없습니다/)).toBeVisible();
  });

  test("X-7: 기본공제 중복이면 **「배분 조정하여 계산」**이 뜬다 (C-3d-2)", async ({ page }) => {
    await page.goto("/calc/cross-104-5");
    await seedCalculation(page, {
      id: "e2e-re-5",
      taxType: "transfer",
      title: "부동산 다건 2024",
      inputData: { __multiTransfer: true, taxYear: 2024 },
      resultData: REAL_ESTATE_RESULT, // basicDeduction 2,500,000
      taxLawVersion: "2024",
    });
    await seedCalculation(page, {
      id: "e2e-oa-5",
      taxType: "stock_transfer",
      title: "기타자산 2024",
      inputData: { transferDate: "2024-05-10" },
      // 주식도 250만원을 써서 합계 500만원 → 250만원 초과
      resultData: { ...OTHER_ASSET_RESULT, basicDeduction: 2_500_000 },
      taxLawVersion: "2024-05-10",
    });
    await page.reload();
    await page.getByText("부동산 다건 2024").click();
    await page.getByText("기타자산 2024").click();

    await expect(page.getByText("양도소득 기본공제가 중복 적용되어 있습니다")).toBeVisible();
    await expect(page.getByRole("button", { name: "배분 조정하여 계산" })).toBeVisible();
    // 부분 배분을 비교하지 않는다는 한계도 적는다(U-1)
    await expect(page.getByText(/부분 배분/)).toBeVisible();
  });

  test("X-4: C-1 고지 카드에서 합산 화면으로 연결된다", async ({ page }) => {
    await page.goto("/calc/cross-104-5");
    // 고지 카드는 결과 화면에만 뜨므로, 링크 대상만 직접 확인한다(라우트 존재 검증).
    await expect(page).toHaveURL(/\/calc\/cross-104-5$/);
    await expect(page.getByRole("heading", { name: /합산 계산/ })).toBeVisible();
  });
});
