/**
 * 판정 메뉴 — 이미 지난 처분기한을 「조건부」로 안내하던 결함 + 비과세 요건 순차 검토 (브라우저 경로, 2026-09-29)
 *
 * 계획서 `docs/00-pm/one-house-judgment-temp-two-house-review.plan.md`.
 * 엔진·route·렌더 주장은 anchor가 고정한다(`one-house-requirement-review.anchor.test.ts` ·
 * `one-house-exemption.route.anchor.test.ts` R-5b · `one-house-requirement-review.ui.test.tsx`).
 * 여기서만 관측되는 것은 **실제 서버의 「오늘」로** 판정했을 때 화면이 그렇게 그려지는가다.
 *
 * 🔑 기한이 **이미 지난** 사례만 둔다 — 처분기한 2026-07-01은 이 spec이 도는 어느 날에도 과거다.
 *    기한이 미래인 사례는 실행 날짜에 따라 결과가 바뀌어 flaky해지므로 단위 테스트(기준일 주입)에서만 다룬다.
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoJudgmentHoldingsStep } from "./_helpers/judgment-seed";

async function judge(page: Page) {
  const response = page.waitForResponse(
    (r) => r.url().includes("/api/calc/one-house-exemption") && r.request().method() === "POST",
  );
  await page.getByTestId("one-house-judge-cta").click();
  const res = await response;
  expect(res.ok(), `판정 API가 ${res.status()}로 응답했다: ${res.ok() ? "" : await res.text()}`).toBe(true);
  await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
}

/** 제보 입력 — 종전 2018-07-06(취득 당시 조정) · 거주 26개월 · 신규 2023-07-01 · 양도 예정 2026-10-22 · 24억. */
const REPORTED = {
  transferDate: "2026-10-22",
  contractTotalPrice: "2400000000",
  wasRegulatedAtAcquisition: true,
  assets: [
    {
      assetKind: "housing",
      acquisitionDate: "2018-07-06",
      residenceInputMode: "direct",
      residencePeriodMonthsAsset: "26",
    },
  ],
  houses: [
    {
      id: "h1",
      region: "capital",
      acquisitionDate: "2023-07-01",
      officialPrice: "460000000",
      // 명부 행의 필수 boolean — 화면 입력은 항상 채운다. 시드도 같은 형태여야 route Zod를 통과한다.
      isInherited: false,
      isLongTermRental: false,
      isApartment: true,
      isOfficetel: false,
      isUnsoldHousing: false,
    },
  ],
};

test.describe("판정 메뉴 — §155① 처분기한이 이미 지난 경우", () => {
  test("[RV-1] 배지 「과세」 · 지난 기한 안내 없음 · 요건 4행 + 고가 행을 순서대로 보여 준다", async ({ page }) => {
    await gotoJudgmentHoldingsStep(page, REPORTED);
    await judge(page);

    await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");
    await expect(page.getByTestId("one-house-pending-155-1-disposal-deadline")).toHaveCount(0);
    await expect(page.getByText("양도일을 조정하면 요건을 갖출 수 있습니다")).toHaveCount(0);
    await expect(page.getByTestId("one-house-judgment-base-date")).toContainText(/\d{4}-\d{2}-\d{2}/);

    const rows = page.getByTestId("one-house-requirement-review").locator("li");
    await expect(rows).toHaveCount(5);
    const statuses = await rows.evaluateAll((els) =>
      els.map((e) => [e.getAttribute("data-testid"), e.getAttribute("data-status")]),
    );
    expect(statuses).toEqual([
      ["one-house-requirement-one-year", "met"],
      ["one-house-requirement-disposal-deadline", "unmet"],
      ["one-house-requirement-holding", "met"],
      ["one-house-requirement-residence", "met"],
      ["one-house-requirement-high-value", "partial"],
    ]);
    const deadline = page.getByTestId("one-house-requirement-disposal-deadline");
    await expect(deadline).toContainText("처분기한 2026-07-01");
    await expect(deadline).toContainText("양도일을 조정해도 충족할 수 없습니다");
  });
});

test.describe("판정 메뉴 — 1주택 단독 양도", () => {
  test("[RV-2] 1세대 1주택 → 보유 → 거주 → 고가 순서로 검토하고 비과세", async ({ page }) => {
    await gotoJudgmentHoldingsStep(page, {
      ...REPORTED,
      contractTotalPrice: "1000000000",
      assets: [{ ...REPORTED.assets[0], residencePeriodMonthsAsset: "24" }],
      houses: [],
    });
    await judge(page);

    await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
    const statuses = await page
      .getByTestId("one-house-requirement-review")
      .locator("li")
      .evaluateAll((els) => els.map((e) => [e.getAttribute("data-testid"), e.getAttribute("data-status")]));
    expect(statuses).toEqual([
      ["one-house-requirement-one-house", "met"],
      ["one-house-requirement-holding", "met"],
      ["one-house-requirement-residence", "met"],
      ["one-house-requirement-high-value", "met"],
    ]);
  });
});
