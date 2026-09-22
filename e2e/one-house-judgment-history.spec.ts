/**
 * 1세대1주택 비과세 **판정 메뉴** — 마법사 플로우 + 이력 왕복 (P4-2b-3)
 *
 * ## 왜 이 스펙이 필요한가
 *
 * P4-2b-2에서 화면을 만들 때 브라우저 확인은 **throwaway 스크립트**였고 저장소에 남기지
 * 않았다. 그래서 머지 직후 이 마법사를 지키는 안전망은 홈 메뉴 제목 단언과 `?new=1`
 * 초기화(F6) 둘뿐이었다 — 마법사 본체가 통째로 깨져도 CI는 초록이었다.
 *
 * ## OHH-4는 **기존 결함의 회귀 단언**이다
 *
 * `HistoryDetailDrawer`의 라우트 맵이 6/8이라 주식 2세목은 드로어에서 「이 조건으로
 * 재계산」 버튼이 아예 뜨지 않았다. vitest 가드(R-4)가 맵을 고정하지만, **버튼이 실제로
 * 렌더되는지**는 DOM에서만 관측된다(가드가 대리 지표만 보는 것을 피한다 —
 * `feedback_guard_uses_proxy_not_the_claim`).
 */
import { test, expect, type Page } from "@playwright/test";
import { fillDateAndVerify } from "./_helpers/tax-flow";
import { putCalculationRecord, waitForCalculationSaved } from "./_helpers/history-seed";

const ADDRESS = "서울 강남구 판정로 1";

/** ①②를 통과해 ③까지 간 뒤, 판정에 필요한 최소 입력을 채운다. */
async function fillToStep3(page: Page): Promise<void> {
  await page.goto("/calc/one-house-exemption?new=1");

  // ① 세대 — `isOneHousehold`는 **기본값이 true**다. 누르면 오히려 꺼진다.
  await expect(page.getByTestId("one-house-household")).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();

  // ② 양도 대상 주택 (2026-09-23 재배치 — 종전에는 3번째 화면이었다)
  await fillDateAndVerify(page, { year: "2015", month: "03", day: "10" }, {
    scope: page.getByTestId("one-house-acq-date"),
  });
  await fillDateAndVerify(page, { year: "2026", month: "06", day: "01" }, {
    scope: page.getByTestId("one-house-sale-date"),
  });
  await page.getByTestId("one-house-sale-price").fill("900000000");

  // ③ 보유 주택·권리 — 1주택 세대(명부 0행)가 가장 흔한 입력이라 그대로 지나간다.
  // 「판정 결과 보기」 CTA는 이 마지막 입력 단계에만 있다.
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByText("③ 보유 주택·권리")).toBeVisible();
}

test.describe("1세대1주택 판정 — 마법사·이력", () => {
  test("[OHH-1] ①→③ 입력 후 판정 결과가 나온다", async ({ page }) => {
    await fillToStep3(page);

    const response = page.waitForResponse(
      (r) => r.url().includes("/api/calc/one-house-exemption") && r.request().method() === "POST",
    );
    await page.getByTestId("one-house-judge-cta").click();
    const res = await response;
    // 400/500을 「판정 실패」 배너로 삼키면 스펙이 조용히 무의미해진다 — 상태코드를 직접 본다.
    expect(res.ok(), `판정 API가 ${res.status()}로 응답했다`).toBe(true);

    await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
    // 2015 취득·2026 양도·9억 — 보유 2년 충족이고 12억 이하라 전액 비과세다.
    await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
  });

  test("[OHH-2] 판정 결과가 이력에 「판정」으로 남는다 (세액이 아니다)", async ({ page }) => {
    await fillToStep3(page);
    await page.getByTestId("one-house-judge-cta").click();
    await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();

    /**
     * 🔑 저장은 결과 화면 마운트 뒤 `useEffect`가 시작하는 **비동기 write**다.
     *    응답만 기다리고 이동하면 `/history`가 0건으로 보인다(`history-seed.ts` 주석 실측).
     */
    await waitForCalculationSaved(page, "one_house_exemption");

    await page.goto("/history");
    await expect(page.getByText("1세대1주택 판정").first()).toBeVisible();
    // 이력 카드는 세액이 없는 세목에 「납부세액 -」을 띄우면 안 된다.
    await expect(page.getByText("판정:").first()).toBeVisible();
    await expect(page.getByText("비과세").first()).toBeVisible();
  });

  test("[OHH-3] 이력 「편집」이 판정 마법사로 돌아오고 입력을 복원한다", async ({ page }) => {
    await page.goto("/history");
    await putCalculationRecord(page, judgmentRecord());
    await page.reload();

    await page.getByTestId("resume-ohh-1").click();
    await expect(page).toHaveURL(/\/calc\/one-house-exemption/);

    // 복원 확인은 ② 양도 대상 화면에서 본다 — 재개는 항상 첫 단계에서 시작한다.
    // (2026-09-23 재배치로 양도 대상이 2번째가 되어 「다음」 1회면 닿는다.)
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("② 양도 대상 주택")).toBeVisible();
    await expect(
      page.getByTestId("one-house-sale-date").getByLabel("연도").first(),
    ).toHaveValue("2026");
    await expect(page.getByTestId("one-house-sale-price")).toHaveValue("900,000,000");
  });

  /**
   * 🔴 **기존 결함 회귀** — 드로어 라우트 맵이 6/8이던 시절 이 버튼은 렌더되지 않았다.
   */
  test("[OHH-4] 드로어에서 주식 평가·판정 이력도 「재계산」 버튼이 뜬다", async ({ page }) => {
    await page.goto("/history");
    await putCalculationRecord(page, stockValuationRecord());
    await putCalculationRecord(page, judgmentRecord());
    await page.reload();

    // 주식 평가 — 종전에는 경로가 없어 버튼 자체가 없었다.
    await page.getByText("주식 평가 이력 A").click();
    await expect(page.getByRole("button", { name: "이 조건으로 재계산" })).toBeVisible();
    // 드로어에는 「닫기」가 둘이다(헤더 아이콘 + 하단 버튼) — 헤더 쪽으로 좁힌다.
    await page.getByLabel("닫기").click();

    /**
     * 판정 — 드로어 머리 값이 「납부세액 -」이 아니라 판정 결론이어야 한다.
     * 🔑 카드는 `stripTaxLabel`로 세목 접두어를 **떼고** 제목을 띄운다(배지와 중복 방지).
     *    전체 title로 찾으면 걸리지 않는다.
     */
    await page.getByText(ADDRESS, { exact: false }).first().click();
    await expect(page.getByTestId("drawer-headline-value")).toHaveText("비과세");
    await expect(page.getByRole("button", { name: "이 조건으로 재계산" })).toBeVisible();
  });

  test("[OHH-5] 이력 필터 「1세대1주택 판정」이 그 세목만 남긴다", async ({ page }) => {
    await page.goto("/history");
    await putCalculationRecord(page, stockValuationRecord());
    await putCalculationRecord(page, judgmentRecord());
    await page.reload();

    await expect(page.getByText("주식 평가 이력 A")).toBeVisible();
    await page.getByRole("button", { name: "1세대1주택 판정", exact: true }).click();
    await expect(page.getByText("주식 평가 이력 A")).toHaveCount(0);
    // 카드 제목은 세목 접두어가 떼인 형태다(`stripTaxLabel`).
    await expect(page.getByText(ADDRESS, { exact: false }).first()).toBeVisible();
  });
});

/** 판정 이력 1건 — 어댑터를 타지 않고 저장 형태를 직접 세운다. */
function judgmentRecord() {
  return {
    id: "ohh-1",
    userId: "local-user",
    taxType: "one_house_exemption",
    title: `1세대1주택 판정 — ${ADDRESS} (양도예정 2026.06.01)`,
    inputData: {
      isOneHousehold: true,
      transferDate: "2026-06-01",
      contractTotalPrice: "900000000",
      assets: [{ id: "a1", addressRoad: ADDRESS, acquisitionDate: "2015-03-10" }],
      houses: [],
      presaleRights: [],
    },
    resultData: {
      judgment: { isExempt: true, isPartialExempt: false, appliedExceptions: [], pending: [] },
      houseCount: { total: 1, countedForExemption: 1, excluded: [] },
    },
    taxLawVersion: "2026-06-01",
    linkedCalculationId: null,
    clientId: null,
    createdAt: "2026-09-21T00:00:00.000Z",
    updatedAt: "2026-09-21T00:00:00.000Z",
  };
}

function stockValuationRecord() {
  return {
    id: "sv-1",
    userId: "local-user",
    taxType: "stock_valuation",
    title: "주식 평가 이력 A",
    inputData: { valuationDate: "2026-05-01", stockItems: [{ companyName: "가나다전자" }] },
    resultData: { totalValuationAmount: 123_456_789, items: [{}] },
    taxLawVersion: "2026-05-01",
    linkedCalculationId: null,
    clientId: null,
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
  };
}
