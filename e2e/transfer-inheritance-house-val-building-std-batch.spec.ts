/**
 * E2E: 상속취득 주택 3-시점 환산(§164⑤) — 건물기준시가 일괄 계산기 배선.
 *
 * HouseValuationSection(상속취득 평가 경로)에 PhdBuildingStdPriceModalButton을 배선.
 * 검증(F2 게이팅 — live app):
 *   T1. 상속 + 단독주택(house_individual) + 상속개시일 < 2005 → "3시점 건물기준시가 일괄 계산" 버튼 노출.
 *   T2. 공동주택(house_apart)으로 전환 → 버튼 미노출(구조·용도 방식 부적합).
 *
 * 계획서: docs/02-design/features/inheritance-house-valuation-3point-building-std-batch.plan.md
 * 정책: [[feedback_browser_verify_with_playwright]]
 * 비-worktree 실행: npx playwright test e2e/transfer-inheritance-house-val-building-std-batch.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { fillDateAndVerify } from "./_helpers/tax-flow";

// 상속 취득원인 + 자동평가 모드 + 상속개시일(2003) 진입. 자산 구분 선택 전까지.
async function gotoInheritanceHouse(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  // 양도일 2026 — 모달 양도시점 연도 도출(미설정 시 양도 블록 연도 미상 → 콤보 불안정).
  await fillDateAndVerify(page, { year: "2026", month: "05", day: "01" }, {
    scope: page.getByTestId("transfer-date"),
  });

  await expandAssetSection(page, 1);
  await page.getByRole("button", { name: "주택", exact: true }).first().click();

  await expandAssetSection(page, 3);
  await page.getByRole("button", { name: "상속", exact: true }).click();

  // 통합 셸(P2b): auto/manual 토글 폐지 → 상속 선택 시 자산 구분 RadioCardGroup이 바로 노출된다.

  // 상속개시일 1983-07-26 (< 1985.1.1 → pre-deemed PreDeemedInputs → 보충적평가 게이트 없이 섹션 활성).
  // (post-deemed(≥1985)은 inheritanceValuationMethod=supplementary 추가 필요.)
  const inhDateScope = page
    .locator("div.space-y-1\\.5")
    .filter({ has: page.getByText("상속개시일", { exact: true }) });
  await fillDateAndVerify(page, { year: "1983", month: "07", day: "26" }, { scope: inhDateScope });
}

const HOUSE_VAL = "개별주택가격 미공시 — 3-시점 기준시가 환산 보조";
const BATCH_BTN = "3시점 건물기준시가 일괄 계산";

// 시점별 구조·용도 콤보를 count개 순차로 채움(미선택 placeholder를 앞에서부터).
async function fillCombos(
  page: Page,
  modal: ReturnType<Page["locator"]>,
  placeholder: "구조 선택" | "용도 선택",
  optionRe: RegExp,
  count: number,
) {
  for (let i = 0; i < count; i++) {
    if ((await modal.getByText(placeholder).count()) === 0) break;
    await modal.getByText(placeholder).first().click();
    await page.getByRole("option", { name: optionRe }).first().click();
  }
}

test.describe("상속취득 주택 3시점 — 건물기준시가 일괄 계산기 (F2 게이팅)", () => {
  test("T1: 단독주택 → 일괄 계산 버튼 노출", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoInheritanceHouse(page);

    // 자산 구분 = 개별·다세대주택(house_individual)
    await page.getByRole("radio", { name: /개별·다세대주택/ }).click();

    const section = page.locator("div").filter({ hasText: HOUSE_VAL }).first();
    await expect(section).toBeVisible();
    await expect(section.getByRole("button", { name: BATCH_BTN })).toHaveCount(1);
  });

  test("T2: 공동주택 → 일괄 계산 버튼 미노출", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoInheritanceHouse(page);

    // 자산 구분 = 공동주택(house_apart)
    await page.getByRole("radio", { name: /공동주택/ }).click();

    const section = page.locator("div").filter({ hasText: HOUSE_VAL }).first();
    await expect(section).toBeVisible();
    await expect(section.getByRole("button", { name: BATCH_BTN })).toHaveCount(0);
  });

  test("T3: 모달 계산·적용 → 계산서 스냅샷 저장 (최초·양도 키 존재, 취득 1983 부재)", async ({ page }) => {
    test.setTimeout(150_000);
    await gotoInheritanceHouse(page);
    await page.getByRole("radio", { name: /개별·다세대주택/ }).click();

    const section = page.locator("div").filter({ hasText: HOUSE_VAL }).first();
    await section.getByRole("button", { name: BATCH_BTN }).click();

    const modal = page.getByRole("dialog").filter({ hasText: "3시점 건물 기준시가 일괄 계산" });
    await expect(modal).toBeVisible();

    // pre-2001 취득(1983) → 취득시 LandPriceLookupField(2001 고정) — 서브헤딩 "(2001년 기준)" + 조회 버튼, 주소 미입력이라 자동주입 없이 빈 값
    // (취득≤2000 필드 placeholder "2001.1.1. 현재 공시지가"로 분리 — 최초·양도만 "원/㎡")
    await expect(modal.getByText("취득시 (2001년 기준) 공시지가")).toBeVisible();
    const acqLandInput = modal.getByPlaceholder("2001.1.1. 현재 공시지가");
    await expect(acqLandInput).toBeVisible();
    await expect(acqLandInput).toHaveValue("");

    await modal.getByPlaceholder("신축연도 (4자리)").fill("1982");
    // 시점별 3블록(취득 2001체계·최초 2005·양도 2026) 구조·용도
    await fillCombos(page, modal, "구조 선택", /철근콘크리트조|연와조/, 3);
    await fillCombos(page, modal, "용도 선택", /단독|주택/, 3);
    await modal.getByPlaceholder("연면적").fill("253.75");

    // 시점별 공시지가 — 취득(1983, "2001.1.1." placeholder)·최초(2005)·양도(2026, "원/㎡")
    await acqLandInput.fill("598517");
    const land = modal.getByPlaceholder("원/㎡"); // 최초·양도 2개
    await land.nth(0).fill("1560000");
    await land.nth(1).fill("6750000");

    await modal.getByRole("button", { name: "3시점 계산하기" }).click();
    const applyBtn = modal.getByRole("button", { name: /모두 적용/ });
    await expect(applyBtn).toBeVisible();
    await applyBtn.click();
    await expect(modal).toBeHidden();

    // 스냅샷 저장 — 최초·양도(≥2001) 키 존재, 취득(1983 ≤2000) 키 부재
    const keys = await page.evaluate(() => {
      const raw = sessionStorage.getItem("building-std-snapshots");
      if (!raw) return [] as string[];
      return Object.keys(JSON.parse(raw)?.state?.snapshots ?? {});
    });
    console.log("[T3] 스냅샷 키:", keys.join(", "));
    expect(keys.some((k) => /-phd-first$/.test(k))).toBe(true);
    expect(keys.some((k) => /-phd-transfer$/.test(k))).toBe(true);
    expect(keys.some((k) => /-phd-acq$/.test(k))).toBe(false);
  });
});
