/**
 * transfer-nbl-other-state-history-u3.spec.ts
 *
 * NBL-STATE-HISTORY-U3 — 기타토지 «소유기간 중 건축물 유무 이력» 마무리 검증(UI 계획서 §11.2 E2·E3·E4·E5 + 일 단위 임계선 쌍 + UV-8 인쇄).
 * 철거 후 양도(E1)·철거 직전 «모름»(E6)은 `transfer-nbl-other-state-history.spec.ts`, 결과 카드·UV-6는 `…-result.spec.ts`가 이미 검증한다 — 겹치지 않는다.
 *
 * 검증:
 *  1) E2 신축 직후 양도(나대지 → 준공 2023-06-01): 화면 입력 → body → 결과가 «이력 없음(현행)»과 반대(사업용 → 비사업용) + 구간표(건축물 없음 → 있음).
 *  2) E3 질문 «모름»: body `unknown` · 현행 판정 유지 + 확인 필요 고지(사건 행 없음).
 *  3) E4 ⑧ 오류 3종을 화면 입력으로 재현 — ① 바뀐 적 있음 + 사건 0건 ② 같은 날·역순 ③ 소유 시작 전·양도일 이후 — 메시지 + 그 행의 칸으로 포커스(필드 점프). 고치면 계산이 진행된다.
 *  4) E5 축 B 지분: 질문은 첫 카드에만 · 하한일 = 번들 최이른 취득일(첫 카드가 가장 이르지 않아도) → 이른 날은 막고, 첫 카드 취득일보다 이르지만 번들 하한 이후인 날은 통과·400 아님.
 *  5) 일 단위 임계선 쌍(엔진 계획서 §6 M8a/M8b — 취득 2014-01-01 · 양도 2024-01-01): 준공 2022-01-01 → 사업용(사업 730), 2022-01-02 → 비사업용(사업 729). 하루 차이로 판정이 갈린다.
 *  6) UV-8 인쇄: «계산 결과 선택 출력»에서 「전체 선택」 → print 미디어 → 구간표·기준 풀이가 보이고 잘리지 않는다.
 *
 * 폼은 sessionStorage로 시드한다(입력 화면 풀플로우는 `transfer-nbl-other-state-history.spec.ts`가 검증). 사건 행은 화면에서 입력한다.
 * 외부 API 의존 없음(주소·시세 조회 버튼 미사용) — mock 불필요.
 *
 * 실행: E2E_PORT=<포트> npx playwright test e2e/transfer-nbl-other-state-history-u3.spec.ts
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Resp = { status: number; req: Record<string, any>; json: Record<string, any> };

const BASE_FORM = { transferDate: "2024-01-01", filingDate: "2024-03-31", contractTotalPrice: "1000000000" };
/** 기타토지 정밀 판정 ON · 취득 2014-01-01(소유 3,651일) · 양도 2024-01-01 — 엔진 계획서 §6 공통 시료. 질문(모드)은 비워 둔다(화면에서 답한다). */
const LAND = {
  assetKind: "land", acquisitionArea: "1000", transferArea: "1000", addressJibun: "서울 강남구 테스트동 1",
  acquisitionCause: "purchase", acquisitionDate: "2014-01-01", fixedAcquisitionPrice: "300000000", actualSalePrice: "1000000000", standardPriceAtTransfer: "500000000",
  isNonBusinessLand: true, nblUseDetailedJudgment: true, nblLandType: "other_land", nblZoneType: "general_residential",
  nblOtherStateHistoryMode: "", nblOtherStateEvents: [],
};
/** 양도일 현재 «건축물 있음 + 별도합산(바닥면적 × 배율 ≥ 토지)» — 마지막 사건이 신축일 때의 꼬리. */
const BUILT_TAIL = { nblOtherPropertyTaxType: "separate", nblOtherBuildingFloorArea: "500" };
/** 양도일 현재 «나대지 + 종합합산» — 마지막 사건이 철거일 때의 꼬리. */
const BARE_TAIL = { nblOtherPropertyTaxType: "comprehensive" };
const HALF = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "" };

async function waitHydrated(page: Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  }, undefined, { timeout: 30_000 });
}

async function seed(page: Page, assets: unknown[], mode: "single" | "fractional" = "single", form: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const formData = { ...createDefaultTransferFormData(), ...BASE_FORM, assetSplitMode: mode, bundledSaleMode: "actual", assets, ...form };
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), { state: { formData, currentStep: 0, pendingMigration: false }, version: 0 });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await waitHydrated(page);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

const landAsset = (over: Record<string, unknown> = {}) => ({ ...makeDefaultAsset(1), ...LAND, ownershipNumerator: "100", ownershipDenominator: "100", ...over });

async function gotoHolding(page: Page) {
  await page.getByRole("button", { name: "보유 상황" }).first().click();
  await expect(page.getByTestId("nbl-other-state-history").first(), "건축물 이력 질문이 보여야 함").toBeVisible({ timeout: 20_000 });
}

/** 질문 라디오를 누르고 React가 렌더한 결과(체크)를 확인한다(e2e/CLAUDE.md §6). */
async function chooseMode(page: Page, mode: "unchanged" | "changed" | "unknown", scope: Page | Locator = page) {
  const radio = scope.getByTestId(`nbl-other-state-mode-${mode}`);
  await radio.click();
  await expect(radio).toBeChecked();
}

async function addEvent(page: Page, kind: "built" | "removed", date: string, scope: Page | Locator = page) {
  const rows = scope.locator('[data-testid^="nbl-other-state-event-"][data-testid$="-date"]');
  const i = await rows.count();
  await scope.getByTestId("nbl-other-state-event-add").click();
  await expect(rows).toHaveCount(i + 1);
  const k = scope.getByTestId(`nbl-other-state-event-${i}-kind-${kind}`);
  await k.click();
  await expect(k).toBeChecked();
  if (date) await setEventDate(scope, i, date);
  return i;
}

async function setEventDate(scope: Page | Locator, i: number, iso: string) {
  const [y, m, d] = iso.split("-");
  const date = scope.getByTestId(`nbl-other-state-event-${i}-date`);
  await date.getByLabel("연도").fill(y);
  await date.getByLabel("월").fill(m);
  await date.getByLabel("일").fill(d);
  await expect(date.getByLabel("연도")).toHaveValue(y);
  await expect(date.getByLabel("일")).toHaveValue(d);
}

async function toLastStep(page: Page) {
  for (const step of ["감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
}

async function calc(page: Page): Promise<Resp> {
  await toLastStep(page);
  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const r = await resp;
  return { status: r.status(), req: r.request().postDataJSON(), json: await r.json() };
}

/** 마지막 단계에서 계산을 눌러 ⑧ 오류 목록에 오르게 한다(요청은 나가지 않는다). */
async function calcExpectBlocked(page: Page) {
  await toLastStep(page);
  let fired = false;
  const watch = (r: { url(): string }) => { if (r.url().includes("/api/calc/transfer")) fired = true; };
  page.on("request", watch);
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await expect(page.getByTestId("validation-issues")).toBeVisible();
  page.off("request", watch);
  expect(fired, "⑧에 막히면 계산 요청이 나가지 않는다").toBe(false);
}

const issueButton = (page: Page, message: RegExp) => page.getByTestId("validation-issues").getByRole("button", { name: message });

/** 오류 항목을 눌렀을 때 포커스가 그 키의 앵커 안에 있고 화면에 보이는가(`transfer-validation-field-jump.spec.ts`와 같은 판정). */
async function expectJumpTo(page: Page, message: RegExp, fieldKey: string) {
  const item = issueButton(page, message);
  await expect(item).toBeVisible();
  await item.click();
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        return !!el.closest(`[data-field="${CSS.escape(key)}"]`);
      }, fieldKey),
    )
    .toBe(true);
  await expect(page.locator(":focus")).toBeInViewport();
}

const banner = {
  business: (page: Page) => page.getByText("사업용 토지 — 일반세율이 적용됩니다."),
  nonBusiness: (page: Page) => page.getByText(/비사업용 토지 — 기본세율 \+10%p 중과/),
};

const periodOf = (r: Resp): any => r.json.data?.result?.nonBusinessLandJudgmentDetail?.periodEvaluation ?? r.json.data?.aggregated?.properties?.[0]?.nonBusinessLandJudgmentDetail?.periodEvaluation;

test.describe("기타토지 건축물 이력 U3 — 입력 → 계산 → 결과", () => {
  test("E2 신축 직후 양도: 나대지 → 준공 2023-06-01 — 화면 입력 → body 도달 → 비사업용(이력 없음이면 사업용) + 구간표(건축물 없음 → 있음)", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, [landAsset(BUILT_TAIL)]);
    await gotoHolding(page);
    await chooseMode(page, "changed");
    await addEvent(page, "built", "2023-06-01");
    await expect(page.getByTestId("nbl-state-history-at-transfer")).toContainText("양도일 현재 건축물: 있음");
    await expect(page.getByTestId("nbl-state-history-preview-row-0")).toContainText("2014-01-02 ~ 2023-05-31");
    await expect(page.getByTestId("nbl-state-history-preview-row-1")).toContainText("2023-06-01 ~ 2023-12-31");

    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    const raw = r.req.nonBusinessLandRaw;
    expect(raw?.nblOtherStateHistoryMode).toBe("changed");
    expect(raw?.nblOtherStateEvents).toEqual([{ kind: "building_built", date: "2023-06-01", propertyTaxTypeBefore: "" }]);
    expect(raw?.nblOtherHasBuilding, "양도일 현재 건축물 유무는 마지막 사건(신축)에서 파생").toBe(true);

    await expect(banner.nonBusiness(page)).toBeVisible();
    const rows = page.getByTestId(/^nbl-state-history-interval-\d+$/);
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("2014-01-02 ~ 2023-05-31");
    await expect(rows.nth(0)).toContainText("없음");
    await expect(rows.nth(1)).toContainText("2023-06-01 ~ 2023-12-31");
    await expect(rows.nth(1)).toContainText("있음");
    // 엔진 계획서 §6 M6 — 사업 214일 / 소유 3,651일(가·나·다목 모두 충족 → 비사업용)
    const sh = periodOf(r)?.stateHistory;
    expect(sh, "periodEvaluation.stateHistory echo").toBeTruthy();
    await expect(page.getByTestId("nbl-state-history-total-row")).toContainText("3,651");

    // 대조군 — 같은 토지를 «바뀐 적 없습니다»(현행: 양도일 현재 건축물 있음·별도합산을 전 기간에 적용)로 넣으면 사업용이다. 이력이 결과를 정반대로 돌렸다.
    await seed(page, [landAsset({ ...BUILT_TAIL, nblOtherHasBuilding: true })]);
    await gotoHolding(page);
    await chooseMode(page, "unchanged");
    const base = await calc(page);
    expect(base.status, JSON.stringify(base.json).slice(0, 300)).toBe(200);
    expect(base.req.nonBusinessLandRaw?.nblOtherStateHistoryMode).toBe("unchanged");
    await expect(banner.business(page)).toBeVisible();
    await expect(page.getByTestId("nbl-state-history-period")).toHaveCount(0);
  });

  test("E3 질문 «모름»: 사건 행 없음 · body unknown · 현행 판정(나대지 종합합산 → 비사업용) + 확인 필요 고지", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, [landAsset(BARE_TAIL)]);
    await gotoHolding(page);
    await chooseMode(page, "unknown");
    await expect(page.getByTestId("nbl-state-history-unknown-notice")).toBeVisible();
    await expect(page.getByTestId("nbl-other-state-events")).toHaveCount(0);

    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.req.nonBusinessLandRaw?.nblOtherStateHistoryMode).toBe("unknown");
    expect(r.req.nonBusinessLandRaw?.nblOtherStateEvents).toEqual([]);
    await expect(banner.nonBusiness(page)).toBeVisible();
    // 이력을 반영하지 않았으므로 구간표 대신 현행(양도일 현재 상태 전 기간) 판정 + 확인 필요 고지
    await expect(page.getByTestId("nbl-state-history-period")).toHaveCount(0);
    expect(periodOf(r)?.basis, "모름은 이력 판정(state_history)으로 가지 않는다").not.toBe("state_history");
    await expect(page.getByText(/소유기간 중 건축물 유무 이력을 확인하지 못했습니다/).first()).toBeVisible();
  });
});

test.describe("기타토지 건축물 이력 U3 — ⑧ 오류 3종 + 필드 점프(화면 입력으로 재현)", () => {
  const ZERO_EVENTS = /소유기간 중 건축물이 새로 생기거나 없어진 적이 있다고 답했으나 사건이 없습니다/;

  test("E4-a 「바뀐 적 있음」 + 사건 0건: 계산 전에 막고 사건 목록으로 이동 → 사건을 넣으면 계산된다", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, [landAsset(BARE_TAIL)]);
    await gotoHolding(page);
    await chooseMode(page, "changed");
    await expect(page.locator('[data-testid^="nbl-other-state-event-"][data-testid$="-date"]')).toHaveCount(0);
    await calcExpectBlocked(page);
    await expectJumpTo(page, ZERO_EVENTS, "nblOtherStateEvents");

    await addEvent(page, "removed", "2021-01-01");
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.req.nonBusinessLandRaw?.nblOtherStateEvents).toEqual([{ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "" }]);
  });

  test("E4-b 같은 날 · 역순: 두 번째 행 날짜 칸으로 이동 → 고치면 계산된다", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, [landAsset(BARE_TAIL)]);
    await gotoHolding(page);
    await chooseMode(page, "changed");
    await addEvent(page, "built", "2018-01-01");
    await addEvent(page, "removed", "2018-01-01"); // 같은 날 — 0일 구간
    await calcExpectBlocked(page);
    await expectJumpTo(page, /건축물 사건 2번째 행 — 사건일\(2018-01-01\)이 앞 사건과 같은 날입니다/, "nblOtherStateEvents.1.date");

    await setEventDate(page, 1, "2017-06-01"); // 역순
    await calcExpectBlocked(page);
    await expectJumpTo(page, /건축물 사건 2번째 행 — 사건일\(2017-06-01\)이 앞 사건\(2018-01-01\)보다 빠릅니다/, "nblOtherStateEvents.1.date");

    await setEventDate(page, 1, "2019-01-01");
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.req.nonBusinessLandRaw?.nblOtherStateEvents).toEqual([
      { kind: "building_built", date: "2018-01-01", propertyTaxTypeBefore: "" },
      { kind: "building_removed", date: "2019-01-01", propertyTaxTypeBefore: "" },
    ]);
  });

  test("E4-c 소유 시작 전 · 양도일 당일 이후: 그 행 날짜 칸으로 이동 → 고치면 계산된다", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, [landAsset(BARE_TAIL)]);
    await gotoHolding(page);
    await chooseMode(page, "changed");
    await addEvent(page, "removed", "2014-01-01"); // 취득일 당일
    await calcExpectBlocked(page);
    await expectJumpTo(page, /건축물 사건 1번째 행 — 사건일\(2014-01-01\)이 소유 시작 전입니다\. 취득일\(2014-01-01\)/, "nblOtherStateEvents.0.date");

    await setEventDate(page, 0, "2024-01-01"); // 양도일 당일
    await calcExpectBlocked(page);
    await expectJumpTo(page, /건축물 사건 1번째 행 — 사건일\(2024-01-01\)이 양도일\(2024-01-01\) 당일 또는 그 이후입니다/, "nblOtherStateEvents.0.date");

    await setEventDate(page, 0, "2023-12-31"); // 양도일 전날 — 유효 경계(꼬리 1일)
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
  });
});

test.describe("기타토지 건축물 이력 U3 — 축 B 지분", () => {
  test("E5 질문은 첫 카드에만 · 하한일 = 번들 최이른 취득일(둘째 지분이 가장 이름) → 번들 하한 전은 막고, 첫 카드 취득일 전이라도 번들 하한 후면 계산된다(400 아님)", async ({ page }) => {
    test.setTimeout(150_000);
    // 첫 카드 취득 2020-01-01(늦음) · 둘째 지분 취득 2014-01-02(가장 이름) — 첫 카드가 가장 이르다는 보장이 없다(UI 계획서 UV-5)
    const first = landAsset({ ...BARE_TAIL, ...HALF, acquisitionDate: "2020-01-01" });
    const second = { ...makeDefaultAsset(2), acquisitionCause: "purchase", acquisitionDate: "2014-01-02", fixedAcquisitionPrice: "300000000", ...HALF };
    await seed(page, [first, second], "fractional");
    await gotoHolding(page);
    await expect(page.getByTestId("nbl-other-state-history"), "이력 질문은 첫 카드에만 있다").toHaveCount(1);
    await chooseMode(page, "changed");
    await addEvent(page, "removed", "2013-06-01"); // 번들 최이른 취득일(2014-01-02)보다 앞
    await calcExpectBlocked(page);
    await expectJumpTo(page, /건축물 사건 1번째 행 — 사건일\(2013-06-01\)이 소유 시작 전입니다\. 취득일\(2014-01-02\)/, "nblOtherStateEvents.0.date");

    await setEventDate(page, 0, "2016-06-01"); // 번들 하한 이후 · 첫 카드 자기 취득일(2020-01-01)보다는 앞
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.req.nonBusinessLandRaw?.nblOtherStateEvents).toEqual([{ kind: "building_removed", date: "2016-06-01", propertyTaxTypeBefore: "" }]);
    // 지분마다 자기 소유 시작일로 사건을 잘라 자기 구간표를 가진다
    const periods = page.getByTestId("nbl-state-history-period");
    await expect(periods).toHaveCount(2, { timeout: 20_000 });
    const iv = (n: number, i: number) => periods.nth(n).getByTestId(`nbl-state-history-interval-${i}`);
    await expect(iv(1, 0)).toContainText("2014-01-03 ~ 2016-05-31"); // 둘째 지분(취득 2014-01-02): 철거 전 구간이 있다
    await expect(iv(0, 0)).toContainText("2020-01-02"); // 첫 지분(취득 2020-01-01): 철거가 소유 전이라 철거 후 구간만
    await expect(periods.nth(0).getByTestId(/^nbl-state-history-interval-\d+$/)).toHaveCount(1);
  });
});

test.describe("기타토지 건축물 이력 U3 — 소유기간 0일(축 B 지분이 양도 전날 취득)", () => {
  // 단건은 사건일이 («취득일 < 사건일 < 양도일») 구간이 없어 0일에서 `changed`에 닿을 수 없다(⑧). 도달 경로는 축 B뿐 — 첫 지분이 이르면 하한이 열려 둘째 지분(취득 = 양도 전날)이 0일로 계산된다.
  // 엔진은 0일 보유를 기간기준 비교 없이 비사업용으로 처리하는데(수치 echo 없음) 종전 카드는 «나목 … 미충족» 행과 «모두 충족해 비사업용» 문구를 함께 그렸다.
  test("둘째 지분 소유 0일: 첫 지분은 기준 3행 · 둘째 지분은 기준 행 없이 «비교 없이 비사업용»(모순 문구 없음)", async ({ page }) => {
    test.setTimeout(150_000);
    const first = landAsset({ ...BARE_TAIL, ...HALF, nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [{ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "separate" }] });
    const second = { ...makeDefaultAsset(2), acquisitionCause: "purchase", acquisitionDate: "2023-12-31", fixedAcquisitionPrice: "300000000", ...HALF };
    await seed(page, [first, second], "fractional");
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    const periods = page.getByTestId("nbl-state-history-period");
    await expect(periods).toHaveCount(2, { timeout: 20_000 });
    await expect(periods.nth(0).getByTestId("nbl-state-history-criterion-da")).toBeVisible();
    await expect(periods.nth(0).getByTestId("nbl-state-history-zero-days")).toHaveCount(0);
    await expect(periods.nth(1).getByTestId("nbl-state-history-zero-days")).toContainText("소유기간이 0일");
    await expect(periods.nth(1).getByTestId("nbl-state-history-total-row")).toContainText("0일");
    await expect(periods.nth(1).getByTestId(/^nbl-state-history-criterion-/)).toHaveCount(0);
    await expect(periods.nth(1).getByTestId("nbl-state-history-criteria-verdict")).toHaveCount(0);
  });
});

test.describe("기타토지 건축물 이력 U3 — 일 단위 임계선 쌍", () => {
  // 엔진 계획서 §6 M8a/M8b — 취득 2014-01-01 · 양도 2024-01-01 · 준공일만 하루 다르다. 나목 «직전 3년 중 1년 초과»(창 1,095일):
  // 준공 2022-01-01 → 꼬리(건축물 있음) 730일 · 직전 3년 비사업 365일(1년 초과 아님) → 사업용 / 준공 2022-01-02 → 729일 · 366일 → 비사업용.
  const PAIR = [
    { built: "2022-01-01", tailDays: "730일", nonBizIn3y: "365일", na: "미충족", nonBusiness: false },
    { built: "2022-01-02", tailDays: "729일", nonBizIn3y: "366일", na: "충족", nonBusiness: true },
  ] as const;

  for (const c of PAIR) {
    test(`준공 ${c.built} → ${c.nonBusiness ? "비사업용" : "사업용"}(꼬리 ${c.tailDays} · 직전 3년 비사업 ${c.nonBizIn3y})`, async ({ page }) => {
      test.setTimeout(150_000);
      await seed(page, [landAsset({ ...BUILT_TAIL, nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [{ kind: "building_built", date: c.built, propertyTaxTypeBefore: "" }] })]);
      const r = await calc(page);
      expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
      await expect(c.nonBusiness ? banner.nonBusiness(page) : banner.business(page)).toBeVisible();
      // 구간표 — 건축물 있음 구간(꼬리)이 사업용 일수 그대로 730 / 729일
      const tail = page.getByTestId("nbl-state-history-interval-1");
      await expect(tail).toContainText(c.built.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1-$2-$3") + " ~ 2023-12-31");
      await expect(tail).toContainText(c.tailDays);
      // 나목(직전 3년 중 1년 초과) — 하루 차이로 충족/미충족이 갈린다
      const na = page.getByTestId("nbl-state-history-criterion-na");
      await expect(na).toContainText(`비사업용 기간 ${c.nonBizIn3y}`);
      await expect(na).toContainText(`→ ${c.na}`);
      await expect(page.getByTestId("nbl-state-history-criteria-verdict")).toContainText(c.nonBusiness ? "모두 충족해 비사업용" : "미충족인 기준이 있어 사업용");
      // 엔진 계획서 §6 M8a/M8b 산출세액(전량 사업용 B / 전량 비사업용 N) — 같은 세율표일 때만 일치하므로 어긋나면 값을 보이도록 로그만 남긴다
      console.log(`[pair ${c.built}] 산출세액`, JSON.stringify(r.json.data?.result?.calculatedTax ?? r.json.data?.aggregated?.totalTax));
    });
  }
});

test.describe("기타토지 건축물 이력 U3 — 인쇄(UV-8)", () => {
  test("«계산 결과 선택 출력» 전체 선택 → print 미디어(A4 내용폭): 구간표·영 §168조의6 기준 풀이가 보이고 잘리지 않는다", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, [landAsset({ ...BARE_TAIL, nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [{ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "separate" }] })]);
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    await expect(page.getByTestId("nbl-state-history-intervals")).toBeVisible({ timeout: 20_000 });

    // 선택 없이 print만 켜면 섹션이 print:hidden이라 폭이 0이다(e2e/CLAUDE.md · 결함 오판 방지) — 「전체 선택」을 먼저 누른다.
    await page.getByRole("button", { name: "전체 선택" }).first().click();
    // A4 세로 · @page margin 10mm → 내용폭 190mm ≈ 718px
    await page.setViewportSize({ width: 718, height: 1100 });
    await page.emulateMedia({ media: "print" });
    try {
      const period = page.getByTestId("nbl-state-history-period");
      await expect(period).toBeVisible();
      const table = page.getByTestId("nbl-state-history-intervals");
      const m = await table.evaluate((el) => {
        const wrap = el.parentElement as HTMLElement;
        const rect = el.getBoundingClientRect();
        const rows = [...el.querySelectorAll("tbody tr")].map((tr) => (tr as HTMLElement).getBoundingClientRect());
        return {
          overflowX: getComputedStyle(wrap).overflowX,
          tableLeft: rect.left, tableRight: rect.right, tableWidth: rect.width, vw: window.innerWidth,
          scrollW: wrap.scrollWidth, clientW: wrap.clientWidth,
          rowsVisible: rows.length > 0 && rows.every((x) => x.width > 0 && x.height > 0),
          lastCellRights: [...el.querySelectorAll("tbody tr")].map((tr) => (tr.lastElementChild as HTMLElement).getBoundingClientRect().right),
        };
      });
      expect(m.tableWidth, "0 가드 — 선택 단계가 빠지면 폭 0으로 통과하는 침묵 실패 방지").toBeGreaterThan(0);
      expect(m.rowsVisible).toBe(true);
      expect(m.overflowX, "print:overflow-visible — 인쇄에서 가로 스크롤 영역이 아니다").toBe("visible");
      expect(m.tableLeft).toBeGreaterThanOrEqual(0);
      expect(m.tableRight, "표 오른쪽 끝이 용지 내용폭을 넘지 않는다").toBeLessThanOrEqual(m.vw + 0.5);
      for (const right of m.lastCellRights) expect(right).toBeLessThanOrEqual(m.vw + 0.5);
      expect(m.scrollW, "래퍼가 표를 잘라내지 않는다").toBeLessThanOrEqual(m.clientW + 1);
      // 구간표 행 · 합계 · 기준 3행(가·나·다목) 모두 인쇄에 남는다
      await expect(page.getByTestId(/^nbl-state-history-interval-\d+$/)).toHaveCount(2);
      await expect(page.getByTestId("nbl-state-history-total-row")).toBeVisible();
      for (const k of ["ga", "na", "da"]) {
        const li = page.getByTestId(`nbl-state-history-criterion-${k}`);
        await expect(li).toBeVisible();
        const box = await li.boundingBox();
        expect(box && box.x >= 0 && box.x + box.width <= m.vw + 0.5, `기준 ${k} 행이 내용폭 안`).toBe(true);
      }
      await expect(page.getByTestId("nbl-state-history-criteria-verdict")).toBeVisible();
      await period.scrollIntoViewIfNeeded();
      await period.screenshot({ path: "e2e/_artifacts/u3-print-period.png" });
    } finally {
      await page.emulateMedia({ media: "screen" });
    }
  });
});
