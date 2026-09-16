/**
 * transfer-multi-stale-source-banner.spec.ts
 *
 * 제보 재현 — **합산에 편입된 자산이 원본과 끊긴 동결 스냅샷**이라, 단건에서 미등기를 켜도
 * 합산이 옛 값으로 계산했다.
 *
 * 종전(결함): 원본 record가 바뀌어도 **화면에 아무 표시가 없고** 합산은 편입 시점 값을 보냈다.
 *   제보 4자산 실측 **9,902,200원 과대**.
 *
 * 기대:
 *   ① 원본이 바뀌면 **배너**가 뜬다
 *   ② 「다시 불러오기」가 자산을 원본의 현재 입력으로 갈아끼운다
 *   ③ 재계산하면 신고서 「세율구분 코드」가 **1-30(미등기)** 이 된다
 *
 * 🔑 ③이 결정적이다 — 배너만 뜨고 재편입이 값을 못 고치면 아무 의미가 없다.
 *    (그 코드를 화면에서 단언할 수 있는 것은 PR #1643이 차손 자산에도 세율·호를 실은 덕이다.)
 *
 * 계획서: `docs/00-pm/multi-aggregate-stale-source-snapshot.plan.md`
 */
import { test, expect, type Page } from "@playwright/test";

import { putCalculationRecord } from "./_helpers/history-seed";
import { openHistoryModal } from "./_helpers/navigation";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { computeInputHash } from "../lib/storage/content-hash";

/** 취득 2020-04-01 · 양도 2026-06-03 — 제보 「양도 2번」과 같은 조건 */
function form(price: string, acqPrice: string, unregistered: boolean) {
  return {
    ...createDefaultTransferFormData(),
    assets: [
      {
        ...makeDefaultAsset(1),
        assetKind: "land",
        acquisitionDate: "2020-04-01",
        acquisitionArea: "1000",
        useEstimatedAcquisition: false,
        isAppraisalAcquisition: false,
        isSalesCaseAcquisition: false,
        fixedAcquisitionPrice: acqPrice,
        directExpenses: "0",
        isNonBusinessLand: false,
        reductions: [],
      },
    ],
    transferDate: "2026-06-03",
    filingDate: "",
    contractTotalPrice: price,
    householdHousingCount: "1",
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: unregistered,
    isOneHousehold: false,
  };
}

/**
 * ⚠️ `mode: "single"`이 있어야 `classifyLoadableTransfer`가 단건으로 인정한다
 *    (`transfer-amendment-entry.ts` — `resultData.mode` 분기). 없으면 모달이 비어 보인다.
 */
const record = async (unregistered: boolean) => ({
  id: "e2e-stale-src-loss",
  userId: "local-user",
  taxType: "transfer",
  title: "차손 단건 (E2E)",
  inputData: form("100000000", "120000000", unregistered),
  /**
   * ⚠️ **저장소가 붙이는 `inputHash`를 시드에도 넣어야 한다** — 실제 저장 경로
   * (`saveOrUpdateByBusinessKey`)가 항상 부여하는 값이다. 빠뜨리면 감지가 「판정 불가」로
   * 떨어져 **편입 직후에도 배너가 뜬다**(오탐). 같은 leaf를 써서 dual truth를 만들지 않는다.
   */
  inputHash: await computeInputHash(
    form("100000000", "120000000", unregistered) as unknown as Record<string, unknown>,
  ),
  resultData: { mode: "single", result: { determinedTax: 0, localIncomeTax: 0 } },
  taxLawVersion: "2026",
  linkedCalculationId: null,
  clientId: null,
  createdAt: "2026-09-16T00:00:00.000Z",
  updatedAt: "2026-09-16T00:00:00.000Z",
});

async function importFromHistory(page: Page) {
  await page.goto("/calc/transfer-tax/multi");
  await openHistoryModal(
    page,
    page.getByTestId("multi-load-history-btn").first(),
    page.getByText("차손 단건 (E2E)"),
  );
  await page.getByTestId("load-record-e2e-stale-src-loss").click();
}

test.describe("합산 편입 자산의 원본 변경 감지", () => {
  test("원본이 바뀌면 배너가 뜨고, 다시 불러오면 미등기가 반영된다", async ({ page }) => {
    test.setTimeout(120_000);

    // ① 미등기 OFF 상태의 단건을 이력에 심고 합산에 편입
    await page.goto("/history");
    await putCalculationRecord(page, await record(false));
    await importFromHistory(page);

    // 아직은 동기 상태 — 배너가 없어야 한다 (오탐 방지)
    await expect(page.getByText("원본 이력과 동기화 확인이 필요합니다")).toHaveCount(0);

    // ② 원본 record를 미등기 ON으로 갱신 (단건 화면에서 고쳐 재계산한 것과 동등)
    await putCalculationRecord(page, await record(true));

    // ③ 🔴 배너가 뜬다
    await page.reload();
    await expect(
      page.getByText("원본 이력과 동기화 확인이 필요합니다"),
      "원본이 바뀌었는데 화면이 아무 말도 하지 않으면 안 된다",
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/합산에 넣은 뒤 원본 계산이 변경/)).toBeVisible();

    // ④ 「다시 불러오기」
    await page.getByRole("button", { name: "다시 불러오기" }).first().click();
    await expect(
      page.getByText("원본 이력과 동기화 확인이 필요합니다"),
      "재편입하면 배너가 사라진다",
    ).toHaveCount(0, { timeout: 15000 });

    // ⑤ 계산 → ⑥ 세율구분 코드 1-30
    const respPromise = page.waitForResponse(
      (r) => r.url().includes("/api/calc/transfer/multi") && r.request().method() === "POST",
      { timeout: 20000 },
    );
    await page.getByRole("button", { name: "공통 설정으로" }).click();
    await page.getByRole("button", { name: "세액 계산" }).click();
    const resp = await respPromise;
    expect(resp.status()).toBe(200);

    const sent = JSON.parse(resp.request().postData() ?? "{}");
    expect(sent.properties[0].isUnregistered, "재편입 후에는 미등기가 실려야 한다").toBe(true);

    await expect(page.getByText("건별 상세").first()).toBeVisible({ timeout: 20000 });
    const codeRow = page.locator('[data-print-id="form-table"]').locator("tr", { hasText: "세율구분" }).first();
    await expect(codeRow, "미등기 §104①10호 → 1-30").toContainText("1-30");
  });
});
