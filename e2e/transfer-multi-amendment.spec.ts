/**
 * 다건(multi 직접입력) 양도세 수정신고·경정청구 — 이력 실플로우 UI E2E
 *
 * 실 진입 경로 검증: 이력(IndexedDB)에 다건 record 시드 → /history 카드 [수정신고]/[경정청구] 노출(가드 통과)
 *   → 클릭 → enterMultiAmendment(store in-memory 세팅 + client-side router.push, reload 없음)
 *   → /calc/transfer-tax/multi settings 단계에 ① 정정 배너 ② AmendmentBlock(당초 결정세액 prefill).
 *
 * sessionStorage 시딩 + reload 방식은 다건 계산기 마운트 auto-add가 재수화보다 먼저 실행되는 레이스가 있어
 * 부적합 — 실 플로우는 reload가 없어 그 레이스를 회피한다.
 *
 * worktree 실행: E2E_PORT=3101 npx playwright test e2e/transfer-multi-amendment.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

/** 전체 MultiTransferFormData (B0 이후 이력 inputData 형태) — 재진입 hydration 가능. */
const MULTI_FORM = {
  taxYear: 2026,
  properties: [
    {
      propertyId: "p1",
      propertyLabel: "건1",
      completionPercent: 100,
      form: {
        assets: [{ assetKind: "land", addressJibun: "서울 강남구 대치동 1-1" }],
        transferDate: "2026-02-15",
      },
    },
  ],
  activePropertyIndex: 0,
  activeStep: "settings",
  annualBasicDeductionUsed: "0",
  basicDeductionAllocation: "MAX_BENEFIT",
  // 당초 record는 정정 아님 — 진입 시 enterMultiAmendment가 amendmentMode/correctionKind 세팅
  amendmentMode: false,
  correctionKind: "amend",
  originalDeterminedTax: "",
  amendmentSourceId: "",
  statutoryFilingDeadline: "",
  amendedFilingDate: "",
  applyUnderReportingPenalty: false,
  underReportingReason: "normal",
  underReductionMode: "exempt",
  priorAssessmentNotified: false,
  applyLatePaymentPenalty: false,
  amendedPaymentDate: "",
  claimReasonType: "ordinary",
  posteriorEventDate: "",
  originalPaymentDate: "",
};

/** 다건 양도 이력 record — resultData는 AggregateTransferResult(mode 래퍼 없음). */
const MULTI_RECORD = {
  id: "e2e-multi-1",
  userId: "local-user",
  taxType: "transfer",
  title: "다건 양도 (E2E)",
  inputData: { __multiTransfer: true, ...MULTI_FORM },
  resultData: { determinedTax: 30000000, totalTax: 33000000, properties: [{ propertyId: "p1" }] },
  taxLawVersion: "2026",
  linkedCalculationId: null,
  clientId: null,
  createdAt: "2026-07-03T00:00:00.000Z",
  updatedAt: "2026-07-03T00:00:00.000Z",
};

/** IndexedDB(Dexie "KoreanTaxCalcLocal")의 calculations 스토어에 다건 record 시드. */
async function seedMultiRecord(page: Page) {
  await page.evaluate((record) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("KoreanTaxCalcLocal");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("calculations", "readwrite");
        tx.objectStore("calculations").put(record);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, MULTI_RECORD);
}

test.describe("다건 양도세 수정신고·경정청구 — 이력 실플로우", () => {
  test.beforeEach(async ({ page }) => {
    // /history 최초 진입으로 Dexie가 DB(v6, calculations 스토어)를 생성하도록 유도
    await page.goto("/history");
    // Dexie DB 생성 완료까지 대기 (seed가 스토어 부재로 실패하는 레이스 회피)
    await page.waitForFunction(
      async () => {
        if (typeof indexedDB.databases !== "function") return true;
        const dbs = await indexedDB.databases();
        return dbs.some((d) => d.name === "KoreanTaxCalcLocal");
      },
      { timeout: 15000 },
    );
    await seedMultiRecord(page);
    await page.reload();
    await expect(page.getByText("다건 양도 (E2E)")).toBeVisible({ timeout: 15000 });
  });

  test("[수정신고] 클릭 → /multi settings 배너 + 당초 결정세액 prefill", async ({ page }) => {
    await page.getByRole("button", { name: "수정신고" }).first().click();

    await page.waitForURL(/\/calc\/transfer-tax\/multi/, { timeout: 15000 });
    await expect(page.getByText(/수정신고 작성 중/)).toBeVisible({ timeout: 15000 });

    // AmendmentBlock — 당초 결정세액이 이력 결정세액(30,000,000)으로 prefill
    const orig = page
      .locator('label:has-text("당초 결정세액")')
      .locator("xpath=..")
      .locator("input")
      .first();
    await expect(orig).toHaveValue(/30,?000,?000/);
  });

  test("[경정청구] 클릭 → /multi settings 경정청구 배너", async ({ page }) => {
    await page.getByRole("button", { name: "경정청구" }).first().click();

    await page.waitForURL(/\/calc\/transfer-tax\/multi/, { timeout: 15000 });
    await expect(page.getByText(/경정청구 작성 중/)).toBeVisible({ timeout: 15000 });
  });
});
