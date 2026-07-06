/**
 * transfer-multi-filing-form.spec.ts
 *
 * 기능(계획 docs/02-design/features/multi-transfer-filing-form.plan.md):
 *   다건 양도세 결과탭 **맨 위**에 단건과 동일한 "신고서 양식" 표를 합계+자산별 컬럼으로 출력.
 *   FilingFormTable aggregate 모드 재사용, 상단 title="신고서 양식 (합산)"로 구분.
 *
 * Pre-Do anchor: 구현 전에는 이 표가 없어 실패해야 정상(실패 확보 후 Do → 통과).
 *
 * 실 플로우: 이력(IndexedDB) 다건 record 시드 → /calc/transfer-tax/multi 진입
 *   → [이력에서 불러오기] → 세션 replace → 세액 계산 → 결과 검증.
 * (transfer-multi-nbl-business-recalc.spec.ts #509 패턴 재사용)
 */
import { test, expect, type Page } from "@playwright/test";

/** 단순 토지 자산 폼 (NBL·감면 없음) — API 필수 필드 충족. */
function landAsset(price: string, area: string) {
  return {
    assetKind: "land",
    acquisitionDate: "2015-01-01",
    acquisitionArea: area,
    useEstimatedAcquisition: false,
    isAppraisalAcquisition: false,
    isSalesCaseAcquisition: false,
    fixedAcquisitionPrice: price,
    directExpenses: "0",
    isNonBusinessLand: false,
    reductions: [],
  };
}

function propertyForm(price: string, transferDate: string) {
  return {
    assets: [landAsset(price, "1000")],
    transferDate,
    contractTotalPrice: price,
    householdHousingCount: "1",
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isOneHousehold: false,
  };
}

const MULTI_RECORD = {
  id: "e2e-multi-filing-1",
  userId: "local-user",
  taxType: "transfer",
  title: "다건 신고서 양식 (E2E)",
  inputData: {
    __multiTransfer: true,
    taxYear: 2026,
    properties: [
      { propertyId: "np1", propertyLabel: "건1", completionPercent: 100, form: propertyForm("826000000", "2026-01-01") },
      { propertyId: "np2", propertyLabel: "건2", completionPercent: 100, form: propertyForm("325000000", "2026-03-01") },
    ],
    activePropertyIndex: 0,
    activeStep: "settings",
    annualBasicDeductionUsed: "0",
    basicDeductionAllocation: "MAX_BENEFIT",
  },
  resultData: { determinedTax: 0, totalTax: 0, properties: [{ propertyId: "np1" }, { propertyId: "np2" }] },
  taxLawVersion: "2026",
  linkedCalculationId: null,
  clientId: null,
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
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

test.describe("다건 결과탭 상단 신고서 양식 (합계+자산별)", () => {
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
    await seedRecord(page, MULTI_RECORD);
  });

  test("결과탭 맨 위에 '신고서 양식 (합산)' 표가 합산 요약 카드보다 앞서 렌더된다", async ({ page }) => {
    await page.goto("/calc/transfer-tax/multi");

    await page.getByTestId("multi-load-history-btn").first().click();
    await expect(page.getByText("다건 신고서 양식 (E2E)")).toBeVisible({ timeout: 15000 });
    await page.getByTestId(`load-record-${MULTI_RECORD.id}`).click();

    const respPromise = page.waitForResponse(
      (r) => r.url().includes("/api/calc/transfer/multi") && r.request().method() === "POST",
      { timeout: 15000 },
    );
    await page.getByRole("button", { name: "세액 계산" }).click();
    const resp = await respPromise;
    expect(resp.status()).toBe(200);

    // 결과 렌더 대기
    await expect(page.getByText("건별 상세").first()).toBeVisible({ timeout: 15000 });

    // 핵심 anchor: 상단 합산 신고서 양식 (구현 전엔 없음 → 실패)
    // PrintSection 래퍼 data-print-id로 특정 (title 텍스트는 per-property 아코디언과 중복 회피)
    const filingSection = page.locator('[data-print-id="form-table"]');
    await expect(filingSection.getByText("신고서 양식 (합산)")).toBeVisible({ timeout: 15000 });

    // DOM 순서: form-table PrintSection이 summary PrintSection보다 앞에 위치
    // (PrintSelectionPanel의 "합산 결과" 체크박스 라벨과 무관 — 실제 섹션 div y 비교)
    const summarySection = page.locator('[data-print-id="summary"]');
    await expect(summarySection).toBeVisible({ timeout: 15000 });
    const filingBox = await filingSection.boundingBox();
    const summaryBox = await summarySection.boundingBox();
    expect(filingBox && summaryBox && filingBox.y < summaryBox.y).toBeTruthy();
  });

  // Phase A anchor — 자산별 양도일(수정①) + 기납부·차감납부 행(수정②)
  test("자산별 양도일이 각 자산 실제값으로 표시되고 차감납부할세액 행이 렌더된다", async ({ page }) => {
    await page.goto("/calc/transfer-tax/multi");

    await page.getByTestId("multi-load-history-btn").first().click();
    await expect(page.getByText("다건 신고서 양식 (E2E)")).toBeVisible({ timeout: 15000 });
    await page.getByTestId(`load-record-${MULTI_RECORD.id}`).click();

    const respPromise = page.waitForResponse(
      (r) => r.url().includes("/api/calc/transfer/multi") && r.request().method() === "POST",
      { timeout: 15000 },
    );
    await page.getByRole("button", { name: "세액 계산" }).click();
    expect((await respPromise).status()).toBe(200);
    await expect(page.getByText("건별 상세").first()).toBeVisible({ timeout: 15000 });

    const filingSection = page.locator('[data-print-id="form-table"]');
    // 수정①: 자산2 양도일(2026-03-01)이 신고서 양식에 표시 (버그 시 자산1 값 2026-01-01만 존재)
    await expect(filingSection.getByText("2026-03-01")).toBeVisible({ timeout: 15000 });
    // 수정②: 차감납부할세액 행 렌더 (기납부 0 → 차감납부=총결정세액)
    await expect(filingSection.getByText("차감납부할세액")).toBeVisible({ timeout: 15000 });
  });
});
