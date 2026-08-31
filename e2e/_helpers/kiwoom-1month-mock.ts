/**
 * 키움 1개월 종가 자동조회 E2E의 **외부 비의존화**.
 *
 * ## 왜 필요한가
 *
 * `.github/workflows/` 전체에 `KIWOOM` 언급이 **0건**이다(V-5 실측).
 * 키가 없으면 `lib/kiwoom/auth.ts:45-49`가 throw → route가 503을 돌려주고
 * 버튼은 「키움 API 미설정」을 띄운다. 즉 **CI에서는 실호출 경로가 성립하지 않는다**.
 *
 * 외부 API 의존 E2E를 `page.route`로 mock 하는 것은 이 저장소의 확립된 패턴이다
 * (법제처 `e2e/_helpers/law-api-mock.ts` · 건축물대장 등 14 spec).
 *
 * ## fixture는 «실측 응답»이다 — 손으로 만들지 말 것
 *
 * 아래 값은 2026-08-31 `KIWOOM_ENV=prod` 실호출로 받은 것이다:
 *
 * | 기준일 | anchor | 슬롯 | 거래일 | 평균 |
 * |---|---|---|---|---|
 * | 2025-06-10 | 2025-06-10 (미이동) | 2025-05-11 ~ 2025-06-10 | 20 | 56,590 |
 * | 2015-02-19 (설날) | **2015-02-17** | 2015-01-18 ~ 2015-02-17 | 22 | **1,371,500** |
 *
 * ⚠️ 이상적인 JSON을 지어 넣으면 **회귀 테스트가 조용히 무의미해진다**
 *    (법제처 mock에서 이미 배운 것 — `law-api-mock.ts` 참조).
 *    포맷이 바뀌면 실 API로 다시 받아 이 파일을 갱신할 것.
 */

import type { Page } from "@playwright/test";

/** 2025-06-10 응답 — fixture 범위 «안»이라 anchor 보정이 일어나지 않는다 */
export const FIXTURE_2025_06_10 = {
  stockCode: "005930",
  stockName: "삼성전자",
  marketType: "KOSPI",
  transferDate: "2025-06-10",
  anchorDate: "2025-06-10",
  anchorShifted: false,
  marketCalendarUnavailable: false,
  stockSpecificGapAtAnchor: false,
  slotDates: [
    "2025-05-11", "2025-05-12", "2025-05-13", "2025-05-14", "2025-05-15",
    "2025-05-16", "2025-05-17", "2025-05-18", "2025-05-19", "2025-05-20",
    "2025-05-21", "2025-05-22", "2025-05-23", "2025-05-24", "2025-05-25",
    "2025-05-26", "2025-05-27", "2025-05-28", "2025-05-29", "2025-05-30",
    "2025-05-31", "2025-06-01", "2025-06-02", "2025-06-03", "2025-06-04",
    "2025-06-05", "2025-06-06", "2025-06-07", "2025-06-08", "2025-06-09",
    "2025-06-10",
  ],
  closingPrices: [
    null, 57600, 56900, 57400, 57300,
    56800, null, null, 55800, 55900,
    55700, 54700, 54200, null, null,
    54700, 53900, 55900, 56100, 56200,
    null, null, 56800, null, 57800,
    59100, null, null, null, 59800,
    59200,
  ],
  weekendLabels: [
    "일요일 · 거래일 제외", "", "", "", "",
    "", "토요일 · 거래일 제외", "일요일 · 거래일 제외", "", "",
    "", "", "", "토요일 · 거래일 제외", "일요일 · 거래일 제외",
    "", "", "", "", "",
    "토요일 · 거래일 제외", "일요일 · 거래일 제외", "", "휴장일 · 거래일 제외", "",
    "", "토요일 · 거래일 제외", "일요일 · 거래일 제외", "휴장일 · 거래일 제외", "",
    "",
  ],
  tradingDays: 20,
  sum: 1_131_800,
  average: 56_590,
  tradingHalt: false,
  adminIssue: false,
  cached: false,
};

/**
 * 2015-02-19(설날) 응답 — 휴장일 fixture **밖**이라 참조 종목 달력으로 anchor를 보정한 결과.
 * 슬롯이 [2015-01-18 ~ 2015-02-17]로 «옮겨져» 있는 것이 이 fixture의 존재 이유다.
 */
export const FIXTURE_2015_02_19_SHIFTED = {
  stockCode: "005930",
  stockName: "삼성전자",
  marketType: "KOSPI",
  transferDate: "2015-02-19",
  anchorDate: "2015-02-17",
  anchorShifted: true,
  marketCalendarUnavailable: false,
  stockSpecificGapAtAnchor: false,
  slotDates: ["2015-01-19", "2015-02-16", "2015-02-17"],
  closingPrices: [1_350_000, 1_371_500, 1_372_000],
  weekendLabels: ["", "", ""],
  tradingDays: 22,
  sum: 4_093_500,
  average: 1_371_500,
  tradingHalt: false,
  adminIssue: false,
  cached: false,
};

type Fixture = typeof FIXTURE_2025_06_10 | typeof FIXTURE_2015_02_19_SHIFTED;

/**
 * `/api/kiwoom/transfer-1month`을 요청 본문의 기준일로 갈라 mock 한다.
 * 등록되지 않은 기준일은 **404**로 돌려준다 — 조용히 아무 값이나 주지 않는다.
 */
export async function mockKiwoom1Month(
  page: Page,
  fixtures: Fixture[] = [FIXTURE_2025_06_10, FIXTURE_2015_02_19_SHIFTED],
) {
  await page.route("**/api/kiwoom/transfer-1month", async (route) => {
    const body = route.request().postDataJSON() as {
      transferDate?: string;
      baseDate?: string;
    };
    const asked = body?.baseDate ?? body?.transferDate;
    const hit = fixtures.find((f) => f.transferDate === asked);
    if (!hit) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          error: "stock_not_found",
          message: `fixture 없음 (기준일: ${asked}) — e2e/_helpers/kiwoom-1month-mock.ts 에 추가하세요`,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(hit),
    });
  });
}

/** 키움 미설정(503) 상황 — 「관리자에게 환경변수 등록 요청」 안내를 확인할 때 */
export async function mockKiwoom1MonthUnconfigured(page: Page) {
  await page.route("**/api/kiwoom/transfer-1month", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "kiwoom_unconfigured" }),
    });
  });
}
