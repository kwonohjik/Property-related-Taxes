/**
 * E2E: 국외전출세 결과 화면 — ② 출력 항목 선택 → ③ 신고서(별지 제84호서식) → ④ 나머지
 *
 * 제보 —「국외전출세 결과탭에 신고서 양식이 있는지 체크해봐」→「일반 주식양도신고서와 동일해
 * 주식 신고서 양식으로 만들면 돼」
 *
 * ## 종전 상태 (실측)
 *
 * 결과탭은 `ExitTaxResultCard` + `ExitTaxHoldingReportSection`(별지 제**104**호서식 —
 * §118의15① **보유현황** 신고서) 둘뿐이었다. 보유현황 신고서는 **세액을 신고하는 서식이
 * 아니다**. 과세표준 신고서(별지 제84호서식)는 `[data-print-section="stock-form-table"]`
 * count **0** — 아예 없었다.
 *
 * 법령: §118의15② 「국외전출자는 … 양도소득과세표준을 출국일이 속하는 달의 말일부터 3개월
 * 이내(납세관리인을 신고한 경우에는 §110① 확정신고 기간 내) … 신고하여야 한다」
 * 서식: 소득세법 시행규칙 별지 008400 「양도소득(**국외전출자**)과세표준 신고 및 납부계산서」
 *
 * 🔑 판정은 **y 좌표**로 한다(FF-1·SO-1 과 같은 이유 — DOM 순서는 `order` 로 뒤집힌다).
 */

import { test, expect, type Page } from "@playwright/test";

async function fillByLabel(page: Page, label: string, value: string) {
  await page
    .locator(`div:has(> label:has-text('${label}')) input[type="text"]`)
    .first()
    .fill(value);
}

/**
 * 결과 화면까지 — 헬퍼는 `exit-tax-wizard-steps.spec.ts` 의 fillStep1/Step2 와 같은 구현이다.
 *
 * `deferral: true` 면 3단계에서 §118의16 납부유예를 켜고 결과로 간다. 결과 화면에서 「이전」으로
 * 되돌아가는 왕복은 쓰지 않는다 — 헤더의 「이전 단계로 이동」과 마법사 「이전」이 같은 이름이라
 * 어느 쪽이 잡히는지가 화면 상태에 의존한다.
 */
async function reachResult(page: Page, opts: { deferral?: boolean } = {}) {
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 30_000 });

  await page.getByPlaceholder("종목명을 입력하세요").fill("전출 케이스");
  await page.getByRole("radio", { name: "국외전출세 (§118의9)" }).first().click();
  await fillByLabel(page, "출국일 전 10년 중 국내 거주 연수", "10");
  await page.locator('input[type="text"][aria-label="연도"]').nth(0).fill("2025");
  await page.locator('input[type="text"][aria-label="월"]').nth(0).fill("06");
  await page.locator('input[type="text"][aria-label="일"]').nth(0).fill("01");
  await page.getByText("직전 연도말 대주주 해당").first().click();

  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("보유 종목 — 간주양도 대상 (§178의9)")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "+ 종목 추가" }).click();
  await page.getByPlaceholder("종목명 입력").first().fill("삼성전자");
  await page.getByPlaceholder("보유 주식수 (주)").first().fill("1000");
  await page.getByPlaceholder("1주당 취득가액").first().fill("50000");
  await page.locator('input[type="text"][aria-label="연도"]').nth(0).fill("2020");
  await page.locator('input[type="text"][aria-label="월"]').nth(0).fill("01");
  await page.locator('input[type="text"][aria-label="일"]').nth(0).fill("02");
  await page.getByPlaceholder("출국일 실제 거래가액 (주당)").first().fill("80000");

  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("실양도 정보 — 경정청구용")).toBeVisible({ timeout: 10_000 });
  if (opts.deferral) {
    await page.getByText("납부유예 신청 (§118의16)").first().click();
  }
  await page.getByRole("button", { name: "결과 보기" }).click();
}

/** 요소의 화면상 세로 위치 — 보이지 않으면 실패시킨다(0 을 「맨 위」로 오독하지 않게). */
async function topOf(page: Page, sel: string) {
  const box = await page.locator(sel).first().boundingBox();
  expect(box, `보이지 않는다: ${sel}`).not.toBeNull();
  return box!.y;
}

test.describe("국외전출세 결과 화면 — 섹션 순서", () => {
  test("ETF-1: 출력 패널 → 신고서 → 결과 카드 → 보유현황 서식 순이다", async ({ page }) => {
    test.setTimeout(180_000);
    await reachResult(page);

    const table = page.locator('[data-print-section="stock-form-table"]');
    await expect(table).toBeVisible({ timeout: 60_000 });

    const panelY = await topOf(page, 'text=출력 항목 선택');
    const filingY = await topOf(page, '[data-print-section="stock-form-table"]');
    const cardY = await topOf(page, 'text=/산출세액 계산 \\(§118의10~§118의11\\)/');
    const holdingY = await topOf(page, '[data-testid="exit-tax-holding-report-toggle"]');

    // 국외 트랙에는 의뢰인 카드(①)가 없다 — 국내 결과뷰 전용 컴포넌트다.
    expect(panelY, `출력 패널 ${panelY} vs 신고서 ${filingY}`).toBeLessThan(filingY);
    expect(filingY, `신고서 ${filingY} vs 결과 카드 ${cardY}`).toBeLessThan(cardY);
    expect(filingY, `신고서 ${filingY} vs 보유현황 서식 ${holdingY}`).toBeLessThan(holdingY);
  });

  test("ETF-2: 서식에 국외전출세 값이 실린다 (빈 껍데기가 아니다)", async ({ page }) => {
    test.setTimeout(180_000);
    await reachResult(page);

    const table = page.locator('[data-print-section="stock-form-table"]');
    await expect(table).toBeVisible({ timeout: 60_000 });

    // 간주양도가액 80,000 × 1,000주 = 80,000,000 / 취득가액 50,000,000
    await expect(table).toContainText("80,000,000");
    await expect(table).toContainText("50,000,000");
    // 양도차익 30,000,000 − 기본공제 2,500,000 = 과세표준 27,500,000
    await expect(table).toContainText("27,500,000");
    // 내부 enum id 노출 금지
    await expect(table).not.toContainText("exit_tax");
  });

  /**
   * ETF-3: 국외전출세는 **§94 양도가 아니라 §118의9 간주양도**다.
   *
   * 서식은 `StockTransferResult` 한 타입만 읽으므로 국내 양도 기준 라벨이 그대로 따라온다.
   * 특히 신고기한 §105①2호(반기 말일 + 2개월)는 국외전출세에 **존재하지 않는 기한**이고,
   * 기본공제도 §103①2호가 아니라 **§118의10④ 별도 그룹**이다.
   */
  test("ETF-3: 근거 조문이 §118 계열이다 (§105①2호 예정신고·§103①2호 아님)", async ({ page }) => {
    test.setTimeout(180_000);
    await reachResult(page);

    const table = page.locator('[data-print-section="stock-form-table"]');
    await expect(table).toBeVisible({ timeout: 60_000 });

    await expect(table).toContainText("§118의9");       // 01 적용 조문
    await expect(table).toContainText("§118의10④");     // 03 기본공제 그룹
    await expect(table).toContainText("§118의11");      // 23 세율
    await expect(table).toContainText("§118의15②");     // 32 신고기한

    // 국내 양도 전용 근거가 섞이면 안 된다
    await expect(table).not.toContainText("§103①2호");
    await expect(table).not.toContainText("예정신고: 반기 말일");
  });

  /**
   * ETF-4: §118의16 납부유예가 서식에 **도달한다**.
   *
   * 단위 anchor(`exit-tax-filing-form-rows.anchor.test.ts` ETA-6)는 **어댑터에서 출발**하므로
   * 「사용자가 유예를 신청할 수 있는가」를 증명하지 못한다 — 토글 → 엔진 → 서식까지 실제
   * 경로를 따라간다(FF-4 와 같은 이유).
   *
   * 🔑 유예는 **세액을 줄이지 않는다** — 31행 총 납부세액이 그대로인지도 함께 본다.
   */
  test("ETF-4: 납부유예를 신청하면 31-E 행이 실리고 총 납부세액은 그대로다", async ({ page }) => {
    test.setTimeout(180_000);
    await reachResult(page, { deferral: true });

    const table = page.locator('[data-print-section="stock-form-table"]');
    await expect(table).toBeVisible({ timeout: 60_000 });

    await expect(table).toContainText("31-E1. 납부유예 신청 세액");
    await expect(table).toContainText("31-E2. 납부유예 기간");
    // ⚠️ 유예는 납부 **시기**만 미룬다 — 31행은 ETF-2 의 미신청 케이스와 **같은** 6,050,000 이다
    //   (신청 전후 대조는 단위 anchor ETA-5·ETA-6 이 든다).
    await expect(table).toContainText("6,050,000");
  });
});
