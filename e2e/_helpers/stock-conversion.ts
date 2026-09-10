/**
 * 상장 환산취득가 — 산정 방식 조작 헬퍼 (S0 셀렉터 방탄화)
 *
 * 계획서 `docs/00-pm/stock-listed-conversion-unification.plan.md` **S0**.
 *
 * ## 왜 헬퍼인가 — testid로는 못 막는다
 *
 * S3은 세 ToggleCard(취득 후 상장 · 양도일 거래정지 · 취득일 거래정지)를
 * **라디오 선택지 하나로 흡수**한다(Q-2 3안). 즉 라벨이 바뀌는 게 아니라 **엘리먼트가 사라진다** —
 * 그 자리에 `data-testid`를 붙여 둬도 소용이 없다.
 *
 * 실제로 막을 수 있는 것은 **호출 지점의 수**다. 같은 조작이
 * `[data-slot="toggle-card"] → filter({hasText}) → getByRole("switch")` 형태로
 * **13개 지점에 복제**돼 있었다(V-4 실측). 헬퍼로 모으면 S3이 **이 파일 하나**만 고친다.
 *
 * ## 규칙 — «동작»만 모으고 «단언»은 각 spec에 남긴다
 *
 * 「취득시 1주당 기준시가가 보인다」 같은 단언은 **S3이 실제로 바꾸는 대상**이라
 * 헬퍼로 감추면 그 spec이 무엇을 지키는지 읽을 수 없게 된다. 여기 모으는 것은
 * 화면을 그 상태로 **만드는 동작**뿐이다.
 */

import type { Page } from "@playwright/test";

/**
 * 상장 환산의 «분자 산정 방식».
 *
 * 지금은 boolean 토글 3개로 표현되고, S3에서 `acquisitionStdMode` enum 라디오 하나가 된다.
 * 이름은 **그 enum 값**을 미리 쓴다 — S3에서 구현만 바꾸면 호출부는 그대로다.
 */
export type StockConversionMode =
  /** 취득일 이전 1개월 종가평균 (일반) — 토글을 하나도 켜지 않은 상태 */
  | "monthly_avg"
  /** 취득일 거래정지 → 취득측만 §165④ 보충 평가 */
  | "halt_acquisition"
  /** 취득 후 상장 → §165⑤ 환산 */
  | "post_listing"
  /** 양도일 거래정지 → 양·취 모두 보충 평가 (분모까지 대체) */
  | "halt_transfer";

type ToggleMode = Exclude<StockConversionMode, "monthly_avg">;

/**
 * ToggleCard 스코프용 **부분 문자열** — `filter({ hasText })`가 자손 텍스트로 매칭한다.
 * 조문 표기(§165⑤ 등)를 빼 두어 문구가 다듬어져도 덜 깨진다.
 */
const TOGGLE_MATCH: Record<ToggleMode, string> = {
  post_listing: "취득 후 상장",
  halt_transfer: "양도일 거래정지·관리종목 지정",
  halt_acquisition: "취득일 거래정지·관리종목 지정",
};

/**
 * **정확 일치** 제목 — `getByText(..., { exact: true })` 변형이 쓴다.
 * 실측(2026-09-10): `Step2.tsx:373·386` · `PostListingValuationCard.tsx:136`.
 */
const TOGGLE_FULL_TITLE: Record<ToggleMode, string> = {
  post_listing: "취득 후 상장 — 환산취득가 (소령 §165⑤)",
  halt_transfer: "양도일 거래정지·관리종목 지정 (소령 §165③)",
  halt_acquisition: "취득일 거래정지·관리종목 지정 (소령 §165③)",
};

/**
 * ToggleCard 안의 스위치를 켠다.
 *
 * ⚠️ `.first()`가 필요하다 — `filter({hasText})`는 **자손 텍스트**로 매칭하므로
 *    바깥 카드까지 함께 걸릴 수 있다.
 */
async function clickToggle(page: Page, title: string): Promise<void> {
  await page
    .locator('[data-slot="toggle-card"]')
    .filter({ hasText: title })
    .getByRole("switch")
    .first()
    .click();
}

/**
 * 산정 방식을 지정한 상태로 만든다 (Step2의 「환산취득가」 선택 이후에 부른다).
 *
 * `"monthly_avg"`는 **기본 상태**라 아무것도 켜지 않는다 — 호출해도 no-op이지만,
 * spec이 「일반 경로를 의도했다」는 것을 코드로 남기려면 명시적으로 부르는 편이 낫다.
 */
export async function setStockConversionMode(
  page: Page,
  mode: StockConversionMode,
): Promise<void> {
  if (mode === "monthly_avg") return;
  await clickToggle(page, TOGGLE_MATCH[mode]);
}

/**
 * 제목 텍스트를 클릭해 토글한다 — **switch role 이중토글을 회피**하는 변형.
 *
 * 일부 spec이 `getByRole("switch").click()` 대신 이 방식을 쓴다
 * (`stock-transfer-trading-halt.spec.ts` 주석: 「switch role 이중토글 회피」).
 * 두 방식이 왜 갈리는지는 그 spec들이 초록인 이상 파고들지 않는다 —
 * **여기 두 방식을 모두 두어 S3이 이 파일 하나만 고치게** 하는 것이 목적이다.
 */
export async function setStockConversionModeByTitle(
  page: Page,
  mode: ToggleMode,
): Promise<void> {
  await page.getByText(TOGGLE_FULL_TITLE[mode], { exact: true }).click();
}

/** 제목 문자열 자체가 필요한 «단언»용 — 동작이 아니라 표시를 확인하는 spec이 쓴다. */
export function conversionToggleTitle(mode: ToggleMode): string {
  return TOGGLE_FULL_TITLE[mode];
}

/**
 * 「취득 후 상장」을 끈다 — 켠 뒤 되돌리는 플로우(F-10 dead-end 회귀 spec) 전용.
 *
 * 켜기와 끄기가 같은 조작이라 별도 함수로 두는 이유는 **읽는 쪽의 의도**다
 * (`setStockConversionMode(page, "post_listing")`를 두 번 부르면 토글인지 재설정인지 모른다).
 */
export async function togglePostListingOff(page: Page): Promise<void> {
  await clickToggle(page, TOGGLE_MATCH.post_listing);
}

/**
 * 「취득 후 상장」 카드 자체 — 카드 «안»을 스코프해야 하는 곳에서 쓴다
 * (예: 카드 안의 유일한 DateInput = 상장일).
 */
export function postListingCard(page: Page) {
  return page
    .locator('[data-slot="toggle-card"]')
    .filter({ hasText: TOGGLE_MATCH.post_listing })
    .first();
}
