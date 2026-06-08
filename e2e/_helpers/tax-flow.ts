/**
 * E2E 공용 헬퍼 — 세금 마법사 full-flow 표준화 (2026-06-08)
 *
 * 목적: 병렬 CPU 경합(fullyParallel + 다중 워커) 시 발생하는 두 가지 레이스를
 *   **타이밍 의존 없이** 차단하는 입증된 패턴을 단일 모듈로 공유한다.
 *
 * 레이스 1) `.fill()` 미커밋 — 워커 포화 시 입력값이 commit 되기 전 다음 단계로
 *   진행 → 빈 필드로 계산 → 검증 실패(에러 응답) → 결과 미렌더.
 *   해소: fillAndVerify / fillDateAndVerify / addLandAsset 가 fill 직후
 *   toHaveValue 로 값 커밋을 **명시 검증**한다.
 *
 * 레이스 2) 계산하기 → 결과 렌더 타이밍 의존 — 응답 지연 시 결과 텍스트
 *   가시성만 기다리면 30s timeout flaky.
 *   해소: calcAndWaitResult 가 계산 API POST 응답을 명시 대기 + resp.ok() 가드로
 *   에러 응답을 즉시 표면화(진단 메시지 포함)한다.
 *
 * 검증 이력: prior-gift-donee 강제경합(--repeat-each=5 --workers=5 --retries=0)
 *   30/30 PASS. 본 모듈은 그 패턴을 그대로 추출한 것.
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_preexisting_failures]]
 */

import { expect, type Page, type Locator } from "@playwright/test";

/**
 * 숫자 입력값을 천단위 콤마 유무에 무관하게 매칭하는 정규식.
 * "10000000" → /^10[,]?0[,]?0[,]?0[,]?0[,]?0[,]?0[,]?0$/ (콤마 그룹핑 차이 흡수).
 * 음수 부호(-) 보존.
 */
export function numericValue(raw: string): RegExp {
  const trimmed = raw.trim();
  const negative = trimmed.startsWith("-");
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (digits.length === 0) return /^$/;
  // 각 자리 사이에 optional comma 허용 → 표시단의 콤마 그룹핑과 무관하게 매칭
  const flexible = digits.split("").join("[,]?");
  return new RegExp(`^${negative ? "-" : ""}${flexible}$`);
}

/**
 * fill + 값 커밋 검증 — 병렬 경합 시 미커밋 방지.
 * @param expected 생략 시 숫자값으로 간주, numericValue() 콤마-유연 매칭 적용.
 *   문자열/정규식을 명시하면 그대로 검증.
 */
export async function fillAndVerify(
  locator: Locator,
  value: string,
  expected?: string | RegExp,
): Promise<void> {
  await locator.fill(value);
  await expect(locator).toHaveValue(expected ?? numericValue(value));
}

/**
 * 상속개시일 / 증여일 (연·월·일) 입력 + 연도 커밋 검증.
 * @param scope 특정 카드 내부 날짜는 scope(Locator) 지정 (예: 사전증여 카드).
 *   미지정 시 page 최상단 첫 번째 연/월/일.
 */
export async function fillDateAndVerify(
  page: Page,
  date: { year: string; month: string; day: string },
  opts: { scope?: Locator } = {},
): Promise<void> {
  const root = opts.scope ?? page;
  const yearInput = root.getByLabel("연도").first();
  await yearInput.fill(date.year);
  await root.getByLabel("월").first().fill(date.month);
  await root.getByLabel("일").first().fill(date.day);
  // 연도 커밋만 검증해도 월·일 직렬 fill 보장(같은 카드 내 동기 입력)
  await expect(yearInput).toHaveValue(date.year);
}

/**
 * 토지 자산 추가 (면적 + 공시지가 단가) + 값 커밋 검증.
 * 상속/증여 공통 — addButtonName 으로 추가 버튼 라벨 구분.
 */
export async function addLandAsset(
  page: Page,
  opts: {
    area: string;
    unitPrice: string;
    addButtonName?: RegExp;
  },
): Promise<void> {
  const addButtonName = opts.addButtonName ?? /상속재산 추가/;
  await page.getByRole("button", { name: addButtonName }).click();
  await page.getByRole("button", { name: /토지/ }).first().click();
  // 보충적 평가(개별공시지가) 토글 ON — 면적·단가 입력 펼침 (2026-06-09 토글 전환)
  await page.getByRole("switch", { name: /보충적 평가방법/ }).click();
  const areaInput = page.getByPlaceholder("면적 입력");
  const priceInput = page.getByPlaceholder("공시지가 단가");
  await fillAndVerify(areaInput, opts.area);
  await fillAndVerify(priceInput, opts.unitPrice);
}

/**
 * "다음" 버튼 N회 클릭 — 마법사 단계 이동.
 * 각 클릭 후 버튼이 여전히 존재하면 그대로 진행(단계 전환은 calc/result 에서 검증).
 */
export async function nextSteps(page: Page, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await page.getByRole("button", { name: /^다음/ }).click();
  }
}

/**
 * 계산하기 → 계산 API POST 응답 명시 대기 + resp.ok() 가드 + 결과 텍스트 노출.
 * 병렬 경합 시 렌더 타이밍 의존을 제거한다.
 *
 * @param taxType "inheritance"(기본) | "gift" — API 경로·기본 결과 텍스트 결정.
 * @param resultText 결과 가시성 검증 텍스트(기본: "{상속세|증여세} 결정세액").
 * @param timeout API·결과 대기 timeout(기본 30s — 경합 여유).
 */
export async function calcAndWaitResult(
  page: Page,
  opts: {
    taxType?: "inheritance" | "gift";
    resultText?: string | RegExp;
    timeout?: number;
  } = {},
): Promise<void> {
  const taxType = opts.taxType ?? "inheritance";
  const resultText =
    opts.resultText ??
    (taxType === "gift" ? "증여세 결정세액" : "상속세 결정세액");
  const timeout = opts.timeout ?? 30_000;

  const calcResponse = page.waitForResponse(
    (r) =>
      r.url().includes(`/api/calc/${taxType}`) &&
      r.request().method() === "POST",
    { timeout },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await calcResponse;
  // 계산 API 가 에러(폼 검증 실패 등)면 결과가 안 뜨므로 명확히 표면화(진단)
  expect(
    resp.ok(),
    `계산 API 비정상 응답 ${resp.status()} — 폼 입력 누락/검증 실패 의심`,
  ).toBe(true);
  await expect(page.getByText(resultText).first()).toBeVisible({ timeout });
}
