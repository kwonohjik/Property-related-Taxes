/**
 * 합산 신고서 표 아래 「※」 안내가 375px에서 끝까지 보인다 (계획서 `docs/00-pm/filing-table-footnote-375-clip.plan.md`).
 *
 * 종전: 안내가 표의 가로 스크롤 영역(`overflow-x-auto`) 안에 있어 표 폭(내용 414 · 칸 339)으로 줄바꿈 → 오른쪽 끝이 잘렸다.
 * 시료: 연간 합산 2건(토지 이익 + 1세대1주택 비과세 손실) — 자산별 세액 칸이 2개라 안내가 붙는다.
 * 사람이 직접 본 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { putCalculationRecord } from "./_helpers/history-seed";
import { openHistoryModal } from "./_helpers/navigation";

const form = (asset: Record<string, unknown>, price: string, extra: Record<string, unknown> = {}) => ({
  ...createDefaultTransferFormData(),
  assets: [{ ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", useEstimatedAcquisition: false, ...asset }],
  transferDate: "2026-06-01", filingDate: "", contractTotalPrice: price, householdHousingCount: "1", isRegulatedArea: false, wasRegulatedAtAcquisition: false,
  isUnregistered: false, isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, ...extra,
});
const RECORD = {
  id: "e2e-filing-footnote-375", userId: "local-user", taxType: "transfer", title: "표 안내 375 (E2E)",
  inputData: {
    __multiTransfer: true, taxYear: 2026,
    properties: [
      { propertyId: "p2", propertyLabel: "토지이익", completionPercent: 100, form: form({ assetKind: "land", landNature: "independent", landAreaM2: "100", acquisitionArea: "100", transferArea: "100", acquisitionCause: "purchase", acquisitionDate: "2010-01-01", fixedAcquisitionPrice: "200000000", directExpenses: "0" }, "500000000") },
      { propertyId: "p3", propertyLabel: "비과세손실", completionPercent: 100, form: form({ assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "700000000", residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "96" }, "500000000", { isOneHousehold: true, residencePeriodMonths: "96" }) },
    ],
    activePropertyIndex: 0, activeStep: "settings", annualBasicDeductionUsed: "0", basicDeductionAllocation: "MAX_BENEFIT",
  },
  resultData: { determinedTax: 0, totalTax: 0, properties: [{ propertyId: "p2" }, { propertyId: "p3" }] },
  taxLawVersion: "2026", linkedCalculationId: null, clientId: null, createdAt: "2026-09-16T00:00:00.000Z", updatedAt: "2026-09-16T00:00:00.000Z",
};

test("FN-375 합산 신고서 표 ※ 안내 — 375px에서 오른쪽 끝까지 화면 안에 있고 가로 스크롤 영역 밖이다", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/history");
  await putCalculationRecord(page, RECORD);
  await page.goto("/calc/transfer-tax/multi");
  await openHistoryModal(page, page.getByTestId("multi-load-history-btn").first(), page.getByText("표 안내 375 (E2E)"));
  await page.getByTestId(`load-record-${RECORD.id}`).click();
  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer/multi") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: "세액 계산" }).click();
  expect((await resp).status()).toBe(200);
  await page.getByText("건별 상세").first().waitFor({ timeout: 30_000 });

  await page.setViewportSize({ width: 375, height: 900 });
  const note = page.locator('[data-print-id="form-table"]').getByTestId("filing-row-footnote").first();
  await note.scrollIntoViewIfNeeded();
  await expect(note).toContainText("자산별 칸(참고)");
  const m = await note.evaluate((el) => {
    const r = el.getBoundingClientRect();
    let a = el.parentElement, scroller = "";
    while (a) { const o = getComputedStyle(a).overflowX; if (o === "auto" || o === "scroll") { scroller = a.tagName; break; } a = a.parentElement; }
    return { left: Math.round(r.left), right: Math.round(r.right), vw: window.innerWidth, scroller, width: Math.round(r.width) };
  });
  expect(m.width, "0 가드 — 안내가 렌더돼야 한다").toBeGreaterThan(0);
  expect(m.right, `안내 오른쪽 끝 ${m.right} ≤ 화면 ${m.vw}`).toBeLessThanOrEqual(m.vw);
  expect(m.left).toBeGreaterThanOrEqual(0);
  expect(m.scroller, "가로 스크롤 영역 밖").toBe("");
});
