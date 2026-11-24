/**
 * 비사업용 토지 **판정 메뉴** — 마법사 플로우 · 의제 · ⑧ 차단 · 이력 왕복 · 계산기 넘기기 · `?new=1` · 이월과세 A/B
 *
 * 계획서: `docs/01-plan/features/nbl-judgment-menu.ui.plan.md` §11.3 (NJM-1~7, 9). NJM-8(계산기 회귀)은 `transfer-nbl-*` 기존 spec을 그대로 돌려 확인한다.
 *
 * 🔑 배관(폼 → 본문 → Zod → 엔진 → 결과 · 계산기 동일 판정)은 vitest anchor가 고정한다(`non-business-land-judgment-route.*` · `nbl-judgment-handoff`).
 *    여기서만 관측되는 것은 **화면이 실제로 이어지는가**다 — 위젯 렌더·단계 관문·이력 카드·계산기 도착 상태.
 * 🔑 외부 API 의존은 mock한다 — 주소 검색은 `setupAddress`(빈 결과 → 「입력한 주소 그대로 사용」). 판정 API는 **mock하지 않는다**(실제 route 응답을 본다).
 */
import { test, expect, type Page } from "@playwright/test";
import { fillDateAndVerify } from "./_helpers/tax-flow";
import { E2E_JIBUN, setupAddress } from "./_helpers/fill-address";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { waitForCalculationSaved } from "./_helpers/history-seed";

const ROUTE = "/calc/non-business-land";

/** React 리스너가 붙기 전의 클릭·fill은 조용히 유실된다(`e2e/CLAUDE.md` §6) — 양도일 입력의 fiber 키가 hydration 증거다. */
async function waitForHydration(page: Page) {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="nbl-judgment-transfer-date"] input');
      return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
    },
    undefined,
    { timeout: 30_000 },
  );
}

async function openMenu(page: Page) {
  await page.goto(`${ROUTE}?new=1`);
  await expect(page.getByRole("heading", { name: "비사업용 토지 판정", level: 1 })).toBeVisible();
  await waitForHydration(page);
}

/** BaseUI Select — 열고 → 방금 연 listbox 안에서 고르고 → 골라졌는지 확인(`e2e/CLAUDE.md` §6-3). */
async function chooseSelect(page: Page, dataField: string, optionName: string, shown: string) {
  const trigger = page.locator(`[data-field="${dataField}"]`).getByRole("combobox").first();
  await expect(trigger, `«${dataField}» Select가 보여야 함`).toBeVisible();
  const listbox = page.getByRole("listbox");
  await expect(async () => {
    if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
    await expect(listbox).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 20_000 });
  await listbox.getByRole("option", { name: optionName }).click();
  // 🔑 role이 아니라 `data-field` 컨테이너로 확인한다 — 의제가 성립하면 이 Select를 감싼 래퍼가 `aria-hidden`+`inert`가 되어 role 조회에서 사라진다.
  await expect(page.locator(`[data-field="${dataField}"]`), `«${dataField}» = ${shown}`).toContainText(shown);
}

async function fillDate(page: Page, testId: string, y: string, m: string, d: string) {
  await fillDateAndVerify(page, { year: y, month: m, day: d }, { scope: page.getByTestId(testId) });
}

/** ① 공통 — 소재지·면적·양도일. 취득원인·취득일은 호출부가 채운다. */
async function fillLandBasics(page: Page, transfer: [string, string, string]) {
  await setupAddress(page);
  await expect(page.getByText(E2E_JIBUN).first()).toBeVisible();
  await page.getByTestId("nbl-judgment-area").fill("3000");
  await fillDate(page, "nbl-judgment-transfer-date", ...transfer);
}

async function next(page: Page, expectText: string | RegExp) {
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByText(expectText).first()).toBeVisible();
}

/** 매매 · 농지(농림지역 · 자경 아님) → 비사업용 후보. 판정 결과 화면까지 간다. */
async function judgeFarmland(page: Page) {
  await openMenu(page);
  await fillLandBasics(page, ["2024", "06", "01"]);
  await fillDate(page, "nbl-judgment-acquisition-date", "2014", "01", "10");
  await next(page, "② 사업용 의제·지목");
  await chooseSelect(page, "nblLandType", "농지", "농지");
  await chooseSelect(page, "nblZoneType", "농림지역", "농림지역");
  await next(page, "③ 부득이한 사유·편입·의제일");
  const response = page.waitForResponse((r) => r.url().includes("/api/calc/non-business-land-judgment") && r.request().method() === "POST");
  await page.getByTestId("nbl-judgment-judge-cta").click();
  const res = await response;
  // 400/500을 「판정 실패」 배너로 삼키면 spec이 조용히 무의미해진다 — 상태코드를 직접 본다.
  expect(res.ok(), `판정 API가 ${res.status()}로 응답했다`).toBe(true);
  await expect(page.getByTestId("nbl-judgment-result")).toBeVisible();
}

test.describe("비사업용 토지 판정 메뉴", () => {
  test("[NJM-1] 홈 카드 → 메뉴 진입 · 「다주택 중과 판정」 바로 뒤", async ({ page }) => {
    await page.goto("/");
    const card = page.getByRole("link", { name: /비사업용 토지 판정/ });
    await expect(card).toBeVisible();
    // 카드 순서 — 다주택 중과 판정 바로 다음
    const titles = await page.getByRole("link").filter({ has: page.getByRole("heading") }).evaluateAll((els) => els.map((e) => e.querySelector("h1,h2,h3,h4")?.textContent ?? ""));
    const idx = titles.findIndex((t) => t === "다주택 중과 판정");
    expect(idx, `홈 메뉴 제목: ${titles.join(" | ")}`).toBeGreaterThanOrEqual(0);
    expect(titles[idx + 1]).toBe("비사업용 토지 판정");
    await card.click();
    await expect(page).toHaveURL(new RegExp(`${ROUTE}$`), { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "비사업용 토지 판정", level: 1 })).toBeVisible();
    // 컨테이너 머리(계산기 전용)는 메뉴에 없다 — `part` 분할의 결과
    await expect(page.getByText("비사업용 토지 정밀 판정")).toHaveCount(0);
  });

  test("[NJM-2] 농지 풀플로우 ①→④ — 비사업용 · 세율을 단정하지 않는다", async ({ page }) => {
    await judgeFarmland(page);
    await expect(page.getByTestId("nbl-judgment-verdict")).toContainText("비사업용");
    await expect(page.getByTestId("nbl-judgment-premise")).toContainText(E2E_JIBUN);
    await expect(page.getByText("판정 과정")).toBeVisible();
    // 판정 중심 문구 · 계산기 카드의 세율 단정 문장은 없다
    await expect(page.getByText("비사업용 토지에 해당합니다.")).toBeVisible();
    await expect(page.getByText("일반세율이 적용됩니다")).toHaveCount(0);
    await expect(page.getByText(/기본세율 \+10%p/)).toHaveCount(0);
    await expect(page.getByTestId("nbl-judgment-qualifier-note")).toContainText("세율·장기보유특별공제·중과 유예·배제는 양도소득세 계산기에서 정해집니다");
    await expect(page.getByText("면책 고지")).toBeVisible();
  });

  test("[NJM-3] 무조건 사업용 의제 — ②에서 지목 선택 시 자동 판정 · ③ 안내 · ④ 사업용", async ({ page }) => {
    await openMenu(page);
    await fillLandBasics(page, ["2009", "06", "01"]);
    await page.getByRole("radio", { name: /^상속/ }).click();
    await fillDate(page, "nbl-judgment-acquisition-date", "2005", "03", "01");
    await fillDate(page, "nbl-judgment-decedent-date", "1990", "01", "01");
    await next(page, "② 사업용 의제·지목");
    // 용도지역 먼저 — 지목을 고르는 순간 의제가 성립해 지목별 입력 래퍼 전체가 비활성(inert)이 된다
    await chooseSelect(page, "nblZoneType", "농림지역", "농림지역");
    await chooseSelect(page, "nblLandType", "농지", "농지");
    await expect(page.getByText("엔진이 무조건 사업용으로 판정합니다")).toBeVisible();
    await expect(page.getByTestId("nbl-per-category")).toHaveAttribute("inert", "");
    await next(page, "③ 부득이한 사유·편입·의제일");
    await expect(page.getByTestId("nbl-judgment-grace-exempt-notice")).toBeVisible();
    await expect(page.getByTestId("nbl-per-category")).toHaveAttribute("inert", "");
    await page.getByTestId("nbl-judgment-judge-cta").click();
    await expect(page.getByTestId("nbl-judgment-verdict")).toContainText("사업용");
    await expect(page.getByText(/무조건 사업용 — 소득세법 시행령 §168의14③/)).toBeVisible();
  });

  test("[NJM-4] ⑧ 차단 — 빈 ①은 다음·단계 점프가 막히고 오류 칸으로 이동한다", async ({ page }) => {
    await openMenu(page);
    await page.getByRole("button", { name: "다음" }).click();
    const banner = page.getByTestId("nbl-judgment-error");
    await expect(banner).toContainText("양도일을 입력하세요.");
    await expect(page.getByText("② 사업용 의제·지목")).toHaveCount(0);
    // 오류 → 입력칸 이동
    await page.getByTestId("nbl-judgment-error-jump").click();
    await expect(page.getByTestId("nbl-judgment-transfer-date").locator("input").first()).toBeFocused();
    // 단계 점프(StepIndicator ③) — 앞 단계 오류가 있으면 그 단계로 되돌아온다(점프로 ⑧을 우회하지 못한다)
    await page.getByRole("button", { name: /부득이한 사유·편입일·의제일 단계로 이동/ }).click();
    await expect(page.getByTestId("nbl-judgment-step-grace")).toHaveCount(0);
    await expect(page.getByTestId("nbl-judgment-transfer-date")).toBeVisible();
    // 뒤로·제자리는 막지 않는다 — ①을 채우면 ②로 갈 수 있다
    await fillLandBasics(page, ["2024", "06", "01"]);
    await fillDate(page, "nbl-judgment-acquisition-date", "2014", "01", "10");
    await next(page, "② 사업용 의제·지목");
    // ②에서 지목 없이 다음 → ② 오류로 막힌다
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByTestId("nbl-judgment-error")).toContainText("지목을 선택하세요");
  });

  test("[NJM-5] 이력 왕복 — 「판정:」 카드 · 필터 · 편집으로 입력 복원(결과는 재판정)", async ({ page }) => {
    await judgeFarmland(page);
    // 저장은 결과 화면 마운트 뒤 비동기 write다 — 응답만 기다리고 이동하면 /history가 0건으로 보인다.
    await waitForCalculationSaved(page, "non_business_land_judgment");
    await page.goto("/history");
    await expect(page.getByText("비사업용 토지 판정").first()).toBeVisible();
    await expect(page.getByText("판정:").first()).toBeVisible();
    await expect(page.getByText("비사업용").first()).toBeVisible();
    // 세액이 없는 세목에 「납부세액 -」을 띄우면 안 된다
    await expect(page.getByText("납부세액").first()).toBeHidden();
    // 필터
    await page.getByRole("button", { name: "비사업용 토지 판정", exact: true }).click();
    await expect(page.getByText(E2E_JIBUN).first()).toBeVisible();
    // 편집 → 메뉴로 복귀 · ① 입력 복원 · 결과는 되살리지 않는다
    await page.locator('[data-testid^="resume-"]').first().click();
    await expect(page).toHaveURL(new RegExp(`${ROUTE}$`), { timeout: 30_000 });
    await waitForHydration(page);
    await expect(page.getByTestId("nbl-judgment-area")).toHaveValue("3000");
    await expect(page.getByText(E2E_JIBUN).first()).toBeVisible();
    await expect(page.getByTestId("nbl-judgment-result")).toHaveCount(0);
  });

  test("[NJM-6] 계산기 넘기기 — 사실만 넘어가 「판정 도움」으로 열리고 양도가액·취득가액은 비어 있다", async ({ page }) => {
    await judgeFarmland(page);
    await expect(page.getByTestId("nbl-judgment-to-calculator-remaining")).toContainText("총 양도가액 · 취득가액");
    await page.getByTestId("nbl-judgment-to-calculator").click();
    await expect(page).toHaveURL(/\/calc\/transfer-tax$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "양도소득세 계산기" })).toBeVisible();
    // 양도일은 넘어왔다 · 총 양도가액·취득가액은 비어 있다(메뉴가 묻지 않는다)
    await expect(page.getByTestId("transfer-date").getByLabel("연도").first()).toHaveValue("2024");
    await expandAssetSection(page, 2);
    await expect(page.getByTestId("companion-actual-sale-price")).toHaveValue("");
    await expandAssetSection(page, 3);
    await expect(page.getByTestId("fixed-acquisition-price")).toHaveValue("");
    // 남은 입력을 채우면(목록 그대로) 다음 단계로 간다 → 「보유 상황」에서 판정 도움 모드로 열려 있다
    await page.getByTestId("companion-actual-sale-price").fill("2000000000");
    await page.getByTestId("fixed-acquisition-price").fill("300000000");
    await page.getByRole("button", { name: "다음" }).click();
    const toggle = page.getByRole("switch", { name: /비사업용 토지/ });
    await expect(toggle).toHaveAttribute("aria-checked", "true", { timeout: 20_000 });
    await expect(page.getByRole("radio", { name: /판정 도움 필요/ })).toBeChecked();
    // 메뉴에서 고른 지목·용도지역이 그대로 보인다
    await expect(page.locator('[data-field="nblLandType"]')).toContainText("농지");
    await expect(page.locator('[data-field="nblZoneType"]')).toContainText("농림지역");
  });

  test("[NJM-7] `?new=1` 초기화 — 새로고침은 입력 보존, 홈 진입(`?new=1`)은 빈 폼", async ({ page }) => {
    await openMenu(page);
    await page.getByTestId("nbl-judgment-area").fill("777");
    await expect(page.getByTestId("nbl-judgment-area")).toHaveValue("777");
    await page.reload();
    await waitForHydration(page);
    await expect(page.getByTestId("nbl-judgment-area")).toHaveValue("777");
    await page.goto(`${ROUTE}?new=1`);
    await waitForHydration(page);
    await expect(page.getByTestId("nbl-judgment-area")).toHaveValue("");
  });

  test("[NJM-9] 이월과세 — 증여자 취득일·증여 등기접수일 → A·B를 나란히, 적용 쪽을 단정하지 않는다", async ({ page }) => {
    await openMenu(page);
    await fillLandBasics(page, ["2023", "12", "01"]);
    await page.getByRole("radio", { name: /^이월과세/ }).click();
    await expect(page.getByTestId("nbl-judgment-acquisition-date")).toHaveCount(0);
    await fillDate(page, "nbl-judgment-donor-date", "2012", "01", "10");
    await fillDate(page, "nbl-judgment-gift-registry-date", "2022", "06", "01");
    await next(page, "② 사업용 의제·지목");
    await chooseSelect(page, "nblLandType", "농지", "농지");
    await chooseSelect(page, "nblZoneType", "농림지역", "농림지역");
    await next(page, "③ 부득이한 사유·편입·의제일");
    const response = page.waitForResponse((r) => r.url().includes("/api/calc/non-business-land-judgment") && r.request().method() === "POST");
    await page.getByTestId("nbl-judgment-judge-cta").click();
    const res = await response;
    expect(res.ok(), `판정 API가 ${res.status()}로 응답했다`).toBe(true);
    const body = res.request().postDataJSON() as { carryoverGiftRegistryDate?: string };
    expect(body.carryoverGiftRegistryDate).toBe("2022-06-01");
    await expect(page.getByTestId("nbl-judgment-carryover-pair")).toBeVisible();
    await expect(page.getByTestId("nbl-judgment-card-a")).toBeVisible();
    await expect(page.getByTestId("nbl-judgment-card-b")).toBeVisible();
    await expect(page.getByTestId("nbl-judgment-carryover-notice")).toContainText("양도소득세 계산기에서 세액 비교로 정해집니다");
    await expect(page.getByText("면책 고지")).toBeVisible();
  });
});
