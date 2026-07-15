/**
 * E2E: PHD 3시점 건물기준시가 "일괄 계산" 버튼 (양도 §164⑤) — 2026-07-06 재작성
 *
 * 계획서: docs/02-design/features/phd-building-stdprice-3point-batch-calculator.plan.md
 * (구 필드별 버튼(PR#519) → 3시점 일괄 버튼 1개로 전환. 버그 1·2·3 수정.)
 *
 * 검증:
 *   T1. 단일 주택 PHD 위젯에 "3시점 건물기준시가 일괄 계산" 버튼 1개 노출 +
 *       구 필드별 "건물 기준시가 계산" 버튼 미노출(게이팅).
 *   T2. 양도일만 설정 → 모달에서 건물정보 1회 + 양도 공시지가 입력 → 계산 →
 *       "모두 적용" 시 산출된 양도시 건물기준시가만 필드에 채워짐(취득/최초공시는 연도 미상 → 미변경).
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 * 비-worktree 실행: E2E_PORT=3000 npx playwright test e2e/transfer-phd-building-stdprice-calculator.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { fillDateAndVerify } from "./_helpers/tax-flow";

async function gotoPhdWidget(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  await expandAssetSection(page, 1);
  await page.getByRole("button", { name: "주택", exact: true }).first().click();

  await expandAssetSection(page, 3);
  await page.getByRole("button", { name: "매매", exact: true }).click();
  await page.getByRole("button", { name: "환산취득가" }).click();

  await page
    .locator('[data-slot="toggle-card"]')
    .filter({ hasText: "취득 당시 개별주택가격 미공시" })
    .getByRole("switch")
    .click();
}

// exact 라벨 날짜 채움 — 스위치 aria-label("…취득일 다름")의 "일" substring 오매칭 회피
async function fillDateExact(
  scope: ReturnType<Page["locator"]>,
  d: { year: string; month: string; day: string },
) {
  await scope.getByLabel("연도", { exact: true }).first().fill(d.year);
  await scope.getByLabel("월", { exact: true }).first().fill(d.month);
  await scope.getByLabel("일", { exact: true }).first().fill(d.day);
}

// 시점별 구조·용도 블록 — 미선택 콤보(placeholder)를 count개 순차로 채움. DOM 순서=부분1(취득·최초·양도)→부분2…
async function fillCombos(
  page: Page,
  modal: ReturnType<Page["locator"]>,
  placeholder: "구조 선택" | "용도 선택",
  optionRe: RegExp,
  count: number,
) {
  for (let i = 0; i < count; i++) {
    if ((await modal.getByText(placeholder).count()) === 0) break; // 시점 블록 수 < count(예: 최초공시 미설정) → 조기 종료
    await modal.getByText(placeholder).first().click();
    await page.getByRole("option", { name: optionRe }).first().click();
  }
}

function phdSection(page: Page) {
  // PHD 패널 루트(bg-primary/5)로 한정 — div.rounded-md 최외곽은 섹션3까지 포함되어 날짜 스코프 오염
  return page
    .locator('div.bg-primary\\/5')
    .filter({ hasText: "주택공시가격 미공시 취득 (3-시점 환산)" })
    .first();
}

test.describe("PHD 3시점 건물기준시가 일괄 계산 (양도)", () => {
  test("T1: 일괄 계산 버튼 1개 노출 + 필드별 버튼 미노출", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoPhdWidget(page);

    const phd = phdSection(page);
    await expect(phd).toBeVisible();

    await expect(phd.getByRole("button", { name: "3시점 건물기준시가 일괄 계산" })).toHaveCount(1);
    // 구 필드별 버튼은 게이팅으로 제거됨
    await expect(phd.getByRole("button", { name: "건물 기준시가 계산" })).toHaveCount(0);
  });

  test("T2: 양도일 설정 → 모달 계산 → 모두 적용 → 양도시 필드만 채움", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoPhdWidget(page);

    // 양도일 2025 (양도연도 도출) — 취득일·최초고시일 미설정 → 두 시점 계산 제외
    await page.getByTestId("transfer-date").getByLabel("연도", { exact: true }).fill("2025");
    await page.getByTestId("transfer-date").getByLabel("월", { exact: true }).fill("05");
    await page.getByTestId("transfer-date").getByLabel("일", { exact: true }).fill("01");

    const phd = phdSection(page);
    await phd.getByRole("button", { name: "3시점 건물기준시가 일괄 계산" }).click();

    const modal = page.getByRole("dialog").filter({ hasText: "3시점 건물 기준시가 일괄 계산" });
    await expect(modal).toBeVisible();

    // 건물 정보 1회
    await modal.getByText("구조 선택").first().click();
    await page.getByRole("option", { name: /철근콘크리트조/ }).first().click();
    await modal.getByText("용도 선택").first().click();
    await page.getByRole("option", { name: /아파트/ }).first().click();
    await modal.getByPlaceholder("연면적").fill("100");
    await modal.getByPlaceholder("신축연도 (4자리)").fill("2010");

    // 양도시 공시지가만 입력 (취득/최초공시는 연도 미상) — 시점별 원/㎡ 3칸 중 마지막=양도
    await modal.getByPlaceholder("원/㎡").last().fill("3486000");

    await modal.getByRole("button", { name: "3시점 계산하기" }).click();

    // 양도시 산출값 노출 + "모두 적용 (1개 시점)"
    const applyBtn = modal.getByRole("button", { name: /모두 적용/ });
    await expect(applyBtn).toBeVisible();
    await expect(applyBtn).toContainText("1개");
    await applyBtn.click();
    await expect(modal).toBeHidden();

    // 양도시 건물기준시가 필드 채워짐(값 > 0), 취득시는 빈 값 유지 — 힌트 삭제(PR#552) 후 라벨 앵커
    const transferBuildingInput = phd
      .getByText("건물기준시가", { exact: true })
      .last()
      .locator("xpath=following::input[1]");
    await expect(transferBuildingInput).not.toHaveValue("");
    const acqBuildingInput = phd
      .getByText("건물기준시가", { exact: true })
      .first()
      .locator("xpath=following::input[1]");
    await expect(acqBuildingInput).toHaveValue("");
  });

  test("T3: 단독주택 3시점(취득 2003·최초고시 2005·양도 2025) 모두 계산·적용", async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // 양도일 2025
    await fillDateAndVerify(page, { year: "2025", month: "05", day: "01" }, {
      scope: page.getByTestId("transfer-date"),
    });

    await expandAssetSection(page, 1);
    await page.getByRole("button", { name: "주택", exact: true }).first().click();

    await expandAssetSection(page, 3);
    await page.getByRole("button", { name: "매매", exact: true }).click();
    await page.getByRole("button", { name: "환산취득가" }).click();

    // 취득일 2003 (< 2005.4.29 → 개별주택가격 미공시 PHD 자동 활성)
    await fillDateExact(page.locator('[data-asset-card-index="0"] [data-asset-section="3"]'), {
      year: "2003",
      month: "06",
      day: "15",
    });

    // PHD 토글이 자동 체크 안됐으면 수동 ON
    const phdToggle = page
      .locator('[data-slot="toggle-card"]')
      .filter({ hasText: "취득 당시 개별주택가격 미공시" })
      .getByRole("switch");
    if ((await phdToggle.getAttribute("aria-checked")) !== "true") {
      await phdToggle.click();
    }

    const phd = phdSection(page);
    await expect(phd).toBeVisible();

    // 최초 고시일 2005-04-30 (PHD 섹션 내 유일한 DateInput)
    await fillDateExact(phd, { year: "2005", month: "04", day: "30" });

    // 일괄 계산 모달
    await phd.getByRole("button", { name: "3시점 건물기준시가 일괄 계산" }).click();
    const modal = page.getByRole("dialog").filter({ hasText: "3시점 건물 기준시가 일괄 계산" });
    await expect(modal).toBeVisible();

    // 시점별 3블록(취득 2003·최초공시 2005·양도 2025) — 구조·용도 동일
    await fillCombos(page, modal, "구조 선택", /철근콘크리트조/, 3);
    await fillCombos(page, modal, "용도 선택", /단독|다가구|주택/, 3);
    await modal.getByPlaceholder("연면적").fill("150");
    await modal.getByPlaceholder("신축연도 (4자리)").fill("2000");

    // 시점별 공시지가 3칸(취득/최초공시/양도)
    const landInputs = modal.getByPlaceholder("원/㎡");
    await landInputs.nth(0).fill("2000000");
    await landInputs.nth(1).fill("2200000");
    await landInputs.nth(2).fill("3486000");

    await modal.getByRole("button", { name: "3시점 계산하기" }).click();

    // 3시점 모두 산출 → "모두 적용 (3개 시점)"
    const applyBtn = modal.getByRole("button", { name: /모두 적용/ });
    await expect(applyBtn).toBeVisible();
    await expect(applyBtn).toContainText("3개");

    // 산출값 로깅(관찰용)
    const shown = await modal.locator("span.font-mono").allInnerTexts();
    console.log("[T3] 3시점 산출값:", shown.join(" / "));

    await applyBtn.click();
    await expect(modal).toBeHidden();

    // 3개 건물기준시가 필드 모두 채워짐(빈 값 아님) — 건물기준시가 힌트 삭제(PR#552) 후 라벨 앵커
    const buildingInputs = phd
      .getByText("건물기준시가", { exact: true })
      .locator("xpath=following::input[1]");
    await expect(buildingInputs.nth(0)).not.toHaveValue("");
    await expect(buildingInputs.nth(1)).not.toHaveValue("");
    await expect(buildingInputs.nth(2)).not.toHaveValue("");
    const values = await buildingInputs.allInnerTexts().catch(() => []);
    const vals2 = await Promise.all(
      [0, 1, 2].map((i) => buildingInputs.nth(i).inputValue()),
    );
    console.log("[T3] 적용된 3필드 값:", vals2.join(" / "), values);
  });

  test("T8: 단독 다부분 — 층별 구조·용도 상이 부분 추가(상가 카테고리 없음) → 3시점 3개 산출·적용", async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    await fillDateAndVerify(page, { year: "2025", month: "05", day: "01" }, {
      scope: page.getByTestId("transfer-date"),
    });

    await expandAssetSection(page, 1);
    await page.getByRole("button", { name: "주택", exact: true }).first().click();

    await expandAssetSection(page, 3);
    await page.getByRole("button", { name: "매매", exact: true }).click();
    await page.getByRole("button", { name: "환산취득가" }).click();

    // 취득일 2003 (< 2005.4.29 → PHD 자동 활성)
    await fillDateExact(page.locator('[data-asset-card-index="0"] [data-asset-section="3"]'), {
      year: "2003",
      month: "06",
      day: "15",
    });
    const phdToggle = page
      .locator('[data-slot="toggle-card"]')
      .filter({ hasText: "취득 당시 개별주택가격 미공시" })
      .getByRole("switch");
    if ((await phdToggle.getAttribute("aria-checked")) !== "true") {
      await phdToggle.click();
    }

    const phd = phdSection(page);
    await expect(phd).toBeVisible();
    await fillDateExact(phd, { year: "2005", month: "04", day: "30" });

    await phd.getByRole("button", { name: "3시점 건물기준시가 일괄 계산" }).click();
    const modal = page.getByRole("dialog").filter({ hasText: "3시점 건물 기준시가 일괄 계산" });
    await expect(modal).toBeVisible();

    // 단독에도 부분 추가 노출 + 상가 카테고리는 없음
    await expect(modal.getByRole("button", { name: "+ 부분 추가" })).toHaveCount(1);
    await expect(modal.getByRole("button", { name: "상가", exact: true })).toHaveCount(0);

    await modal.getByPlaceholder("신축연도 (4자리)").fill("2000");
    // 부분1 (1층 주택) — 시점별 3블록 단독
    await fillCombos(page, modal, "구조 선택", /철근콘크리트조/, 3);
    await fillCombos(page, modal, "용도 선택", /단독|다가구|주택/, 3);
    await modal.getByPlaceholder("연면적").first().fill("90");

    // 부분2 (2층 — 용도 상이 아파트) 추가 — 시점별 3블록
    await modal.getByRole("button", { name: "+ 부분 추가" }).click();
    await expect(modal.getByText(/^부분 2$/)).toBeVisible();
    await fillCombos(page, modal, "구조 선택", /철근콘크리트조/, 3);
    await fillCombos(page, modal, "용도 선택", /아파트/, 3);
    await modal.getByPlaceholder("연면적").last().fill("60");

    // 3시점 공시지가 전부(취득·최초공시·양도 모두 ≥2001 → 3개 산출)
    const land = modal.getByPlaceholder("원/㎡");
    await land.nth(0).fill("2000000");
    await land.nth(1).fill("2200000");
    await land.nth(2).fill("3486000");

    await modal.getByRole("button", { name: "3시점 계산하기" }).click();

    const applyBtn = modal.getByRole("button", { name: /모두 적용/ });
    await expect(applyBtn).toBeVisible();
    await expect(applyBtn).toContainText("3개");
    // 단독 라벨은 "주택건물"이 아닌 "건물"
    await expect(modal.getByText(/취득시 건물 기준시가/)).toBeVisible();
    const shown = await modal.locator("span.font-mono").allInnerTexts();
    console.log("[T8] 단독 다부분 3시점 산출값:", shown.join(" / "));

    await applyBtn.click();
    await expect(modal).toBeHidden();

    // 3개 건물기준시가 필드 모두 채워짐 — 힌트 삭제(PR#552) 후 라벨 앵커
    const buildingInputs = phd
      .getByText("건물기준시가", { exact: true })
      .locator("xpath=following::input[1]");
    await expect(buildingInputs.nth(0)).not.toHaveValue("");
    await expect(buildingInputs.nth(1)).not.toHaveValue("");
    await expect(buildingInputs.nth(2)).not.toHaveValue("");

    // GAP1: 일괄 적용이 건물기준시가 스냅샷을 저장했는지(결과탭 계산서 재유도용)
    const snapKeys = await page.evaluate(() => {
      const raw = sessionStorage.getItem("building-std-snapshots");
      if (!raw) return [] as string[];
      return Object.keys(JSON.parse(raw)?.state?.snapshots ?? {});
    });
    console.log("[T8] 저장된 스냅샷 키:", snapKeys.join(", "));
    expect(snapKeys.some((k) => /-phd-acq$/.test(k))).toBe(true);
    expect(snapKeys.some((k) => /-phd-first$/.test(k))).toBe(true);
    expect(snapKeys.some((k) => /-phd-transfer$/.test(k))).toBe(true);
  });

  test("T4: 겸용 Case B — 일괄 버튼·모달 모두 주택 전용(상가 UI 미노출)", async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // 양도일 2025 · 취득일 2010(≥2001)
    await fillDateAndVerify(page, { year: "2025", month: "05", day: "01" }, {
      scope: page.getByTestId("transfer-date"),
    });

    await expandAssetSection(page, 1);
    await page.getByRole("button", { name: "주택", exact: true }).first().click();

    // 겸용주택 분리계산 ON (자산 카드 상단 — section 1 열린 상태)
    await page.getByRole("switch", { name: "겸용주택 분리계산" }).click();

    await expandAssetSection(page, 3);
    await page.getByRole("button", { name: "매매", exact: true }).click();
    await page.getByRole("button", { name: "환산취득가" }).click();

    await fillDateExact(page.locator('[data-asset-card-index="0"] [data-asset-section="3"]'), {
      year: "2010",
      month: "06",
      day: "15",
    });

    // 면적 입력 (겸용 확장 패널)
    await page.getByPlaceholder("주택 전용면적").fill("120");
    await page.getByPlaceholder("상가(비주택) 전용면적").fill("80");
    await page.getByPlaceholder("건축물대장의 건축면적").fill("100");

    // PHD(개별주택가격 미공시) ON
    await page.getByRole("switch", { name: /개별주택가격 미공시/ }).click();

    // ── Case B 게이팅: 일괄 버튼은 **주택 전용** ──
    // 겸용 상가 기준시가는 전용 ③ 상가 섹션(MixedUseAssetMajorStdPrice/Legacy)이 전담하므로
    // PHD 주택분 일괄계산 모달에 상가 UI를 함께 띄우면 중복이다(d34c4b62, 2026-07-14).
    // 상가 경로 커버리지는 e2e/mixed-use-asset-major-commercial-modal.spec.ts.
    await expect(page.getByRole("button", { name: "3시점 건물기준시가 일괄 계산" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: /주택·상가 건물기준시가 일괄 계산/ })).toHaveCount(0);

    await page.getByRole("button", { name: "3시점 건물기준시가 일괄 계산" }).click();
    const modal = page.getByRole("dialog").filter({ hasText: "3시점 건물 기준시가 일괄 계산" });
    await expect(modal).toBeVisible();

    // 모달 내부도 주택 전용 — 상가 카테고리 버튼 없음 + 부분 헤더에 "구분"(주택/상가) 없음
    await expect(modal.getByRole("button", { name: "상가", exact: true })).toHaveCount(0);
    await expect(modal.getByText("부분(층/구역) — 구조·용도·연면적", { exact: true })).toBeVisible();
    await expect(modal.getByRole("button", { name: "+ 부분 추가" })).toHaveCount(1);
  });

  // 겸용(Case B) 진입 — 겸용 토글 + 면적 + 취득일 + PHD. 반환 = MixedUsePHD 섹션 로케이터.
  async function gotoMixedPhd(page: Page) {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await fillDateAndVerify(page, { year: "2025", month: "05", day: "01" }, {
      scope: page.getByTestId("transfer-date"),
    });
    await expandAssetSection(page, 1);
    await page.getByRole("button", { name: "주택", exact: true }).first().click();
    await page.getByRole("switch", { name: "겸용주택 분리계산" }).click();
    await expandAssetSection(page, 3);
    await page.getByRole("button", { name: "매매", exact: true }).click();
    await page.getByRole("button", { name: "환산취득가" }).click();
    await fillDateExact(page.locator('[data-asset-card-index="0"] [data-asset-section="3"]'), {
      year: "2010",
      month: "06",
      day: "15",
    });
    await page.getByPlaceholder("주택 전용면적").fill("120");
    await page.getByPlaceholder("상가(비주택) 전용면적").fill("80");
    await page.getByPlaceholder("건축물대장의 건축면적").fill("100");
    await page.getByRole("switch", { name: /개별주택가격 미공시/ }).click();
    return page
      .locator("div.bg-primary\\/5")
      .filter({ hasText: "개별주택가격 미공시 취득" })
      .first();
  }

  test("T5: 겸용 Case B — 3시점 공시지가 전부 입력 → 주택 3시점 산출·적용", async ({ page }) => {
    test.setTimeout(150_000);
    const mixedPhd = await gotoMixedPhd(page);
    await expect(mixedPhd).toBeVisible();

    // 최초 고시일 2015 (MixedUsePHD 섹션 내 최초 고시일)
    await fillDateExact(mixedPhd, { year: "2015", month: "04", day: "30" });

    await mixedPhd.getByRole("button", { name: "3시점 건물기준시가 일괄 계산" }).click();
    const modal = page.getByRole("dialog").filter({ hasText: "3시점 건물 기준시가 일괄 계산" });
    await expect(modal).toBeVisible();

    await modal.getByPlaceholder("신축연도 (4자리)").fill("2010");
    // 주택분만 — Case B 모달은 상가 부분(카테고리)을 제공하지 않는다(d34c4b62)
    await fillCombos(page, modal, "구조 선택", /철근콘크리트조/, 3);
    await fillCombos(page, modal, "용도 선택", /단독|다가구|주택/, 3);
    await modal.getByPlaceholder("연면적").first().fill("120");

    // 3시점 공시지가 전부
    const land = modal.getByPlaceholder("원/㎡");
    await land.nth(0).fill("2000000");
    await land.nth(1).fill("2200000");
    await land.nth(2).fill("3486000");

    await modal.getByRole("button", { name: "3시점 계산하기" }).click();

    // 주택 3시점 = 3개 산출. 양도 상가건물은 이 모달의 책임이 아니다
    // (③ 상가 섹션 전담 — e2e/mixed-use-asset-major-commercial-modal.spec.ts가 커버).
    const applyBtn = modal.getByRole("button", { name: /모두 적용/ });
    await expect(applyBtn).toBeVisible();
    await expect(applyBtn).toContainText("3개");
    await expect(modal.getByText("양도시 상가건물 기준시가")).toHaveCount(0);
    const shown = await modal.locator("span.font-mono").allInnerTexts();
    console.log("[T5] 겸용 Case B 3시점 산출값:", shown.join(" / "));
    await applyBtn.click();
    await expect(modal).toBeHidden();
  });

  test("T6: 겸용 Case A — splitMode 진입 + 게이팅 승격(주택·상가 버튼 전부 숨김)", async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await fillDateAndVerify(page, { year: "2025", month: "05", day: "01" }, {
      scope: page.getByTestId("transfer-date"),
    });
    await expandAssetSection(page, 1);
    await page.getByRole("button", { name: "주택", exact: true }).first().click();
    await page.getByRole("switch", { name: "겸용주택 분리계산" }).click();
    // 보유 중 일부 용도변경 ON (겸용 ON 후 활성) — direction 기본 house_to_commercial
    await page.getByRole("switch", { name: "보유 중 일부 용도변경" }).click();
    // 용도변경일 2018
    await fillDateExact(
      page.locator("div").filter({ hasText: /^용도변경일/ }).first(),
      { year: "2018", month: "06", day: "15" },
    );

    await expandAssetSection(page, 3);
    await page.getByRole("button", { name: "매매", exact: true }).click();
    await page.getByRole("button", { name: "환산취득가" }).click();
    await fillDateExact(page.locator('[data-asset-card-index="0"] [data-asset-section="3"]'), {
      year: "2010",
      month: "06",
      day: "15",
    });
    await page.getByPlaceholder("주택 전용면적").fill("120");
    await page.getByPlaceholder("상가(비주택) 전용면적").fill("80");
    await page.getByPlaceholder("건축물대장의 건축면적").fill("100");
    await page.getByRole("switch", { name: /개별주택가격 미공시/ }).click();

    const mixedPhd = page
      .locator("div.bg-primary\\/5")
      .filter({ hasText: "개별주택가격 미공시 취득" })
      .first();
    await expect(mixedPhd).toBeVisible();
    // 최초고시일 2015 < 용도변경일 2018 → Case A(splitMode·4부분)
    await fillDateExact(mixedPhd, { year: "2015", month: "04", day: "30" });
    // splitMode 신호: 상가건물 기준시가 필드 노출
    await expect(mixedPhd.getByText("상가건물 기준시가").first()).toBeVisible();

    // Phase 2.1: 일괄 버튼 1개 + 배치가 취득·최초공시 상가도 산출 → 필드별 버튼(주택·상가) 전부 숨김 count 0
    await expect(mixedPhd.getByRole("button", { name: /주택·상가 건물기준시가 일괄 계산/ })).toHaveCount(1);
    await expect(mixedPhd.getByRole("button", { name: "건물 기준시가 계산" })).toHaveCount(0);
  });

  test("T7: 겸용 Case A — 일괄 6필드(취득·최초공시 상가 포함) 산출·적용", async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await fillDateAndVerify(page, { year: "2025", month: "05", day: "01" }, {
      scope: page.getByTestId("transfer-date"),
    });
    await expandAssetSection(page, 1);
    await page.getByRole("button", { name: "주택", exact: true }).first().click();
    await page.getByRole("switch", { name: "겸용주택 분리계산" }).click();
    await page.getByRole("switch", { name: "보유 중 일부 용도변경" }).click();
    await fillDateExact(page.locator("div").filter({ hasText: /^용도변경일/ }).first(), {
      year: "2018", month: "06", day: "15",
    });
    await expandAssetSection(page, 3);
    await page.getByRole("button", { name: "매매", exact: true }).click();
    await page.getByRole("button", { name: "환산취득가" }).click();
    await fillDateExact(page.locator('[data-asset-card-index="0"] [data-asset-section="3"]'), {
      year: "2010", month: "06", day: "15",
    });
    await page.getByPlaceholder("주택 전용면적").fill("120");
    await page.getByPlaceholder("상가(비주택) 전용면적").fill("80");
    await page.getByPlaceholder("건축물대장의 건축면적").fill("100");
    await page.getByRole("switch", { name: /개별주택가격 미공시/ }).click();

    const mixedPhd = page.locator("div.bg-primary\\/5").filter({ hasText: "개별주택가격 미공시 취득" }).first();
    await expect(mixedPhd).toBeVisible();
    await fillDateExact(mixedPhd, { year: "2015", month: "04", day: "30" });

    await mixedPhd.getByRole("button", { name: "3시점 주택·상가 건물기준시가 일괄 계산" }).click();
    const modal = page.getByRole("dialog").filter({ hasText: "3시점 건물 기준시가 일괄 계산" });
    await expect(modal).toBeVisible();
    // (구) "당시 실제 용도(주택)로 자동 산출" 안내 단언 삭제 — f03f9ad0(2026-07-10)이
    //      연면적 아래 상가분 자동산출 안내 블록을 제거했다(도움말 정리). 산출·적용 검증은 아래 존치.

    await modal.getByPlaceholder("신축연도 (4자리)").fill("2010");
    // 부분1 주택
    await fillCombos(page, modal, "구조 선택", /철근콘크리트조/, 3);
    await fillCombos(page, modal, "용도 선택", /단독|다가구|주택/, 3);
    await modal.getByPlaceholder("연면적").first().fill("120");
    // 부분2 상가
    await modal.getByRole("button", { name: "+ 부분 추가" }).click();
    await modal.getByRole("button", { name: "상가", exact: true }).nth(1).click();
    await fillCombos(page, modal, "구조 선택", /철근콘크리트조/, 1);
    await fillCombos(page, modal, "용도 선택", /근린생활/, 1);
    await modal.getByPlaceholder("연면적").last().fill("80");

    const land = modal.getByPlaceholder("원/㎡");
    await land.nth(0).fill("2000000");
    await land.nth(1).fill("2200000");
    await land.nth(2).fill("3486000");

    await modal.getByRole("button", { name: "3시점 계산하기" }).click();

    // housing 3 + commercial 3 = 6개
    const applyBtn = modal.getByRole("button", { name: /모두 적용/ });
    await expect(applyBtn).toBeVisible();
    await expect(applyBtn).toContainText("6개");
    // 취득·최초공시 상가건물 산출줄 노출
    await expect(modal.getByText("취득시 상가건물 기준시가")).toBeVisible();
    await expect(modal.getByText("최초공시일 상가건물 기준시가")).toBeVisible();
    const shown = await modal.locator("span.font-mono").allInnerTexts();
    console.log("[T7] Case A 6필드 산출값:", shown.join(" / "));

    await applyBtn.click();
    await expect(modal).toBeHidden();
  });

  test("T10: 단독 취득 2000이전(1999) 시점별 용도 — 취득 6,044,400 (홈택스 일치)", async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // 양도일 2026
    await fillDateAndVerify(page, { year: "2026", month: "05", day: "01" }, {
      scope: page.getByTestId("transfer-date"),
    });

    await expandAssetSection(page, 1);
    await page.getByRole("button", { name: "주택", exact: true }).first().click();

    await expandAssetSection(page, 3);
    await page.getByRole("button", { name: "매매", exact: true }).click();
    await page.getByRole("button", { name: "환산취득가" }).click();

    // 취득일 1999 (< 2005.4.29 → PHD 자동 활성, ≤2000 → 산정기준율 경로)
    await fillDateExact(page.locator('[data-asset-card-index="0"] [data-asset-section="3"]'), {
      year: "1999", month: "06", day: "15",
    });
    const phdToggle = page
      .locator('[data-slot="toggle-card"]')
      .filter({ hasText: "취득 당시 개별주택가격 미공시" })
      .getByRole("switch");
    if ((await phdToggle.getAttribute("aria-checked")) !== "true") {
      await phdToggle.click();
    }

    const phd = phdSection(page);
    await expect(phd).toBeVisible();
    await fillDateExact(phd, { year: "2005", month: "04", day: "30" });

    await phd.getByRole("button", { name: "3시점 건물기준시가 일괄 계산" }).click();
    const modal = page.getByRole("dialog").filter({ hasText: "3시점 건물 기준시가 일괄 계산" });
    await expect(modal).toBeVisible();

    await modal.getByPlaceholder("신축연도 (4자리)").fill("1966");
    // 시점별 3블록(취득 2001체계·최초공시 2005·양도 2026) — 구조 시멘트블록조, 용도 단독(각 체계 첫 단독옵션)
    await fillCombos(page, modal, "구조 선택", /시멘트블록/, 3);
    await fillCombos(page, modal, "용도 선택", /단독/, 3);
    await modal.getByPlaceholder("연면적").fill("115");

    // 취득(≤2000) 행은 LandPriceLookupField(2001 고정 조회) — "2001년 (기준)" 표시 + 조회 버튼 노출
    await expect(modal.getByText("2001년 (기준)")).toBeVisible();
    await expect(modal.getByRole("button", { name: "공시지가 조회" })).toBeVisible();

    // 시점별 공시지가 취득 930,000 / 최초공시 1,470,000 / 양도 2,548,000
    // 취득(≤2000) 필드는 placeholder가 "2001.1.1. 현재 공시지가"로 분리됨(LandPriceLookupField ②열).
    await modal.getByPlaceholder("2001.1.1. 현재 공시지가").fill("930000");
    const land = modal.getByPlaceholder("원/㎡"); // 최초공시·양도 2개
    await land.nth(0).fill("1470000");
    await land.nth(1).fill("2548000");

    await modal.getByRole("button", { name: "3시점 계산하기" }).click();

    // 취득당시(1999) = 6,044,400 (5,520,000 × 1.095) — 홈택스 실측 일치
    await expect(modal.getByText("6,044,400")).toBeVisible();
    const shown = await modal.locator("span.font-mono").allInnerTexts();
    console.log("[T10] 3시점 산출값:", shown.join(" / "));
    const applyBtn = modal.getByRole("button", { name: /모두 적용/ });
    await expect(applyBtn).toContainText("3개");
  });

  // §166⑥ 분리 가드 — 부수토지 공시지가=토지 취득일 / 건물 기준시가=건물 취득일.
  // 유닛 정본: __tests__/calc/phd-acquisition-date-building.test.tsx (2026-07-11 B안 정정).
  test("T9: 토지·건물 취득일 다름 — 부수토지 공시지가=토지일(2013) / 건물 std=건물일(2014)", async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    await fillDateAndVerify(page, { year: "2026", month: "09", day: "01" }, {
      scope: page.getByTestId("transfer-date"),
    });

    await expandAssetSection(page, 1);
    await page.getByRole("button", { name: "주택", exact: true }).first().click();

    await expandAssetSection(page, 3);
    await page.getByRole("button", { name: "매매", exact: true }).click();
    await page.getByRole("button", { name: "환산취득가" }).click();

    // 건물 취득일 2014-09-14
    await fillDateExact(page.locator('[data-asset-card-index="0"] [data-asset-section="3"]'), {
      year: "2014", month: "09", day: "14",
    });

    // 토지·건물 취득일 다름 ON → 토지 취득일 2013-06-01
    await page.getByRole("switch", { name: "토지·건물 취득일 다름" }).click();
    await fillDateExact(
      page.locator("div").filter({ hasText: /^토지 취득일/ }).first(),
      { year: "2013", month: "06", day: "01" },
    );

    // PHD(개별주택가격 미공시) ON
    const phdToggle = page
      .locator('[data-slot="toggle-card"]')
      .filter({ hasText: "취득 당시 개별주택가격 미공시" })
      .getByRole("switch");
    if ((await phdToggle.getAttribute("aria-checked")) !== "true") {
      await phdToggle.click();
    }

    const phd = phdSection(page);
    await expect(phd).toBeVisible();
    await fillDateExact(phd, { year: "2015", month: "04", day: "30" });

    // ── 시점 블록 스코프 필수 ──
    // 스코프 없는 getByText(/2014년 \(자동\)/)는 **② 최초공시일의 2014**를 잡아 통과해버린다
    // (최초공시일 2015-04-30 < 공시일 6.1 → 전년도 2014 공시 적용). 취득 필드를 증명하지 못한다.
    const block = (label: string) =>
      phd.locator("div").filter({ hasText: new RegExp("^" + label) }).first();

    // ① 취득 부수토지 공시지가 = **토지** 취득일(2013). §166⑥ — 부수토지 기준시가는
    //    공시지가 × 면적의 land value이므로 토지 취득 당시 공시지가로 산정한다(10aa63d6 정정).
    await expect(block("① 취득시").getByText("2013년 (자동)")).toBeVisible();
    await expect(block("① 취득시").getByText("2014년 (자동)")).toHaveCount(0);

    // ② 최초공시일의 2014는 별개 규칙(공시일 이전 → 전년도)이며 취득의 건물일과 무관
    await expect(block("② 최초공시일").getByText("2014년 (자동)")).toBeVisible();

    // 일괄 모달 취득시 = **건물** 취득일(2014). 건물 기준시가·batch·신축연도는 건물일 유지
    // (결합 분리 — 부수토지 공시지가 축과 별개).
    await phd.getByRole("button", { name: "3시점 건물기준시가 일괄 계산" }).click();
    const modal = page.getByRole("dialog").filter({ hasText: "3시점 건물 기준시가 일괄 계산" });
    await expect(modal).toBeVisible();
    await expect(modal.getByText(/취득시 \(2014년\)/)).toBeVisible();
    await expect(modal.getByText(/취득시 \(2013년\)/)).toHaveCount(0);
  });
});
