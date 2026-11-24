/**
 * transfer-nbl-other-state-history-e3-5d.spec.ts
 *
 * NBL-STATE-HISTORY-E3-⑤ E3f-3 U-4 — 빈집정비 철거 빈집 부속토지의 «국가 등 공용·공공용 사용» 예외(「지방세법 시행령」 §103의2 2호 단서) 하위 4칸 — 화면 E2E.
 * 계획서: docs/01-plan/features/nbl-state-history-e3-5d-vacant-public-use.ui.plan.md §3 · §6 · 엔진 계획서 §6.1
 *
 *  E5-11a  K-7 시료(취득 2018-06-01 · 주택 철거 2021-06-02 · 구분 변경 2024-08-01 · 양도 2024-09-01) — 건축 외 용도 «예» + 빈집정비 «예» → 공용 사용 «예» → 유료 «예» → 개시일·종료일 · 창 154일 · 비사업용 520/2,283 · 세액 283,080,000 불변 · «아니오»는 221,730,000
 *  E5-11b  세액이 바뀌는 시료(취득 2023-03-01 · 철거 2024-03-01 · 구간 끝 2026-12-01 · 양도 2027-01-15 · 공용 2025-01-01 ~ 2026-12-01) — 304,920,000 → 239,370,000
 *  E5-11c  ⑧ 차단 + 필드 점프: 공용 사용·유료 미선택 · 개시일 빈칸 · **종료일 빈칸(구간 끝으로 읽지 않는다)** → 요청이 나가지 않고 그 칸으로 점프
 *  E5-11d  유료 «아니오»(무상) — 막지 않고 `demolished_other_use` 접힘 + 「비과세·면제 토지」 안내 · 계산 가능(비사업용)
 *  E5-11e  주택부수토지 카드(V-15) — 같은 사슬로 4칸이 열리고 body에 도달
 *  E5-12   상위 답(빈집정비)을 «아니오»로 바꾸면 하위 블록이 숨고 body에서 4칸이 소실 · 되돌리면 복원 · 재산세 구분을 바꾸면 리셋
 *  E5-V4   시각: 라이트/다크 글자 대비 4.5 · 375px 가로 넘침 0 · 날짜 두 칸 세로 쌓기
 *
 * 폼은 sessionStorage로 시드한다. 외부 API 의존 없음 — mock 불필요.
 * 실행: E2E_PORT=<포트> npx playwright test e2e/transfer-nbl-other-state-history-e3-5d.spec.ts
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { expectDarkContrast, expectLightContrast } from "./_helpers/dark-contrast";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Resp = { status: number; req: Record<string, any>; json: Record<string, any> };

const BASE_FORM = { transferDate: "2024-09-01", filingDate: "2024-11-30", contractTotalPrice: "1000000000" };
const LAND = {
  assetKind: "land", acquisitionArea: "1000", transferArea: "1000", addressJibun: "서울 강남구 테스트동 1",
  acquisitionCause: "purchase", acquisitionDate: "2018-06-01", fixedAcquisitionPrice: "300000000", actualSalePrice: "1000000000", standardPriceAtTransfer: "500000000",
  isNonBusinessLand: true, nblUseDetailedJudgment: true, nblLandType: "other_land", nblZoneType: "general_residential", nblIsMetropolitanArea: "no",
  nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [],
};
const landAsset = (over: Record<string, unknown> = {}) => ({ ...makeDefaultAsset(1), ...LAND, ownershipNumerator: "100", ownershipDenominator: "100", ...over });

async function waitHydrated(page: Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  }, undefined, { timeout: 30_000 });
}

async function seed(page: Page, assets: unknown[], form: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const formData = { ...createDefaultTransferFormData(), ...BASE_FORM, ...form, assetSplitMode: "single", bundledSaleMode: "actual", assets };
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), { state: { formData, currentStep: 0, pendingMigration: false }, version: 0 });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await waitHydrated(page);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

async function gotoHolding(page: Page) {
  await page.getByRole("button", { name: "보유 상황" }).first().click();
  await expect(page.getByTestId("nbl-other-state-history").first(), "건축물 이력 질문이 보여야 함").toBeVisible({ timeout: 20_000 });
}

/** 라디오를 누르고 React가 렌더한 결과(체크)를 확인한다(e2e/CLAUDE.md §6). */
async function pick(radio: Locator) {
  await radio.click();
  await expect(radio).toBeChecked();
}

async function setDate(scope: Locator, iso: string) {
  const [y, m, d] = iso.split("-");
  await scope.getByLabel("연도").fill(y);
  await scope.getByLabel("월").fill(m);
  await scope.getByLabel("일").fill(d);
  await expect(scope.getByLabel("연도")).toHaveValue(y);
  await expect(scope.getByLabel("일")).toHaveValue(d);
}

async function calc(page: Page): Promise<Resp> {
  for (const step of ["감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const r = await resp;
  return { status: r.status(), req: r.request().postDataJSON(), json: await r.json() };
}

/** 계산 요청이 **나가지 않는지** — ⑧ 차단 확인용. */
async function calcBlocked(page: Page): Promise<boolean> {
  let posted = false;
  const onReq = (r: { url(): string; method(): string }) => {
    if (r.url().includes("/api/calc/transfer") && r.method() === "POST") posted = true;
  };
  page.on("request", onReq);
  for (const step of ["감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.waitForTimeout(1500);
  page.off("request", onReq);
  return !posted;
}

const taxOf = (r: Resp): number => Number(r.json.data?.result?.calculatedTax ?? r.json.data?.aggregated?.totalTax);
const nblOf = (r: Resp): Record<string, any> | undefined => r.json.data?.result?.nonBusinessLandJudgmentDetail;
const tid = (i: number, tail: string) => `nbl-other-state-event-${i}-${tail}`;
const facts = (i: number, key: string) => tid(i, `demolished-${key}`);
const anchorOf = (page: Page, i: number, field: string) => page.locator(`[data-field="nblOtherStateEvents.${i}.${field}"]`);
const win = (page: Page, i = 2) => page.getByTestId(tid(i, "demolished-window"));
const foldNotice = (page: Page, i = 2) => page.getByTestId(tid(i, "demolished-fold-notice"));
const puNotice = (page: Page, i = 2) => page.getByTestId(tid(i, "demolished-publicuse-accepted-notice"));
const PU_KEYS = ["demolishedPublicUseBefore", "demolishedPublicUsePaidBefore", "demolishedPublicUseFromBefore", "demolishedPublicUseToBefore"];

/** 닫는 행의 재산세 구분 «별도합산» → 근거 «철거ㆍ멸실»을 화면에서 고른다. */
async function declareDemolished(page: Page, i: number) {
  await pick(page.getByTestId(tid(i, "ptax-separate")));
  await pick(page.getByTestId(tid(i, "basis-demolished")));
}

/** 주택 철거 행 + 구분 변경 닫는 행(구분·근거·사실 칸은 화면에서 입력) 시료 — 엔진 K-7 · P-1 시료와 같다. */
const houseCase = (o: { acq: string; bld: string; rem: string; close: string }) => ({
  acquisitionDate: o.acq,
  nblOtherHasBuilding: false, nblOtherPropertyTaxType: "comprehensive",
  nblOtherStateEvents: [
    { kind: "building_built", date: o.bld, propertyTaxTypeBefore: "" },
    { kind: "building_removed", date: o.rem, propertyTaxTypeBefore: "separate", buildingKindBefore: "house", houseFootprintBefore: "400" },
    { kind: "tax_type_changed", date: o.close, propertyTaxTypeBefore: "" },
  ],
});
const K7 = () => houseCase({ acq: "2018-06-01", bld: "2020-06-01", rem: "2021-06-02", close: "2024-08-01" });
const P1 = () => houseCase({ acq: "2023-03-01", bld: "2023-03-02", rem: "2024-03-01", close: "2026-12-01" });
/** 닫는 행(구분 변경)에 구분·근거·사실 칸을 미리 채운 시료 — 결과 화면에서는 입력 단계 버튼이 없어 «대조 실행»은 다시 시드한다. */
const withClosing = (asset: Record<string, any>, extra: Record<string, unknown>) => ({
  ...asset,
  nblOtherStateEvents: asset.nblOtherStateEvents.map((e: any, i: number, all: any[]) =>
    i === all.length - 1 ? { ...e, propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished", demolishedPermitBefore: "yes", demolishedOtherUseBefore: "yes", demolishedVacantHouseBefore: "yes", ...extra } : e,
  ),
});
const PU_ALL_P1 = { demolishedPublicUseBefore: "yes", demolishedPublicUsePaidBefore: "yes", demolishedPublicUseFromBefore: "2025-01-01", demolishedPublicUseToBefore: "2026-12-01" };
const FORM_K7 = { transferDate: "2024-09-01", filingDate: "2024-11-30" };
const FORM_P1 = { transferDate: "2027-01-15", filingDate: "2027-03-31" };

/** 허가 «예» · 건축 외 용도 «예» · 빈집정비 «예» — 공용 사용 칸이 열린다. */
async function answerUpper(page: Page, otherUse: "yes" | "no" = "yes") {
  await pick(page.getByTestId(facts(2, "permit-yes")));
  await pick(page.getByTestId(facts(2, "otheruse-" + otherUse)));
  await pick(page.getByTestId(facts(2, "vacanthouse-yes")));
}
const dateIn = (page: Page, which: "from" | "to") => page.getByTestId(facts(2, `publicuse-${which}`));

test.describe("E3-⑤ E3f-3 U-4 — 빈집 부속토지 국가 등 공용·공공용 사용 예외 하위 4칸", () => {
  test("E5-11a: K-7 — 하위 칸이 사슬 순서로 열린다 · 창 154일(공용 사용 기간으로 한정) · 비사업용 520/2,283 · 세액 283,080,000 불변(현행 접힘과 같음) · 건축 외 용도 «아니오»는 221,730,000", async ({ page }) => {
    test.setTimeout(300_000);
    await seed(page, [landAsset(K7())], FORM_K7);
    await gotoHolding(page);
    await declareDemolished(page, 2);
    // 상위 답 전에는 공용 사용 블록이 없다
    await expect(page.getByTestId(tid(2, "demolished-publicuse"))).toHaveCount(0);
    await pick(page.getByTestId(facts(2, "permit-yes")));
    await pick(page.getByTestId(facts(2, "otheruse-yes")));
    await expect(page.getByTestId(tid(2, "demolished-publicuse")), "빈집정비 «예» 전에는 없다").toHaveCount(0);
    await pick(page.getByTestId(facts(2, "vacanthouse-yes")));
    // ① 공용 사용 칸만 — 빈집정비 칸 바로 뒤(DOM 순서)
    await expect(anchorOf(page, 2, "demolishedPublicUseBefore")).toBeVisible();
    await expect(anchorOf(page, 2, "demolishedPublicUsePaidBefore")).toHaveCount(0);
    await expect(dateIn(page, "from")).toHaveCount(0);
    const order = await page.evaluate(() => {
      const q = (f: string) => document.querySelector(`[data-field="nblOtherStateEvents.2.${f}"]`)!;
      return !!(q("demolishedVacantHouseBefore").compareDocumentPosition(q("demolishedPublicUseBefore")) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(order, "빈집정비 → 공용 사용 순").toBe(true);
    await expect(win(page), "사실 칸이 모두 답해지기 전에는 미리보기가 없다").toHaveCount(0);

    await pick(page.getByTestId(facts(2, "publicuse-yes")));
    await expect(anchorOf(page, 2, "demolishedPublicUsePaidBefore")).toBeVisible();
    await expect(dateIn(page, "from")).toHaveCount(0);
    await pick(page.getByTestId(facts(2, "publicusepaid-yes")));
    await expect(dateIn(page, "from")).toBeVisible();
    await expect(dateIn(page, "to")).toBeVisible();
    await expect(win(page), "날짜가 비어 있으면 미리보기가 없다").toHaveCount(0);
    // 종료일 빈칸은 구간 끝으로 읽지 않는다 — 개시일만 입력해도 창이 없다
    await setDate(dateIn(page, "from"), "2024-01-01");
    await expect(win(page), "종료일 빈칸 — 구간 끝까지로 읽지 않는다").toHaveCount(0);
    await setDate(dateIn(page, "to"), "2024-07-01");
    await expect(win(page)).toHaveText("한시 지위 인정 기간: 2024-01-01 ~ 2024-06-02(154일 · 한시 기간 3년 · 국가 등 공용 사용 기간만)");
    await expect(puNotice(page)).toBeVisible();
    await expect(puNotice(page)).toContainText("그 기간 밖은 건축 외 용도 사용 여부를 나누지 않아 인정하지 않았습니다");
    await expect(puNotice(page)).toContainText("확인 필요");
    await expect(foldNotice(page)).toHaveCount(0);
    await expect(page.getByTestId("nbl-state-history-preview-row-2")).toContainText("별도합산(나대지 — 철거·멸실 근거 · 한시 기간 중 공용 사용 기간만) · 인정 2024-01-01 ~ 2024-06-02(154일)");

    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.req.nonBusinessLandRaw?.nblOtherStateEvents?.[2]).toMatchObject({
      kind: "tax_type_changed", date: "2024-08-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished",
      demolishedPermitBefore: "yes", demolishedOtherUseBefore: "yes", demolishedVacantHouseBefore: "yes",
      demolishedPublicUseBefore: "yes", demolishedPublicUsePaidBefore: "yes", demolishedPublicUseFromBefore: "2024-01-01", demolishedPublicUseToBefore: "2024-07-01",
    });
    const nbl = nblOf(r);
    console.log("[E5-11a 공용 2024-01-01~2024-07-01] 산출세액", taxOf(r), "사업용일수", nbl?.effectiveBusinessDays, "/", nbl?.totalOwnershipDays);
    expect(taxOf(r)).toBe(283_080_000);
    expect([nbl?.effectiveBusinessDays, nbl?.totalOwnershipDays]).toEqual([520, 2283]);
    const iv = page.getByTestId("nbl-state-history-interval-2");
    await expect(iv).toContainText("별도합산(나대지 — 철거·멸실 근거 · 한시 기간 중 공용 사용 기간만)");
    await expect(iv).toContainText("한시 지위 인정 2024-01-01 ~ 2024-06-02(154일 · 한시 기간 3년)");
    await expect(page.getByText(/사용자가 확인해 선택한 사실\(공용 사용 · 유료\)로 보아 입력한 사용 기간으로 한정해 적용/).first(), "결과의 확인 필요 고지").toBeVisible();

    // 대조: 건축 외 용도 «아니오»(하위 4칸 stale 값이 저장돼 있어도 하위 블록이 숨고 body에 4칸이 없다) → 세액 221,730,000
    await seed(page, [landAsset(withClosing(K7(), { demolishedOtherUseBefore: "no", demolishedPublicUseBefore: "yes", demolishedPublicUsePaidBefore: "yes", demolishedPublicUseFromBefore: "2024-01-01", demolishedPublicUseToBefore: "2024-07-01" }))], FORM_K7);
    await gotoHolding(page);
    await expect(page.getByTestId(facts(2, "otheruse-no"))).toBeChecked();
    await expect(page.getByTestId(tid(2, "demolished-publicuse"))).toHaveCount(0);
    const no = await calc(page);
    expect(no.status, JSON.stringify(no.json).slice(0, 300)).toBe(200);
    for (const k of PU_KEYS) expect(no.req.nonBusinessLandRaw?.nblOtherStateEvents?.[2], k).not.toHaveProperty(k);
    console.log("[E5-11a 건축 외 용도 아니오] 산출세액", taxOf(no));
    expect(taxOf(no)).toBe(221_730_000);
  });

  test("E5-11b: 세액이 바뀌는 시료(P-1) — 공용 사용 2025-01-01 ~ 2026-12-01 → 사업용 1,064/1,415 · 239,370,000(종전 접힘 304,920,000) · 공용 사용 «아니오»는 접힘 304,920,000", async ({ page }) => {
    test.setTimeout(300_000);
    await seed(page, [landAsset(P1())], FORM_P1);
    await gotoHolding(page);
    await declareDemolished(page, 2);
    await answerUpper(page);
    await pick(page.getByTestId(facts(2, "publicuse-yes")));
    await pick(page.getByTestId(facts(2, "publicusepaid-yes")));
    await setDate(dateIn(page, "from"), "2025-01-01");
    await setDate(dateIn(page, "to"), "2026-12-01");
    await expect(win(page)).toHaveText("한시 지위 인정 기간: 2025-01-01 ~ 2026-11-30(699일 · 한시 기간 3년 · 국가 등 공용 사용 기간만)");
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.req.nonBusinessLandRaw?.nblOtherStateEvents?.[2]).toMatchObject({ demolishedPublicUseFromBefore: "2025-01-01", demolishedPublicUseToBefore: "2026-12-01" });
    const nbl = nblOf(r);
    console.log("[E5-11b 공용 2025-01-01~2026-12-01] 산출세액", taxOf(r), "사업용일수", nbl?.effectiveBusinessDays, "/", nbl?.totalOwnershipDays);
    expect(taxOf(r)).toBe(239_370_000);
    expect([nbl?.isNonBusinessLand, nbl?.effectiveBusinessDays, nbl?.totalOwnershipDays]).toEqual([false, 1064, 1415]);
    await expect(page.getByText("사업용 토지 — 일반세율이 적용됩니다.")).toBeVisible();

    // 대조: 공용 사용 «아니오»(유료·날짜 stale 값은 저장돼 있다) → 접힘(종전과 같음) 304,920,000 · 비사업용 365/1,415
    await seed(page, [landAsset(withClosing(P1(), PU_ALL_P1))], FORM_P1);
    await gotoHolding(page);
    await pick(page.getByTestId(facts(2, "publicuse-no")));
    await expect(foldNotice(page)).toBeVisible();
    await expect(win(page)).toHaveCount(0);
    const no = await calc(page);
    expect(no.status, JSON.stringify(no.json).slice(0, 300)).toBe(200);
    console.log("[E5-11b 공용 사용 아니오 접힘] 산출세액", taxOf(no), "사업용일수", nblOf(no)?.effectiveBusinessDays);
    expect(taxOf(no)).toBe(304_920_000);
    expect(nblOf(no)?.effectiveBusinessDays).toBe(365);
    for (const k of PU_KEYS.slice(1)) expect(no.req.nonBusinessLandRaw?.nblOtherStateEvents?.[2], k).not.toHaveProperty(k);
    expect(no.req.nonBusinessLandRaw?.nblOtherStateEvents?.[2]).toMatchObject({ demolishedPublicUseBefore: "no" });
  });

  test("E5-11c: ⑧ 차단 + 필드 점프 — 공용 사용 미선택 → 유료 미선택 → 개시일 빈칸 → 종료일 빈칸(구간 끝으로 읽지 않는다) → 채우면 계산", async ({ page }) => {
    test.setTimeout(300_000);
    await seed(page, [landAsset(K7())], FORM_K7);
    await gotoHolding(page);
    await declareDemolished(page, 2);
    await answerUpper(page);
    const issues = page.getByTestId("validation-issues");

    expect(await calcBlocked(page), "공용 사용 미선택").toBe(true);
    await issues.getByRole("button", { name: /국가·지방자치단체·지방자치단체조합이 1년 이상 공용·공공용으로 사용했는지/ }).click();
    await expect(anchorOf(page, 2, "demolishedPublicUseBefore").locator("input").first()).toBeFocused();
    await pick(page.getByTestId(facts(2, "publicuse-yes")));

    expect(await calcBlocked(page), "유료 미선택").toBe(true);
    await issues.getByRole("button", { name: /유료이거나 소유권 유상이전 약정 후 취득 전에 미리 사용한 것이라 재산세가 부과되는지/ }).click();
    await expect(anchorOf(page, 2, "demolishedPublicUsePaidBefore").locator("input").first()).toBeFocused();
    await pick(page.getByTestId(facts(2, "publicusepaid-yes")));

    expect(await calcBlocked(page), "개시일 빈칸").toBe(true);
    await issues.getByRole("button", { name: /공용·공공용 사용 개시일을 입력하세요/ }).click();
    await expect(dateIn(page, "from").getByLabel("연도")).toBeFocused();
    await setDate(dateIn(page, "from"), "2024-01-01");

    expect(await calcBlocked(page), "종료일 빈칸 — 구간 끝까지로 읽지 않고 막는다").toBe(true);
    await issues.getByRole("button", { name: /공용·공공용 사용 종료일을 입력하세요/ }).click();
    await expect(dateIn(page, "to").getByLabel("연도")).toBeFocused();
    await expect(anchorOf(page, 2, "demolishedPublicUseToBefore")).toBeInViewport();
    await expect(win(page)).toHaveCount(0);
    await setDate(dateIn(page, "to"), "2024-07-01");

    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    console.log("[E5-11c 점프 후 계산] 산출세액", taxOf(r));
    expect(taxOf(r)).toBe(283_080_000);
  });

  test("E5-11d: 유료 «아니오»(무상) — 막지 않고 접힘 + «비과세·면제 토지» 안내 · «모름»도 같은 접힘 · 계산 가능(비사업용 283,080,000)", async ({ page }) => {
    test.setTimeout(240_000);
    await seed(page, [landAsset(K7())], FORM_K7);
    await gotoHolding(page);
    await declareDemolished(page, 2);
    await answerUpper(page);
    await pick(page.getByTestId(facts(2, "publicuse-yes")));
    await pick(page.getByTestId(facts(2, "publicusepaid-no")));
    await expect(dateIn(page, "from"), "무상이면 날짜 칸이 없다").toHaveCount(0);
    await expect(foldNotice(page)).toBeVisible();
    await expect(foldNotice(page)).toContainText("비과세·면제 토지");
    await expect(win(page)).toHaveCount(0);
    await expect(puNotice(page)).toHaveCount(0);
    await pick(page.getByTestId(facts(2, "publicusepaid-unknown")));
    await expect(foldNotice(page), "«모름»도 같은 접힘").toContainText("비과세·면제 토지");
    await pick(page.getByTestId(facts(2, "publicusepaid-no")));
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    console.log("[E5-11d 유료 아니오 접힘] 산출세액", taxOf(r));
    expect(taxOf(r)).toBe(283_080_000);
    expect(r.req.nonBusinessLandRaw?.nblOtherStateEvents?.[2]).toMatchObject({ demolishedPublicUseBefore: "yes", demolishedPublicUsePaidBefore: "no" });
    for (const k of PU_KEYS.slice(2)) expect(r.req.nonBusinessLandRaw?.nblOtherStateEvents?.[2], k).not.toHaveProperty(k);
    await expect(page.getByTestId("nbl-state-history-interval-2")).not.toContainText("공용 사용 기간만");
  });

  test("E5-11e: 주택부수토지 카드(V-15) — 모든 철거 행이 주택이라 같은 사슬로 4칸이 열린다 · body 도달 · 결과 라벨", async ({ page }) => {
    test.setTimeout(300_000);
    const housing = landAsset({
      acquisitionDate: "2014-01-01",
      nblLandType: "housing_site", nblHousingFootprint: "250",
      nblOtherStateEvents: [
        { kind: "building_removed", date: "2024-01-15", propertyTaxTypeBefore: "", houseFootprintBefore: "250" },
        { kind: "building_built", date: "2024-09-01", propertyTaxTypeBefore: "" },
      ],
    });
    await seed(page, [housing], { transferDate: "2024-12-01", filingDate: "2025-02-28" });
    await gotoHolding(page);
    await declareDemolished(page, 1);
    await pick(page.getByTestId(facts(1, "permit-yes")));
    await pick(page.getByTestId(facts(1, "otheruse-yes")));
    await pick(page.getByTestId(facts(1, "vacanthouse-yes")));
    await expect(anchorOf(page, 1, "demolishedPublicUseBefore")).toBeVisible();
    await pick(page.getByTestId(facts(1, "publicuse-yes")));
    await pick(page.getByTestId(facts(1, "publicusepaid-yes")));
    await setDate(page.getByTestId(facts(1, "publicuse-from")), "2024-04-01");
    await setDate(page.getByTestId(facts(1, "publicuse-to")), "2024-12-01");
    await expect(page.getByTestId(tid(1, "demolished-window"))).toHaveText("한시 지위 인정 기간: 2024-04-01 ~ 2024-08-31(153일 · 한시 기간 3년 · 국가 등 공용 사용 기간만)");
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.req.nonBusinessLandRaw?.nblOtherStateEvents?.[1]).toMatchObject({
      propertyTaxBasisBefore: "demolished", demolishedPublicUseBefore: "yes", demolishedPublicUsePaidBefore: "yes", demolishedPublicUseFromBefore: "2024-04-01", demolishedPublicUseToBefore: "2024-12-01",
    });
    console.log("[E5-11e 주택부수토지 카드] 산출세액", taxOf(r));
    await expect(page.getByTestId("nbl-state-history-interval-1")).toContainText("한시 기간 중 공용 사용 기간만");
  });

  test("E5-12: 빈집정비 «아니오»로 바꾸면 하위 블록이 숨고 body에서 4칸 소실 · 되돌리면 값이 복원 · 재산세 구분을 바꾸면 리셋(되돌려도 이전 답이 없다)", async ({ page }) => {
    test.setTimeout(300_000);
    // ① 빈집정비 «아니오» — 하위 블록 숨김 · body에 4칸 없음
    await seed(page, [landAsset(withClosing(P1(), PU_ALL_P1))], FORM_P1);
    await gotoHolding(page);
    await expect(page.getByTestId(facts(2, "publicuse-yes"))).toBeChecked();
    await expect(win(page)).toBeVisible();
    await pick(page.getByTestId(facts(2, "vacanthouse-no")));
    await expect(page.getByTestId(tid(2, "demolished-publicuse")), "빈집정비 «아니오» — 하위 블록 숨김").toHaveCount(0);
    const hidden = await calc(page);
    expect(hidden.status, JSON.stringify(hidden.json).slice(0, 300)).toBe(200);
    for (const k of PU_KEYS) expect(hidden.req.nonBusinessLandRaw?.nblOtherStateEvents?.[2], `body에 ${k} 없음`).not.toHaveProperty(k);
    console.log("[E5-12 빈집정비 아니오] 산출세액", taxOf(hidden));

    // ② 아니오 → 예로 되돌리면 이전 답이 복원(지우지 않았다) · body에 4칸 · 세액 239,370,000
    await seed(page, [landAsset(withClosing(P1(), PU_ALL_P1))], FORM_P1);
    await gotoHolding(page);
    await pick(page.getByTestId(facts(2, "vacanthouse-no")));
    await expect(page.getByTestId(tid(2, "demolished-publicuse"))).toHaveCount(0);
    await pick(page.getByTestId(facts(2, "vacanthouse-yes")));
    await expect(page.getByTestId(facts(2, "publicuse-yes")), "되돌리면 이전 답이 복원").toBeChecked();
    await expect(page.getByTestId(facts(2, "publicusepaid-yes"))).toBeChecked();
    await expect(dateIn(page, "from").getByLabel("연도")).toHaveValue("2025");
    await expect(dateIn(page, "to").getByLabel("월")).toHaveValue("12");
    const back = await calc(page);
    expect(back.status, JSON.stringify(back.json).slice(0, 300)).toBe(200);
    expect(back.req.nonBusinessLandRaw?.nblOtherStateEvents?.[2]).toMatchObject(PU_ALL_P1);
    expect(taxOf(back)).toBe(239_370_000);

    // ③ 재산세 구분을 바꾸면 사실 칸(하위 4칸 포함)이 리셋된다 — 근거를 다시 고르면 빈 칸
    await seed(page, [landAsset(withClosing(P1(), PU_ALL_P1))], FORM_P1);
    await gotoHolding(page);
    await pick(page.getByTestId(tid(2, "ptax-comprehensive")));
    await expect(page.getByTestId(tid(2, "demolished"))).toHaveCount(0);
    await declareDemolished(page, 2);
    await expect(page.getByTestId(facts(2, "otheruse-yes")), "리셋 — 이전 답이 남지 않는다").not.toBeChecked();
    await expect(page.getByTestId(tid(2, "demolished-publicuse"))).toHaveCount(0);
    await answerUpper(page);
    await expect(page.getByTestId(facts(2, "publicuse-yes")), "하위 답도 리셋").not.toBeChecked();
    await expect(page.getByTestId(facts(2, "publicuse-no"))).not.toBeChecked();
    await pick(page.getByTestId(facts(2, "publicuse-yes")));
    await pick(page.getByTestId(facts(2, "publicusepaid-yes")));
    await expect(dateIn(page, "from").getByLabel("연도"), "리셋 — 날짜도 비었다").toHaveValue("");
    await expect(dateIn(page, "to").getByLabel("연도")).toHaveValue("");
  });
});

test.describe("E3-⑤ E3f-3 U-4 — 시각(라이트·다크·375px) (E5-V4)", () => {
  test("E5-V4: 하위 4칸 블록 — 라이트/다크 글자 대비 4.5 이상 · 375px 가로 넘침 없음 · 날짜 두 칸 세로 쌓기", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 375, height: 900 });
    await seed(page, [landAsset(K7())], FORM_K7);
    await gotoHolding(page);
    await declareDemolished(page, 2);
    await answerUpper(page);
    await pick(page.getByTestId(facts(2, "publicuse-yes")));
    await pick(page.getByTestId(facts(2, "publicusepaid-yes")));
    await setDate(dateIn(page, "from"), "2024-01-01");
    await setDate(dateIn(page, "to"), "2024-07-01");
    const block = page.getByTestId(tid(2, "demolished-publicuse"));
    await expect(block).toBeVisible();
    await expect(puNotice(page)).toBeVisible();
    for (const [name, loc] of [["블록", block], ["공용 사용 칸", anchorOf(page, 2, "demolishedPublicUseBefore")], ["유료 칸", anchorOf(page, 2, "demolishedPublicUsePaidBefore")], ["개시일 칸", anchorOf(page, 2, "demolishedPublicUseFromBefore")], ["종료일 칸", anchorOf(page, 2, "demolishedPublicUseToBefore")], ["인정 고지", puNotice(page)]] as const) {
      const b = await loc.boundingBox();
      expect(b && b.x >= 0 && b.x + b.width <= 375 + 0.5, `${name}이 375px 안`).toBe(true);
    }
    const from = await anchorOf(page, 2, "demolishedPublicUseFromBefore").boundingBox();
    const to = await anchorOf(page, 2, "demolishedPublicUseToBefore").boundingBox();
    expect(from && to && to.y >= from.y + from.height - 0.5, "375px에서 날짜 두 칸은 세로로 쌓인다").toBe(true);
    expect(await block.evaluate((el) => el.scrollWidth - el.clientWidth), "블록 안쪽 가로 넘침").toBeLessThanOrEqual(1);
    expect(await page.getByTestId("nbl-other-state-history").first().evaluate((el) => el.scrollWidth - el.clientWidth), "이력 섹션 안쪽 가로 넘침").toBeLessThanOrEqual(1);
    await block.screenshot({ path: "e2e/_artifacts/e3-5d-block-375.png" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await expectLightContrast(page, block);
    await block.screenshot({ path: "e2e/_artifacts/e3-5d-block-light.png" });
    await expectDarkContrast(page, block);
    await block.screenshot({ path: "e2e/_artifacts/e3-5d-block-dark.png" });
  });
});
