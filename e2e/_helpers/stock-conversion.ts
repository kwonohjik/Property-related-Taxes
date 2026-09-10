/**
 * 상장 환산취득가 — 산정 방식 조작 헬퍼 (S0 셀렉터 방탄화)
 *
 * 계획서 `docs/00-pm/stock-listed-conversion-unification.plan.md` **S0**.
 *
 * ## 왜 헬퍼인가 — testid로는 못 막았다
 *
 * S3이 세 ToggleCard(취득 후 상장 · 양도일 거래정지 · 취득일 거래정지)를
 * **라디오 선택지 하나로 흡수**했다(Q-2 3안). 라벨이 바뀐 게 아니라 **엘리먼트가 사라졌다** —
 * `data-testid`를 붙여 뒀어도 소용없었을 변화다.
 *
 * 실제로 통한 것은 **호출 지점을 모으는 것**이었다. 같은 조작이
 * `[data-slot="toggle-card"] → filter({hasText}) → getByRole("switch")` 형태로
 * **13개 지점에 복제**돼 있었고(V-4 실측), S3에서 **이 파일 하나만** 고쳐 끝났다.
 * 호출부 13곳은 **한 줄도 바뀌지 않았다.**
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
 * 라디오 선택지 라벨 — `AcquisitionStdModeRadio.tsx`의 `options[].label`과 일치해야 한다.
 * 🔑 정규식인 이유는 라벨에 조문·설명이 붙기 때문이다(부분 매칭).
 */
const MODE_LABEL: Record<ToggleMode, RegExp> = {
  post_listing: /취득 후 상장/,
  halt_transfer: /양도일 거래정지/,
  halt_acquisition: /취득일 거래정지/,
};

/** 산정 방식 라디오에서 한 선택지를 고른다. */
async function pickMode(page: Page, mode: ToggleMode): Promise<void> {
  await page.getByRole("radio", { name: MODE_LABEL[mode] }).first().click();
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
  if (mode === "monthly_avg") {
    // 기본값이지만 «명시적으로» 고른다 — 다른 방식에서 되돌아오는 플로우가 있다.
    await page.getByRole("radio", { name: /취득일 이전 1개월 종가평균/ }).first().click();
    return;
  }
  await pickMode(page, mode);
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
  // S3 이후 두 방식은 같다 — 축이 라디오 하나라 「이중토글」 문제 자체가 없다.
  await pickMode(page, mode);
}

/** 제목 문자열 자체가 필요한 «단언»용 — 동작이 아니라 표시를 확인하는 spec이 쓴다. */
export function conversionToggleTitle(mode: ToggleMode): string {
  return {
    post_listing: "취득 후 상장 → 상장일 이후 1개월 종가평균 환산",
    halt_transfer: "양도일 거래정지·관리종목 → 양·취 모두 보충 평가",
    halt_acquisition: "취득일 거래정지·관리종목 → 보충 평가",
  }[mode];
}

/**
 * 분모의 «입력 방식»(직접/일자별)을 고른다.
 *
 * 🔑 S3의 핵심 이득이 이 함수로 표현된다 — 종전에는 이 축의 라디오가 「취득 후 상장」
 * 카드 **안**에만 있어, 다른 방식에서 `daily`가 남으면 **되돌릴 UI가 없었다**(F-10 dead-end).
 * 분모 블록이 4갈래 위에 항상 있으므로 어느 방식에서도 되돌릴 수 있다.
 */
export async function setTransferStdInputMode(
  page: Page,
  mode: "direct" | "daily",
): Promise<void> {
  await page
    .locator(`label:has(input[name="transferStdInputMode"][value="${mode}"])`)
    .first()
    .click();
}

/**
 * 분모(양도 당시 기준시가)를 채운다.
 *
 * S3에서 이 칸의 라벨이 「양도시 1주당 기준시가 (양도일 이전 1개월 종가평균)」에서
 * 「1개월 종가 평균」으로 바뀌었다 — 섹션 제목이 그 말을 이미 하기 때문이다.
 * ⇒ **라벨을 spec에 흩뿌리지 않는다.** placeholder는 S3 전후로 같아 축이 안정적이다.
 */
export async function fillTransferStdPrice(page: Page, value: string): Promise<void> {
  await transferStdPriceInput(page).fill(value);
}

/** 분모 입력 칸 — 값 단언이 필요한 spec용 */
export function transferStdPriceInput(page: Page) {
  return page.getByPlaceholder("양도일 이전 1개월 종가평균 (1주당)");
}

/**
 * 「취득 후 상장」을 끈다 — 켠 뒤 되돌리는 플로우(F-10 dead-end 회귀 spec) 전용.
 *
 * 켜기와 끄기가 같은 조작이라 별도 함수로 두는 이유는 **읽는 쪽의 의도**다
 * (`setStockConversionMode(page, "post_listing")`를 두 번 부르면 토글인지 재설정인지 모른다).
 */
export async function togglePostListingOff(page: Page): Promise<void> {
  await setStockConversionMode(page, "monthly_avg");
}

/**
 * 「취득 후 상장」 카드 자체 — 카드 «안»을 스코프해야 하는 곳에서 쓴다
 * (예: 카드 안의 유일한 DateInput = 상장일).
 */
export function postListingCard(page: Page) {
  return page.locator("div.rounded-lg").filter({ hasText: "취득 후 상장 — 환산취득가" }).first();
}
