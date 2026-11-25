/**
 * 재산세 토지(별도합산·종합합산) E2E 공용 헬퍼 — `property-land-split.spec.ts` · `property-separate-demolished-requirements.spec.ts`.
 * 과세기준일은 화면이 항상 올해 6.1.이라 철거일은 `YEAR` 기준 상대 날짜로 만든다.
 */
import { expect, type Page, type Request } from "@playwright/test";

export const YEAR = new Date().getFullYear();

export function amountInput(page: Page, labelText: string | RegExp) {
  return page.locator("div").filter({ hasText: labelText }).locator('input[inputmode="numeric"]').last();
}

/** CurrencyInput은 Tab blur로 확정한다 — 값 커밋 후 단언. */
export async function fillAmount(page: Page, locator: ReturnType<typeof amountInput>, value: string) {
  await locator.fill(value);
  await locator.press("Tab");
}

export async function startLand(page: Page, priceWon: string) {
  await page.goto("/calc/property-tax");
  await page.getByRole("radio", { name: "토지" }).check();
  await fillAmount(page, amountInput(page, /^공시가격/), priceWon);
  await page.getByRole("button", { name: /^다음$/ }).click();
}

export async function pickLandType(page: Page, name: RegExp) {
  await page.getByRole("radio", { name }).check();
  await page.getByRole("button", { name: /^다음$/ }).click();
}

/** 철거일(DateInput 연·월·일 칸) — 「일」은 substring 매칭이라 라디오 라벨까지 잡힌다 — exact (e2e/CLAUDE.md §1) */
export async function fillDemolishedDate(page: Page, iso: string) {
  const [y, m, d] = iso.split("-");
  await page.getByLabel("연도", { exact: true }).fill(y);
  await page.getByLabel("월", { exact: true }).fill(String(Number(m)));
  await page.getByLabel("일", { exact: true }).fill(String(Number(d)));
  await expect(page.getByLabel("연도", { exact: true })).toHaveValue(y);
}

export type Answer = "yes" | "no" | "unknown";

export interface DemolishedFill {
  /** YYYY-MM-DD */
  date: string;
  kind?: "house" | "building";
  permit?: Answer;
  otherUse?: Answer;
  vacantHouse?: Answer;
  publicUse?: Answer;
  paid?: Answer;
}

/**
 * 철거 토글 → 철거일 → (종류·사실 칸). 사실 칸은 **엄격 순차 노출**(PSA-S1)이라 앞 답에 따라 그려지는 칸·자리가 달라진다 —
 * 헬퍼는 사슬을 판단하지 않고, 정해진 시도 순서대로 «그려져 있으면 누르고 없으면 건너뛴다».
 * 시도 순서: 빈집정비(관문 자리 — 철거일이 일반 한시 기간 밖·빈집 기간 안인 주택) → 허가 → 건축 외 용도 → 빈집정비(단서 하위 자리) → 공용 → 유료.
 */
export async function fillDemolished(page: Page, d: DemolishedFill) {
  await page.getByRole("switch", { name: /건축물 철거 완료/ }).click();
  await fillDemolishedDate(page, d.date);
  if (d.kind) await page.getByTestId(`pt-sa-demolished-kind-${d.kind}`).check();
  const attempts: [string, Answer | undefined][] = [
    ["vacanthouse", d.vacantHouse],
    ["permit", d.permit],
    ["otheruse", d.otherUse],
    ["vacanthouse", d.vacantHouse],
    ["publicuse", d.publicUse],
    ["publicusepaid", d.paid],
  ];
  for (const [key, answer] of attempts) {
    if (!answer) continue;
    const radio = page.getByTestId(`pt-sa-demolished-${key}-${answer}`);
    if ((await radio.count()) > 0) await radio.check();
  }
}

/**
 * 용도지역·건물(철거 전) 바닥면적 블록 — **사슬 끝에서만 그려진다**(PSA-S2: 비철거는 허가 «예», 철거는 사슬 통과 뒤 건축물일 때).
 * 그려져 있을 때만 채운다(헬퍼는 사슬을 판단하지 않는다 — 블록이 없으면 건너뛴다). 위치(`.first()`/`.nth()`)가 아니라 testid로 가리킨다.
 */
export async function fillAreaBasis(page: Page, o: { zoning?: RegExp; floor?: string }) {
  if ((await page.getByTestId("pt-sa-area-basis").count()) === 0) return;
  if (o.zoning) await page.getByTestId("pt-sa-area-zoning").getByRole("radio", { name: o.zoning }).check();
  if (o.floor !== undefined) await page.getByTestId("pt-sa-area-floor").fill(o.floor);
}

/**
 * 별도합산 상세(Step 2) — 순서는 화면 순서(PSA-S2): 토지 면적 → (공장용지는 호출부) → 허가(비철거) 또는 철거 토글·사슬 → 사슬 끝의 용도지역·바닥면적.
 * 용도지역·바닥면적은 블록이 그려졌을 때만 채운다(허가 «아니오»·«모름» · 철거 접힘이면 블록 없음 — 호출부가 값을 줘도 건너뛴다).
 */
export async function fillSeparateDetail(
  page: Page,
  o: { zoning: RegExp; area: string; floor?: string; permit?: Answer; demolished?: DemolishedFill; next?: boolean },
) {
  await page.getByTestId("pt-sa-land-area").fill(o.area);
  // 비철거 건축물 허가·사용승인 칸(PSA-E3 · 영 §101① 단서) — 기본값이 없으므로 호출부가 답을 명시한다(미지정 = 미선택 그대로)
  if (o.permit) await page.getByTestId(`pt-sa-permit-${o.permit}`).check();
  if (o.demolished) await fillDemolished(page, o.demolished);
  await fillAreaBasis(page, { zoning: o.zoning, floor: o.floor });
  if (o.next !== false) await page.getByRole("button", { name: /^다음$/ }).click();
}

/** Step 3 합산 칸 — 그려진 칸만 «없음(0)»으로 채운다(요구 칸은 엔진 술어가 정한다). */
export async function fillSplitInputsZero(page: Page) {
  for (const id of ["other-separate-aggregate-value", "other-comprehensive-value"]) {
    const box = page.getByTestId(id);
    if ((await box.count()) > 0) await fillAmount(page, box, "0");
  }
}

export function captureBody(page: Page): { bodies: Record<string, unknown>[] } {
  const box = { bodies: [] as Record<string, unknown>[] };
  page.on("request", (req: Request) => {
    if (req.url().includes("/api/calc/property") && req.method() === "POST") {
      box.bodies.push(req.postDataJSON() as Record<string, unknown>);
    }
  });
  return box;
}

export async function calc(page: Page) {
  const resp = page.waitForResponse(
    (r) => r.url().includes("/api/calc/property") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /재산세 계산하기/ }).click();
  expect((await resp).ok()).toBe(true);
  await expect(page.getByTestId("property-land-split-card")).toBeVisible({ timeout: 30_000 });
}

export const totalPayable = (page: Page) => page.locator('[data-print-id="total-payable"]');
/** 부분 일치(1,960,000 ⊃ 960,000) 오탐을 막는 경계 매칭 */
export const exact = (n: string) => new RegExp(`(^|[^\\d,])${n}($|[^\\d,])`);
