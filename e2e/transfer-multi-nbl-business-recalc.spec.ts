/**
 * transfer-multi-nbl-business-recalc.spec.ts
 *
 * 회귀 방지(#508): 이력에서 다건 양도를 불러와 재계산할 때, 원시 isNonBusinessLand=true지만
 * 정밀판정(nonBusinessLandDetails)이 사업용(자경 농지)인 토지가 다건에서 비사업용 중과(+10%p)로
 * 과다 과세되지 않아야 한다. 결과 건별 배지는 "비사업용 토지"가 아니라 "일반 누진"이어야 한다.
 *
 * 실 플로우: 이력(IndexedDB) 다건 record 시드 → /calc/transfer-tax/multi 진입
 *   → [이력에서 불러오기] → 세션 replace → 세액 계산 → 결과 검증.
 * (feedback_e2e_client_nav_no_reload_vs_sessionstorage_race: Dexie DB 생성 후 시드)
 */
import { test, expect, type Page } from "@playwright/test";

import { putCalculationRecord } from "./_helpers/history-seed";

/** 자경 농지(사업용 판정) 토지 자산 폼 — 원시 isNonBusinessLand=true. */
function businessLandAsset(price: string, area: string, transferDate: string) {
  return {
    assetKind: "land",
    acquisitionDate: "2015-01-01",
    acquisitionArea: area,
    useEstimatedAcquisition: false,
    isAppraisalAcquisition: false,
    isSalesCaseAcquisition: false,
    fixedAcquisitionPrice: price,
    directExpenses: "0",
    isNonBusinessLand: true, // 원시 체크박스 true
    // ── NBL 정밀판정(자경 농지 → 사업용) ──
    nblUseDetailedJudgment: true,
    nblLandType: "farmland",
    nblZoneType: "agriculture_forest",
    nblFarmingSelf: true,
    nblFarmerResidenceDistance: "10",
    nblBusinessUsePeriods: [
      { startDate: "2015-01-02", endDate: transferDate, usageType: "자경" },
    ],
    reductions: [],
  };
}

const MULTI_RECORD = {
  id: "e2e-multi-nbl-1",
  userId: "local-user",
  taxType: "transfer",
  title: "다건 NBL 사업용 (E2E)",
  inputData: {
    __multiTransfer: true,
    taxYear: 2026,
    properties: [
      {
        propertyId: "np1",
        propertyLabel: "건1",
        completionPercent: 100,
        form: {
          assets: [businessLandAsset("826000000", "5000", "2026-01-01")],
          transferDate: "2026-01-01",
          contractTotalPrice: "826,000,000",
          householdHousingCount: "1",
          isRegulatedArea: false,
          wasRegulatedAtAcquisition: false,
          isUnregistered: false,
          isOneHousehold: false,
        },
      },
      {
        propertyId: "np2",
        propertyLabel: "건2",
        completionPercent: 100,
        form: {
          assets: [businessLandAsset("325000000", "3000", "2026-03-01")],
          transferDate: "2026-03-01",
          contractTotalPrice: "325,000,000",
          householdHousingCount: "1",
          isRegulatedArea: false,
          wasRegulatedAtAcquisition: false,
          isUnregistered: false,
          isOneHousehold: false,
        },
      },
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
  await putCalculationRecord(page, record);
}

test.describe("다건 이력 불러오기 → 재계산 — NBL 사업용 오중과 회귀(#508)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/history");
    await seedRecord(page, MULTI_RECORD);
  });

  test("사업용 판정 토지는 비사업용 중과 없이 재계산된다", async ({ page }) => {
    await page.goto("/calc/transfer-tax/multi");

    // 마운트 edit 모드(빈 자산) → 불러오기 → 다건 record replace → 공통 설정
    await page.getByTestId("multi-load-history-btn").first().click();
    await expect(page.getByText("다건 NBL 사업용 (E2E)")).toBeVisible({ timeout: 15000 });
    await page.getByTestId(`load-record-${MULTI_RECORD.id}`).click();

    // 세액 계산 (요청/응답 가로채기)
    const reqPromise = page.waitForRequest(
      (r) => r.url().includes("/api/calc/transfer/multi") && r.method() === "POST",
      { timeout: 15000 },
    );
    const respPromise = page.waitForResponse(
      (r) => r.url().includes("/api/calc/transfer/multi") && r.request().method() === "POST",
      { timeout: 15000 },
    );
    await page.getByRole("button", { name: "세액 계산" }).click();
    const req = await reqPromise;
    const resp = await respPromise;

    // NBL 정밀판정 raw가 전송됐는지(파이프라인 도달)
    const body = JSON.parse(req.postData() ?? "{}");
    expect(body.properties?.[0]?.nonBusinessLandRaw).toBeTruthy();
    expect(resp.status()).toBe(200);

    // 결과 렌더 대기 — 건별 상세
    await expect(page.getByText("건별 상세").first()).toBeVisible({ timeout: 15000 });

    // 핵심: 사업용 판정이므로 "비사업용 토지" 배지가 없어야 한다(#508 수정 전엔 노출됐음)
    await expect(page.getByText("비사업용 토지")).toHaveCount(0);
    // 일반 누진 배지로 표시
    await expect(page.getByText("일반 누진").first()).toBeVisible({ timeout: 15000 });
  });
});
