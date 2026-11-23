/**
 * transfer-nbl-other-state-history-e3-1.spec.ts
 *
 * NBL-STATE-HISTORY-E3-① (U4) — 기타토지 «재산세 과세 구분 변경 사건»(`tax_type_changed`) — 입력 → 계산 → 결과 (엔진 계획서 §6 M12).
 * 선례: `transfer-nbl-other-state-history-u3.spec.ts`(sessionStorage 시드 + 화면에서 사건 입력).
 *
 * 검증:
 *  1) M12 — 건물은 그대로, 별도합산 → 종합합산(2022-06-01): 화면 입력(철거 없음) → 미리보기 2행 → body에 `tax_type_changed` + 직전 구분 도달(침묵 strip 방지) → 사업용 + 결과 구간표 2행.
 *     대조군 «바뀐 적 없습니다»는 비사업용(현행: 양도일 현재 종합합산을 전 기간에 적용).
 *  2) 건축물 없는 구간의 구분 변경은 ⑧이 막고 그 행의 «종류» 칸으로 점프한다 — 「건축물 있음」 토글(건축물 사건 0건이면 보인다)을 켜면 통과.
 *  3) 같은 날 사건(신축 + 구분 변경) 차단 — 점프.
 *  4) 변경 직전 구분 «모름»: 확인 필요 안내 + body "" + 비사업용(종합합산 + 확인 필요).
 *  5) 변경 전후 같은 구분: 비차단 안내만(계산은 진행) · 375px 폭에서 종류 3종 라디오가 화면 안.
 *  6) 축 B 지분(fractional): 재산세 변경 사건이 지분별 구간표 2행씩으로 이어진다.
 *  7) 시각: 입력 영역·결과 카드의 라이트/다크 대비 · 결과 카드 375px 페이지 가로 스크롤 없음(스크린샷 `e2e/_artifacts/e3-1-*.png`).
 *
 * 폼은 sessionStorage로 시드한다. 외부 API 의존 없음 — mock 불필요.
 *
 * 실행: E2E_PORT=<포트> npx playwright test e2e/transfer-nbl-other-state-history-e3-1.spec.ts
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { expectDarkContrast, expectLightContrast } from "./_helpers/dark-contrast";
import { expectNoPageHScroll } from "./_helpers/no-page-hscroll";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Resp = { status: number; req: Record<string, any>; json: Record<string, any> };
type Kind = "built" | "removed" | "taxchange";
type Ptax = "exempt" | "special_sum" | "separate" | "comprehensive" | "unknown";

const BASE_FORM = { transferDate: "2024-01-01", filingDate: "2024-03-31", contractTotalPrice: "1000000000" };
/** 기타토지 정밀 판정 ON · 취득 2014-01-01(소유 3,651일) · 양도 2024-01-01 — 엔진 계획서 §6 공통 시료. 질문(모드)은 비워 둔다(화면에서 답한다). */
const LAND = {
  assetKind: "land", acquisitionArea: "1000", transferArea: "1000", addressJibun: "서울 강남구 테스트동 1",
  acquisitionCause: "purchase", acquisitionDate: "2014-01-01", fixedAcquisitionPrice: "300000000", actualSalePrice: "1000000000", standardPriceAtTransfer: "500000000",
  isNonBusinessLand: true, nblUseDetailedJudgment: true, nblLandType: "other_land", nblZoneType: "general_residential",
  nblOtherStateHistoryMode: "", nblOtherStateEvents: [],
};
/** 양도일 현재 «건축물 있음(250㎡ ≤ 배율 한도) + 종합합산» — 별도합산이던 건물이 2022-06-01에 종합합산으로 바뀐 M12의 꼬리. */
const BUILDING_COMPREHENSIVE = { nblOtherHasBuilding: true, nblOtherBuildingFloorArea: "250", nblOtherPropertyTaxType: "comprehensive" };
const HALF = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "" };

async function waitHydrated(page: Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  }, undefined, { timeout: 30_000 });
}

async function seed(page: Page, assets: unknown[], mode: "single" | "fractional" = "single") {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const formData = { ...createDefaultTransferFormData(), ...BASE_FORM, assetSplitMode: mode, bundledSaleMode: "actual", assets };
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

/** 라디오를 누르고 React가 렌더한 결과(체크)를 확인한다(e2e/CLAUDE.md §6). */
async function pick(radio: Locator) {
  await radio.click();
  await expect(radio).toBeChecked();
}

const chooseMode = (page: Page, mode: "unchanged" | "changed" | "unknown") => pick(page.getByTestId(`nbl-other-state-mode-${mode}`));

async function setEventDate(page: Page, i: number, iso: string) {
  const [y, m, d] = iso.split("-");
  const date = page.getByTestId(`nbl-other-state-event-${i}-date`);
  await date.getByLabel("연도").fill(y);
  await date.getByLabel("월").fill(m);
  await date.getByLabel("일").fill(d);
  await expect(date.getByLabel("연도")).toHaveValue(y);
  await expect(date.getByLabel("일")).toHaveValue(d);
}

/** 사건 행을 더하고 종류·날짜(·변경/철거 직전 구분)를 입력한다. */
async function addEvent(page: Page, kind: Kind, date: string, before?: Ptax) {
  const rows = page.locator('[data-testid^="nbl-other-state-event-"][data-testid$="-date"]');
  const i = await rows.count();
  await page.getByTestId("nbl-other-state-event-add").click();
  await expect(rows).toHaveCount(i + 1);
  await pick(page.getByTestId(`nbl-other-state-event-${i}-kind-${kind}`));
  await setEventDate(page, i, date);
  if (before) await pick(page.getByTestId(`nbl-other-state-event-${i}-ptax-${before}`));
  return i;
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

/** 오류 항목을 눌렀을 때 포커스가 그 키의 앵커 안에 있고 화면에 보이는가(`transfer-validation-field-jump.spec.ts`와 같은 판정). */
async function expectJumpTo(page: Page, message: RegExp, fieldKey: string) {
  const item = page.getByTestId("validation-issues").getByRole("button", { name: message });
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

test.describe("기타토지 재산세 과세 구분 변경 사건(E3-①) — 입력 → 계산 → 결과", () => {
  test("M12: 건물 그대로 · 별도합산 → 종합합산(2022-06-01) — 화면 입력(철거 없음) → 미리보기 2행 → body 도달 → 사업용 + 구간표 2행 · 대조군 «바뀐 적 없음»은 비사업용", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, [landAsset(BUILDING_COMPREHENSIVE)]);
    await gotoHolding(page);
    await chooseMode(page, "changed");
    // 건축물 사건 0건 — 「건축물 있음」 토글이 보인다(건축물 유무를 받을 곳)
    await expect(page.getByTestId("nbl-other-has-building-toggle")).toBeVisible();
    const i = await addEvent(page, "taxchange", "2022-06-01");
    await expect(page.getByTestId("nbl-other-has-building-toggle"), "건축물 사건이 없으면 사건을 더해도 토글은 남는다").toBeVisible();
    await expect(page.getByTestId("nbl-state-history-at-transfer")).toHaveCount(0);
    // 직전 구분 «모름»(미선택) 확인 필요 안내 → 별도합산 선택
    await expect(page.getByTestId(`nbl-other-state-event-${i}-ptax-unknown-notice`)).toBeVisible();
    await pick(page.getByTestId(`nbl-other-state-event-${i}-ptax-separate`));
    await expect(page.getByTestId(`nbl-other-state-event-${i}-ptax-unknown-notice`)).toHaveCount(0);
    await expect(page.getByTestId(`nbl-other-state-event-${i}-after`)).toContainText("변경 후: 종합합산(양도일 현재 선언 기준)");
    await expect(page.getByTestId(`nbl-other-state-event-${i}-same-notice`)).toHaveCount(0);

    // 미리보기 = 엔진 leaf 구간 — 구간1 별도합산 «충족» · 꼬리 «결과 계산 후 확정»
    await expect(page.getByTestId("nbl-state-history-preview-row-0")).toContainText("2014-01-02 ~ 2022-05-31");
    await expect(page.getByTestId("nbl-state-history-preview-row-0")).toContainText("3,072일");
    await expect(page.getByTestId("nbl-state-history-preview-row-0")).toContainText("별도합산(선언)");
    await expect(page.getByTestId("nbl-state-history-preview-row-0")).toContainText("충족");
    await expect(page.getByTestId("nbl-state-history-preview-row-1")).toContainText("2022-06-01 ~ 2023-12-31");
    await expect(page.getByTestId("nbl-state-history-preview-row-1")).toContainText("579일");
    await expect(page.getByTestId("nbl-state-history-preview-row-1")).toContainText("결과 계산 후 확정");

    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    const raw = r.req.nonBusinessLandRaw;
    expect(raw?.nblOtherStateHistoryMode).toBe("changed");
    expect(raw?.nblOtherStateEvents, "새 종류 + 변경 직전 구분 도달(④⑫⑬⑭ — 침묵 strip·모름 소실 방지)").toEqual([
      { kind: "tax_type_changed", date: "2022-06-01", propertyTaxTypeBefore: "separate" },
    ]);
    expect(raw?.nblOtherHasBuilding, "건축물 사건이 없으므로 토글 저장값(true)이 그대로 실린다").toBe(true);

    await expect(banner.business(page)).toBeVisible();
    const rows = page.getByTestId(/^nbl-state-history-interval-\d+$/);
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("2014-01-02 ~ 2022-05-31");
    await expect(rows.nth(0)).toContainText("3,072일");
    await expect(rows.nth(0)).toContainText("있음");
    await expect(rows.nth(0)).toContainText("별도합산");
    await expect(rows.nth(0)).toContainText("사업용");
    await expect(rows.nth(1)).toContainText("2022-06-01 ~ 2023-12-31");
    await expect(rows.nth(1)).toContainText("579일");
    await expect(rows.nth(1)).toContainText("있음");
    await expect(rows.nth(1)).toContainText("종합합산");
    await expect(page.getByTestId("nbl-state-history-period")).toContainText("재산세 구분 이력 반영");
    console.log("[M12] 산출세액", JSON.stringify(r.json.data?.result?.calculatedTax ?? r.json.data?.aggregated?.totalTax));

    // 대조군 — 같은 토지를 «바뀐 적 없습니다»로 넣으면 양도일 현재(종합합산)가 전 기간에 적용돼 비사업용이다. 이력이 결과를 돌렸다.
    await seed(page, [landAsset(BUILDING_COMPREHENSIVE)]);
    await gotoHolding(page);
    await chooseMode(page, "unchanged");
    const base = await calc(page);
    expect(base.status, JSON.stringify(base.json).slice(0, 300)).toBe(200);
    expect(base.req.nonBusinessLandRaw?.nblOtherStateHistoryMode).toBe("unchanged");
    await expect(banner.nonBusiness(page)).toBeVisible();
    console.log("[M12 대조군] 산출세액", JSON.stringify(base.json.data?.result?.calculatedTax ?? base.json.data?.aggregated?.totalTax));
  });

  test("건축물 없는 구간의 구분 변경: ⑧ 차단 + 그 행의 «종류» 칸으로 점프 → 「건축물 있음」 토글을 켜면 통과", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, [landAsset({ nblOtherHasBuilding: false, nblOtherPropertyTaxType: "comprehensive" })]);
    await gotoHolding(page);
    await chooseMode(page, "changed");
    await addEvent(page, "taxchange", "2022-06-01", "separate");
    // 건축물 없음 + 구분 변경 — 미리보기를 그릴 수 없다(구간을 지어내지 않는다)
    await expect(page.getByTestId("nbl-state-history-preview-empty")).toBeVisible();
    await expect(page.getByTestId("nbl-other-state-event-0-after")).toHaveCount(0);

    await calcExpectBlocked(page);
    await expectJumpTo(page, /재산세 과세 구분 변경 사건 1번째 행 — 이 날짜 직전에는 건축물이 없습니다/, "nblOtherStateEvents.0.kind");

    // 토글을 켠다(건축물 유무를 받는 곳) + 바닥면적 입력
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    const toggle = page.getByTestId("nbl-other-has-building-toggle").getByRole("switch");
    await expect(async () => {
      if ((await toggle.getAttribute("aria-checked")) !== "true") await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "true", { timeout: 3_000 });
    }).toPass({ timeout: 15_000 });
    await expect(page.getByTestId("nbl-state-history-preview-row-1")).toBeVisible();
    await page.locator('[data-field="nblOtherBuildingFloorArea"] input').first().fill("250");
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.req.nonBusinessLandRaw?.nblOtherHasBuilding).toBe(true);
  });

  test("같은 날 사건(신축 + 구분 변경 같은 날): ⑧ 차단 — 종류별 접두 «재산세 과세 구분 변경 사건 2번째 행» + 날짜 칸으로 점프", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, [landAsset({ nblOtherHasBuilding: true, nblOtherBuildingFloorArea: "250", nblOtherPropertyTaxType: "comprehensive" })]);
    await gotoHolding(page);
    await chooseMode(page, "changed");
    await addEvent(page, "built", "2019-01-01");
    // 건축물 사건이 1건 이상이면 토글은 숨고 줄이 대신한다 — 마지막 «건축물» 사건 기준
    await expect(page.getByTestId("nbl-other-has-building-toggle")).toHaveCount(0);
    await addEvent(page, "taxchange", "2019-01-01", "separate");
    await expect(page.getByTestId("nbl-state-history-at-transfer")).toContainText("양도일 현재 건축물: 있음");
    await expect(page.getByTestId("nbl-state-history-at-transfer")).toContainText("마지막 건축물 사건: 건축물 신축");

    await calcExpectBlocked(page);
    await expectJumpTo(page, /재산세 과세 구분 변경 사건 2번째 행 — 사건일\(2019-01-01\)이 앞 사건과 같은 날입니다/, "nblOtherStateEvents.1.date");
    await setEventDate(page, 1, "2022-06-01");
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.req.nonBusinessLandRaw?.nblOtherStateEvents).toEqual([
      { kind: "building_built", date: "2019-01-01", propertyTaxTypeBefore: "" },
      { kind: "tax_type_changed", date: "2022-06-01", propertyTaxTypeBefore: "separate" },
    ]);
  });

  test("변경 직전 구분 «모름»(미선택): 확인 필요 안내 · body \"\" · 종합합산 + 확인 필요 → 비사업용 · 결과 구간표에 «모름 — 확인 필요»", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, [landAsset({ ...BUILDING_COMPREHENSIVE, nblOtherPropertyTaxType: "separate" })]);
    await gotoHolding(page);
    await chooseMode(page, "changed");
    await addEvent(page, "taxchange", "2022-06-01"); // 직전 구분 미선택 = 모름
    await expect(page.getByTestId("nbl-other-state-event-0-ptax-unknown")).toBeChecked(); // 표시 fallback — 저장값 ""
    await expect(page.getByTestId("nbl-other-state-event-0-ptax-unknown-notice")).toContainText("재산세 과세 구분 변경 전 구간의 구분을 모르면");
    await expect(page.getByTestId("nbl-state-history-preview-row-0")).toContainText("종합합산(선언 없음 — 확인 필요)");

    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.req.nonBusinessLandRaw?.nblOtherStateEvents).toEqual([{ kind: "tax_type_changed", date: "2022-06-01", propertyTaxTypeBefore: "" }]);
    await expect(banner.nonBusiness(page)).toBeVisible();
    await expect(page.getByTestId("nbl-state-history-interval-0")).toContainText("종합합산(모름 — 확인 필요)");
  });

  test("변경 전후 같은 구분: 비차단 안내만(계산은 진행) · 375px 폭에서 종류 3종 라디오가 화면 안", async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 375, height: 900 });
    await seed(page, [landAsset({ ...BUILDING_COMPREHENSIVE, nblOtherPropertyTaxType: "separate" })]);
    await gotoHolding(page);
    await chooseMode(page, "changed");
    await addEvent(page, "taxchange", "2022-06-01", "separate"); // 변경 전 = 변경 후(꼬리 별도합산)
    await expect(page.getByTestId("nbl-other-state-event-0-same-notice")).toContainText("변경 전후 구분이 같습니다. 바뀐 적이 없으면 이 행을 삭제하세요.");

    await page.getByTestId("nbl-other-state-event-0-kind-taxchange").scrollIntoViewIfNeeded();
    // 페이지 전체의 가로 넘침은 이 PR과 무관한 기존 현상이다(§168의14③ 의제 사유 토글 행 — 이력 행이 0건이어도 scrollWidth 471, 실측) — 이 섹션의 폭만 본다.
    const sectionRight = await page.getByTestId("nbl-other-state-events").evaluate((el) => el.getBoundingClientRect().right);
    expect(sectionRight, "사건 입력 영역이 375px 안").toBeLessThanOrEqual(375.5);
    const kinds = await Promise.all(["built", "removed", "taxchange"].map((k) => page.getByTestId(`nbl-other-state-event-0-kind-${k}`).locator("xpath=ancestor::label[1]").boundingBox()));
    for (const b of kinds) expect(b && b.x >= 0 && b.x + b.width <= 375 + 0.5, "종류 라디오 카드가 화면 폭 안").toBe(true);

    const r = await calc(page); // 막지 않는다
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
  });
});

test.describe("기타토지 재산세 과세 구분 변경 사건(E3-①) — 축 B 지분", () => {
  test("지분 2장(취득 2014-01-01 · 2014-01-02): 변경 사건 하나가 지분마다 자기 구간표 2행(별도합산 → 종합합산)으로 이어진다 · body 도달", async ({ page }) => {
    test.setTimeout(150_000);
    const first = landAsset({ ...BUILDING_COMPREHENSIVE, ...HALF });
    const second = { ...makeDefaultAsset(2), acquisitionCause: "purchase", acquisitionDate: "2014-01-02", fixedAcquisitionPrice: "300000000", ...HALF };
    await seed(page, [first, second], "fractional");
    await gotoHolding(page);
    await expect(page.getByTestId("nbl-other-state-history"), "이력 질문은 첫 카드에만 있다").toHaveCount(1);
    await chooseMode(page, "changed");
    await addEvent(page, "taxchange", "2022-06-01", "separate");

    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.req.nonBusinessLandRaw?.nblOtherStateEvents).toEqual([{ kind: "tax_type_changed", date: "2022-06-01", propertyTaxTypeBefore: "separate" }]);
    const periods = page.getByTestId("nbl-state-history-period");
    await expect(periods).toHaveCount(2, { timeout: 20_000 });
    for (const n of [0, 1]) {
      const iv = periods.nth(n).getByTestId(/^nbl-state-history-interval-\d+$/);
      await expect(iv).toHaveCount(2);
      await expect(iv.nth(0)).toContainText("별도합산");
      await expect(iv.nth(1)).toContainText("종합합산");
      await expect(iv.nth(1)).toContainText("2022-06-01 ~ 2023-12-31");
    }
    await expect(periods.nth(0).getByTestId("nbl-state-history-interval-0")).toContainText("2014-01-02 ~ 2022-05-31");
    await expect(periods.nth(1).getByTestId("nbl-state-history-interval-0")).toContainText("2014-01-03 ~ 2022-05-31");
  });
});

test.describe("기타토지 재산세 과세 구분 변경 사건(E3-①) — 시각(라이트·다크·375px)", () => {
  test("M12 입력 영역·결과 카드: 라이트/다크 글자 대비 4.5 이상 · 결과 카드 375px 페이지 가로 스크롤 없음", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, [landAsset({ ...BUILDING_COMPREHENSIVE, nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [{ kind: "tax_type_changed", date: "2022-06-01", propertyTaxTypeBefore: "separate" }] })]);
    await gotoHolding(page);
    const section = page.getByTestId("nbl-other-state-history");
    await section.scrollIntoViewIfNeeded();
    await section.screenshot({ path: "e2e/_artifacts/e3-1-input-light.png" });
    await expectLightContrast(page, section);
    await expectDarkContrast(page, section);
    await section.screenshot({ path: "e2e/_artifacts/e3-1-input-dark.png" });
    await page.emulateMedia({ media: "screen", colorScheme: "light" });

    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    const card = page.getByTestId("nbl-state-history-period");
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: "e2e/_artifacts/e3-1-card-light.png" });
    await expectLightContrast(page, card);
    await expectDarkContrast(page, card);
    await card.screenshot({ path: "e2e/_artifacts/e3-1-card-dark.png" });
    await expectNoPageHScroll(page, 375);
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: "e2e/_artifacts/e3-1-card-375.png" });
  });
});
