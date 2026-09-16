/**
 * 이력 「편집」(재계산) — **다건 record는 다건 마법사로** 실플로우 E2E
 *
 * 계획서: `docs/00-pm/history-resume-multi-record-misroute.plan.md`
 *
 * ## 종전 결함 (probe 실측)
 * 다건 record를 편집하면 **단건 마법사**로 갔다. 다건 `inputData`엔 `assets`가 없어
 * `updateFormData`(단순 merge)가 아무것도 덮지 못했고, **직전 단건 세션의 입력**이 그대로
 * 남은 위에 다건 record의 **정정 플래그가 주입**됐다(경정청구는 당초 결정세액을 차감한다 —
 * 세액이 바뀐다).
 *
 * ## 이 spec이 지키는 것
 * 카드와 드로어 **두 경로 모두** — 갈라진 사본이 이 결함의 뿌리였다.
 *
 * worktree 실행: E2E_PORT=3101 npx playwright test e2e/history-resume-multi-record.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

import { putCalculationRecord } from "./_helpers/history-seed";

const MULTI_REC = {
  id: "e2e-resume-multi",
  userId: "local-user",
  taxType: "transfer",
  title: "다건 양도 재계산 (E2E)",
  inputData: {
    __multiTransfer: true,
    taxYear: 2026,
    properties: [
      {
        propertyId: "mp1",
        propertyLabel: "양도 1번",
        completionPercent: 100,
        form: { assets: [{ assetKind: "land" }], transferDate: "2026-04-20" },
      },
      {
        propertyId: "mp2",
        propertyLabel: "양도 2번",
        completionPercent: 100,
        form: { assets: [{ assetKind: "apartment" }], transferDate: "2026-08-08" },
      },
    ],
    activePropertyIndex: 0,
    activeStep: "settings",
    annualBasicDeductionUsed: "0",
    basicDeductionAllocation: "MAX_BENEFIT",
    // 단건 TransferFormData와 **같은 필드명**이라 종전에는 단건 폼으로 새어 들어갔다
    amendmentMode: true,
    correctionKind: "refund_claim",
    originalDeterminedTax: "999999999",
  },
  resultData: {
    determinedTax: 30000000,
    localIncomeTax: 3000000,
    totalTax: 33000000,
    properties: [{ propertyId: "mp1" }, { propertyId: "mp2" }],
  },
  taxLawVersion: "2026",
  linkedCalculationId: null,
  clientId: null,
  createdAt: "2026-09-16T09:00:00.000Z",
  updatedAt: "2026-09-16T09:00:00.000Z",
};

/** 구 stub — `properties[].form`이 없다(B0 이전 저장분) */
const STUB_REC = {
  ...MULTI_REC,
  id: "e2e-resume-stub",
  title: "다건 양도 구버전 stub (E2E)",
  inputData: {
    __multiTransfer: true,
    taxYear: 2026,
    properties: [{ propertyId: "sp1", propertyLabel: "양도 1번", completionPercent: 100 }],
  },
  createdAt: "2026-09-16T08:00:00.000Z",
  updatedAt: "2026-09-16T08:00:00.000Z",
};

/** 단건 마법사에 「직전 작업」을 남긴다 — 편집이 이것을 남겨 두면 결함이다 */
async function seedPreviousSingleSession(page: Page) {
  await page.evaluate(() => {
    sessionStorage.setItem(
      "transfer-tax-wizard",
      JSON.stringify({
        state: {
          formData: {
            assets: [{ assetKind: "apartment", addressJibun: "직전 단건 소재지 E2E" }],
            transferDate: "2026-02-02",
            contractTotalPrice: "111111111",
          },
          currentStep: 0,
        },
        version: 0,
      }),
    );
  });
}

/** 단건 store가 다건 키·정정 플래그로 오염됐는가 */
async function singleStoreDump(page: Page) {
  return page.evaluate(() => {
    const raw = sessionStorage.getItem("transfer-tax-wizard");
    const f = raw ? JSON.parse(raw)?.state?.formData ?? {} : {};
    return {
      multiKeys: Object.keys(f).filter((k) =>
        ["__multiTransfer", "properties", "taxYear", "activeStep"].includes(k),
      ),
      amendmentMode: f.amendmentMode ?? false,
      correctionKind: f.correctionKind ?? "amend",
    };
  });
}

test.describe("이력 편집 — 다건 record", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/history");
    await putCalculationRecord(page, MULTI_REC);
    await putCalculationRecord(page, STUB_REC);
    await seedPreviousSingleSession(page);
    await page.reload();
    await expect(page.getByText("다건 양도 재계산 (E2E)")).toBeVisible({ timeout: 15000 });
  });

  test("카드 「편집」 → 다건 마법사에 자산 2건, 단건 폼 오염 없음", async ({ page }) => {
    await page.getByTestId(`resume-${MULTI_REC.id}`).click();

    await expect(page).toHaveURL(/\/calc\/transfer-tax\/multi/, { timeout: 15000 });
    await expect(page.getByText("양도 1번").first()).toBeVisible({ timeout: 15000 });

    // record의 자산 2건이 그대로 — 직전 단건 세션(2026-02-02)이 아니다
    expect(await page.getByText(/^양도일: /).allTextContents()).toEqual([
      "양도일: 2026-04-20",
      "양도일: 2026-08-08",
    ]);

    // 🔴 종전 결함: 단건 폼에 다건 키와 경정청구 플래그가 주입됐다
    const dump = await singleStoreDump(page);
    expect(dump.multiKeys).toEqual([]);
    expect(dump.amendmentMode).toBe(false);
    expect(dump.correctionKind).toBe("amend");
  });

  test("드로어 「이 조건으로 재계산」 → 같은 결과 (사본이 갈라지지 않는다)", async ({ page }) => {
    await page.getByText("다건 양도 재계산 (E2E)").click();
    await expect(page.getByRole("button", { name: "이 조건으로 재계산" })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole("button", { name: "이 조건으로 재계산" }).click();

    await expect(page).toHaveURL(/\/calc\/transfer-tax\/multi/, { timeout: 15000 });
    await expect(page.getByText("양도 1번").first()).toBeVisible({ timeout: 15000 });
    expect(await page.getByText(/^양도일: /).allTextContents()).toEqual([
      "양도일: 2026-04-20",
      "양도일: 2026-08-08",
    ]);
    const dump = await singleStoreDump(page);
    expect(dump.multiKeys).toEqual([]);
    expect(dump.amendmentMode).toBe(false);
  });

  test("구 stub 다건은 차단하고 사유를 말한다 — 이동하지 않는다", async ({ page }) => {
    await page.getByTestId(`resume-${STUB_REC.id}`).click();

    await expect(page.getByText(/저장된 자산 입력값이 없어 편집할 수 없습니다/)).toBeVisible({
      timeout: 15000,
    });
    await expect(page).toHaveURL(/\/history/);
  });
});
