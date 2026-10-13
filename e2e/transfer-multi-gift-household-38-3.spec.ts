/**
 * transfer-multi-gift-household-38-3.spec.ts
 *
 * 결정 #38-3 — 다건(합산) 마법사에서 증여받은 주택의 「증여자와 계속 같은 세대」 사실의 노출 · 필수 · 전송.
 *
 * 다건 편집 단계는 단건 계산기(`TransferTaxCalculator`)를 그대로 마운트하고, 다건 ④는 단건과 같은 빌더
 * (`buildCalcGiftHouseholdPayload`)로 건마다 주 자산의 사실을 싣는다. 종전에는 다건 화면이 이 칸을 열지 않았고(다건 ④가 싣지 않아),
 * 같은 입력의 세액이 단건 0 · 다건 229,075,000이었다. 이 spec은 그 경로를 화면에서 끝까지 따라간다 —
 * 칸이 열리고, 미응답이면 자산 목록에서 막히고, 「예」로 답하면 응답이 `/api/calc/transfer/multi` 본문에 실려 비과세(0)가 나온다.
 *
 * 시료: 그 밖의 친족이 2010-03-01 취득 → 2025-06-01 증여 → 2026-02-16 양도(9억 / 증여 신고가액 6억) · 1세대 1주택.
 *
 * 실행: E2E_PORT=3383 npx playwright test e2e/transfer-multi-gift-household-38-3.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

import { putCalculationRecord } from "./_helpers/history-seed";
import { openHistoryModal } from "./_helpers/navigation";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";

const RECORD_ID = "e2e-multi-gift-household-38-3";
const RECORD_TITLE = "다건 증여 세대 사실 (E2E)";
const QUESTION = "증여자와 계속 같은 세대였습니까";

function propertyForm() {
  const f = createDefaultTransferFormData();
  f.assets[0] = {
    ...f.assets[0],
    ...DIRECT_RESIDENCE,
    addressJibun: "서울 종로구 청운동 1-1",
    assetKind: "housing",
    acquisitionCause: "gift",
    acquisitionDate: "2025-06-01",
    donorAcquisitionDate: "2010-03-01",
    fixedAcquisitionPrice: "600000000",
    actualSalePrice: "900000000",
    residencePeriodMonthsAsset: "0",
    // 세대 사실은 비워 둔다 — 화면에서 답한다
    giftDonorRelation: "",
    giftSameHousehold: "",
    giftHouseholdHoldingStartDate: "",
  };
  return Object.assign(f, {
    transferDate: "2026-02-16",
    contractTotalPrice: "900000000",
    householdHousingCount: "1",
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    isOneHousehold: true,
    isRegulatedArea: false,
    isRegulatedAreaTouched: true,
    wasRegulatedAtAcquisition: false,
    wasRegulatedAtAcquisitionTouched: true,
    residencePeriodMonths: "0",
  });
}

function record() {
  return {
    id: RECORD_ID,
    userId: "local-user",
    taxType: "transfer",
    title: RECORD_TITLE,
    inputData: {
      __multiTransfer: true,
      taxYear: 2026,
      properties: [{ propertyId: "gh1", propertyLabel: "종로 증여 주택", completionPercent: 100, form: propertyForm() }],
      activePropertyIndex: 0,
      activeStep: "settings",
      annualBasicDeductionUsed: "0",
      basicDeductionAllocation: "EARLIEST_TRANSFER",
    },
    resultData: { determinedTax: 0, totalTax: 0, properties: [{ propertyId: "gh1" }] },
    taxLawVersion: "2026",
    linkedCalculationId: null,
    clientId: null,
    createdAt: "2026-10-13T00:00:00.000Z",
    updatedAt: "2026-10-13T00:00:00.000Z",
  };
}

/** 이력 시드 → 다건 화면 → 불러오기(공통 설정에 착지) → 자산 목록으로 */
async function loadToList(page: Page) {
  await page.goto("/history");
  await putCalculationRecord(page, record());
  await page.goto("/calc/transfer-tax/multi");
  await openHistoryModal(page, page.getByTestId("multi-load-history-btn").first(), page.getByText(RECORD_TITLE));
  await page.getByTestId(`load-record-${RECORD_ID}`).click();
  await page.getByRole("button", { name: "자산 목록" }).first().click();
  await expect(page.getByText("종로 증여 주택", { exact: true })).toBeVisible();
}

test.describe("#38-3 다건 마법사 — 증여받은 주택의 세대 사실 노출 · 필수 · 전송", () => {
  test("미응답이면 자산 목록에서 막히고, 「예」로 답하면 응답이 다건 API에 실려 비과세(0)가 나온다", async ({ page }) => {
    test.setTimeout(180_000);
    await loadToList(page);

    // ⑧ — 세대 사실이 미응답이라 「공통 설정으로」가 막혀 있다
    await expect(page.getByText("일부 자산의 필수 정보가 입력되지 않았습니다", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "공통 설정으로" })).toBeDisabled();

    // ⑤ — 편집 → 단건 계산기(임베드) 취득 화면에 같은 칸이 열린다(종전에는 다건 임베드에서 열지 않았다)
    await page.getByRole("button", { name: "편집", exact: true }).click();
    await page.getByRole("button", { name: /^3\s*취득/ }).click();
    await expect(page.getByText(QUESTION)).toBeVisible();
    await page.getByRole("radio", { name: "그 밖의 친족" }).check();
    await page.getByRole("radio", { name: /^예 — 계속 같은 세대/ }).check();
    const start = page.getByTestId("one-house-gift-household-start");
    await start.getByLabel("연도").fill("2010");
    await start.getByLabel("월").fill("3");
    await start.getByLabel("일").fill("1");

    // 자산 목록으로 돌아가면 막힘이 풀린다
    await page.getByRole("button", { name: "자산 목록으로" }).first().click();
    await expect(page.getByText("일부 자산의 필수 정보가 입력되지 않았습니다", { exact: false })).toHaveCount(0);
    await page.getByRole("button", { name: "공통 설정으로" }).click();

    // ④⑬ — 사실이 다건 API 본문에 실리고 엔진이 통산해 비과세로 본다
    const reqPromise = page.waitForRequest(
      (r) => r.url().includes("/api/calc/transfer/multi") && r.method() === "POST",
      { timeout: 20_000 },
    );
    const respPromise = page.waitForResponse(
      (r) => r.url().includes("/api/calc/transfer/multi") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "세액 계산" }).click();
    const body = (await reqPromise).postDataJSON() as {
      properties: { acquisitionCause?: string; giftSameHouseholdContinuous?: boolean; giftHouseholdHoldingStartDate?: string }[];
    };
    expect(body.properties[0]).toMatchObject({
      acquisitionCause: "gift",
      giftSameHouseholdContinuous: true,
      giftHouseholdHoldingStartDate: "2010-03-01",
    });

    const resp = await respPromise;
    expect(resp.status()).toBe(200);
    const json = (await resp.json()) as { data: { totalTax: number } };
    expect(json.data.totalTax).toBe(0);
  });
});
