/**
 * E2E: 주식 신고서 양식 표 — **열 폭이 지정대로 지켜지는가**
 *
 * 계획서: docs/00-pm/stock-filing-form-display-and-layout.plan.md §5 · §6 (A-4~A-7)
 *
 * ## 무엇을 증명하는가
 *
 * `StockFilingFormTable.tsx`는 줄곧 `항목 220px / 데이터 130px`을 지정하고 있었지만
 * **한 번도 지켜지지 않았다**. 테이블 폭이 `auto`면 브라우저가 `table-layout: fixed`의
 * 기준 폭을 잡지 못해 내용 기반으로 폴백하고, `<col>`은 강제값이 아니라 힌트로 격하된다.
 *
 * 2026-09-17 실측(3종목 · viewport 1280) — **항목 88px / 합계 355px / 종목 242px / 표 1170px**.
 * 제보 그대로 「항목은 좁아 4~5행으로 접히고 합계는 쓸데없이 넓은」 상태였다.
 *
 * 🔑 **폭만 조이면 터진다.** 합계 열을 355px로 밀어낸 것은 금액이 아니라 설명 문자열
 *   (`예정신고: 반기 말일 + 2개월 / …` max-content 441px)이라, nowrap을 그대로 둔 채
 *   150px로 조이면 셀 밖으로 넘친다. **A-7이 그 실패만 단독으로 잡는다.**
 *
 * 실행: npx playwright test e2e/stock-filing-form-column-width.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";

import { gotoStockTransferTax, fillItemThroughStep3 } from "./_helpers/stock-item-fill";

/** 표 기하 — 열 폭·표 폭·스크롤 컨테이너 폭·셀 넘침을 한 번에 걷는다. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const sec = document.querySelector('[data-print-section="stock-form-table"]')!;
    const table = sec.querySelector("table") as HTMLTableElement;
    const scroller = sec.querySelector(".overflow-x-auto") as HTMLElement;
    const headers = [...table.querySelectorAll("thead th")].map((th) =>
      Math.round(th.getBoundingClientRect().width),
    );
    // 넘침 — nowrap 셀이 자기 열보다 넓으면 scrollWidth 가 clientWidth 를 넘는다.
    const overflowing = [...table.querySelectorAll("tbody td")]
      .filter((td) => td.scrollWidth > td.clientWidth + 1)
      .map((td) => ({
        text: (td.textContent ?? "").trim().slice(0, 40),
        scroll: td.scrollWidth,
        client: td.clientWidth,
      }));
    return {
      itemColPx: headers[0],
      totalColPx: headers[1],
      stockColsPx: headers.slice(2),
      tablePx: Math.round(table.getBoundingClientRect().width),
      scrollerPx: Math.round(scroller.getBoundingClientRect().width),
      overflowing,
    };
  });
}

/** 지정 폭과 ±1px 이내인지 — 렌더 미세차는 허용하고 「압축됨」은 잡는다. */
function expectPx(actual: number, expected: number, label: string) {
  expect(
    Math.abs(actual - expected),
    `${label} ${actual}px (지정 ${expected}px)`,
  ).toBeLessThanOrEqual(1);
}

async function threeItemsToResult(page: Page) {
  await gotoStockTransferTax(page);
  await fillItemThroughStep3(page, "첫째종목", { y: "2024", m: "02", d: "01" });
  await page.getByTestId("stock-item-add").click();
  await fillItemThroughStep3(page, "둘째종목", { y: "2024", m: "09", d: "01" });
  await page.getByTestId("stock-item-add").click();
  await fillItemThroughStep3(page, "셋째종목", { y: "2024", m: "11", d: "01" });
  await page.getByRole("button", { name: "결과 보기" }).click();
  await expect(page.getByText(/다자산 합산 \(3종목\)/)).toBeVisible({ timeout: 60_000 });
}

test.describe("신고서 양식 표 — 열 폭", () => {
  test("CW-1: 항목 열이 넓어지고 합계 열이 좁아진다 · 표가 컨테이너를 넘지 않는다 · 넘치는 셀이 없다", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await threeItemsToResult(page);
    const m = await measure(page);

    // A-4·A-5 — 지정 폭이 **그대로** 나오는가. 종전 실측 항목 88px / 합계 355px / 종목 242px.
    //
    // 🔑 범위 단언(`>= 200` 등)으로는 부족하다 — 실측으로 확인했다. 테이블 폭을 명시하지
    //   않으면 colgroup 은 여전히 강제되지 않고 **컨테이너 폭에 맞춰 비례 압축**되어
    //   220/150/190 대신 **215/148/187** 이 나온다(뮤테이션 M-2). 범위 단언은 그 5px 를
    //   놓쳐 「고쳤다」고 오판하게 만든다. ±1px 만 허용한다.
    expectPx(m.itemColPx, 220, "항목 열");
    expectPx(m.totalColPx, 150, "합계 열");
    for (const px of m.stockColsPx) expectPx(px, 190, "종목 열");

    // A-6 — 표 폭: 종전 1170px 로 컨테이너(924px)를 246px 넘겼다.
    expect(
      m.tablePx,
      `표 ${m.tablePx}px vs 컨테이너 ${m.scrollerPx}px`,
    ).toBeLessThanOrEqual(m.scrollerPx + 40);

    // A-7 — 폭을 조인 대가로 셀이 넘치면 안 된다. (c) 줄바꿈 정책의 안전망.
    expect(m.overflowing, JSON.stringify(m.overflowing)).toEqual([]);
  });

  /**
   * CW-3 — **좁은 창에서도 지정이 지켜진다.**
   *
   * 테이블 폭을 명시하지 않으면 컨테이너에 맞춰 압축되므로, 창이 좁을수록 지정에서 멀어진다.
   * 여기서는 가로 스크롤이 생기는 것이 **정상**이다 — 열이 찌그러지는 것보다 낫다.
   */
  test("CW-3: 좁은 뷰포트(800px)에서도 열 폭이 지정대로 유지된다", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 800, height: 900 });
    await threeItemsToResult(page);
    const m = await measure(page);

    expectPx(m.itemColPx, 220, "항목 열(좁은 창)");
    expectPx(m.totalColPx, 150, "합계 열(좁은 창)");
    for (const px of m.stockColsPx) expectPx(px, 190, "종목 열(좁은 창)");
    expect(m.overflowing, JSON.stringify(m.overflowing)).toEqual([]);
  });

  /**
   * V-4 — 인쇄 경로. `print:static`이 sticky 항목 열을 풀어 폭 계산이 흔들릴 수 있다.
   *
   * 🔑 **출력 항목을 먼저 선택해야 한다.** 결과뷰는 섹션을 `PrintSection`으로 감싸고
   *   미선택 섹션에 `print:hidden`을 건다(기본값은 **전체 미선택**). 선택 없이
   *   `emulateMedia({media:"print"})`만 하면 표가 `display:none`이라 폭이 **0**으로 잡힌다
   *   — 제품 정상 동작이지 결함이 아니다(이 spec 최초 작성 시 실제로 오판했다).
   */
  test("CW-2 (V-4): 인쇄 미디어에서도 열 폭이 유지된다", async ({ page }) => {
    test.setTimeout(300_000);
    await threeItemsToResult(page);
    await page.getByRole("button", { name: "전체 선택" }).click();
    await page.emulateMedia({ media: "print" });
    const m = await measure(page);

    // 가드 — 선택이 실제로 먹어 표가 인쇄 대상이다(폭 0이면 위 선택이 빠진 것이다).
    expect(m.tablePx, "인쇄 미디어에서 표가 숨겨졌다").toBeGreaterThan(0);

    // print: 는 sticky 를 static 으로 바꾼다(`print:static`) — 폭 계산이 흔들리지 않는지 본다.
    expect(m.itemColPx, `항목 열(print) ${m.itemColPx}px`).toBeGreaterThanOrEqual(200);
    expect(m.totalColPx, `합계 열(print) ${m.totalColPx}px`).toBeLessThanOrEqual(170);
    expect(m.overflowing, JSON.stringify(m.overflowing)).toEqual([]);
  });
});
