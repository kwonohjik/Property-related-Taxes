/**
 * 다건 양도세 — 이력 불러오기 + 기납부세액 자동채움 (Phase 2) 실플로우 E2E
 *
 * 이력(IndexedDB)에 단건 양도 record 시드 → /calc/transfer-tax/multi 진입(마운트 edit 모드)
 *   → edit 헤더 [이력에서 불러오기] → 모달에서 단건 선택 → 자산 append
 *   → 공통 설정에서 기납부세액 "자동 (참고)" 배지 노출(record 결정세액 자동채움).
 *
 * IndexedDB 시드는 Dexie DB 생성 후(/history waitForFunction) — feedback_e2e_client_nav_no_reload_vs_sessionstorage_race.
 * worktree 실행: E2E_PORT=3101 npx playwright test e2e/transfer-multi-prepaid-load.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

/** 단건 양도 이력 record — resultData는 { mode:"single", result: TransferTaxResult } */
const SINGLE_RECORD = {
  id: "e2e-single-load-1",
  userId: "local-user",
  taxType: "transfer",
  title: "단건 양도 A (E2E)",
  inputData: {
    assets: [{ assetKind: "land", addressJibun: "서울 강남구 대치동 2-2" }],
    transferDate: "2026-03-10",
  },
  resultData: { mode: "single", result: { determinedTax: 12340000, localIncomeTax: 1234000 } },
  taxLawVersion: "2026",
  linkedCalculationId: null,
  clientId: null,
  createdAt: "2026-07-04T00:00:00.000Z",
  updatedAt: "2026-07-04T00:00:00.000Z",
};

/** 다건 양도 이력 record — resultData는 AggregateTransferResult(mode 래퍼 없음). */
const MULTI_RECORD = {
  id: "e2e-multi-load-1",
  userId: "local-user",
  taxType: "transfer",
  title: "다건 양도 B (E2E)",
  inputData: {
    __multiTransfer: true,
    taxYear: 2026,
    properties: [
      {
        propertyId: "mp1",
        propertyLabel: "건1",
        completionPercent: 100,
        form: {
          assets: [{ assetKind: "land", addressJibun: "서울 서초구 서초동 3-3" }],
          transferDate: "2026-04-20",
        },
      },
    ],
    activePropertyIndex: 0,
    activeStep: "settings",
    annualBasicDeductionUsed: "0",
    basicDeductionAllocation: "MAX_BENEFIT",
  },
  resultData: {
    determinedTax: 30000000,
    localIncomeTax: 3000000,
    totalTax: 33000000,
    properties: [{ propertyId: "mp1" }],
  },
  taxLawVersion: "2026",
  linkedCalculationId: null,
  clientId: null,
  createdAt: "2026-07-04T01:00:00.000Z",
  updatedAt: "2026-07-04T01:00:00.000Z",
};

async function seedRecord(page: Page, record: unknown) {
  await page.evaluate((rec) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("KoreanTaxCalcLocal");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("calculations", "readwrite");
        tx.objectStore("calculations").put(rec);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, record);
}

test.describe("다건 양도세 — 이력 불러오기 + 기납부 자동채움", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/history");
    await page.waitForFunction(
      async () => {
        if (typeof indexedDB.databases !== "function") return true;
        const dbs = await indexedDB.databases();
        return dbs.some((d) => d.name === "KoreanTaxCalcLocal");
      },
      { timeout: 15000 },
    );
    await seedRecord(page, SINGLE_RECORD);
    await seedRecord(page, MULTI_RECORD);
  });

  test("단건 이력 불러오기 → 자산 append + 기납부 자동채움 배지", async ({ page }) => {
    await page.goto("/calc/transfer-tax/multi");

    // 마운트 edit 모드 → edit 헤더의 불러오기 버튼
    await page.getByTestId("multi-load-history-btn").first().click();

    // 모달에서 단건 record 선택
    await expect(page.getByText("단건 양도 A (E2E)")).toBeVisible({ timeout: 15000 });
    await page.getByTestId(`load-record-${SINGLE_RECORD.id}`).click();

    // append 후 자산 목록(list)에 자산 노출
    await expect(page.getByText("양도 1번")).toBeVisible({ timeout: 15000 });

    // 공통 설정으로 이동 → 기납부세액 자동 배지 노출
    await page.getByRole("button", { name: /공통 설정으로/ }).click();
    await expect(page.getByTestId("prior-paid-tax-auto-badge")).toBeVisible({ timeout: 15000 });
  });

  test("다건 이력 불러오기 → 세션 replace + 기납부 자동채움(결정세액)", async ({ page }) => {
    await page.goto("/calc/transfer-tax/multi");

    // 마운트 edit 모드(빈 자산 1건) → 불러오기 → 다건 record 선택.
    // 현재 세션이 빈 자산뿐이라 폐기 Dialog 없이 바로 replace → 공통 설정 단계로.
    await page.getByTestId("multi-load-history-btn").first().click();
    await expect(page.getByText("다건 양도 B (E2E)")).toBeVisible({ timeout: 15000 });
    await page.getByTestId(`load-record-${MULTI_RECORD.id}`).click();

    // replace 후 공통 설정 단계 + 기납부세액 자동 배지(record 결정세액 30,000,000 자동채움)
    await expect(page.getByTestId("prior-paid-tax-auto-badge")).toBeVisible({ timeout: 15000 });

    // 자산 목록으로 돌아가 hydrate된 자산(건1) 확인
    await page.getByRole("button", { name: /자산 목록으로/ }).first().click();
    await expect(page.getByText("건1")).toBeVisible({ timeout: 15000 });
  });
});
