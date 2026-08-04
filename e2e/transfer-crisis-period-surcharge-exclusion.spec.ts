/**
 * transfer-crisis-period-surcharge-exclusion.spec.ts
 *
 * 부칙 §9270호 §14①(2009.3.16~2012.12.31 취득 자산 중과세율 배제) — E2E.
 * 비사업용 토지 2건(2010 취득=부칙 배제 / 2015 취득=+10%p 중과)을 이력에서 불러와 재계산하고,
 * 계산 API 응답 본문으로 per-property `nblSurchargeExcluded` 차이를 검증한다(DOM 셀렉터 취약성 회피).
 *
 * seed→불러오기→재계산 패턴은 transfer-multi-nbl-business-recalc.spec.ts(#508)와 동일.
 * 실행: E2E_PORT=3103 npx playwright test e2e/transfer-crisis-period-surcharge-exclusion.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

/** 비사업용 토지 자산 — 자경하지 않는 농지(비사업용 판정). #508 asset 구조 준용. */
function nblLandAsset(acquisitionDate: string) {
  return {
    assetKind: "land",
    acquisitionDate,
    acquisitionArea: "1000",
    useEstimatedAcquisition: false,
    isAppraisalAcquisition: false,
    isSalesCaseAcquisition: false,
    fixedAcquisitionPrice: "200000000",
    directExpenses: "0",
    isNonBusinessLand: true,
    // ── NBL 정밀판정(자경 아님 → 비사업용) ──
    nblUseDetailedJudgment: true,
    nblLandType: "farmland",
    nblZoneType: "agriculture_forest",
    nblFarmingSelf: false,
    nblFarmerResidenceDistance: "100",
    nblBusinessUsePeriods: [],
    reductions: [],
  };
}

function nblProperty(propertyId: string, label: string, acquisitionDate: string) {
  return {
    propertyId,
    propertyLabel: label,
    completionPercent: 100,
    form: {
      assets: [nblLandAsset(acquisitionDate)],
      transferDate: "2026-06-01",
      contractTotalPrice: "600,000,000",
      householdHousingCount: "1",
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
      isOneHousehold: false,
    },
  };
}

const RECORD = {
  id: "e2e-crisis-nbl-1",
  userId: "local-user",
  taxType: "transfer",
  title: "부칙 §14① 비사업용 토지 (E2E)",
  inputData: {
    __multiTransfer: true,
    taxYear: 2026,
    properties: [
      nblProperty("crisis", "부칙배제(2010)", "2010-06-01"), // 부칙 §14① window 내 → 배제
      nblProperty("normal", "중과(2015)", "2015-06-01"), // window 밖 → +10%p 중과
    ],
    activePropertyIndex: 0,
    activeStep: "settings",
    annualBasicDeductionUsed: "0",
    basicDeductionAllocation: "MAX_BENEFIT",
  },
  resultData: { determinedTax: 0, totalTax: 0, properties: [{ propertyId: "crisis" }, { propertyId: "normal" }] },
  taxLawVersion: "2026",
  linkedCalculationId: null,
  clientId: null,
  createdAt: "2026-07-26T00:00:00.000Z",
  updatedAt: "2026-07-26T00:00:00.000Z",
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

test.describe("부칙 §9270호 §14① — 취득기간 중과배제 (E2E)", () => {
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
    await seedRecord(page, RECORD);
  });

  test("2010 취득 비사업용 토지는 +10%p 배제, 2015 취득은 중과 — 응답 본문 검증", async ({ page }) => {
    await page.goto("/calc/transfer-tax/multi");
    await page.getByTestId("multi-load-history-btn").first().click();
    await expect(page.getByText("부칙 §14① 비사업용 토지 (E2E)")).toBeVisible({ timeout: 15000 });
    await page.getByTestId(`load-record-${RECORD.id}`).click();

    const respPromise = page.waitForResponse(
      (r) => r.url().includes("/api/calc/transfer/multi") && r.request().method() === "POST",
      { timeout: 15000 },
    );
    await page.getByRole("button", { name: "세액 계산" }).click();
    const resp = await respPromise;
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    const props: Array<Record<string, number | string>> = body.data?.properties ?? [];
    const crisis = props.find((p) => p.propertyId === "crisis")!;
    const normal = props.find((p) => p.propertyId === "normal")!;

    /**
     * 🔄 계약 변경 (PR#1020 `ff8d8232`, 2026-08-03) — crisis의 `rateGroup`이 뒤집혔다.
     *
     * 종전 이 spec은 "두 건 모두 비사업용 판정 — 세율만 부칙으로 갈린다"를 고정했다.
     * 그러나 부칙 §9270호 §14①로 +10%p가 배제되면 **해당 호 자체가 §104①1호**이므로
     * §104⑤ 그룹도 `progressive`여야 한다
     * (`legal-codes/surcharge-transition.ts:41` 「중과세율 배제 → §104①1호 기본세율」 ·
     *  기획재정부 재산세제과-1422 · 서울행정법원 2024구단72950).
     *
     * 종전 분류는 위기취득 비사토가 같은 §104①1호 자산과 §104⑤2호 버킷을 공유하지 못해
     * 누진이 두 번 태워졌고 **20,640,000원 과소**를 냈다
     * (anchor `aggregate-crisis-nbl-clause-group.anchor.test.ts` C-1 · 대조군 C-2).
     *
     * ⚠️ PR#1020은 vitest anchor 4건만 신설하고 이 E2E를 갱신하지 않아, 머지 이후
     *    CI가 상시 실패 상태였다(브랜치 보호가 없어 머지는 차단되지 않는다).
     */
    expect(crisis.rateGroup).toBe("progressive");
    expect(normal.rateGroup).toBe("non_business_land");

    // crisis(2010 취득): 부칙 §14① → 기본세율 적용. 과세표준 2.8억(1.5억~3억) → 기본 38%(비사업용 48% 아님).
    expect(crisis.appliedRate).toBe(0.38);
    // normal(2015 취득): 비사업용 +10%p 중과. 과세표준 3.12억(3억~5억) → 기본 40% + 10%p = 50%.
    expect(normal.appliedRate).toBe(0.5);

    // 결과 렌더 확인
    await expect(page.getByText("건별 상세").first()).toBeVisible({ timeout: 15000 });
  });
});
