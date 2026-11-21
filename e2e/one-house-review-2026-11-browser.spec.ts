/**
 * 2026-11 1주택 판정기 리뷰 머지분 — 화면에서만 보이는 것 확인
 *
 * - PR-20b(Q-24): ② 「공동명의(지분)로 소유합니다」·본인 지분율 → 넘기기 → 계산기 공유 지분율·「나머지 지분은 타인 소유」
 * - PR-13(I-13 · I-15): 판정 결과 면책 고지(판정 문구) · 넘길 때 더 넣을 값 · 공동명의 안내
 * - I-14(Q-12): 넘겨받은 사실 카드의 「원본 판정 열기」 → 판정 메뉴로 돌아간다
 * - I-07(Q-13): 구간 모드 거주 구간이 판정 요청 본문에 `residenceIntervals`로 실린다
 */
import { test, expect, type Page } from "@playwright/test";
import { fillDateAndVerify } from "./_helpers/tax-flow";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { selectDirectResidenceInput } from "./_helpers/residence-direct";
import { answerPhrp154_10NoIfUnanswered } from "./_helpers/judgment-seed";

const JIBUN = "서울 강남구 대치동 316";

async function mockAddress(page: Page) {
  await page.route("**/api/address/search*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [] }) }),
  );
  await page.route("**/api/address/standard-price*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ units: [] }) }),
  );
}

async function gotoSaleStep(page: Page) {
  await page.goto("/calc/one-house-exemption?new=1");
  await expect(page.getByTestId("one-house-household")).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByText("② 양도 대상 주택")).toBeVisible();
  await answerPhrp154_10NoIfUnanswered(page);
}

async function fillSaleBasics(page: Page) {
  await fillDateAndVerify(page, { year: "2021", month: "03", day: "01" }, {
    scope: page.getByTestId("one-house-acq-date"),
  });
  await fillDateAndVerify(page, { year: "2026", month: "06", day: "01" }, {
    scope: page.getByTestId("one-house-sale-date"),
  });
  await page.getByTestId("one-house-sale-price").fill("900000000");
}

async function judge(page: Page) {
  await answerPhrp154_10NoIfUnanswered(page);
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByText("③ 보유 주택·권리")).toBeVisible();
  await page.getByTestId("one-house-judge-cta").click();
  await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
}

async function declareHalfShare(page: Page) {
  const box = page.getByTestId("judgment-ownership-share");
  await box.getByRole("switch", { name: /공동명의\(지분\)로 소유합니다/ }).click();
  const ratio = box.getByPlaceholder("지분율");
  await ratio.fill("50");
  await expect(ratio).toHaveValue("50");
}

test.describe("2026-11 리뷰 머지분 화면 확인", () => {
  test("[RV-1] 판정 결과 — 판정용 면책 고지 · 넘길 때 더 넣을 값 · 공동명의 안내", async ({ page }) => {
    await gotoSaleStep(page);
    await selectDirectResidenceInput(page);
    await fillSaleBasics(page);
    await judge(page);
    await expect(page.getByText("본 판정 결과는 참고용이며 법적 효력이 없습니다").first()).toBeVisible();
    await expect(page.getByTestId("one-house-to-calculator-remaining")).toBeVisible();
    await expect(page.getByTestId("one-house-to-calculator-share-note")).toContainText("공동명의(지분)로 소유합니다");
  });

  test("[RV-2] 공동명의 50% → 넘기면 계산기 공유 지분율 50 · 나머지 지분 타인 소유 켜짐", async ({ page }) => {
    await mockAddress(page);
    await gotoSaleStep(page);
    await selectDirectResidenceInput(page);
    await fillSaleBasics(page);
    await declareHalfShare(page);
    await judge(page);
    await page.getByTestId("one-house-to-calculator").click();
    await expect(page).toHaveURL(/\/calc\/transfer-tax$/, { timeout: 30_000 });
    await expandAssetSection(page, 1);
    const num = page.locator('[data-field="ownershipNumerator"]').first();
    await expect(num).toBeVisible();
    await expect(num.getByPlaceholder("지분율")).toHaveValue("50");
    await expect(page.getByRole("switch", { name: /이 물건의 나머지 지분은 타인 소유입니다/ }).first()).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("[RV-3] 넘겨받은 사실 카드의 「원본 판정 열기」 → 판정 메뉴로 돌아간다", async ({ page }) => {
    await mockAddress(page);
    await gotoSaleStep(page);
    await selectDirectResidenceInput(page);
    await fillSaleBasics(page);
    await judge(page);
    await page.getByTestId("one-house-to-calculator").click();
    await expect(page).toHaveURL(/\/calc\/transfer-tax$/, { timeout: 30_000 });
    await expandAssetSection(page, 1);
    const input = page.getByPlaceholder("도로명 또는 지번 주소 입력").first();
    await input.fill(JIBUN);
    await input.press("Enter");
    await page.getByRole("button", { name: new RegExp(`「${JIBUN}」`) }).first().click();
    await expandAssetSection(page, 3);
    await page.getByTestId("fixed-acquisition-price").fill("500000000");
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("① 세대·주택 현황")).toBeVisible();
    const facts = page.getByTestId("imported-one-house-facts");
    await expect(facts).toBeVisible();
    await facts.getByTestId("open-source-judgment").click();
    await expect(page).toHaveURL(/\/calc\/one-house-exemption/, { timeout: 30_000 });
    await expect(page.getByTestId("open-source-judgment-missing")).toHaveCount(0);
    // 이력 재개는 ① 단계로 연다 — 원본 판정의 사실이 다시 채워져 요약에 보인다.
    await expect(page.getByTestId("one-house-household")).toBeVisible();
    await expect(page.getByText("900,000,000").first()).toBeVisible();
    await expect(page.getByText("2026-06-01").first()).toBeVisible();
  });

  test("[RV-4] 구간 모드 거주 구간이 판정 요청 본문에 residenceIntervals로 실린다", async ({ page }) => {
    await gotoSaleStep(page);
    // 신규 자산 기본값 = 구간 입력 + 빈 구간 1개
    await fillDateAndVerify(page, { year: "2021", month: "03", day: "01" }, {
      scope: page.locator('[data-field="residencePeriods.0.moveInDate"]'),
    });
    await fillDateAndVerify(page, { year: "2026", month: "06", day: "01" }, {
      scope: page.locator('[data-field="residencePeriods.0.moveOutDate"]'),
    });
    await fillSaleBasics(page);
    const reqP = page.waitForRequest((r) => r.url().includes("/api/calc/one-house-exemption") && r.method() === "POST");
    await judge(page);
    const body = (await reqP).postDataJSON() as Record<string, unknown>;
    const iv = (body.residenceIntervals ?? (body.sale as Record<string, unknown> | undefined)?.residenceIntervals) as
      | { start: string; end: string }[]
      | undefined;
    expect(iv).toBeDefined();
    expect(iv).toHaveLength(1);
    expect(String(iv![0].start)).toContain("2021-03-01");
    expect(String(iv![0].end)).toContain("2026-06-01");
  });
});
