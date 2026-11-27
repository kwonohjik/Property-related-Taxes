/**
 * E2E: 소득세법 §101② 증여 후 우회양도 판정 화면
 *
 * 계획서: `docs/00-pm/transfer-101-2-gift-resale.plan.md` §6 · P5
 *
 * 검증 대상:
 *  - G-1 교재 사례 → 미적용 · 1호 42,555,000 · 수증자 · 최종부담 42,555,000 (request body 13키)
 *  - G-2 거울 사례(수증자 양도세 5,000,000) → 부인 적용 · 증여자 · 최종부담 13,704,000
 *  - G-3 빈 입력 → 칸별 오류 · API 요청 0건
 *  - G-4 배우자·직계존비속 → 판정하지 않음(Q-1)
 *  - G-5 이력 불러오기 — 단건만 후보(일괄 제외) · 선택 시 칸·배지 · 칸 수정 시 그 칸 배지만 제거
 *  - G-6 홈 카드 → 판정 화면
 *  - G-8 이력 모달 폭 — 긴 이력 제목(주소·양도일)이 잘리지 않고 가로 스크롤이 없다
 *  - G-7 2호 «양도세 계산기로» → 계산기 «증여자 기준» 표지 켜짐(이력 분리 — `transfer-history-101-2-donor-key.plan.md`)
 *
 * ⚠️ 값이 든 금액 칸(`CurrencyInput`)에 `fill()`을 다시 하면 값이 이어 붙는다 — 공용 컴포넌트의
 *    RAF 전체 선택과 `fill()`의 경합(P3 실측: 36250000 → «362,500,005,000,000»). 덮어쓰기는
 *    클릭 → 전체 선택 → 타이핑으로 한다(`overwriteAmount`). 빈 칸에는 `fill()`이 정상이다.
 */
import { test, expect, type Page } from "@playwright/test";
import { fillDateAndVerify } from "./_helpers/tax-flow";
import { putCalculationRecord } from "./_helpers/history-seed";

const PATH = "/calc/gift-resale-101-2";

async function gotoHydrated(page: Page) {
  await page.goto(PATH);
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="gr-judge"]');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}

async function fillRequirements(page: Page) {
  await page.getByTestId("gr-relation-related").click();
  await expect(page.getByTestId("gr-relation-related")).toBeChecked();
  await fillDateAndVerify(page, { year: "2026", month: "02", day: "01" }, { scope: page.getByTestId("gr-gift-date") });
  await fillDateAndVerify(page, { year: "2026", month: "04", day: "05" }, { scope: page.getByTestId("gr-transfer-date") });
  await page.getByTestId("gr-attribution-no").click();
  await expect(page.getByTestId("gr-attribution-no")).toBeChecked();
}

async function fillAmounts(page: Page, a: { calc: string; credits: string; donee?: string; donor?: string }) {
  await page.getByTestId("gr-gift-tax-calculated").fill(a.calc);
  await page.getByTestId("gr-gift-tax-credits").fill(a.credits);
  if (a.donee) await page.getByTestId("gr-donee-transfer-tax").fill(a.donee);
  if (a.donor) await page.getByTestId("gr-donor-transfer-tax").fill(a.donor);
}

/** 값이 든 금액 칸 덮어쓰기 — 사용자 동작(클릭 → 전체 선택 → 타이핑) */
async function overwriteAmount(page: Page, testId: string, value: string) {
  const f = page.getByTestId(testId);
  await f.click();
  await f.press("ControlOrMeta+a");
  await page.keyboard.type(value);
  await f.blur();
}

async function judge(page: Page): Promise<Record<string, unknown>> {
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/calc/gift-resale-101-2") && r.request().method() === "POST"),
    page.getByTestId("gr-judge").click(),
  ]);
  expect(resp.ok(), await resp.text()).toBe(true);
  await expect(page.getByTestId("gr-result")).toBeVisible();
  return JSON.parse(resp.request().postData() ?? "{}");
}

test.describe("§101② 증여 후 우회양도 판정", () => {
  test("G-1 교재 사례 → 미적용 · 수증자 · 최종부담 42,555,000", async ({ page }) => {
    await gotoHydrated(page);
    await fillRequirements(page);
    await fillAmounts(page, { calc: "6500000", credits: "195000", donee: "36250000", donor: "13704000" });
    const body = await judge(page);

    expect(Object.keys(body)).toHaveLength(13);
    expect(body).toMatchObject({ relation: "related", substantiveAttribution: "no", giftRegistryDate: "2026-02-01" });
    await expect(page.getByTestId("gr-result")).toHaveAttribute("data-outcome", "not_applied");
    await expect(page.getByTestId("gr-badge")).toHaveText("미적용");
    await expect(page.getByTestId("gr-clause1")).toHaveText("42,555,000");
    await expect(page.getByTestId("gr-clause2")).toHaveText("13,704,000");
    await expect(page.getByTestId("gr-taxpayer")).toHaveText("수증자");
    await expect(page.getByTestId("gr-final-burden")).toHaveText("42,555,000");
    await expect(page.getByTestId("gr-period")).toContainText("2036.2.1.");
  });

  test("G-2 거울 사례 → 부인 적용 · 증여자 · 최종부담 13,704,000", async ({ page }) => {
    await gotoHydrated(page);
    await fillRequirements(page);
    await fillAmounts(page, { calc: "6500000", credits: "195000", donee: "5000000", donor: "13704000" });
    await judge(page);

    await expect(page.getByTestId("gr-result")).toHaveAttribute("data-outcome", "applied");
    await expect(page.getByTestId("gr-badge")).toHaveText("부인 적용");
    await expect(page.getByTestId("gr-clause1")).toHaveText("11,305,000");
    await expect(page.getByTestId("gr-taxpayer")).toContainText("증여자");
    await expect(page.getByTestId("gr-final-burden")).toHaveText("13,704,000");
    await expect(page.getByTestId("gr-applied-extra")).toBeVisible();
  });

  test("G-3 빈 입력 → 칸별 오류 · 요청 없음", async ({ page }) => {
    await gotoHydrated(page);
    let requests = 0;
    page.on("request", (r) => {
      if (r.url().includes("/api/calc/gift-resale-101-2")) requests += 1;
    });
    await page.getByTestId("gr-judge").click();
    await expect(page.getByTestId("gr-errors").locator("li")).toHaveCount(8);
    await expect(page.getByTestId("gr-result")).toHaveCount(0);
    expect(requests).toBe(0);
  });

  test("G-4 배우자·직계존비속 → 판정하지 않음", async ({ page }) => {
    await gotoHydrated(page);
    await fillRequirements(page);
    await page.getByTestId("gr-relation-spouse-lineal").click();
    await expect(page.getByTestId("gr-relation-spouse-lineal")).toBeChecked();
    await fillAmounts(page, { calc: "6500000", credits: "195000", donee: "5000000", donor: "13704000" });
    await judge(page);

    await expect(page.getByTestId("gr-result")).toHaveAttribute("data-outcome", "out_of_scope");
    await expect(page.getByTestId("gr-badge")).toHaveText("판정하지 않음");
    await expect(page.getByTestId("gr-reason")).toContainText("배우자등 이월과세");
    await expect(page.getByTestId("gr-final-burden")).toHaveCount(0);
  });

  test("G-5 이력 불러오기 — 단건만 후보 · 배지 · 수정 시 그 칸 배지만 제거", async ({ page }) => {
    await gotoHydrated(page);
    const rec = (id: string, title: string, createdAt: string, resultData: Record<string, unknown>) => ({
      id,
      userId: "local-user",
      taxType: "transfer",
      title,
      inputData: {},
      resultData,
      taxLawVersion: "2026-01-01",
      linkedCalculationId: null,
      clientId: null,
      createdAt,
      updatedAt: createdAt,
    });
    await putCalculationRecord(page, rec("gr-e2e-donee", "을 수증자 기준", "2026-11-26T01:00:00.000Z", { mode: "single", result: { determinedTax: 36_250_000, penaltyTax: 0 } }));
    await putCalculationRecord(page, rec("gr-e2e-donor", "갑 증여자 기준", "2026-11-26T02:00:00.000Z", { mode: "single", result: { determinedTax: 13_704_000, penaltyTax: 0 } }));
    await putCalculationRecord(page, rec("gr-e2e-bundled", "일괄양도", "2026-11-26T03:00:00.000Z", { mode: "bundled", aggregated: {}, apportionment: {} }));

    await page.getByTestId("gr-donee-history-launch").click();
    const list = page.getByTestId("gr-history-list");
    await expect(list.locator("li")).toHaveCount(2);
    await expect(page.getByTestId("gr-history-item-gr-e2e-bundled")).toHaveCount(0);
    await page.getByTestId("gr-history-item-gr-e2e-donee").click();
    await expect(page.getByTestId("gr-donee-transfer-tax")).toHaveValue("36,250,000");
    await expect(page.getByTestId("gr-donee-history-badge")).toContainText("을 수증자 기준");

    await page.getByTestId("gr-donor-history-launch").click();
    await page.getByTestId("gr-history-item-gr-e2e-donor").click();
    await expect(page.getByTestId("gr-donor-transfer-tax")).toHaveValue("13,704,000");
    await expect(page.getByTestId("gr-donor-history-badge")).toContainText("갑 증여자 기준");

    await overwriteAmount(page, "gr-donee-transfer-tax", "5000000");
    await expect(page.getByTestId("gr-donee-transfer-tax")).toHaveValue("5,000,000");
    await expect(page.getByTestId("gr-donee-history-badge")).toHaveCount(0);
    await expect(page.getByTestId("gr-donor-history-badge")).toBeVisible();
  });

  test("G-8 이력 모달 폭 — 긴 제목이 잘리지 않고 가로 스크롤 없음", async ({ page }) => {
    await gotoHydrated(page);
    const title = "양도소득세 (증여자 기준) — 경기도 수원시 권선구 금곡로212번길 25 (금곡동) (양도 2026.04.05)";
    const at = "2026-11-27T01:00:00.000Z";
    await putCalculationRecord(page, {
      id: "gr-e2e-long", userId: "local-user", taxType: "transfer", title, inputData: {},
      resultData: { mode: "single", result: { determinedTax: 13_704_000, penaltyTax: 0 } },
      taxLawVersion: "2026-04-05", linkedCalculationId: null, clientId: null, createdAt: at, updatedAt: at,
    });
    await page.getByTestId("gr-donee-history-launch").click();
    const modal = page.getByTestId("gr-history-modal");
    const item = page.getByTestId("gr-history-item-gr-e2e-long");
    await expect(item).toContainText(title);
    await expect(item).toContainText("13,704,000");
    // 기본 `sm:max-w-sm`(24rem=384px)에 묶이면 실패한다
    expect((await modal.boundingBox())!.width).toBeGreaterThan(600);
    const overflow = await modal.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const titleClipped = await item.locator("span.font-medium").first().evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(titleClipped).toBe(false);
    await modal.screenshot({ path: "e2e/_artifacts/gr-history-modal-g8.png" });
  });

  test("G-6 홈 카드 → 판정 화면", async ({ page }) => {
    await page.goto("/");
    await page.locator(`a[href="${PATH}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${PATH}$`));
    await expect(page.getByRole("heading", { name: "증여 후 우회양도 판정" })).toBeVisible();
  });

  test("G-7 2호 링크 → 계산기 «증여자 기준» 표지 켜짐 · 일반 진입은 꺼짐", async ({ page }) => {
    await gotoHydrated(page);
    await page.getByTestId("gr-donor-calc-link").click();
    // 계산기 첫 컴파일(dev·새 워크트리)이 5초를 넘는다 — 기본 대기로는 판정 화면에 머문 채 실패했다(2026-11-27)
    await expect(page).toHaveURL(/\/calc\/transfer-tax$/, { timeout: 60_000 });
    const toggle = page.getByTestId("gift-resale-donor-basis-toggle");
    await expect(toggle).toHaveAttribute("data-checked", "true");

    // 끄기 — 사용자가 일반 계산으로 되돌릴 수 있다
    await toggle.getByRole("switch").click();
    await expect(toggle).not.toHaveAttribute("data-checked", "true");

    // 홈 카드 진입(?new=1)은 표지 없이 시작한다
    await page.goto("/calc/transfer-tax?new=1");
    await expect(page.getByTestId("gift-resale-donor-basis-toggle")).not.toHaveAttribute("data-checked", "true");
  });
});
