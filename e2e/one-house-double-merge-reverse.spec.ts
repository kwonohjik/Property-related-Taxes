/**
 * D4 이중 합가 — 역순(동거봉양 합가 → 혼인)도 1세대1주택으로 본다(2026-10-09 사용자 결정 · 서면인터넷방문상담4팀-598 대칭).
 *
 * 엔진·구성·라벨은 anchor(`one-house-double-merge-d4` · `surcharge-deemed-double-merge` · `double-merge-origin-d4`)가 고정한다.
 * 여기서는 판정 메뉴에서 역순 세대가 비과세로 나오고, 명부 배지가 순서에 맞는 소유 쪽을 보여 주는지를 본다.
 *
 * 시나리오: 양도 주택 2015-04-01 · 배우자 주택 2014-02-01 · 부모 주택 2005-01-01 · 동거봉양 합가 2018-06-01 → 혼인
 * 2019-03-01 · 양도 2026-04-10(동거봉양 합가일부터 10년 안) · 비조정 · 8억.
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoJudgmentHoldingsStep } from "./_helpers/judgment-seed";

const REVERSE_ID = "155-4-5-double-merge-reverse-unverified";

const house = (id: string, acquisitionDate: string, mergeOrigin: string) => ({
  id,
  region: "capital" as const,
  acquisitionDate,
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
  mergeOrigin,
});

async function seed(page: Page, spouseOrigin: string) {
  await gotoJudgmentHoldingsStep(page, {
    transferDate: "2026-04-10",
    contractTotalPrice: "800000000",
    marriageDate: "2019-03-01",
    parentalCareMergeDate: "2018-06-01",
    isFirstTransferredInMerge: true,
    assets: [{ assetKind: "housing", acquisitionDate: "2015-04-01" }],
    houses: [
      house("spouse", "2014-02-01", spouseOrigin),
      house("parents", "2005-01-01", "counterpart_side"),
    ],
  });
}

async function judge(page: Page) {
  const response = page.waitForResponse(
    (r) => r.url().includes("/api/calc/one-house-exemption") && r.request().method() === "POST",
  );
  await page.getByTestId("one-house-judge-cta").click();
  const res = await response;
  expect(res.ok(), `판정 API가 ${res.status()}로 응답했다`).toBe(true);
  await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
}

test("[DMR-1] 역순 이중 합가 — 비과세", async ({ page }) => {
  await seed(page, "second_merge_side");
  await expect(page.getByText("혼인한 배우자 쪽").first()).toBeVisible();
  await judge(page);
  await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
  // 역순은 해석 미확보 — 적용하되 「판정하지 않은 부분」에 확인 필요를 싣는다
  await expect(page.getByTestId(`one-house-undetermined-${REVERSE_ID}`)).toContainText("확인이 필요합니다");
});

test("[DMR-2] 짝 — 배우자 주택도 먼저 합친 쪽(합친 가족 쪽)으로 두면 구성 불일치로 과세", async ({ page }) => {
  await seed(page, "counterpart_side");
  await judge(page);
  await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");
  await expect(page.getByTestId(`one-house-undetermined-${REVERSE_ID}`)).toHaveCount(0);
});
