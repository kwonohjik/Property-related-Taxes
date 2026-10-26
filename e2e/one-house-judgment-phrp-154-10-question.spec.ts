/**
 * 판정 메뉴 — §154⑩ 사실 질문(계획서 `docs/00-pm/phrp-154-10-undeclared-one-house.plan.md` Q-1 (a)) · 브라우저 경로.
 *
 * 판정·⑧·④는 anchor가 고정한다(`__tests__/calc/phrp-154-10-fact-question.anchor.test.tsx` · `__tests__/components/phrp-154-10-fact-question.ui.test.tsx`).
 * 여기서만 보이는 것: ② 화면에서 질문이 ⑳ 토글 바깥에 뜨고, 답하지 않으면 넘어가지 못하며, 「예」가 ⑳ 카드의 §154⑩ 블록을 열어
 * 그 입력이 판정 본문에 실려 「기간분 비과세」가 되는가.
 *
 * 시료: 8억 · 비조정 · 1주택 · 2018-06-01 취득 · 직전거주주택 2019-03-01 양도 · 2020-07-01 양도 · 거주 13개월.
 */
import { test, expect, type Page } from "@playwright/test";
import { fillDateAndVerify } from "./_helpers/tax-flow";

async function gotoSaleStep(page: Page) {
  await page.goto("/calc/one-house-exemption");
  await expect(page.getByTestId("one-house-household")).toBeVisible();
  await page.evaluate(
    (s) => sessionStorage.setItem("one-house-judgment-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          transferDate: "2020-07-01",
          isOneHousehold: true,
          contractTotalPrice: "800000000",
          wasRegulatedAtAcquisition: false,
          assets: [{ assetKind: "housing", acquisitionDate: "2018-06-01", residenceInputMode: "direct", residencePeriodMonthsAsset: "13" }],
          houses: [],
        },
      },
      version: 0,
    },
  );
  await page.reload();
  await expect(page.getByTestId("one-house-household")).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click(); // ① → ②
  await expect(page.getByText("② 양도 대상 주택")).toBeVisible();
}

async function toHoldingsAndJudge(page: Page) {
  await page.getByRole("button", { name: "다음" }).click(); // ② → ③
  await expect(page.getByText("③ 보유 주택·권리")).toBeVisible();
  const response = page.waitForResponse((r) => r.url().includes("/api/calc/one-house-exemption") && r.request().method() === "POST");
  await page.getByTestId("one-house-judge-cta").click();
  const res = await response;
  expect(res.ok(), `판정 API가 ${res.status()}로 응답했다`).toBe(true);
  await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
  return res.request().postDataJSON() as Record<string, unknown>;
}

// 카드 hasText 필터는 안쪽 §154⑩1호 토글까지 잡는다(카드가 중첩) — 스위치 이름으로 고른다
const rentalToggle = (page: Page) => page.getByRole("switch", { name: "장기임대주택 보유자 거주주택 비과세 특례 적용" });

test.describe("판정 메뉴 — §154⑩ 사실 질문", () => {
  test("[PQE-1] ★ ⑳ 토글이 꺼져 있어도 질문이 보이고, 답하지 않으면 ③으로 넘어가지 않는다", async ({ page }) => {
    await gotoSaleStep(page);
    await expect(page.getByTestId("phrp-154-10-question")).toBeVisible();
    await expect(rentalToggle(page)).toHaveAttribute("aria-checked", "false");
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText(/소득세법 시행령 §154⑩\): 이 주택을 임대주택으로 등록했거나/).first()).toBeVisible();
    await expect(page.getByText("③ 보유 주택·권리")).toHaveCount(0);
  });

  test("[PQE-2] 「아니오」 → 판정 「비과세」 · 본문에 특례 없음", async ({ page }) => {
    await gotoSaleStep(page);
    await page.getByTestId("phrp-154-10-answer-no").check();
    const body = await toHoldingsAndJudge(page);
    expect(body).not.toHaveProperty("rentalHousingException");
    await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
  });

  test("[PQE-3] ★ 「예」 → ⑳ 카드에 §154⑩ 블록 · 직전거주주택 양도일 → 판정 본문 B · 0호 · 「기간분 비과세」", async ({ page }) => {
    await gotoSaleStep(page);
    await page.getByTestId("phrp-154-10-answer-yes").check();
    await expect(rentalToggle(page)).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("rental-154-10-block")).toBeVisible();
    await fillDateAndVerify(page, { year: "2019", month: "03", day: "01" }, { scope: page.getByTestId("rental-154-10-prior-date") });
    const body = await toHoldingsAndJudge(page);
    expect(body.rentalHousingException).toMatchObject({ applyException: true, scenario: "B", rentalUnits: [], wasRegisteredRentalOrChildcare: true });
    await expect(page.getByText("기간분 비과세").first()).toBeVisible();
  });
});
