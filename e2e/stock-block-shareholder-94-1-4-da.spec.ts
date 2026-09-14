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
 * | B-4 | 이력 선택 합산 → **자연 순서**(Step1 모달 → Step2·3 당회차) → B-1과 같은 세액 |
 * | B-5 | 제외 사유를 **합쳐 말하지 않는다** — 3년 창 밖 ↔ 결과 미저장이 다른 문장 |
 * | B-6 | 기신고가 **`①4다`여도** 기납부세액에 그대로 합산된다(조문 자동 배제 없음) |
 * | B-7 | 모달 **재확인이 멱등**이다 (종전: 2,100,000,000 → 2,700,000,000 이중합산) |
 * | B-8 | 당회차 금액을 **나중에 고쳐도** 기신고분이 살아 있다 (제보 본체) |
 * | B-9 | 저장된 이력이 **당회차분**으로 다시 잡힌다 (다음 회차 이중합산 차단) |
 * | B-10 | 배지는 **기신고분 칸에만** 반응한다 (당회차 편집에는 남는다) |
 *
 * ## 🔴 B-4 는 «자연 순서»여야 한다
 *
 * 2026-09-14 이전 B-4 는 `jumpToStep` 으로 Step2·Step3 를 **먼저** 채운 뒤 Step1 로 돌아와
 * 모달을 열었다. 그 우회 없이는 통과하지 못했기 때문이다 — 당시 합산은 당회차 칸을 덮어쓰는
 * 방식이라 이후 입력이 합산분을 지웠다. **테스트가 제보된 결함(70,009,500 과소)을 가리고
 * 있었다.** 순서를 되돌리지 말 것.
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

/**
 * 이미 값이 든 Step2 금액칸을 **사용자처럼** 고쳐 넣는다 — 클릭 → 전체선택 → 타이핑.
 *
 * ⚠️ `locator.fill()` 을 그대로 다시 부르면 **이어 붙는다**(실측: "999,999,999" 에 fill
 *    "1500000000" → `9,999,999,991,500,000,000`). `CurrencyInput` 은 focus 시 `setLocalRaw`
 *    로 리렌더하는데, 그 리렌더가 Playwright 이 잡아 둔 선택 영역을 **끝으로 접어** 버려
 *    삽입이 되기 때문이다. 실제 사용자는 `SelectOnFocusProvider` 가 RAF 로 걸어 주는
 *    전체선택이 리렌더 «뒤»에 실행돼 덮어쓰기가 된다 — 그래서 이 경로가 «실사용자» 재현이다.
 */
async function retypeStep2(page: Page, o: { transferTotal: string; perShareAcq: string }) {
  const tt = page.locator("div:has(> label:has-text('양도가액 합계')) input").first();
  const pa = page.locator("div:has(> label:has-text('1주당 취득가액')) input").first();
  for (const [loc, v] of [
    [tt, o.transferTotal],
    [pa, o.perShareAcq],
  ] as const) {
    await loc.click();
    await page.keyboard.press("ControlOrMeta+a");
    await loc.pressSequentially(v);
  }
  // ⚠️ `CurrencyInput` 은 **포커스 중에는 콤마를 빼고** raw 숫자를 보여 준다 — blur 해야
  //    표시값이 확정된다. 이걸 빼먹으면 마지막 칸만 "15000" 으로 읽혀 단언이 어긋난다.
  await page.keyboard.press("Tab");
  await expect(tt).toHaveValue(Number(o.transferTotal).toLocaleString());
  await expect(pa).toHaveValue(Number(o.perShareAcq).toLocaleString());
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
    /**
     * ⚠️ **실제 저장 형태를 지킨다** — 주식수는 폼(inputData)의 **문자열**이고,
     *    `resultData`에는 2026-09-14 echo 추가 이전까지 수량 키가 **없었다**.
     *    종전 이 픽스처는 `resultData.shareCount: 30_000`을 손으로 심어, 후보가 한 건도
     *    안 잡히는 결함을 가린 채 초록이었다([[feedback_fixture_default_masks_gate_defect]]).
     *    여기서는 **구 이력**(echo 없음)을 재현해 fallback 경로까지 함께 지킨다.
     */
    inputData: {
      securityName: CORP,
      securityCode: "",
      transferDate: "2023-06-20",
      shareCount: "30000",
    },
    resultData: {
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

  /**
   * 🔴 **자연 순서다** — Step1 에서 바로 모달을 연다.
   *
   * 2026-09-14 이전 이 테스트는 `jumpToStep` 으로 **Step2·Step3 를 먼저 채운 뒤** Step1 로
   * 되돌아와 모달을 열었다. 그래야만 통과했기 때문이다 — 당시 합산은 당회차 칸에 총액을
   * 되쓰는 방식이라, 자연 순서로 하면 이후 Step2·Step3 입력이 합산분을 **덮어써서 지웠다**.
   * 그 우회 때문에 제보된 결함(총 납부세액 70,009,500 과소)이 **초록 뒤에 숨어 있었다**.
   * ⇒ 우회를 걷어내고 사용자가 실제로 걷는 순서로 고정한다.
   */
  await page.getByTestId("block-shareholder-prior-lookup").click();
  await expect(
    page.getByRole("heading", { name: "기신고 이력에서 합산 (영 §158②)" }),
  ).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("prior-transfer-e2e-block-prior-1").check();
  await expect(page.getByText(/선택 1건 합계/)).toBeVisible();
  await page.getByRole("button", { name: /선택 1건 합산/ }).click();

  // 모달이 채우는 것은 «기신고분 전용 칸»이다 — 당회차 칸이 아니다
  await expect(page.getByText(/기신고 1건 반영됨/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByLabel("기신고분 양도가액 합계")).toHaveValue("600,000,000");
  await expect(page.getByLabel("기신고분 취득가액 합계")).toHaveValue("450,000,000");
  await expect(page.getByLabel("기신고분 필요경비 합계")).toHaveValue("1,500,000");
  await expect(fieldInput(page, "기신고분 주식수 합계")).toHaveValue("30000");
  await expect(fieldInput(page, "소급 3년 누적 양도비율")).toHaveValue("70");
  await expect(page.getByLabel("대주주로서 납부하였거나 납부할 세액")).toHaveValue("29,200,000");
  await expect(page.locator('input[type="text"][aria-label="연도"]').nth(2)).toHaveValue("2023");

  // 🔑 **당회차 주식수는 그대로 40,000 이다** — 종전에는 70,000 으로 덮어써져
  //    「1주당 취득가액 × 주식수」가 오염됐다.
  await expect(fieldInput(page, "양도 주식수")).toHaveValue("40,000");

  await expect(
    page.getByText("§94①4 다목 요건 충족 — 기타자산(§55① 누진)으로 계산됩니다"),
  ).toBeVisible();

  // 이제 «당회차» 금액을 평소대로 입력한다 — 합산분을 덮어쓰지 않는다
  await page.getByRole("button", { name: /^다음/ }).click();
  await fillStep2(page, { transferTotal: "1500000000", perShareAcq: "15000" });
  await page.getByRole("button", { name: /^다음/ }).click();
  await fillStep3(page, { expenses: "3500000", filingDate: "2026-04-30" });

  await clickResult(page);
  await expectCaseFiftyResult(page);

  // 결과 표에 합산 내역이 펼쳐진다 — 합계 = 기신고분 + 당회차분
  await expect(page.getByText("2,100,000,000").first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "07-1.  기신고분 합산 (영 §158②)" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "07-2.  당회차분" })).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────
// B-7 ~ B-10 — 「같은 칸 공유」가 만들던 세 증상의 회귀 방어
// ─────────────────────────────────────────────────────────────────

/** B-7~B-10 공통 — 당회차 + 기신고 1건 픽스처를 깔고 Step1 요건까지 채운다 */
async function seedCaseFifty(page: Page) {
  await gotoStockTransferTax(page);
  const now = new Date().toISOString();
  await putCalculationRecord(page, {
    id: "e2e-block-prior-1",
    userId: LOCAL_USER_ID,
    taxType: "stock_transfer",
    title: `${CORP} 1차 양도 2023-06-20`,
    inputData: {
      securityName: CORP,
      securityCode: "",
      transferDate: "2023-06-20",
      shareCount: "30000",
    },
    resultData: {
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
  await page.getByRole("radio", { name: "기타자산" }).first().click();
  await fillStep1Basics(page, {
    name: CORP,
    acquisitionDate: "2003-02-17",
    transferDate: "2026-02-26",
    shareCount: "40000",
  });
  await turnOnBlockShareholder(page);
  await fillGateFields(page, { realEstate: "65", ownership: "70" });
}

async function applyPriorOnce(page: Page) {
  await page.getByTestId("block-shareholder-prior-lookup").click();
  await expect(
    page.getByRole("heading", { name: "기신고 이력에서 합산 (영 §158②)" }),
  ).toBeVisible({ timeout: 10_000 });
  const cb = page.getByTestId("prior-transfer-e2e-block-prior-1");
  if (!(await cb.isChecked())) await cb.check();
  await page.getByRole("button", { name: /선택 1건 합산/ }).click();
  await expect(page.getByText(/기신고 1건 반영됨/)).toBeVisible({ timeout: 10_000 });
}

test("B-7: 모달을 두 번 확인해도 값이 변하지 않는다 (재적용 멱등)", async ({ page }) => {
  test.setTimeout(150_000);
  await seedCaseFifty(page);

  await applyPriorOnce(page);
  await expect(page.getByLabel("기신고분 양도가액 합계")).toHaveValue("600,000,000");

  // 🔴 종전에는 여기서 2,700,000,000 이 됐다(누적 합산 — 실측).
  await applyPriorOnce(page);
  await expect(page.getByLabel("기신고분 양도가액 합계")).toHaveValue("600,000,000");
  await expect(page.getByLabel("기신고분 취득가액 합계")).toHaveValue("450,000,000");
  await expect(page.getByLabel("기신고분 필요경비 합계")).toHaveValue("1,500,000");
  await expect(fieldInput(page, "기신고분 주식수 합계")).toHaveValue("30000");
  await expect(fieldInput(page, "소급 3년 누적 양도비율")).toHaveValue("70");
});

test("B-8: 당회차 금액을 나중에 고쳐도 기신고분이 살아 있다", async ({ page }) => {
  test.setTimeout(150_000);
  await seedCaseFifty(page);
  await applyPriorOnce(page);

  // 당회차를 한 번 잘못 넣었다가 고친다 — 사용자가 실제로 하는 행동
  await page.getByRole("button", { name: /^다음/ }).click();
  await fillStep2(page, { transferTotal: "999999999", perShareAcq: "9999" });
  await retypeStep2(page, { transferTotal: "1500000000", perShareAcq: "15000" });
  await page.getByRole("button", { name: /^다음/ }).click();
  await fillStep3(page, { expenses: "3500000", filingDate: "2026-04-30" });

  await clickResult(page);
  await expectCaseFiftyResult(page);
});

test("B-9: 합산 결과를 저장한 이력은 «당회차분»으로 다시 잡힌다 (이중합산 차단)", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await seedCaseFifty(page);
  await applyPriorOnce(page);
  await page.getByRole("button", { name: /^다음/ }).click();
  await fillStep2(page, { transferTotal: "1500000000", perShareAcq: "15000" });
  await page.getByRole("button", { name: /^다음/ }).click();
  await fillStep3(page, { expenses: "3500000", filingDate: "2026-04-30" });
  await clickResult(page);
  await expectCaseFiftyResult(page);

  // 이력이 저장되기를 기다린 뒤 3차 양도를 새로 연다
  await page.waitForTimeout(2_000);
  await gotoStockTransferTax(page);
  await page.getByRole("radio", { name: "기타자산" }).first().click();
  await fillStep1Basics(page, {
    name: CORP,
    acquisitionDate: "2003-02-17",
    transferDate: "2026-06-30",
    shareCount: "10000",
  });
  await turnOnBlockShareholder(page);
  await fillGateFields(page, { realEstate: "65", ownership: "70" });
  await page.getByTestId("block-shareholder-prior-lookup").click();

  /**
   * 🔑 2차 건이 후보로 뜰 때 보이는 양도가액은 **1,500,000,000(당회차분)** 이어야 한다.
   *    종전에는 결과에 총액(2,100,000,000)만 있어 그것이 후보 값이 됐고, 1차분이 **두 번**
   *    들어갔다. 엔진이 `ownTransferPrice` 를 따로 echo 하면서 해소됐다.
   */
  await expect(page.getByText("2,100,000,000")).toHaveCount(0);
  await expect(page.getByText(/양도 1,500,000,000/).first()).toBeVisible({ timeout: 10_000 });
});

test("B-10: 배지는 기신고분 칸에만 반응한다 (당회차 편집에는 남는다)", async ({ page }) => {
  test.setTimeout(150_000);
  await seedCaseFifty(page);
  await applyPriorOnce(page);

  // 당회차 칸을 고쳐도 배지는 «남는다» — 출처가 여전히 이력이기 때문이다
  await page.getByRole("button", { name: /^다음/ }).click();
  await fillStep2(page, { transferTotal: "1500000000", perShareAcq: "15000" });
  await page.getByTestId("step-circle-0").click();
  await expect(page.getByText(/기신고 1건 반영됨/)).toBeVisible();

  // 기신고분 칸을 고치면 «사라진다»
  await page.getByLabel("기신고분 양도가액 합계").fill("700000000");
  await expect(page.getByText(/기신고 1건 반영됨/)).toHaveCount(0);
});

// ─────────────────────────────────────────────────────────────────
// B-5 — 제외 사유를 «구분해서» 말한다
// ─────────────────────────────────────────────────────────────────
//
// 종전 문구는 「3년 창 밖«이거나» 계산 결과가 없어 제외됐습니다」 한 문장이었다.
// 두 사유는 처방이 정반대인데(전자는 합산 대상 자체가 아니고, 후자는 값이 복원되지 않은 것)
// 합쳐 말해서, 실제 제보에서 「결과 미저장」 결함이 「3년 창」 문제로 오인됐다.

test("B-5: 3년 창 밖 이력 → 「소급 3년을 넘어」 문구만 뜬다 (사유를 합치지 않는다)", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await gotoStockTransferTax(page);

  // 이번 양도일(2026-02-26) 기준 소급 3년 **밖**인 이력 — 경계는 2023-02-26이다.
  const now = new Date().toISOString();
  await putCalculationRecord(page, {
    id: "e2e-block-prior-old",
    userId: LOCAL_USER_ID,
    taxType: "stock_transfer",
    title: `${CORP} 구 양도 2022-01-10`,
    inputData: {
      securityName: CORP,
      securityCode: "",
      transferDate: "2022-01-10",
      shareCount: "30000",
    },
    resultData: {
      transferPrice: 600_000_000,
      acquisitionPrice: 450_000_000,
      expenses: 1_500_000,
      calculatedTax: 29_200_000,
      appliedSection94: "①3나_본문",
    },
    taxLawVersion: "2022-01-10",
    linkedCalculationId: null,
    clientId: null,
    createdAt: now,
    updatedAt: now,
  });

  await page.getByRole("radio", { name: "기타자산" }).first().click();
  await fillStep1Basics(page, {
    name: CORP,
    acquisitionDate: "2003-02-17",
    transferDate: "2026-02-26",
    shareCount: "40000",
  });
  await turnOnBlockShareholder(page);

  await page.getByTestId("block-shareholder-prior-lookup").click();
  await expect(
    page.getByRole("heading", { name: "기신고 이력에서 합산 (영 §158②)" }),
  ).toBeVisible({ timeout: 10_000 });

  // 3년 창 사유만 뜬다 — 「계산 결과가 저장돼 있지 않아」는 뜨지 않는다.
  await expect(page.getByText(/양도일이 소급 3년을 넘어/)).toBeVisible();
  await expect(page.getByText(/계산 결과\(양도가액·주식수\)가 저장돼 있지 않아/)).toHaveCount(0);
});

// ─────────────────────────────────────────────────────────────────
// B-6 — 기신고 조문으로 «자동 배제»하지 않는다
// ─────────────────────────────────────────────────────────────────
//
// 종전에는 이미 `①4다`(기타자산)로 신고된 회차의 세액을 영 §168② 「**대주주로서** 납부하였거나
// 납부할 세액」 문언에 닿지 않는다고 보아 **기납부 합산에서 뺐다**. 2026-09-14에 그 자동 배제를
// 걷어냈다 — §94①4 다목 요건 판정 자체가 **사용자 입력 축**이고, 과거 신고 성격을 근거로
// 프로그램이 차감을 깎으면 방향이 **납세자에게 불리**한데 되돌릴 수단이 없다.
// 뺄지 말지는 사용자가 «선택 해제»로 정한다.

test("B-6: `①4다`로 신고된 이력도 기납부세액에 합산된다 (배지는 정보 표시)", async ({ page }) => {
  test.setTimeout(150_000);
  await gotoStockTransferTax(page);

  const now = new Date().toISOString();
  await putCalculationRecord(page, {
    id: "e2e-block-prior-4da",
    userId: LOCAL_USER_ID,
    taxType: "stock_transfer",
    title: `${CORP} 1차 양도 2023-06-20 (기타자산 신고)`,
    inputData: {
      securityName: CORP,
      securityCode: "",
      transferDate: "2023-06-20",
      shareCount: "30000",
    },
    resultData: {
      transferPrice: 600_000_000,
      acquisitionPrice: 450_000_000,
      expenses: 1_500_000,
      calculatedTax: 29_200_000,
      // 🔑 B-4와 **이 한 값만** 다르다 — 그때 이미 기타자산으로 신고한 건이다.
      appliedSection94: "①4다",
    },
    taxLawVersion: "2023-06-20",
    linkedCalculationId: null,
    clientId: null,
    createdAt: now,
    updatedAt: now,
  });

  await page.getByRole("radio", { name: "기타자산" }).first().click();
  await fillStep1Basics(page, {
    name: CORP,
    acquisitionDate: "2003-02-17",
    transferDate: "2026-02-26",
    shareCount: "40000",
  });
  await turnOnBlockShareholder(page);

  await page.getByTestId("block-shareholder-prior-lookup").click();
  await expect(
    page.getByRole("heading", { name: "기신고 이력에서 합산 (영 §158②)" }),
  ).toBeVisible({ timeout: 10_000 });

  // 배지는 뜨되 「제외」가 아니라 «신고된 건»이라는 정보다
  await expect(page.getByText("기타자산(§94①4다)으로 신고된 건")).toBeVisible();

  await page.getByTestId("prior-transfer-e2e-block-prior-4da").check();
  // 합계 미리보기에 기납부가 «그대로» 들어간다
  await expect(page.getByText(/기납부\(영 §168②\) 29,200,000/)).toBeVisible();
  await expect(page.getByText(/그대로 합산/)).toBeVisible();

  await page.getByRole("button", { name: /선택 1건 합산/ }).click();

  // 폼 칸에도 그대로 채워진다 — B-4(①3나)와 같은 값이다
  await expect(page.getByLabel("대주주로서 납부하였거나 납부할 세액")).toHaveValue("29,200,000");
});
