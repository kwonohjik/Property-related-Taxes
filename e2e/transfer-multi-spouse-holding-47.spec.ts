/**
 * transfer-multi-spouse-holding-47.spec.ts
 *
 * 결정 #47 — 다건(합산) 마법사에서 「양도일 현재도 배우자 쪽이 보유하나요」 질문의 노출 · 응답 · 전송.
 *
 * 다건 편집 단계는 단건 계산기(`TransferTaxCalculator`)를 그대로 마운트하고, 다건 ④는 단건과 같은 빌더
 * (`buildHousesPayload`)로 명부를 싣는다. 이 spec은 그 경로를 화면에서 끝까지 따라간다 — 질문이 열리고,
 * 미응답이면 자산 목록에서 막히고, 「예」로 답하면 그 응답이 `/api/calc/transfer/multi` 본문에 실려 차감된 세액이 나온다.
 *
 * 시료: 양도 주택 서울 강남구(1168010100) 2019-01-01 취득 · 혼인 2024-03-01 · 양도 2026-06-15(한시배제 종료 후) ·
 * 배우자 쪽 명부 2행(3주택). 조정대상지역 **토글은 꺼 둔다** — 주소가 조정대상지역이면 엔진은 주소로 중과하므로
 * 질문도 열려야 한다(#47-1, `spouseHoldingQuestionApplies`가 ④와 같은 실효값을 읽는다).
 *
 * 실행: E2E_PORT=3319 npx playwright test e2e/transfer-multi-spouse-holding-47.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

import { putCalculationRecord } from "./_helpers/history-seed";
import { openHistoryModal } from "./_helpers/navigation";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { otherHouse } from "./_helpers/transfer-seed";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";

const RECORD_ID = "e2e-multi-spouse-holding-47";
const RECORD_TITLE = "다건 배우자 보유 질문 (E2E)";

function propertyForm() {
  const f = createDefaultTransferFormData();
  f.assets[0] = {
    ...f.assets[0],
    ...DIRECT_RESIDENCE,
    addressJibun: "서울 강남구 테스트동 1-1",
    regionCode: "1168010100",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2019-01-01",
    actualSalePrice: "900000000",
    fixedAcquisitionPrice: "300000000",
    residencePeriodMonthsAsset: "0",
  };
  return Object.assign(f, {
    transferDate: "2026-06-15",
    contractTotalPrice: "900000000",
    marriageDate: "2024-03-01",
    householdHousingCount: "3",
    householdNoPresaleRightsConfirmed: true,
    isOneHousehold: true,
    // 토글은 꺼져 있다 — 조정대상지역 여부는 주소(강남)가 정한다
    isRegulatedArea: false,
    isRegulatedAreaTouched: true,
    wasRegulatedAtAcquisition: false,
    wasRegulatedAtAcquisitionTouched: true,
    residencePeriodMonths: "0",
    houses: [1, 2].map((n) => otherHouse(`h${n}`, "2018-01-01", { region: "capital", mergeOrigin: "counterpart_side" })),
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
      properties: [{ propertyId: "sp1", propertyLabel: "강남 주택", completionPercent: 100, form: propertyForm() }],
      activePropertyIndex: 0,
      activeStep: "settings",
      annualBasicDeductionUsed: "0",
      basicDeductionAllocation: "EARLIEST_TRANSFER",
    },
    resultData: { determinedTax: 0, totalTax: 0, properties: [{ propertyId: "sp1" }] },
    taxLawVersion: "2026",
    linkedCalculationId: null,
    clientId: null,
    createdAt: "2026-10-12T00:00:00.000Z",
    updatedAt: "2026-10-12T00:00:00.000Z",
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
  await expect(page.getByText("강남 주택", { exact: true })).toBeVisible();
}

test.describe("#47 다건 마법사 — 배우자 보유 질문 노출 · 응답 · 전송", () => {
  test("미응답이면 자산 목록에서 막히고, 「예」로 답하면 응답이 다건 API에 실려 차감된 세액이 나온다", async ({ page }) => {
    test.setTimeout(180_000);
    await loadToList(page);

    // ⑧ — 배우자 쪽 행이 미응답이라 「공통 설정으로」가 막혀 있다
    await expect(page.getByText("일부 자산의 필수 정보가 입력되지 않았습니다", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "공통 설정으로" })).toBeDisabled();

    // 편집 → 단건 계산기(임베드) → 보유 상황
    await page.getByRole("button", { name: "편집", exact: true }).click();
    await page.getByRole("button", { name: "보유 상황" }).first().click();

    // ⑤ — 배우자 쪽 두 행 모두 질문이 열리고 「예」로 답한다
    const dialog = page.getByRole("dialog");
    for (const id of ["h1", "h2"]) {
      await page.getByRole("button", { name: `주택 ${id.slice(1)} 편집` }).click();
      await expect(dialog).toBeVisible({ timeout: 3000 });
      await expect(dialog.getByTestId("spouse-holding-spouse_side")).toBeVisible();
      await expect(dialog.getByTestId("spouse-holding-spouse_side")).toContainText("(소득세법 시행령 §167의3⑨)");
      await dialog.getByTestId(`spouse-holding-yes-${id}`).check();
      await dialog.getByRole("button", { name: "완료" }).click();
      await expect(dialog).not.toBeVisible({ timeout: 3000 });
    }

    // 자산 목록으로 돌아가면 막힘이 풀린다
    await page.getByRole("button", { name: "자산 목록으로" }).first().click();
    await expect(page.getByText("일부 자산의 필수 정보가 입력되지 않았습니다", { exact: false })).toHaveCount(0);
    await page.getByRole("button", { name: "공통 설정으로" }).click();

    // ④⑬ — 응답이 다건 API 본문에 실리고 엔진이 차감한다
    const reqPromise = page.waitForRequest(
      (r) => r.url().includes("/api/calc/transfer/multi") && r.method() === "POST",
      { timeout: 20_000 },
    );
    const respPromise = page.waitForResponse(
      (r) => r.url().includes("/api/calc/transfer/multi") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "세액 계산" }).click();
    const body = (await reqPromise).postDataJSON() as { properties: { houses?: { id: string; spouseHeldAtTransfer?: string }[] }[] };
    const sent = (body.properties[0].houses ?? []).filter((h) => h.id === "h1" || h.id === "h2");
    expect(sent.map((h) => h.spouseHeldAtTransfer)).toEqual(["yes", "yes"]);

    const resp = await respPromise;
    expect(resp.status()).toBe(200);
    const json = (await resp.json()) as { data: { totalTax: number } };
    expect(json.data.totalTax).toBe(197_703_000);
  });
});
