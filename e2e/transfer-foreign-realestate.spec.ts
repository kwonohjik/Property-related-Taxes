/**
 * E2E: 국외자산 부동산 양도소득세 (소득세법 §118의2~§118의8) — 화면 입력 → 계산 → 결과 → 이력
 *
 * 계획서: `docs/02-design/features/transfer-foreign-realestate.ui.plan.md` §9 · §13~§15 · 엔진 `...engine.plan.md` K-1·K-14·K-15.
 * 결정(재제안 금지): C-1 한 건의 계산 안에 국외자산 여러 개 · C-2 거주 연수 정수 1칸 · C-3 미등기 칸 없음 · D-M `/multi`는 국외 건을 막는다.
 *
 * ## 증명하려는 것
 * 엔진 anchor·화면 단위 테스트는 «사용자가 그 값을 넣을 수 있는가»를 증명하지 못한다. 이 spec은 **sessionStorage 시드 없이**
 * 폼을 손으로 채워(⑤ 위젯) → ④⑬ body(항목별 환율) → ⑫ Zod → 엔진 → ⑦ 결과 카드 → 이력(IndexedDB)까지 실제 경로를 따라간다.
 * 외부 API 의존 없음(주소 검색 안 씀) — mock 불필요.
 *
 *  FRE-E1  K-1 교재: 항목별 환율이 body에 실리고 결과가 437,000,000 / 434,500,000 / 147,860,000 / 14,786,000 / 162,646,000
 *  FRE-E2  함정 음성: 같은 사례에 대고객 매입률(1,050/1,250)을 입력하면 다른 과세표준 — 환율은 입력 그대로(숨은 대체 없음)
 *  FRE-E3  K-14 2건: 산출세액 188,550,000 (합산 후 1회 누진 · 기본공제는 먼저 양도한 자산에서)
 *  FRE-E4  K-15 차손+차익 혼재: 통산하지 않고 계산(437,000,000 / 434,500,000 / 147,860,000) · 「확인 필요」 카드 · 차손 행 0 반영
 *  FRE-E5  거주 4년: 비차단 경고 → 계산 → 납세의무 없음 사유 카드 · 세액 0 · 세액 계산 섹션 없음
 *  FRE-E6  ⑧ 차단: 양도비 행 환율 누락 → 오류 목록 + 그 칸으로 이동 · 요청 없음
 *  FRE-E7  `/multi`: 국외 건 안내 문구 + 합산 계산 차단
 *  FRE-E8  이력: K-1 계산 뒤 이력 목록에 국외 제목과 총 납부세액
 *  FRE-E9  신고서 표(별지 제84호서식 · 국내 부동산과 같은 서식): K-1 숫자 · 선택 출력(print) · 선택 항목 PDF 다운로드
 *
 * 실행: E2E_PORT=<포트> npx playwright test e2e/transfer-foreign-realestate.spec.ts
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { fillAndVerify } from "./_helpers/tax-flow";

const FOREIGN_API = "/api/calc/transfer/foreign";

interface AssetInput {
  address: string;
  transferDate: [string, string, string];
  transferAmount: string;
  transferRate: string;
  acquisitionDate: [string, string, string];
  acquisitionAmount: string;
  acquisitionRate: string;
}

/** K-1 교재 — 국외 토지(미국) · 양도 $900,000 @1,100(2026-07-10) · 취득 $400,000 @1,300(2022-01-15) */
const K1: AssetInput = {
  address: "Dallas TX 1 Main St",
  transferDate: ["2026", "7", "10"],
  transferAmount: "900000",
  transferRate: "1100",
  acquisitionDate: ["2022", "1", "15"],
  acquisitionAmount: "400000",
  acquisitionRate: "1300",
};

const card = (page: Page, i: number) => page.getByTestId(`foreign-asset-card-${i}`);
const fieldInput = (scope: Locator | Page, field: string) => scope.locator(`[data-field="${field}"] input`).first();

/** 진입 — 새 컨텍스트라 sessionStorage가 비어 있다. hydration 전 클릭 유실을 막으려고 React 키가 붙을 때까지 기다린다(e2e/CLAUDE.md §6). */
async function openForeignWizard(page: Page, path = "/calc/transfer-tax", heading = "양도소득세 계산기") {
  await page.goto(path);
  await page.getByRole("heading", { name: heading }).waitFor({ timeout: 60_000 });
  const radio = page.getByTestId("asset-location-foreign");
  await radio.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="asset-location-foreign"]');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  }, undefined, { timeout: 30_000 });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await radio.click();
  await expect(page.getByTestId("foreign-real-estate-step")).toBeVisible({ timeout: 15_000 });
  // 국내 전용 입력은 마운트되지 않는다(양성 짝 — 위 가시성 단언이 있어 «아무것도 안 떴다»가 아니다)
  await expect(page.getByTestId("transfer-date")).toHaveCount(0);
}

async function fillDate(scope: Locator, [y, m, d]: [string, string, string]) {
  const year = scope.getByLabel("연도", { exact: true });
  await year.fill(y);
  await scope.getByLabel("월", { exact: true }).fill(m);
  await scope.getByLabel("일", { exact: true }).fill(d);
  await expect(year).toHaveValue(y);
  await expect(scope.getByLabel("월", { exact: true })).toHaveValue(m);
  await expect(scope.getByLabel("일", { exact: true })).toHaveValue(d);
}

async function fillResidence(page: Page, years: string) {
  await fillAndVerify(fieldInput(page, "foreignResidenceYears"), years);
}

/** 국외자산 카드 i를 채운다 — 자산 종류는 «토지» 라디오를 직접 누른다 */
async function fillAsset(page: Page, i: number, a: AssetInput) {
  const c = card(page, i);
  await expect(c).toBeVisible();
  const land = c.getByRole("radio", { name: "토지" });
  await land.click();
  await expect(land).toBeChecked();
  await c.getByLabel(`국외자산 ${i + 1} 소재 국가`).selectOption("US");
  await c.getByLabel(`국외자산 ${i + 1} 소재지`).fill(a.address);
  await fillDate(c.locator('[data-field="foreignAsset.transferDate"]'), a.transferDate);
  await fillAndVerify(fieldInput(c, "foreignAsset.transferAmount"), a.transferAmount);
  await fillAndVerify(fieldInput(c, "foreignAsset.transferRate"), a.transferRate);
  await fillDate(c.locator('[data-field="foreignAsset.acquisitionDate"]'), a.acquisitionDate);
  await fillAndVerify(fieldInput(c, "foreignAsset.acquisitionAmount"), a.acquisitionAmount);
  await fillAndVerify(fieldInput(c, "foreignAsset.acquisitionRate"), a.acquisitionRate);
}

/** 양도비 1행 — 지출일·금액. `rate`가 있으면 직접 입력, 없으면 비워 둔다(`shortcut`이면 «양도일 환율과 같음» 버튼) */
async function addCostRow(
  page: Page,
  i: number,
  row: { date: [string, string, string]; amount: string; rate?: string; shortcut?: boolean },
) {
  const box = page.getByTestId(`foreign-costRows-${i}`);
  await box.getByRole("button", { name: "+ 양도비 추가" }).click();
  await fillDate(box.locator('[data-field="foreignAsset.costRows.0.date"]'), row.date);
  await fillAndVerify(fieldInput(box, "foreignAsset.costRows.0.amount"), row.amount);
  const rate = fieldInput(box, "foreignAsset.costRows.0.rate");
  if (row.shortcut) {
    await box.getByRole("button", { name: "양도일 환율과 같음" }).click();
    await expect(rate).toHaveValue(/^1,?100$/);
  } else if (row.rate) {
    await fillAndVerify(rate, row.rate);
  }
}

/** 「세금 계산하기」 — 응답을 기다려 body·응답을 돌려준다 */
async function calculate(page: Page) {
  const resp = page.waitForResponse((r) => r.url().includes(FOREIGN_API) && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const r = await resp;
  return { status: r.status(), body: r.request().postDataJSON() as Record<string, any>, json: (await r.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** 계산 요청이 **나가지 않는지** — ⑧ 차단 확인용 */
async function calculateBlocked(page: Page): Promise<boolean> {
  let posted = false;
  const onReq = (r: { url(): string; method(): string }) => {
    if (r.url().includes(FOREIGN_API) && r.method() === "POST") posted = true;
  };
  page.on("request", onReq);
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await expect(page.getByTestId("validation-issues")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);
  page.off("request", onReq);
  return !posted;
}

/** 결과 카드의 금액 칸 — `AmountRow`(data-testid) 안 `[data-amount]` */
const amount = (page: Page, testId: string) => page.getByTestId(testId).locator("[data-amount]").first();

async function fillK1(page: Page, rates?: { transfer: string; acquisition: string; cost: string }, path?: string, heading?: string) {
  await openForeignWizard(page, path, heading);
  await fillResidence(page, "7");
  await fillAsset(page, 0, {
    ...K1,
    ...(rates ? { transferRate: rates.transfer, acquisitionRate: rates.acquisition } : {}),
  });
  await addCostRow(page, 0, { date: K1.transferDate, amount: "30000", ...(rates ? { rate: rates.cost } : { shortcut: true }) });
}

test.describe("국외자산 부동산 양도소득세 — 화면 입력부터 결과·이력까지", () => {
  test("FRE-E1: K-1 교재 — 항목별 환율이 body에 실리고 결과가 교재 정답과 같다", async ({ page }) => {
    test.setTimeout(180_000);
    await fillK1(page);

    const { status, body, json } = await calculate(page);
    expect(status).toBe(200);

    // ④⑬ body — 행마다 자기 환율(양도 1,100 · 취득 1,300 · 양도비 1,100). 한 환율로 뭉개지면 K-6 오답(차익 517,000,000)이 된다
    expect(body.domesticResidenceYears).toBe(7);
    expect(body.assets).toHaveLength(1);
    const a = body.assets[0];
    expect(a.kind).toBe("land");
    expect(a.transfer).toMatchObject({ amountForeign: 900000, currency: "USD", exchangeRate: 1100, date: "2026-07-10" });
    expect(a.acquisition).toMatchObject({ amountForeign: 400000, currency: "USD", exchangeRate: 1300, date: "2022-01-15" });
    expect(a.transferCosts).toHaveLength(1);
    expect(a.transferCosts[0]).toMatchObject({ amountForeign: 30000, exchangeRate: 1100, date: "2026-07-10" });
    expect(a.capitalExpenditures).toEqual([]);
    expect(body).not.toHaveProperty("foreignTax"); // 토글을 켜지 않았다

    // 엔진 응답이 화면 값의 근거 — 같은 숫자를 결과 카드에서도 확인한다
    expect(json.data.taxBase).toBe(434_500_000);
    expect(json.data.calculatedTax).toBe(147_860_000);

    // ⑦ 결과 카드
    await expect(page.getByTestId("foreign-result-card")).toBeVisible({ timeout: 30_000 });
    await expect(amount(page, "foreign-gain-0-income")).toHaveText("437,000,000");
    await expect(amount(page, "foreign-tax-base")).toHaveText("434,500,000");
    await expect(amount(page, "foreign-basic-deduction")).toHaveText("2,500,000");
    await expect(amount(page, "foreign-calculated-tax")).toHaveText("147,860,000");
    await expect(amount(page, "foreign-local-tax")).toHaveText("14,786,000");
    await expect(amount(page, "foreign-total-tax")).toHaveText("162,646,000");
    await expect(page.getByTestId("foreign-result-total")).toHaveText("162,646,000");
    // 장기보유특별공제 배제 문구(§118의8 단서) · 양도차익 산식은 항목별 환산 값
    await expect(page.getByTestId("foreign-gain-0-lthd")).toContainText("적용 배제 — 소득세법 §118의8 단서");
    await expect(amount(page, "foreign-gain-0-transfer")).toHaveText("990,000,000");
    await expect(amount(page, "foreign-gain-0-acquisition")).toHaveText("520,000,000");
    await expect(amount(page, "foreign-gain-0-cost-0")).toHaveText("33,000,000");
    // 국내 결과 화면이 섞이지 않았다
    await expect(page.getByTestId("foreign-result-view")).toBeVisible();
  });

  test("FRE-E2: 함정 음성 — 대고객 매입률(1,050/1,250)을 넣으면 교재 값이 나오지 않는다(환율은 입력 그대로)", async ({ page }) => {
    test.setTimeout(180_000);
    await fillK1(page, { transfer: "1050", acquisition: "1250", cost: "1050" });

    const { status, body } = await calculate(page);
    expect(status).toBe(200);
    // 환율이 입력 그대로 body에 실린다 — 화면·변환 어디에서도 기준환율(1,100/1,300)로 바꿔 끼우지 않는다
    const a = body.assets[0];
    expect(a.transfer.exchangeRate).toBe(1050);
    expect(a.acquisition.exchangeRate).toBe(1250);
    expect(a.transferCosts[0].exchangeRate).toBe(1050);

    // 양도가액 945,000,000 − 취득가액 500,000,000 − 양도비 31,500,000 = 413,500,000 → 기본공제 2,500,000 → 411,000,000
    await expect(page.getByTestId("foreign-result-card")).toBeVisible({ timeout: 30_000 });
    await expect(amount(page, "foreign-gain-0-income")).toHaveText("413,500,000");
    await expect(amount(page, "foreign-tax-base")).toHaveText("411,000,000");
    await expect(amount(page, "foreign-tax-base")).not.toHaveText("434,500,000");
    await expect(amount(page, "foreign-total-tax")).not.toHaveText("162,646,000");
  });

  test("FRE-E3: K-14 — 2건(차익 437,000,000 + 100,000,000)은 합산 후 1회 누진 → 산출세액 188,550,000", async ({ page }) => {
    test.setTimeout(180_000);
    await fillK1(page);
    // 자산 2 — 양도 2026-03-05(먼저 양도) · 양도 $200,000 @1,000 − 취득 $100,000 @1,000 = 차익 100,000,000
    await page.getByTestId("foreign-add-asset").click();
    await fillAsset(page, 1, {
      address: "Austin TX 2 Oak Ave",
      transferDate: ["2026", "3", "5"],
      transferAmount: "200000",
      transferRate: "1000",
      acquisitionDate: ["2021", "3", "5"],
      acquisitionAmount: "100000",
      acquisitionRate: "1000",
    });

    const { status, body } = await calculate(page);
    expect(status).toBe(200);
    expect(body.assets).toHaveLength(2);
    expect(body.assets[1].transfer.exchangeRate).toBe(1000);

    await expect(page.getByTestId("foreign-result-card")).toBeVisible({ timeout: 30_000 });
    await expect(amount(page, "foreign-gain-0-income")).toHaveText("437,000,000");
    await expect(amount(page, "foreign-gain-1-income")).toHaveText("100,000,000");
    await expect(amount(page, "foreign-income-total")).toHaveText("537,000,000");
    await expect(amount(page, "foreign-basic-deduction")).toHaveText("2,500,000");
    await expect(amount(page, "foreign-tax-base")).toHaveText("534,500,000");
    await expect(amount(page, "foreign-calculated-tax")).toHaveText("188,550,000");
    await expect(amount(page, "foreign-local-tax")).toHaveText("18,855,000");
    await expect(amount(page, "foreign-total-tax")).toHaveText("207,405,000");
    // 기본공제 §118의7②: 먼저 양도한 자산(2번째 카드, 3월 5일)에서 공제 — 양도일 1번째
    await expect(amount(page, "foreign-gain-1-bd")).toHaveText("2,500,000");
    await expect(page.getByTestId("foreign-gain-1-bd")).toContainText("양도일 1번째");
    await expect(amount(page, "foreign-gain-0-bd")).toHaveText("0");
  });

  test("FRE-E4: K-15 — 차손 자산과 차익 자산이 섞이면 통산하지 않고 계산하고 «확인 필요» 카드를 보인다", async ({ page }) => {
    test.setTimeout(180_000);
    await fillK1(page);
    await page.getByTestId("foreign-add-asset").click();
    // 자산 2 — 양도 $50,000 @1,000 − 취득 $100,000 @1,000 = 차손 −50,000,000 (양도 3/5 — K-1 자산보다 먼저)
    await fillAsset(page, 1, {
      address: "Austin TX 2 Oak Ave",
      transferDate: ["2026", "3", "5"],
      transferAmount: "50000",
      transferRate: "1000",
      acquisitionDate: ["2021", "3", "5"],
      acquisitionAmount: "100000",
      acquisitionRate: "1000",
    });

    const { status, json } = await calculate(page);
    expect(status).toBe(200);
    expect(json.data.confirmationNeeded).toContain("FOREIGN_LOSS_NOT_NETTED");

    // 차손 −50,000,000은 0으로 보고 K-1 자산만 과세 — K-1 단건(FRE-E1)과 같은 세액
    await expect(page.getByTestId("foreign-result-card")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("foreign-gain-1-gain")).toContainText("-50,000,000");
    await expect(page.getByTestId("foreign-gain-1-income")).toContainText("통산하지 않음 — 과세기간 소득금액에 0으로 반영");
    await expect(amount(page, "foreign-gain-1-income")).toHaveText("0");
    await expect(amount(page, "foreign-income-total")).toHaveText("437,000,000");
    await expect(amount(page, "foreign-basic-deduction")).toHaveText("2,500,000");
    await expect(amount(page, "foreign-gain-0-bd")).toHaveText("2,500,000"); // 차손 자산이 먼저 양도됐어도 기본공제는 차익 자산 몫
    await expect(amount(page, "foreign-gain-1-bd")).toHaveText("0");
    await expect(amount(page, "foreign-tax-base")).toHaveText("434,500,000");
    await expect(amount(page, "foreign-calculated-tax")).toHaveText("147,860,000");
    await expect(amount(page, "foreign-total-tax")).toHaveText("162,646,000");
    const notice = page.getByTestId("foreign-confirm-FOREIGN_LOSS_NOT_NETTED");
    await expect(notice).toContainText("통산하지 않고 0으로 보아 계산했습니다");
    await expect(notice).toContainText("국심2005서3759");
    await expect(page.getByTestId("validation-issues")).toHaveCount(0);
  });

  test("FRE-E5: 거주 4년 — 경고(비차단) → 계산 → 납세의무 없음 카드 · 세액 0", async ({ page }) => {
    test.setTimeout(180_000);
    await fillK1(page);
    await fillResidence(page, "4");
    // 비차단 경고 — 입력 중 즉시 보인다
    await expect(page.getByTestId("foreign-residence-under-min")).toBeVisible();

    const { status, body } = await calculate(page);
    expect(status).toBe(200);
    expect(body.domesticResidenceYears).toBe(4);

    await expect(page.getByTestId("foreign-result-card")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("foreign-not-liable")).toBeVisible();
    await expect(page.getByTestId("foreign-not-liable")).toContainText("5년 이상 국내에 주소 또는 거소를 둔 거주자가 아니어서");
    await expect(page.getByTestId("foreign-result-total")).toHaveText("0");
    // 세액 계산 섹션은 렌더되지 않는다(양성 짝: 위에서 결과 카드는 보인다)
    await expect(page.getByTestId("foreign-tax-calc")).toHaveCount(0);
  });

  test("FRE-E6: ⑧ 차단 — 양도비 행의 환율을 비우면 오류 목록이 뜨고 그 칸으로 이동한다(요청 없음)", async ({ page }) => {
    test.setTimeout(180_000);
    await fillK1(page);
    // «양도일 환율과 같음»으로 채운 양도비 환율을 비운다 — 조용한 대체가 없음을 확인
    const rate = fieldInput(page.getByTestId("foreign-costRows-0"), "foreignAsset.costRows.0.rate");
    await rate.fill("");
    await expect(rate).toHaveValue("");

    expect(await calculateBlocked(page)).toBe(true);
    const panel = page.getByTestId("validation-issues");
    await expect(panel).toContainText("입력 확인이 필요합니다");
    await expect(panel).toContainText("기준환율");
    await expect(page.getByTestId("foreign-result-view")).toHaveCount(0);

    // 오류 항목을 누르면 그 칸으로 이동(포커스 + 뷰포트)
    await panel.getByRole("button", { name: /기준환율/ }).first().click();
    await expect(rate).toBeFocused();
    await expect(rate).toBeInViewport();
  });

  test("FRE-E7: /multi — 국외 건 안내가 세 자리(편집·목록·합산 계산)에 뜨고 합산 계산 요청은 나가지 않는다", async ({ page }) => {
    test.setTimeout(180_000);
    const MSG = "국외 자산은 한 건 계산 안에서 여러 개를 추가하세요";
    const MULTI = "/calc/transfer-tax/multi";
    // 편집 화면에서 「국외 부동산」을 고르는 자리 — 고르기 전에는 안내가 없다(양성 짝은 openForeignWizard가 국외 입력 화면 가시성으로 단언)
    await page.goto(MULTI);
    await page.getByRole("heading", { name: "양도소득세 연간 합산 과세 계산" }).waitFor({ timeout: 60_000 });
    await expect(page.getByTestId("asset-location-foreign")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("multi-foreign-notice")).toHaveCount(0);

    // 같은 건을 K-1로 채워 ⑧(국외 입력 검증)을 통과시킨다 — 그래도 합산 쪽이 국외를 받지 않는다
    await fillK1(page, undefined, MULTI, "양도소득세 연간 합산 과세 계산");
    await expect(page.getByTestId("multi-foreign-notice")).toContainText(MSG);

    const posts: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/api/calc/")) posts.push(r.url());
    });
    await page.getByRole("button", { name: "공통 설정으로 →" }).click();
    const calcBtn = page.getByRole("button", { name: "세액 계산" });
    await expect(calcBtn).toBeVisible({ timeout: 15_000 });
    await calcBtn.click();
    // 합산 계산 검증(`validateMultiSupportedMode`)이 같은 문구로 막는다
    await expect(page.getByRole("alert").filter({ hasText: MSG })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    expect(posts).toEqual([]);

    // 건 목록으로 돌아가면 국외 건 옆에도 같은 문구
    await page.getByRole("button", { name: "자산 목록으로" }).click();
    await expect(page.getByTestId("multi-foreign-list-notice")).toContainText(MSG);
  });

  test("FRE-E8: 이력 — K-1 계산 뒤 이력 목록에 국외 제목과 총 납부세액 162,646,000", async ({ page, context }) => {
    test.setTimeout(180_000);
    await fillK1(page);
    const { status } = await calculate(page);
    expect(status).toBe(200);
    await expect(page.getByTestId("foreign-result-total")).toHaveText("162,646,000", { timeout: 30_000 });

    // 같은 컨텍스트(같은 IndexedDB)의 다른 탭에서 이력을 연다 — 결과 탭을 떠나 자동 저장을 끊지 않는다
    const hist = await context.newPage();
    await hist.goto("/history");
    await expect(async () => {
      await hist.reload();
      await expect(hist.getByText("양도소득세 (국외 부동산) — 미국 Dallas TX 1 Main St (양도 2026.07.10)")).toBeVisible({ timeout: 4_000 });
    }).toPass({ timeout: 45_000 });
    await expect(hist.getByText("162,646,000").first()).toBeVisible();
  });
  test("FRE-E9: 신고서 표(별지 제84호서식) — K-1 숫자 · 신고서 표만 인쇄 · 선택 항목 PDF 다운로드", async ({ page }) => {
    test.setTimeout(240_000);
    // 폰트 CDN은 E2E 전용 헤더(x-e2e-*)가 CORS에 걸린다 — route에서 뗀다(`transfer-pdf-head-rows.spec.ts`와 같다). PDF 실패 alert도 잡는다.
    const dialogs: string[] = [];
    page.on("dialog", async (d) => {
      dialogs.push(d.message());
      await d.dismiss();
    });
    await page.route("https://cdn.jsdelivr.net/**", async (r) => {
      const h = { ...r.request().headers() };
      for (const k of Object.keys(h)) if (k.startsWith("x-e2e")) delete h[k];
      await r.continue({ headers: h });
    });
    await fillK1(page);
    const { status } = await calculate(page);
    expect(status).toBe(200);

    // 화면: 서식 표에 교재 숫자가 보인다(원화 환산 · 장기보유특별공제 0 · 세율구분 코드 2-10 · 소재지는 입력한 값)
    const form = page.getByTestId("foreign-filing-form");
    await expect(form).toBeVisible({ timeout: 30_000 });
    await expect(form).toContainText("별지 제84호서식");
    for (const n of ["990,000,000", "520,000,000", "33,000,000", "437,000,000", "2,500,000", "434,500,000", "147,860,000", "2-10", "Dallas TX 1 Main St", "미국"]) {
      await expect(form).toContainText(n);
    }
    await expect(form).toContainText("국외자산은 해당되지 않습니다");
    const shot = process.env.FRE_SHOT_DIR;
    if (shot) {
      await page.addStyleTag({ content: "header, nav { position: static !important; }" }); // sticky 사이트 헤더가 표를 가리지 않게(스크린샷 전용)
      await form.screenshot({ path: `${shot}/foreign-filing-form-screen.png` });
    }

    // 기본은 전체 미선택 — PDF 버튼은 잠겨 있다. 신고서 표만 고른다.
    const pdfBtn = page.getByRole("button", { name: /선택 항목 PDF/ });
    await expect(pdfBtn).toBeDisabled();
    await page.getByLabel("신고서 양식 표 (별지 제84호서식)").click();

    // 인쇄: 신고서 표 leaf만 남고 나머지는 print:hidden
    await page.emulateMedia({ media: "print" });
    await expect(page.locator('[data-print-id="form-table"]')).toBeVisible();
    await expect(page.locator('[data-print-id="summary"]')).toBeHidden();
    await expect(page.locator('[data-print-id="asset-gain"]')).toBeHidden();
    if (shot) await page.screenshot({ path: `${shot}/foreign-filing-form-print.png`, fullPage: true });
    await page.emulateMedia({ media: "screen" });

    // PDF: react-pdf가 클라이언트에서 파일을 만든다
    await expect(pdfBtn).toBeEnabled();
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 90_000 }), pdfBtn.click()]);
    expect(download.suggestedFilename()).toMatch(/^양도소득세_국외부동산_신고서_.*\.pdf$/);
    const path = await download.path();
    const { readFileSync } = await import("node:fs");
    const bytes = readFileSync(path);
    expect(bytes.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(bytes.length).toBeGreaterThan(5_000);
    expect(dialogs).toEqual([]);
    if (shot) await download.saveAs(`${shot}/foreign-filing-form.pdf`);
  });
});
