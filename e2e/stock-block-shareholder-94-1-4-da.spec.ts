/**
 * E2E: 과점주주 특정주식(§94①4 다목) — **요건 게이트 · 영 §168② 차감 · 기신고 이력 합산**
 *
 * 계획서: `docs/00-pm/stock-block-shareholder-94-1-4-da.plan.md`
 * 교재:   『2026 양도·상속·증여세 이론 및 계산실무』 **사례 50**(pp.623~629)
 *
 * ## 왜 E2E인가 — 엔진 anchor가 못 보는 층
 *
 * `__tests__/tax-engine/stock-transfer/block-shareholder-94-1-4-da.anchor.test.ts`는 엔진을
 * **직접** 부른다. 이번 변경의 절반은 그 앞 배선이다 — ⑤ 신규 4칸이 실제로 렌더되는가,
 * ④ 변환·⑫ Zod·⑭ Route 매핑이 **침묵 strip** 없이 값을 엔진까지 보내는가, ⑦ 결과행이 뜨는가.
 * 그 축은 브라우저를 실제로 걸어야만 증명된다([[feedback_leaf_anchor_skips_zod_layer]]).
 *
 * | ID | 무엇을 고정하는가 |
 * |---|---|
 * | B-1 | 4칸 수동 입력 → **A-3 정본 373,985,000** · §168② 차감행 · 지방 37,398,500 |
 * | B-2 | 게이트 미충족(누적 30%) → 미리보기 「미충족」 + `other_asset` **차단**(폴백 불가) |
 * | B-3 | 요건② **양도일 종속** 임계 — 50.0%가 2026년엔 미달, 2019년엔 충족 |
 * | B-4 | Phase C 이력 선택 합산 → 다섯 칸 자동 채움 → **B-1과 같은 세액** |
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 * 로케이터: FieldCard label은 htmlFor 미연결 → `[data-slot="field-card"]` + `.last()` 패턴
 *          (형제 spec `stock-basic-deduction-gate.spec.ts`와 동일). CurrencyInput은 aria-label 보유.
 */

import { test, expect, type Page } from "@playwright/test";

import { putCalculationRecord } from "./_helpers/history-seed";

const LOCAL_USER_ID = "local-user";
const CORP = "㈜현조경";

// ─────────────────────────────────────────────────────────────────
// 공통 헬퍼
// ─────────────────────────────────────────────────────────────────

async function gotoStockTransferTax(page: Page) {
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 30_000 });
}

/** 날짜 3칸(연·월·일). `scope`가 없으면 페이지 전역 nth. */
async function fillDate(page: Page, nth: number, iso: string) {
  const [y, m, d] = iso.split("-");
  await page.locator('input[type="text"][aria-label="연도"]').nth(nth).fill(y);
  await page.locator('input[type="text"][aria-label="월"]').nth(nth).fill(m);
  await page.locator('input[type="text"][aria-label="일"]').nth(nth).fill(d);
}

/**
 * FieldCard 안의 첫 텍스트 input.
 *
 * ⚠️ `hasText`는 **바깥 FieldCard까지** 매칭한다(기타자산 블록 전체가 FieldCard다).
 *    `.last()`로 가장 안쪽 카드를 고른다 — 형제 spec과 같은 규약.
 */
function fieldInput(page: Page, label: string) {
  return page
    .locator('[data-slot="field-card"]')
    .filter({ hasText: label })
    .last()
    .locator('input[type="text"]')
    .first();
}

/** Step1 기본 입력 — 시장 라디오는 호출부가 먼저 누른다. */
async function fillStep1Basics(
  page: Page,
  o: { name: string; acquisitionDate: string; transferDate: string; shareCount: string },
) {
  await page.getByPlaceholder("종목명을 입력하세요").fill(o.name);
  await fillDate(page, 0, o.acquisitionDate); // 취득일 — AcquisitionInfoBlock
  await fillDate(page, 1, o.transferDate); // 양도일 — 양도 정보 block
  await fieldInput(page, "양도 주식수").fill(o.shareCount);
  await fieldInput(page, "발행주식 총수").fill("100000");
}

/** §94①4 다목 ToggleCard ON */
async function turnOnBlockShareholder(page: Page) {
  const sw = page
    .locator('[data-slot="toggle-card"]')
    .filter({ hasText: /과점주주/ })
    .getByRole("switch")
    .first();
  await sw.waitFor({ state: "visible", timeout: 10_000 });
  await sw.click();
}

/** 요건 3칸(%) + 합산창 최초 양도일. `firstDate`가 없으면 날짜는 건드리지 않는다. */
async function fillGateFields(
  page: Page,
  o: { realEstate?: string; ownership?: string; cumulative?: string; firstDate?: string },
) {
  if (o.realEstate !== undefined) {
    await fieldInput(page, "법인 자산총액 중 부동산등 비율").fill(o.realEstate);
  }
  if (o.ownership !== undefined) {
    await fieldInput(page, "과점주주 소유비율 (본인 + 기타주주)").fill(o.ownership);
  }
  if (o.cumulative !== undefined) {
    await fieldInput(page, "소급 3년 누적 양도비율").fill(o.cumulative);
  }
  if (o.firstDate !== undefined) {
    // Step1 DateInput 순서: 0=취득일 · 1=양도일 · 2=합산기간 최초 양도일(마지막 섹션)
    await fillDate(page, 2, o.firstDate);
  }
}

/** 단계 인디케이터로 직접 이동 — `handleNext` 검증을 태우지 않는다. */
async function jumpToStep(page: Page, i: number) {
  await page.getByTestId(`step-circle-${i}`).click();
}

async function fillStep2(page: Page, o: { transferTotal: string; perShareAcq: string }) {
  await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });
  await page.locator("div:has(> label:has-text('양도가액 합계')) input").first().fill(o.transferTotal);
  await page.locator("div:has(> label:has-text('1주당 취득가액')) input").first().fill(o.perShareAcq);
}

async function fillStep3(page: Page, o: { expenses: string; filingDate: string }) {
  await expect(page.getByText("필요경비·신고").first()).toBeVisible({ timeout: 10_000 });
  await page.getByLabel("필요경비 합계", { exact: true }).fill(o.expenses);
  await fillDate(page, 0, o.filingDate); // Step3의 유일한 DateInput
}

async function clickResult(page: Page) {
  const resp = page.waitForResponse(
    (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "결과 보기" }).click();
  const r = await resp;
  if (!r.ok()) throw new Error(`계산 API 비정상 응답 ${r.status()}`);
}

/**
 * 교재 사례 50 정본(A-3) 결과 단언 — §168② 차감 후 373,985,000.
 *
 * ⚠️ 같은 문구가 **결과 표와 신고서 서식 둘 다**에 있다(strict mode 충돌). 둘을 갈라서
 *    각각 단언한다 — `.first()`로 뭉개면 «서식 행이 사라져도» 초록이 된다.
 */
async function expectCaseFiftyResult(page: Page) {
  // ⑦ 결과 표 — 차감 전 → 차감 → 차감 후 3행
  await expect(page.getByText("계산 결과").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("산출세액 (차감 전)", { exact: true })).toBeVisible();
  await expect(
    page.getByText("△ 대주주로서 납부한 세액 (영 §168②)", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("403,185,000").first()).toBeVisible();
  await expect(page.getByText("-29,200,000").first()).toBeVisible();
  await expect(page.getByText("373,985,000").first()).toBeVisible();
  await expect(page.getByText("37,398,500").first()).toBeVisible();
  await expect(page.getByText("411,383,500").first()).toBeVisible();

  // 신고서 서식 — 24-1·24-2 신설행 + 25·30행 라벨 전환
  await expect(page.getByRole("cell", { name: "24-1. 산출세액 (차감 전)" })).toBeVisible();
  await expect(
    page.getByRole("cell", { name: /24-2\. △ 대주주로서 납부하였거나 납부할 세액/ }),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: /25\. 산출세액 \(영 §168② 차감 후/ })).toBeVisible();
  await expect(
    page.getByRole("cell", { name: /30\. 지방소득세 §103의3 \(영 §168② 차감 «후»/ }),
  ).toBeVisible();
}

// ─────────────────────────────────────────────────────────────────
// B-1 — 4칸 수동 입력 → 교재 사례 50 정본
// ─────────────────────────────────────────────────────────────────

test("B-1: 다목 3요건 + 영 §168② 기납부 → 산출 373,985,000 · 지방 37,398,500", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoStockTransferTax(page);

  await page.getByRole("radio", { name: "기타자산" }).first().click();
  await fillStep1Basics(page, {
    name: CORP,
    acquisitionDate: "2003-02-17",
    transferDate: "2026-02-26",
    shareCount: "70000",
  });
  await turnOnBlockShareholder(page);
  await fillGateFields(page, {
    realEstate: "65",
    ownership: "70",
    cumulative: "70",
    firstDate: "2023-06-20",
  });

  // ⑤ 게이트 미리보기 — 엔진 leaf 단일 소스가 「충족」으로 판정한다
  await expect(
    page.getByText("§94①4 다목 요건 충족 — 기타자산(§55① 누진)으로 계산됩니다"),
  ).toBeVisible({ timeout: 10_000 });

  // 영 §168② — 1차(§94①3호)로 이미 낸 산출세액
  await page.getByLabel("대주주로서 납부하였거나 납부할 세액").fill("29200000");

  await page.getByRole("button", { name: /^다음/ }).click();
  await fillStep2(page, { transferTotal: "2100000000", perShareAcq: "15000" });
  await page.getByRole("button", { name: /^다음/ }).click();
  await fillStep3(page, { expenses: "5000000", filingDate: "2026-04-30" });

  await clickResult(page);
  await expectCaseFiftyResult(page);
});

// ─────────────────────────────────────────────────────────────────
// B-2 — 게이트 미충족 → `other_asset`은 돌아갈 곳이 없어 차단된다
// ─────────────────────────────────────────────────────────────────

test("B-2: 누적 양도비율 30% → 미리보기 「미충족」 + 다음 단계 차단", async ({ page }) => {
  test.setTimeout(90_000);
  await gotoStockTransferTax(page);

  await page.getByRole("radio", { name: "기타자산" }).first().click();
  await fillStep1Basics(page, {
    name: "미달법인",
    acquisitionDate: "2015-01-15",
    transferDate: "2026-02-26",
    shareCount: "30000",
  });
  await turnOnBlockShareholder(page);
  await fillGateFields(page, {
    realEstate: "65",
    ownership: "70",
    cumulative: "30", // 🔴 영 §158② 임계 50% 미달
    firstDate: "2023-06-20",
  });

  await expect(page.getByText("§94①4 다목 요건 미충족")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("소급 3년 누적 양도비율 50% 이상 (영 §158②)")).toBeVisible();

  // ⑧ validate — `other_asset`은 폴백 대상 시장 정보가 없어 **error**다.
  // ⚠️ 같은 문장이 ⑤ 미리보기 카드에도 있다 — 배너만 잡도록 «미달 항목 괄호»까지 건다.
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(
    page.getByText(
      /§94①4 다목 요건 미충족\(소급 3년 누적 양도비율 50% 이상 \(영 §158②\)\) — 시장 유형에서/,
    ),
  ).toBeVisible({ timeout: 10_000 });
  // 여전히 1단계다 — 「양도·취득가액」은 인디케이터 라벨로도 존재하므로 aria-current로 본다.
  await expect(
    page.getByRole("button", { name: /^자산·시장·대주주 단계로 이동/ }),
  ).toHaveAttribute("aria-current", "step");
});

// ─────────────────────────────────────────────────────────────────
// B-3 — 요건②의 임계는 **양도일**로 갈린다 (대통령령 제30395호 부칙 §41)
// ─────────────────────────────────────────────────────────────────

test("B-3: 소유비율 50.0% — 2026년 양도는 미달(초과), 2019년 양도는 충족(이상)", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await gotoStockTransferTax(page);

  await page.getByRole("radio", { name: "기타자산" }).first().click();
  await fillStep1Basics(page, {
    name: "경계법인",
    acquisitionDate: "2003-02-17",
    transferDate: "2026-02-26",
    shareCount: "50000",
  });
  await turnOnBlockShareholder(page);
  await fillGateFields(page, {
    realEstate: "65",
    ownership: "50", // 🔴 정확히 50.0%
    cumulative: "70",
    firstDate: "2023-06-20",
  });

  // 신법(2020-02-11~) — 「50%를 **초과**」라 50.0%는 미달
  await expect(page.getByText("§94①4 다목 요건 미충족")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("과점주주 소유비율 (영 §158①)")).toBeVisible();
  await expect(page.getByText(/100분의 50을 «초과»해야|50%를 «초과»해야/)).toBeVisible();

  // 양도일을 시행 전으로 되돌리면 구법(「이상」)이 적용된다
  await fillDate(page, 1, "2019-06-20");
  await fillDate(page, 2, "2018-06-20"); // 3년 창 유지
  await expect(
    page.getByText("§94①4 다목 요건 충족 — 기타자산(§55① 누진)으로 계산됩니다"),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/2020-02-11 시행 전 양도분/)).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────
// B-4 — Phase C: 기신고 이력을 «골라» 합산하면 B-1과 같은 세액이 나온다
// ─────────────────────────────────────────────────────────────────

test("B-4: 기신고 1건 선택 → 다섯 칸 자동 채움 → 373,985,000 (B-1과 동일)", async ({ page }) => {
  test.setTimeout(150_000);
  await gotoStockTransferTax(page);

  // 교재 1차 양도(2023-06-20) 신고 이력 — §94①3호로 과세된 건
  const now = new Date().toISOString();
  await putCalculationRecord(page, {
    id: "e2e-block-prior-1",
    userId: LOCAL_USER_ID,
    taxType: "stock_transfer",
    title: `${CORP} 1차 양도 2023-06-20`,
    inputData: { securityName: CORP, securityCode: "", transferDate: "2023-06-20" },
    resultData: {
      shareCount: 30_000,
      transferPrice: 600_000_000,
      acquisitionPrice: 450_000_000,
      expenses: 1_500_000,
      calculatedTax: 29_200_000,
      appliedSection94: "①3나_본문",
    },
    taxLawVersion: "2023-06-20",
    linkedCalculationId: null,
    clientId: null,
    createdAt: now,
    updatedAt: now,
  });

  // Step1 — 당회차(2차) 40,000주만 입력한다
  await page.getByRole("radio", { name: "기타자산" }).first().click();
  await fillStep1Basics(page, {
    name: CORP,
    acquisitionDate: "2003-02-17",
    transferDate: "2026-02-26",
    shareCount: "40000",
  });
  await turnOnBlockShareholder(page);
  await fillGateFields(page, { realEstate: "65", ownership: "70" });

  // 당회차 금액을 먼저 채운다 — 합산은 «기신고 + 당회차»다.
  // (요건 4칸이 아직 비어 있어 `다음`은 막히므로 인디케이터로 이동한다)
  await jumpToStep(page, 1);
  await fillStep2(page, { transferTotal: "1500000000", perShareAcq: "15000" });
  await jumpToStep(page, 2);
  await fillStep3(page, { expenses: "3500000", filingDate: "2026-04-30" });
  await jumpToStep(page, 0);

  // 모달 — 후보 1건을 골라 합산
  await page.getByTestId("block-shareholder-prior-lookup").click();
  await expect(
    page.getByRole("heading", { name: "기신고 이력에서 합산 (영 §158②)" }),
  ).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("prior-transfer-e2e-block-prior-1").check();
  await expect(page.getByText("선택 1건 합계")).toBeVisible();
  await page.getByRole("button", { name: /선택 1건 합산/ }).click();

  // 다섯 값이 «한 소스»에서 파생됐다
  await expect(page.getByText(/기신고 1건 반영됨/)).toBeVisible({ timeout: 10_000 });
  await expect(fieldInput(page, "소급 3년 누적 양도비율")).toHaveValue("70");
  await expect(fieldInput(page, "양도 주식수")).toHaveValue("70,000");
  await expect(page.getByLabel("대주주로서 납부하였거나 납부할 세액")).toHaveValue("29,200,000");
  await expect(page.locator('input[type="text"][aria-label="연도"]').nth(2)).toHaveValue("2023");

  await expect(
    page.getByText("§94①4 다목 요건 충족 — 기타자산(§55① 누진)으로 계산됩니다"),
  ).toBeVisible();

  // 금액 3칸도 합산됐다 — 손으로 더하지 않았는데 B-1의 입력과 같아진다
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(
    page.locator("div:has(> label:has-text('양도가액 합계')) input").first(),
  ).toHaveValue("2,100,000,000");
  await expect(
    page.locator("div:has(> label:has-text('1주당 취득가액')) input").first(),
  ).toHaveValue("15,000");
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByLabel("필요경비 합계", { exact: true })).toHaveValue("5,000,000");

  await clickResult(page);
  await expectCaseFiftyResult(page);
});
