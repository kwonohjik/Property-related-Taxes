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
 *
 * 2026-06-10 자산 카드 테이블+모달 전환 이후: 자산 추가 시 편집 모달이 자동 오픈(E-1)되며
 * 면적·공시지가 입력은 모달 안에 위치. 입력 후 모달을 닫아야 다음 단계(다음 버튼) 클릭이
 * 오버레이에 막히지 않는다.
 */
export async function addLandAsset(
  page: Page,
  opts: {
    area: string;
    unitPrice: string;
    addButtonName?: RegExp;
    /** 입력 후 편집 모달을 닫지 않음 (모달 안 칩·고급옵션을 추가로 조작하는 spec용) */
    keepModalOpen?: boolean;
  },
): Promise<void> {
  const addButtonName = opts.addButtonName ?? /상속재산 추가/;
  await page.getByRole("button", { name: addButtonName }).click();
  await page.getByRole("button", { name: /토지/ }).first().click();
  // 추가 직후 편집 모달 자동 오픈 — 면적·단가 입력은 모달 안
  await expect(page.getByTestId("estate-edit-dialog")).toBeVisible();
  // 보충적 평가(개별공시지가) 토글 ON — 면적·단가 입력 펼침 (2026-06-09 토글 전환)
  await page.getByRole("switch", { name: /보충적 평가방법/ }).click();
  const areaInput = page.getByPlaceholder("면적 입력");
  const priceInput = page.getByPlaceholder("공시지가 단가");
  await fillAndVerify(areaInput, opts.area);
  await fillAndVerify(priceInput, opts.unitPrice);
  if (!opts.keepModalOpen) {
    // 편집 모달 닫기 → 요약 테이블로 복귀 (다음 단계 클릭 가능)
    await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
    await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();
  }
}

/**
 * 상속인 추가 헬퍼 — 2단계 picker(2026-06-10 테이블 뷰 개편 이후).
 *
 * 이전 UI: "상속인 추가" → 관계 바로 클릭 (1단계 RelationPickerGrid)
 * 현재 UI: "상속인 추가" → 1단계 종류 선택 → (상속인 종류만) 2단계 관계 선택
 *
 * @param kind AddKind — 추가할 종류 (heir|legatee|substitute|corporate|other)
 * @param relation heir 종류 선택 시 2단계 관계 (spouse|child|lineal_ascendant|sibling)
 *
 * 사용 예:
 *   await addHeir(page, "heir", "child");    // 자녀 추가
 *   await addHeir(page, "heir", "spouse");   // 배우자 추가
 *   await addHeir(page, "legatee");          // 수유자 추가 (2단계 없음)
 *   await addHeir(page, "corporate");        // 법인 추가
 *   await addHeir(page, "substitute");       // 대습상속인 추가
 *   await addHeir(page, "other");            // 기타 추가
 */
export async function addHeir(
  page: Page,
  kind: "heir" | "legatee" | "substitute" | "corporate" | "other",
  relation?: "spouse" | "child" | "lineal_ascendant" | "sibling",
  opts: {
    /** 주민번호(생년월일·성별 의존 케이스). 기본 700101-1000000. corporate는 무시. */
    residentNumber?: string;
    /**
     * true면 모달을 닫지 않음 — 모달 안에서 상속인 속성(법인 영리 여부·대습 패널·장애인·
     * 동거 등)을 추가 편집하는 spec용. 편집 후 closeHeirEditModal(page)로 직접 닫는다.
     */
    keepModalOpen?: boolean;
  } = {},
): Promise<void> {
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  // KindButton / RelationButton 은 span이 분리되어 있어 filter로 찾음
  const kindLabels: Record<string, string> = {
    heir: "상속인",
    legatee: "수유자",
    substitute: "대습상속인",
    corporate: "법인",
    other: "기타",
  };
  await page.locator("button").filter({ hasText: kindLabels[kind] }).first().click();
  if (kind === "heir" && relation) {
    const relationLabels: Record<string, string> = {
      spouse: "배우자",
      child: "자녀",
      lineal_ascendant: "직계존속 (부모·조부모)",
      sibling: "형제자매",
    };
    // 2단계 관계 선택 — 정확한 텍스트로 first() 클릭
    await page.locator("button").filter({ hasText: relationLabels[relation] }).first().click();
  }
  // 추가 직후 상속인 편집 모달이 자동 오픈(E-1, PR #68)됨.
  //  · 자연인(법인 제외): 모달 안에서 주민번호 입력(상속세 calc 필수, inheritance-validate §RRN).
  //  · keepModalOpen 아니면 입력 후 모달 닫기 — 안 닫으면 오버레이가 다음/추가 클릭을 막음.
  const heirDialog = page.getByRole("dialog", { name: "상속인 편집" });
  if (await heirDialog.isVisible().catch(() => false)) {
    if (kind !== "corporate") {
      const rrnInput = heirDialog.getByPlaceholder("앞 6자리-뒤 7자리");
      if (await rrnInput.isVisible().catch(() => false)) {
        await rrnInput.fill(opts.residentNumber ?? "700101-1000000");
      }
    }
    if (!opts.keepModalOpen) {
      await heirDialog.getByRole("button", { name: "닫기" }).click();
      await expect(heirDialog).toBeHidden();
    }
  }
}

/**
 * 상속인 편집 모달 닫기 — addHeir는 이미 모달을 닫지만, 모달 안에서 추가 입력 후 직접 닫아야
 * 하는 경우(피상속인+상속인 RRN 분리 입력 등)에 명시 호출. 모달이 없으면 no-op.
 */
export async function closeHeirEditModal(page: Page): Promise<void> {
  const heirDialog = page.getByRole("dialog", { name: "상속인 편집" });
  if (await heirDialog.isVisible().catch(() => false)) {
    await heirDialog.getByRole("button", { name: "닫기" }).click();
    await expect(heirDialog).toBeHidden();
  }
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
    (taxType === "gift" ? "증여세 결정세액" : "상속세 과세 요약");
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

/**
 * 사전증여 편집 모달 닫기 (PriorGiftInput 테이블+모달 전환, 2026-06-13).
 *
 * 사전증여 추가/행 클릭 시 GiftRowEditor가 Dialog 모달로 열린다.
 * 모달이 열린 채 "다음"/"계산하기"를 누르면 backdrop이 클릭을 가로채므로,
 * 단계 이동·계산 전 반드시 호출. 모달이 닫혀 있으면 no-op.
 * onUpdate 실시간 반영이라 닫아도 입력값은 유지된다.
 */
export async function closePriorGiftModal(page: Page) {
  const dialog = page.getByTestId("prior-gift-edit-dialog");
  if (await dialog.isVisible().catch(() => false)) {
    await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
    await expect(dialog).toHaveCount(0);
  }
}
