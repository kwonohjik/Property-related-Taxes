/**
 * 판정 메뉴 — 합가일을 ③ 명부 옆에서 받고, 명부 행마다 합가 전 보유자를 고른다 (브라우저 경로, 2026-09-29)
 *
 * 계획서 `docs/00-pm/one-house-judgment-merge-house-link.plan.md`.
 * 엔진·route·렌더 주장은 anchor가 고정한다(`one-house-merge-composition.anchor.test.ts` ·
 * `one-house-merge-composition.route.anchor.test.ts` · `one-house-merge-origin.ui.test.tsx`).
 * 여기서만 관측되는 것은 **사용자가 ③ 화면에서 합가일을 넣고 → 행 편집 창에서 보유자를 고르면 →
 * 판정 결과의 합가 요건 카드가 그것을 반영한다**는 흐름 전체다.
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoJudgmentHoldingsStep } from "./_helpers/judgment-seed";
import { fillDateAndVerify } from "./_helpers/tax-flow";

async function judge(page: Page) {
  const response = page.waitForResponse(
    (r) => r.url().includes("/api/calc/one-house-exemption") && r.request().method() === "POST",
  );
  await page.getByTestId("one-house-judge-cta").click();
  const res = await response;
  expect(res.ok(), `판정 API가 ${res.status()}로 응답했다: ${res.ok() ? "" : await res.text()}`).toBe(true);
  await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
}

/** 양도 주택 2015-01-01 취득 · 양도 예정 2026-03-01 · 8억 · 먼저 양도 선언(시드). 명부 1채는 테스트마다. */
function seed(otherAcquisitionDate: string) {
  return {
    transferDate: "2026-03-01",
    contractTotalPrice: "800000000",
    isFirstTransferredInMerge: true,
    assets: [{ assetKind: "housing", acquisitionDate: "2015-01-01" }],
    houses: [
      {
        id: "h1",
        region: "capital",
        acquisitionDate: otherAcquisitionDate,
        officialPrice: "300000000",
        // 명부 행의 필수 boolean — 화면 입력은 항상 채운다. 없으면 route Zod가 400을 낸다.
        isInherited: false,
        isLongTermRental: false,
        isApartment: true,
        isOfficetel: false,
        isUnsoldHousing: false,
      },
    ],
  };
}

async function enterMarriageDate(page: Page) {
  await fillDateAndVerify(page, { year: "2020", month: "01", day: "01" }, {
    scope: page.getByTestId("merge-date-marriage"),
  });
}

test.describe("판정 메뉴 — 합가 전 보유자", () => {
  test("[MO-E1] ③에서 혼인일 입력 → 행 편집에서 「배우자 쪽」 선택 → 합가 요건 전부 충족 · 비과세", async ({
    page,
  }) => {
    await gotoJudgmentHoldingsStep(page, seed("2018-01-01"));
    await enterMarriageDate(page);

    const badge = page.getByTestId("house-merge-badge-h1");
    await expect(badge).toHaveAttribute("data-side", "unset");

    await page.getByRole("button", { name: "주택 1 편집" }).click();
    await expect(page.getByTestId("house-merge-origin")).toBeVisible();
    // 판정 메뉴에서는 중과 축의 「배우자 단독 보유」 칩을 묻지 않는다
    await expect(page.getByText("배우자 단독 보유 주택")).toHaveCount(0);
    await page.getByTestId("merge-origin-counterpart").check();
    await page.getByRole("button", { name: "완료" }).click();
    await expect(badge).toHaveAttribute("data-side", "counterpart_side");
    await expect(badge).toHaveText("배우자 쪽");

    await judge(page);
    await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
    await expect(page.getByTestId("one-house-requirement-merge-composition")).toHaveAttribute("data-status", "met");
  });

  /**
   * 합가 특례가 성립하지 않으면 법이 가리키는 다음 경로는 §155① 일시적 2주택이다 — 판정 메뉴는
   * 명부에서 신규 주택(2022-06-01)을 도출해 그 요건 카드를 그린다(처분기한 2025-06-02 경과 → 과세).
   * 합가 특례가 왜 빠졌는지는 「선언했으나 적용되지 않은 특례」 카드가 말한다.
   */
  test("[MO-E2] 다른 주택을 혼인 후 취득 → 배지 「혼인 후 취득」 · §155① 검토로 · 합가 미충족 사유 · 과세", async ({ page }) => {
    await gotoJudgmentHoldingsStep(page, seed("2022-06-01"));
    await enterMarriageDate(page);

    await expect(page.getByTestId("house-merge-badge-h1")).toHaveAttribute("data-side", "after_merge");

    await judge(page);
    await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");
    await expect(page.getByTestId("one-house-requirement-disposal-deadline")).toHaveAttribute("data-status", "unmet");
    await expect(page.getByTestId("one-house-unmet-155-5-marriage-merge")).toContainText(
      "2022-06-01에 취득했습니다",
    );
  });
});
