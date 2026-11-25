/**
 * 재산세 별도합산(비철거) — 건축물 허가·사용승인 칸 E2E (PSA-E3 · 「지방세법 시행령」 §101① 단서)
 *
 * 세액 오라클: docs/01-plan/features/property-separate-demolished-requirements.engine.plan.md §7 K-27~K-29 (총 납부세액 = 본세 × 1.2)
 *   건축물 300㎡ 상업(공시가격 3억 · 바닥 100 → 기준면적 300㎡)
 *   K-27 허가 «예»            → 516,000 (별도합산 430,000)
 *   K-28 허가 «아니오»        → 960,000 (전량 종합합산 이관 800,000)
 *   K-29 허가 «모름»          → 960,000 + 확인 필요
 * 과세기준일은 화면이 항상 올해 6.1.(2011.6.1. 이후)이라 칸은 언제나 열린다 — 노출 술어는 어댑터(`buildingPermitNeedOf`)가 소유한다.
 * 실행: E2E_PORT=3173 npx playwright test e2e/property-separate-building-permit.spec.ts
 */
import { test, expect } from "@playwright/test";
import {
  YEAR,
  calc,
  captureBody,
  exact,
  fillAreaBasis,
  fillSeparateDetail,
  fillSplitInputsZero,
  pickLandType,
  startLand,
  totalPayable,
} from "./_helpers/property-land";

const BUILDING = { zoning: /상업지역/, area: "300", floor: "100" } as const;
const ISSUE = /이 건축물이 허가·사용승인을 받은 것인지 선택하세요/;

async function toDetail(page: import("@playwright/test").Page) {
  await startLand(page, "300000000");
  await pickLandType(page, /별도합산과세대상/);
}

const item = (box: { bodies: Record<string, unknown>[] }) => box.bodies[0].separateAggregateItem as Record<string, unknown>;

test.describe("재산세 별도합산 건축물 허가·사용승인 칸 (PSA-E3)", () => {
  test("K-27 허가 «예» → 516,000 · 이관 사유 없음 · body에 buildingPermit yes", async ({ page }) => {
    const box = captureBody(page);
    await toDetail(page);
    await fillSeparateDetail(page, { ...BUILDING, permit: "yes" });
    await fillSplitInputsZero(page);
    await calc(page);
    await expect(totalPayable(page)).toHaveText(exact("516,000"));
    await expect(page.getByTestId("land-split-reasons")).toHaveCount(0);
    expect(item(box)).toMatchObject({ buildingPermit: "yes" });
    expect(item(box)).not.toHaveProperty("demolished");
  });

  test("K-28 허가 «아니오» → 960,000 · 이관 사유 · 확인 필요 고지", async ({ page }) => {
    const box = captureBody(page);
    await toDetail(page);
    await fillSeparateDetail(page, { ...BUILDING, permit: "no" });
    await fillSplitInputsZero(page);
    await calc(page);
    await expect(totalPayable(page)).toHaveText(exact("960,000"));
    await expect(page.getByTestId("land-split-reasons")).toContainText("허가·사용승인을 받지 않았거나 확인되지 않은 건축물의 부속토지(영 §101① 단서)");
    await expect(page.getByText(/사용승인\(임시사용승인 포함\)을 받지 않고 사용 중인 건축물의 부속토지는/)).toBeVisible();
    expect(item(box)).toMatchObject({ buildingPermit: "no" });
    // PSA-S2 — 허가 «아니오»는 결과가 확정이라 용도지역·바닥면적을 묻지도 보내지도 않는다
    expect(item(box)).not.toHaveProperty("zoningDistrict");
    expect(item(box)).not.toHaveProperty("buildingFloorArea");
  });

  test("K-29 허가 «모름» → 960,000 · «확인되지 않아» 고지", async ({ page }) => {
    await toDetail(page);
    await fillSeparateDetail(page, { ...BUILDING, permit: "unknown" });
    await fillSplitInputsZero(page);
    await calc(page);
    await expect(totalPayable(page)).toHaveText(exact("960,000"));
    await expect(page.getByTestId("land-split-reasons")).toContainText("영 §101① 단서");
    await expect(page.getByText(/여부가 확인되지 않아\(모름·미선택\)/)).toBeVisible();
  });

  test("공장용지 + «아니오» → 종합합산 이관(960,000) · 공장용지도 같은 요건", async ({ page }) => {
    const box = captureBody(page);
    await toDetail(page);
    await page.getByRole("switch", { name: /공장용지/ }).click();
    await fillSeparateDetail(page, { ...BUILDING, permit: "no" });
    await fillSplitInputsZero(page);
    await calc(page);
    await expect(totalPayable(page)).toHaveText(exact("960,000"));
    await expect(page.getByTestId("land-split-reasons")).toContainText("영 §101① 단서");
    expect(item(box)).toMatchObject({ buildingPermit: "no", isFactory: true });
  });

  test("미선택 차단 + 점프 — «다음» → 허가 문구 · StepIndicator로 step 3 → 계산 → 토지 상세로 복귀(서버 호출 0) · 점프 앵커 data-field", async ({ page }) => {
    const box = captureBody(page);
    await toDetail(page);
    await fillSeparateDetail(page, { ...BUILDING, next: false });
    // 기본값 없음 — 어느 선택지도 눌려 있지 않다
    for (const a of ["yes", "no", "unknown"]) await expect(page.getByTestId(`pt-sa-permit-${a}`)).not.toBeChecked();
    await expect(page.locator('[data-field="buildingPermit"]')).toHaveCount(1);
    await page.getByRole("button", { name: /^다음$/ }).click();
    await expect(page.getByText(ISSUE)).toBeVisible();
    await expect(page.getByRole("heading", { name: "별도합산과세 상세 정보" })).toBeVisible();
    await page.getByRole("button", { name: "전년도 세액 단계로 이동" }).click();
    await page.getByRole("button", { name: /재산세 계산하기/ }).click();
    await expect(page.getByText(ISSUE)).toBeVisible();
    await expect(page.getByRole("heading", { name: "별도합산과세 상세 정보" })).toBeVisible();
    await expect(page.getByText("입력값이 올바르지 않습니다.")).toHaveCount(0);
    expect(box.bodies).toHaveLength(0);
  });

  test("PSA-S2 — 용도지역·바닥면적은 허가 «예» 뒤에만 · «아니오»·«모름»·미선택이면 칸 없음 · 허가 칸은 철거 토글 바로 아래", async ({ page }) => {
    await toDetail(page);
    // 철거 토글 → 허가 → (예) 용도지역·바닥면적 순서 — 위치가 아니라 DOM 순서로 확인
    const yPos = async (testId: string) => (await page.getByTestId(testId).boundingBox())?.y ?? Number.NaN;
    const toggleY = (await page.getByRole("switch", { name: /건축물 철거 완료/ }).boundingBox())?.y ?? Number.NaN;
    expect(await yPos("pt-sa-permit")).toBeGreaterThan(toggleY);
    await expect(page.getByTestId("pt-sa-area-basis")).toHaveCount(0); // 미선택 — 아직 묻지 않는다
    await page.getByTestId("pt-sa-permit-no").check();
    await expect(page.getByTestId("pt-sa-area-basis")).toHaveCount(0);
    await page.getByTestId("pt-sa-permit-unknown").check();
    await expect(page.getByTestId("pt-sa-area-basis")).toHaveCount(0);
    await page.getByTestId("pt-sa-permit-yes").check();
    await expect(page.getByTestId("pt-sa-area-basis")).toBeVisible();
    expect(await yPos("pt-sa-area-basis")).toBeGreaterThan(await yPos("pt-sa-permit"));
    // 값을 넣고 «아니오»로 바꾸면 칸이 사라지고, 다시 «예»로 돌리면 값이 그대로(숨은 값 보존)
    await fillAreaBasis(page, { zoning: BUILDING.zoning, floor: BUILDING.floor });
    await page.getByTestId("pt-sa-permit-no").check();
    await expect(page.getByTestId("pt-sa-area-basis")).toHaveCount(0);
    await page.getByTestId("pt-sa-permit-yes").check();
    await expect(page.getByTestId("pt-sa-area-floor")).toHaveValue("100");
  });

  test("PSA-S2 — 허가 «아니오»: 면적 칸 없이 «다음» 통과 → 합산 칸 요구 유지(종합합산) → 960,000", async ({ page }) => {
    const box = captureBody(page);
    await toDetail(page);
    await fillSeparateDetail(page, { zoning: BUILDING.zoning, area: BUILDING.area, permit: "no" });
    await expect(page.getByTestId("other-comprehensive-value")).toBeVisible();
    await fillSplitInputsZero(page);
    await calc(page);
    await expect(totalPayable(page)).toHaveText(exact("960,000"));
    expect(item(box)).toMatchObject({ buildingPermit: "no" });
    // 이관 사유·고지는 «건축물이 없는 토지»가 아니라 허가 요건이다(종전 N2 오표기 정정)
    await expect(page.getByTestId("land-split-reasons")).toContainText("영 §101① 단서");
  });

  test("철거 ON → 허가 칸 숨김 + body에 buildingPermit 없음 · 철거 OFF → 칸 복귀 + 고른 답 보존", async ({ page }) => {
    const box = captureBody(page);
    await toDetail(page);
    await fillSeparateDetail(page, { ...BUILDING, permit: "no", next: false });
    await expect(page.getByTestId("pt-sa-permit")).toBeVisible();
    await page.getByRole("switch", { name: /건축물 철거 완료/ }).click();
    await expect(page.getByTestId("pt-sa-permit")).toHaveCount(0);
    // 철거 OFF로 돌리면 고른 «아니오»가 그대로 있다(숨은 값 보존)
    await page.getByRole("switch", { name: /건축물 철거 완료/ }).click();
    await expect(page.getByTestId("pt-sa-permit-no")).toBeChecked();
    // 다시 철거 ON — 철거 경로의 허가 칸이 맡고, 본 경로의 buildingPermit은 전송되지 않는다
    await page.getByRole("switch", { name: /건축물 철거 완료/ }).click();
    const [y, m, d] = `${YEAR}-01-01`.split("-");
    await page.getByLabel("연도", { exact: true }).fill(y);
    await page.getByLabel("월", { exact: true }).fill(String(Number(m)));
    await page.getByLabel("일", { exact: true }).fill(String(Number(d)));
    await page.getByTestId("pt-sa-demolished-kind-building").check();
    await page.getByTestId("pt-sa-demolished-permit-yes").check();
    await page.getByTestId("pt-sa-demolished-otheruse-no").check();
    // 철거 경로의 용도지역·바닥면적은 사슬 끝에서 처음 그려진다(허가 «아니오»였던 비철거 경로에서는 입력한 적이 없다)
    await expect(page.getByTestId("pt-sa-area-basis")).toBeVisible();
    await fillAreaBasis(page, { zoning: BUILDING.zoning, floor: BUILDING.floor });
    await page.getByRole("button", { name: /^다음$/ }).click();
    await fillSplitInputsZero(page);
    await calc(page);
    await expect(totalPayable(page)).toHaveText(exact("516,000"));
    expect(item(box)).toMatchObject({ demolished: true, demolishedPermit: "yes" });
    expect(item(box)).not.toHaveProperty("buildingPermit");
  });

  test("375px — 허가 칸(힌트 펼침) 가로 넘침 없음", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await toDetail(page);
    await fillSeparateDetail(page, { ...BUILDING, permit: "no", next: false });
    await page.getByTestId("pt-sa-permit").getByRole("button", { name: /펼치기/ }).click();
    await expect(page.getByText(/건축물대장·허가대장으로 확인하세요/)).toBeVisible();
    await expect(page.getByTestId("pt-sa-permit-yes")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await page.getByTestId("pt-sa-permit").screenshot({ path: "e2e/_artifacts/property-building-permit-375.png" });
  });
});
