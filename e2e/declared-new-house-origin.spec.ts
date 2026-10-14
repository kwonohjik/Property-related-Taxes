/**
 * §155① 신규 주택 **직접 선언 경로**의 취득 경위 질문 E2E (결정 #43-3).
 *
 * 규칙·route 결론은 vitest anchor(`__tests__/tax-engine/transfer/declared-new-house-origin.anchor.test.ts`)가 고정한다.
 * 여기서 보는 것은 **화면**이다 —
 *   · 직접 선언(`temporaryTwoHouseSpecial` + `newHouseAcquisitionDate`)이 켜진 경로에서만 질문이 뜨고, 명부에서 신규 주택이 도출되면 뜨지 않는다
 *   · 답이 판정 카드(요건 D)와 ⑧ 검증에 닿는다 · 미답은 막지 않는다
 *   · 계산기·판정 메뉴 두 화면 모두에 같은 질문이 뜬다
 *
 * worktree 실행: E2E_PORT=3xxx npx playwright test e2e/declared-new-house-origin.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { gotoJudgmentHoldingsStep } from "./_helpers/judgment-seed";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { fillDateAndVerify } from "./_helpers/tax-flow";

/** 종전주택 2023-03-15 · 신규 주택 완공 2024-06-15(직접 선언) · 양도 2025-06-15 */
const SEQ = {
  transferDate: "2025-06-15",
  isOneHousehold: true,
  contractTotalPrice: "800000000",
  temporaryTwoHouseSpecial: true,
  newHouseAcquisitionDate: "2024-06-15",
};
const sellingAsset = {
  ...makeDefaultAsset(1),
  ...DIRECT_RESIDENCE,
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2023-03-15",
  fixedAcquisitionPrice: "300000000",
  transferPrice: "800000000",
};

function gotoJudgment(page: Page, over: Record<string, unknown> = {}) {
  return gotoJudgmentHoldingsStep(page, { ...SEQ, assets: [sellingAsset], ...over });
}

async function gotoCalc(page: Page, over: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          householdNoOtherHousesConfirmed: true,
          householdNoPresaleRightsConfirmed: true,
          assets: [sellingAsset],
          householdHousingCount: "2",
          ...SEQ,
          ...over,
        },
        pendingMigration: false,
      },
      version: 0,
    },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).first().click();
}

test.describe("§155① 신규 주택 직접 선언 경로 — 취득 경위 질문", () => {
  test("판정 메뉴 — 직접 선언이면 질문이 뜨고 미답은 일반 취득과 같이 판정하되 확인 필요를 알린다", async ({ page }) => {
    await gotoJudgment(page);
    const block = page.getByTestId("declared-new-house-origin");
    await expect(block).toBeVisible();
    // 미답 — 막지 않고 종전 판정(충족) + 요건 D 확인 필요
    await expect(page.getByText("일시적 2주택 특례 요건 충족", { exact: true })).toBeVisible();
    await expect(page.getByTestId("temp-two-house-origin-note")).toContainText("확인 필요 · 요건 D");
  });

  test("판정 메뉴 — 순차 분양권을 답하면 요건 D 미충족으로 바뀌고, 일반 취득을 답하면 확인 필요가 걷힌다", async ({ page }) => {
    await gotoJudgment(page);
    const block = page.getByTestId("declared-new-house-origin");
    await block.getByTestId("house-row-origin-presale").click();
    const dateField = block.getByTestId("house-row-right-acquisition-date");
    await expect(dateField).toBeVisible();
    // 권리 취득일 2021-09-01 < 종전주택 취득일 2023-03-15 — 순차 사례
    await fillDateAndVerify(page, { year: "2021", month: "9", day: "1" }, { scope: dateField });
    await expect(page.getByText("일시적 2주택 특례 요건 미충족", { exact: true })).toBeVisible();
    await expect(page.getByTestId("temp-two-house-origin-note")).toContainText("미충족 · 요건 D");

    await block.getByTestId("house-row-origin-general").click();
    await expect(page.getByText("일시적 2주택 특례 요건 충족", { exact: true })).toBeVisible();
    await expect(page.getByTestId("temp-two-house-origin-note")).toHaveCount(0);
    await expect(block.getByTestId("house-row-right-acquisition-date")).toHaveCount(0);
  });

  test("판정 메뉴 — 명부에서 신규 주택이 도출되면 이 질문은 뜨지 않는다(행 편집에서 묻는다)", async ({ page }) => {
    await gotoJudgment(page, {
      temporaryTwoHouseSpecial: false,
      newHouseAcquisitionDate: "",
      houses: [
        {
          id: "h-new",
          region: "capital",
          acquisitionOrigin: "general",
          acquisitionDate: "2024-06-15",
          officialPrice: "300000000",
          isInherited: false,
        },
      ],
    });
    await expect(page.getByTestId("temp-two-house-verdict")).toBeVisible();
    await expect(page.getByTestId("declared-new-house-origin")).toHaveCount(0);
  });

  test("판정 메뉴 ⑧ — 답을 골랐는데 권리 취득일이 없으면 판정 결과 단계로 넘어가지 않는다", async ({ page }) => {
    await gotoJudgment(page);
    await page.getByTestId("declared-new-house-origin").getByTestId("house-row-origin-presale").click();
    await page.getByRole("button", { name: "판정 결과 보기" }).click();
    await expect(page.getByText(/권리 취득일\(분양권 취득일/).first()).toBeVisible();
    await expect(page.getByText("③ 보유 주택·권리")).toBeVisible();
  });

  test("계산기 — 직접 선언이면 같은 질문이 뜨고 답이 선택 상태로 남는다", async ({ page }) => {
    await gotoCalc(page);
    const block = page.getByTestId("declared-new-house-origin");
    await expect(block).toBeVisible();
    await block.getByTestId("house-row-origin-unknown").click();
    await expect(block.locator('input[type="radio"][value="unknown"]')).toBeChecked();
  });

  test("계산기 — 직접 선언이 아니면(토글 없음) 질문이 뜨지 않는다", async ({ page }) => {
    await gotoCalc(page, { temporaryTwoHouseSpecial: false, newHouseAcquisitionDate: "" });
    await expect(page.getByText("③ 합가 특례", { exact: true })).toBeVisible();
    await expect(page.getByTestId("declared-new-house-origin")).toHaveCount(0);
  });
});
