/**
 * transfer-multi-loss-offset-same-rate.spec.ts
 *
 * 제보 재현 — **§102② 차손 통산이 「같은 세율」이 아니라 「같은 호」로 묶였다**.
 *
 * 입력 4건(전부 2026-06-01 양도):
 *   ① 토지 60,000,000 (§55① 누진)
 *   ② **미등기 차손 −20,000,000** (§104①10호 **70%**)
 *   ③ **주택 1년미만 19,000,000** (§104①3호 괄호 **70%**)
 *   ④ 토지 140,000,000 (§55① 누진)
 *
 * 종전(결함): ②와 ③이 `unregistered` / `short_term`으로 갈려 **전액 2호 안분**
 *   → 5,479,452 / 1,735,159 / 12,785,389 · 총 납부세액 65,400,222
 * 기대: 같은 70%이므로 ③에 **19,000,000 먼저**(§167의2①1호) → 잔액 1,000,000을
 *   60:140으로 안분 = **300,000 / 700,000** · 총 납부세액 **60,203,000**
 *
 * 🔑 **vitest anchor로는 부족하다** — 통산 결과가 실제로 화면의 「차손 통산 (동일그룹)」·
 *    「(타군안분)」 행으로 흘러가는지는 렌더된 표에서만 확인된다
 *    (memory `feedback_browser_verify_with_playwright`).
 *
 * 계획서: `docs/00-pm/loss-offset-same-rate-axis.plan.md`
 */
import { test, expect, type Page } from "@playwright/test";

import { putCalculationRecord } from "./_helpers/history-seed";
import { openHistoryModal } from "./_helpers/navigation";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function assetOf(assetKind: string, acquisitionDate: string, acqPrice: string) {
  return {
    ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1",
    assetKind,
    acquisitionDate,
    acquisitionArea: "1000",
    useEstimatedAcquisition: false,
    isAppraisalAcquisition: false,
    isSalesCaseAcquisition: false,
    fixedAcquisitionPrice: acqPrice,
    directExpenses: "0",
    isNonBusinessLand: false,
    reductions: [],
  };
}

/**
 * ⚠️ **앱의 기본 폼에서 출발한다.** 손으로 최소 필드만 적으면 화면이
 *    `Cannot read properties of undefined (reading 'length')`로 죽는다 — 신규 배열 필드가
 *    추가될 때마다 픽스처가 조용히 낡기 때문이다(memory `feedback_fixture_default_masks_gate_defect`).
 */
function propertyForm(o: {
  assetKind: string;
  acquisitionDate: string;
  acqPrice: string;
  price: string;
  unregistered?: boolean;
}) {
  return {
    ...createDefaultTransferFormData(),
    assets: [assetOf(o.assetKind, o.acquisitionDate, o.acqPrice)],
    transferDate: "2026-06-01",
    filingDate: "",
    contractTotalPrice: o.price,
    householdHousingCount: "1",
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: o.unregistered ?? false,
    isOneHousehold: false,
  };
}

/** 보유 2년 이상·3년 미만 — 단기세율도 장기보유특별공제도 타지 않아 양도차익 = 양도소득금액 */
const LONG = "2024-01-01";
/** 보유 8개월 — §104①3호 단기 */
const SHORT = "2025-10-01";

const RECORD = {
  id: "e2e-loss-offset-same-rate",
  userId: "local-user",
  taxType: "transfer",
  title: "차손 통산 세율축 (E2E)",
  inputData: {
    __multiTransfer: true,
    taxYear: 2026,
    properties: [
      { propertyId: "lp1", propertyLabel: "토지1", completionPercent: 100,
        form: propertyForm({ assetKind: "land", acquisitionDate: LONG, acqPrice: "100000000", price: "160000000" }) },
      { propertyId: "lp2", propertyLabel: "미등기", completionPercent: 100,
        form: propertyForm({ assetKind: "land", acquisitionDate: LONG, acqPrice: "100000000", price: "80000000", unregistered: true }) },
      { propertyId: "lp3", propertyLabel: "주택단기", completionPercent: 100,
        form: propertyForm({ assetKind: "housing", acquisitionDate: SHORT, acqPrice: "100000000", price: "119000000" }) },
      { propertyId: "lp4", propertyLabel: "토지2", completionPercent: 100,
        form: propertyForm({ assetKind: "land", acquisitionDate: LONG, acqPrice: "100000000", price: "240000000" }) },
    ],
    activePropertyIndex: 0,
    activeStep: "settings",
    annualBasicDeductionUsed: "0",
    basicDeductionAllocation: "MAX_BENEFIT",
  },
  resultData: {
    determinedTax: 0,
    totalTax: 0,
    properties: [{ propertyId: "lp1" }, { propertyId: "lp2" }, { propertyId: "lp3" }, { propertyId: "lp4" }],
  },
  taxLawVersion: "2026",
  linkedCalculationId: null,
  clientId: null,
  createdAt: "2026-09-16T00:00:00.000Z",
  updatedAt: "2026-09-16T00:00:00.000Z",
};

/** 이력 시드 → 다건 화면 진입 → 불러오기 → 세액 계산 */
async function calculate(page: Page) {
  await page.goto("/history");
  await putCalculationRecord(page, RECORD);
  await page.goto("/calc/transfer-tax/multi");

  await openHistoryModal(
    page,
    page.getByTestId("multi-load-history-btn").first(),
    page.getByText("차손 통산 세율축 (E2E)"),
  );
  await page.getByTestId(`load-record-${RECORD.id}`).click();

  const respPromise = page.waitForResponse(
    (r) => r.url().includes("/api/calc/transfer/multi") && r.request().method() === "POST",
    { timeout: 20000 },
  );
  await page.getByRole("button", { name: "세액 계산" }).click();
  const resp = await respPromise;
  expect(resp.status()).toBe(200);
  await expect(page.getByText("건별 상세").first()).toBeVisible({ timeout: 20000 });
  return resp;
}

test.describe("§102② 통산 축 — 같은 세율(영 §167의2①1호)", () => {
  test("미등기 70% 차손이 주택 1년미만 70%에 먼저 공제되고 잔액만 안분된다", async ({ page }) => {
    test.setTimeout(120_000);
    const resp = await calculate(page);

    // ─── 엔진 응답 — 배분이 법정 순서를 따른다 ───────────────────────
    const body = await resp.json();
    const by = (id: string) =>
      body.data.properties.find((p: { propertyId: string }) => p.propertyId === id);

    expect(by("lp3").lossOffsetFromSameGroup, "같은 70% → §167의2①1호 우선 공제").toBe(19_000_000);
    expect(by("lp3").lossOffsetFromOtherGroup).toBe(0);
    expect(by("lp1").lossOffsetFromOtherGroup, "잔액 1,000,000 중 60:140").toBe(300_000);
    expect(by("lp4").lossOffsetFromOtherGroup).toBe(700_000);
    expect(body.data.totalTax, "종전 65,400,222 — 5,197,222 과대").toBe(60_203_000);

    // ─── 화면 — 제보 이미지와 **같은 표**(신고서 양식 합산)에서 확인한다 ─────
    //   사용자가 본 것은 이 표의 「감면후 소득금액」 행이다. 종전에는 여기에
    //   59,700,000 / 139,300,000 대신 54,520,548 / 127,214,611이 찍혔다.
    const filing = page.locator('[data-print-id="form-table"]');
    const incomeRow = filing.locator("tr", { hasText: "감면후 소득금액" }).first();
    await expect(incomeRow).toBeVisible({ timeout: 20000 });

    // 🔑 1호 — 같은 70% 자산이 19,000,000을 **먼저** 흡수했다
    await expect(incomeRow).toContainText("결손금 통산 19,000,000 반영");
    // 🔑 2호 — 잔액 1,000,000만 60:140으로 안분됐다
    await expect(incomeRow).toContainText("결손금 통산 300,000 반영");
    await expect(incomeRow).toContainText("결손금 통산 700,000 반영");
    // 통산 후 자산별 양도소득금액
    await expect(incomeRow).toContainText("59,700,000");
    await expect(incomeRow).toContainText("139,300,000");

    // ─── 결함 ③ — 차손 자산에도 세율구분 코드가 찍힌다 ──────────────
    //   종전에는 미등기 열이 `-`라 **토글이 켜졌는지 화면에서 판별할 수 없었다**.
    const codeRow = filing.locator("tr", { hasText: "세율구분" }).first();
    await expect(codeRow, "미등기(§104①10호) 코드 1-30").toContainText("1-30");
    await expect(codeRow, "주택 1년미만(§104①3호, ’21.6.1.~) 코드 1-46").toContainText("1-46");
  });
});
