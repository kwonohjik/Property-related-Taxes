import { test, expect, type Page } from "@playwright/test";

/**
 * 종부세 토지분 "납부할세액의 계산" 카드 E2E — 사례10 종합합산 필지 입력 → 카드 검증.
 *
 * 필지 입력은 테이블+모달 (LandParcelSection) — 필지 추가(자동 모달 오픈) → fill → 닫기 1건씩.
 * worktree: E2E_PORT=3101 npx playwright test e2e/comprehensive-land-payable-calc.spec.ts
 */

const PAGE = "/calc/comprehensive-tax";

async function clickNext(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^다음/ }).click();
}

/** 필지 추가(자동 모달 오픈) → 모달 필드 입력 → 닫기. priorMode auto면 prior 포함. */
async function addParcel(
  page: Page,
  kind: "aggregate" | "separate",
  data: { jurisdiction: string; name?: string; area: string; share: string; price: string; prior?: string },
): Promise<void> {
  await page.getByRole("button", { name: /필지 추가/ }).click();
  const dialog = page.getByTestId(`land-${kind}-parcel-dialog`);
  await expect(dialog).toBeVisible();

  await page.getByTestId(`land-${kind}-parcel-jurisdiction`).fill(data.jurisdiction);
  if (data.name) await page.getByTestId(`land-${kind}-parcel-name`).fill(data.name);
  await page.getByTestId(`land-${kind}-parcel-area`).locator("input").fill(data.area);
  await page.getByTestId(`land-${kind}-parcel-share`).locator("input").fill(data.share);
  await page.getByTestId(`land-${kind}-parcel-price`).locator("input").last().fill(data.price);
  if (data.prior !== undefined) {
    await page.getByTestId(`land-${kind}-parcel-prior-price`).locator("input").last().fill(data.prior);
  }

  await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
  await expect(dialog).toBeHidden();
}

test.describe("종합합산토지분 종합부동산세 납부할 세액 산출 근거 카드", () => {
  test("L-1: 사례10 필지 3건 → 카드 ①~⑤ 값 + 기본 접힘", async ({ page }) => {
    test.setTimeout(120_000);
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

    await page.goto(PAGE);
    await page.getByRole("radio", { name: "2022" }).check();
    await clickNext(page); // → Step2 주택
    await clickNext(page); // → Step3 합산배제
    await clickNext(page); // → Step4 토지

    // 종합합산 토지 ON → 필지 모드
    await page.getByText("종합합산 토지 보유").click();
    await page.getByRole("radio", { name: /필지별 자동 계산/ }).first().check();

    // 직전연도 자동 서브모드 (모달에 직전 공시지가 필드 노출)
    await page.getByRole("radio", { name: /직전 공시지가로 자동 계산/ }).check();

    // 필지 3건 — 추가→모달 fill→닫기 1건씩
    await addParcel(page, "aggregate", { jurisdiction: "서초구", area: "200", share: "50", price: "4300000", prior: "3200000" });
    await addParcel(page, "aggregate", { jurisdiction: "송파구", name: "송파구-1", area: "100", share: "100", price: "3700000", prior: "3300000" });
    await addParcel(page, "aggregate", { jurisdiction: "송파구", name: "송파구-2", area: "200", share: "100", price: "5000000", prior: "4000000" });

    // Step4(토지)가 마지막 → 계산
    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/comprehensive") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: /계산하기/ }).click();
    const resp = await calcResponse;
    expect(resp.ok(), `계산 API 비정상 ${resp.status()}`).toBe(true);

    await expect(page.getByText(/8,638,017/).first()).toBeVisible({ timeout: 30_000 });

    const card = page.getByTestId("land-agg-payable-calc");
    await card.scrollIntoViewIfNeeded();
    // 기본 접힘
    await expect(page.getByTestId("land-agg-payable-step5")).toBeHidden();
    // 펼침
    await card.getByRole("button", { name: /종합합산토지분 종합부동산세 납부할 세액 산출 근거/ }).click();

    await expect(page.getByTestId("land-agg-payable-step1")).toContainText("13,000,000원");
    await expect(page.getByTestId("land-agg-payable-step2-a")).toContainText("5,800,000원");
    await expect(page.getByTestId("land-agg-payable-step3")).toContainText("8,638,017원");
    await expect(page.getByTestId("land-agg-payable-step4-na")).toContainText("10,604,916원");
    await expect(page.getByTestId("land-agg-payable-step4-da")).toContainText("15,907,374원");
    await expect(page.getByTestId("land-agg-payable-step5")).toContainText("8,638,017원");
    await expect(card).toContainText("≪서초구 토지≫");
    await expect(card).not.toContainText("농어촌특별세");

    expect(consoleErrors, `콘솔 에러: ${consoleErrors.join("\n")}`).toEqual([]);
  });
});
