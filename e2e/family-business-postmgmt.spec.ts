import { test, expect } from "@playwright/test";

/**
 * 가업상속공제 사후관리 시뮬레이터 (PR-2b) e2e.
 *
 * 검증: querystring prefill → 위반 입력 → 계산 → 추징/면제 결과.
 * 엔진(PR-2)은 unit anchor로 검증됨 — 본 spec은 UI 폼→엔진→결과 배선 검증.
 */
test.describe("가업상속공제 사후관리 시뮬레이터", () => {
  const PREFILL =
    // ⚠️ baseTaxable 필수 — canCalculate가 "빈칸=silent 0 방지"로 명시 입력을 요구한다
    //    (page.tsx:152). 실제 호출부도 이 파라미터를 붙인다(InheritanceTaxResultView.tsx:453).
    "/calc/family-business-postmgmt?originalDeduction=10000000000&baseTaxable=20000000000" +
    "&deathDate=2025-01-01&filingDeadline=2025-07-31";

  async function setViolationDate(card: ReturnType<import("@playwright/test").Page["getByTestId"]>, y: string, m: string, d: string) {
    await card.getByLabel("연도").fill(y);
    await card.getByLabel("월").fill(m);
    await card.getByLabel("일").fill(d);
  }

  test("5년 내 가업 미종사 → 추징 발생(면제 아님)", async ({ page }) => {
    await page.goto(PREFILL);
    await expect(page.getByRole("heading", { name: "가업상속공제 사후관리 시뮬레이터" })).toBeVisible();
    // 메인 진입 prefill 안내
    await expect(page.getByText("메인 마법사에서 진입")).toBeVisible();

    // 위반 유형: 가업 미종사
    await page.getByText("가업 미종사", { exact: false }).first().click();

    // 위반일 2026-06-01 (5년 내)
    const card = page.getByTestId("violation-0");
    await setViolationDate(card, "2026", "06", "01");

    await page.getByRole("button", { name: "추징세액 계산" }).click();

    const result = page.getByTestId("fb-postmgmt-result");
    await expect(result).toBeVisible();
    // 추징 발생 → 위반별 표에 "면제" 없음
    await expect(result).not.toContainText("면제 (outside_five_year_period)");
    // 순 추징세액 표시 (0원 아님)
    await expect(page.getByTestId("fb-postmgmt-net")).toBeVisible();
  });

  test("5년 초과 위반 → 자동 면제(outside_five_year_period)", async ({ page }) => {
    await page.goto(PREFILL);
    await page.getByText("가업 미종사", { exact: false }).first().click();

    // 위반일 2031-06-01 (사망 2025-01-01 + 5년 초과)
    const card = page.getByTestId("violation-0");
    await setViolationDate(card, "2031", "06", "01");

    await page.getByRole("button", { name: "추징세액 계산" }).click();

    const result = page.getByTestId("fb-postmgmt-result");
    await expect(result).toBeVisible();
    await expect(result).toContainText("outside_five_year_period");
  });

  test("PR-5: cgt querystring → 양도소득세 환원 공제(§18의2⑩) prefill", async ({ page }) => {
    // 양도세 결과뷰 링크에서 넘어온 §18의2⑩ creditAmount 5억
    await page.goto(`${PREFILL}&cgt=500000000`);
    // §18의2⑩ 환원 공제 안내 라벨 노출 + 입력칸에 5억 prefill
    await expect(page.getByText("양도소득세 환원 공제 (§18의2⑩, 선택)")).toBeVisible();
    await expect(page.locator('input[value="500,000,000"]')).toBeVisible();
  });
  // ══════════════════════════════════════════════════
  // UI 리뷰 G8 — IG-011 · IG-012 · IG-013 · IG-095
  // ══════════════════════════════════════════════════

  test("IG-011: 정당한 사유 목록이 위반 유형별로 갈린다 (상증령 §15⑧ 1~3호)", async ({ page }) => {
    await page.goto(PREFILL);
    const select = page.getByTestId("justifiable-reason-0");

    // 기본값 = 자산처분(§⑤1호) → 1호 7건만
    await expect(select).toBeVisible();
    await expect(select.locator("option")).toHaveCount(8); // "해당 없음" + 7
    await expect(select.locator('option:has-text("1호가.")')).toHaveCount(1);
    await expect(select.locator('option:has-text("3호가.")')).toHaveCount(0);

    // 지분 감소(§⑤3호) → 3호 7건만
    await page.getByText("지분 감소", { exact: false }).first().click();
    await expect(select.locator("option")).toHaveCount(8);
    await expect(select.locator('option:has-text("3호가.")')).toHaveCount(1);
    await expect(select.locator('option:has-text("1호가.")')).toHaveCount(0);

    // 고용 미달(§⑤4호) → §15⑧에 정당사유 자체가 없다 ⇒ 칸이 사라진다
    await page.getByText("고용 미달", { exact: false }).first().click();
    await expect(page.getByTestId("justifiable-reason-0")).toHaveCount(0);
    await expect(page.getByTestId("justifiable-reason-none-0")).toBeVisible();
  });

  test("IG-011: 위반 유형을 바꾸면 호가 어긋난 정당사유가 비워진다 (엔진은 대조하지 않는다)", async ({ page }) => {
    await page.goto(PREFILL);
    const card = page.getByTestId("violation-0");
    await setViolationDate(card, "2026", "06", "01");

    // 자산처분 + 1호 사유 선택
    const select = page.getByTestId("justifiable-reason-0");
    await select.selectOption("expropriation");
    await expect(select).toHaveValue("expropriation");

    // 지분 감소로 전환 → 1호 사유는 인정될 수 없으므로 비워진다
    await page.getByText("지분 감소", { exact: false }).first().click();
    await expect(page.getByTestId("justifiable-reason-0")).toHaveValue("");

    // 그대로 계산하면 «면제되지 않는다» — 값이 남아 있었다면 추징이 전액 0이 된다
    await page.getByRole("button", { name: "추징세액 계산" }).click();
    const result = page.getByTestId("fb-postmgmt-result");
    await expect(result).toBeVisible();
    await expect(result).not.toContainText("면제 (expropriation)");
  });

  test("IG-013: 위반이 2건이면 기한이 «가장 이른» 사건 기준 + 건별 기한 표시", async ({ page }) => {
    await page.goto(PREFILL);

    // ① 늦은 사건을 먼저 입력 (배열 첫 원소 = 늦은 날짜)
    await setViolationDate(page.getByTestId("violation-0"), "2028", "03", "10");
    // ② 이른 사건을 나중에 추가
    await page.getByRole("button", { name: "+ 사건 추가" }).click();
    await setViolationDate(page.getByTestId("violation-1"), "2026", "06", "15");
    await page.getByTestId("violation-1").getByText("가업 미종사", { exact: false }).first().click();

    await page.getByRole("button", { name: "추징세액 계산" }).click();
    const result = page.getByTestId("fb-postmgmt-result");
    await expect(result).toBeVisible();

    // 배너 = 가장 이른 기한 (2026-06-30 + 6개월).
    // ⚠️ 결과 섹션 전체를 보면 «건별 기한 열»의 같은 날짜에 걸려 통과한다 — 배너로 스코프한다.
    const banner = page.getByTestId("fb-postmgmt-deadline-banner");
    await expect(banner).toContainText("2026-12-30");
    await expect(banner).not.toContainText("2028-09-30");
    // 여러 건 안내
    await expect(page.getByTestId("fb-postmgmt-multi-deadline")).toBeVisible();
    // 건별 기한 — 첫 행(늦은 사건)은 2028-09-30
    await expect(page.getByTestId("fb-postmgmt-deadline-0")).toContainText("2028-09-30");
    await expect(page.getByTestId("fb-postmgmt-deadline-1")).toContainText("2026-12-30");
  });

  test("IG-095: 「직접입력 모드」는 조작 가능한 토글이 아니라 읽기 전용 표시다", async ({ page }) => {
    // direct=1 없이 진입 → 아무것도 안 뜬다
    await page.goto(PREFILL);
    await expect(page.getByTestId("fb-postmgmt-direct-input-badge")).toHaveCount(0);

    // direct=1 진입 → 읽기 전용 배지 (토글 아님)
    await page.goto(`${PREFILL}&direct=1`);
    const badge = page.getByTestId("fb-postmgmt-direct-input-badge");
    await expect(badge).toBeVisible();
    await expect(badge.getByRole("switch")).toHaveCount(0);
    await expect(badge.locator('input[type="checkbox"]')).toHaveCount(0);
  });
  test("IG-012: ③ 판정이 「4호 위반 아님」인데 ②에 고용 미달이 있으면 모순을 명시한다", async ({ page }) => {
    await page.goto(PREFILL);

    // ② 고용 미달 위반 1건 (5년 내)
    await setViolationDate(page.getByTestId("violation-0"), "2026", "06", "01");
    await page.getByText("고용 미달", { exact: false }).first().click();

    // ③ 정규직·총급여 — 유지(90% 이상)로 입력 ⇒ bothViolated = false
    await page.getByTestId("fb-postmgmt-employment-toggle").getByRole("switch").click();
    await page.getByTestId("fb-postmgmt-five-year-avg").fill("100");
    await page.getByTestId("fb-postmgmt-prior-two-year-avg").fill("100");

    await page.getByRole("button", { name: "추징세액 계산" }).click();
    const result = page.getByTestId("fb-postmgmt-result");
    await expect(result).toBeVisible();
    await expect(result).toContainText("4호 위반: 아니오");
    await expect(page.getByTestId("fb-postmgmt-employment-conflict")).toBeVisible();
  });
});
