/**
 * E2E: 토지/건물 취득·양도가액 독립 산정 — 파트별 게이팅.
 *
 * 계획서: docs/02-design/features/transfer-land-building-independent-valuation-mode.plan.md
 * UI: components/calc/transfer/LandBuildingSplitSection.tsx
 *
 * 2026-07-28 재작성 — 구 UI(자산 전체 "취득가액 산정 방식" 라디오 + "직접 입력" 버튼)를
 * 폐지하고 파트별(토지·건물 각각 4방식) 독립 선택 UI로 교체한 데 따른 spec 재작성.
 *
 * 새 UI 구조:
 *  - 토지 취득 방식: `part-acq-mode-land` (실거래가·환산취득가·감정가액·매매사례가액)
 *  - 건물 취득 방식: `part-acq-mode-building` (동일 4옵션, 토지와 완전 독립)
 *  - 양도 방식: `sale-split-mode` (구분양도(직접입력) | 일괄양도(양도시 기준시가 안분)) — 기본값 "일괄양도"
 *  - 부담부증여(② 양도정보 라디오) 선택 시 파트별 모드 선택 자체가 사라지고 안내만 표시
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

async function setupSplitAsset(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await expandAssetSection(page, 1);
  await page.getByRole("button", { name: "주택", exact: true }).first().click();
  await expandAssetSection(page, 3);
  await page.getByRole("button", { name: "매매", exact: true }).click();
  await page.getByRole("switch", { name: /토지·건물 취득일 다름/ }).click();
}

const landAcqGroup = (p: Page) => p.getByTestId("part-acq-mode-land");
const buildingAcqGroup = (p: Page) => p.getByTestId("part-acq-mode-building");
const saleSplitGroup = (p: Page) => p.getByTestId("sale-split-mode");
const landAcq = (p: Page) => p.getByTestId("split-land-acq-price");
const landTransfer = (p: Page) => p.getByTestId("split-land-transfer-price");
const landSalesCase = (p: Page) => p.getByTestId("split-land-salescase-value");
const landTransferStdPrice = (p: Page) => p.getByText("토지 양도시 기준시가");

test.describe("P1 — 분리 모드 취득시 기준시가 입력 노출", () => {
  // 계획서: transfer-separate-acq-date-per-part-completion.plan.md §3.1
  // 버그: 취득시 기준시가 3요소가 "환산취득가" 모드에서만 렌더돼(CompanionAcqPurchaseBlock.tsx:454),
  // 실거래가 분리 모드에서는 §166⑥ 안분 비율 소스를 입력할 방법 자체가 없었다
  // → calcApportionRatio null → calcSplitGain 전체 null → 분리 계산이 오류 없이 비활성.
  test("실거래가 모드(기본)에서도 '취득시 기준시가' 입력이 노출된다", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    await expect(
      page.getByText("취득시 기준시가", { exact: false }).first(),
      "분리 모드는 실거래가여도 안분 비율 산정에 취득시 기준시가가 필수다",
    ).toBeVisible();
  });

  test("실거래가 모드에서 '양도시 기준시가'(환산 분모)는 노출되지 않는다", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    // 상단 공용 "양도시 기준시가"는 환산 분모 전용 — 비환산 분리 진입에서는 숨긴다.
    // (파트별 양도시 기준시가는 LandBuildingSplitSection이 별도로 노출)
    await expect(page.getByText("양도시 기준시가 (원)", { exact: false })).toHaveCount(0);
  });

  test("분리 OFF + 실거래가 → 취득시 기준시가 미노출 (회귀 0)", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await expandAssetSection(page, 1);
    await page.getByRole("button", { name: "주택", exact: true }).first().click();
    await expandAssetSection(page, 3);
    await page.getByRole("button", { name: "매매", exact: true }).click();
    // 분리 토글을 켜지 않음 — 종전 동작 그대로 숨김
    await expect(page.getByText("취득시 기준시가", { exact: false })).toHaveCount(0);
  });
});

test.describe("파트별 취득 방식 게이팅 — 토지", () => {
  test("실거래가(기본) → 취득가액 칸 노출, 양도가액 칸은 일괄양도 기본이라 숨김", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    await expect(landAcqGroup(page)).toBeVisible();
    await expect(buildingAcqGroup(page)).toBeVisible();
    await expect(saleSplitGroup(page)).toBeVisible();
    await expect(landAcq(page)).toBeVisible();
    // 양도 방식 기본값은 "일괄양도 (양도시 기준시가 안분)" — 구분양도 직접입력 칸은 미노출
    await expect(landTransfer(page), "기본값은 일괄양도이므로 양도가액 직접입력 칸 숨김").toHaveCount(0);
  });

  // 저장 필드는 실거래가와 같지만(landAcquisitionPrice 재사용) **testid는 분리**한다 —
  // E2E에서 두 모드를 구분할 수 없으면 모드 전환 회귀를 잡지 못한다.
  test("감정가액 → 감정가액 칸 노출 (저장 필드는 실거래가와 동일, testid는 분리)", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    await landAcqGroup(page).getByRole("radio", { name: "감정가액" }).check();
    await expect(page.getByTestId("split-land-appraisal-value")).toBeVisible();
    await expect(landAcq(page), "실거래가 testid로는 잡히지 않아야 모드 구분이 가능하다").toHaveCount(0);
  });

  test("환산취득가 → 취득가액 칸 숨김 + 양도시 기준시가 칸 노출", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    await landAcqGroup(page).getByRole("radio", { name: "환산취득가" }).check();
    await expect(landAcq(page)).toHaveCount(0);
    await expect(landTransferStdPrice(page)).toBeVisible();
  });

  test("매매사례가액 → 취득가액 칸 숨김 + 매매사례가 칸 + 안분 안내", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    await landAcqGroup(page).getByRole("radio", { name: "매매사례가액" }).check();
    await expect(landAcq(page), "추계액은 토지/건물 개별 실지가액이 없다").toHaveCount(0);
    await expect(landSalesCase(page)).toBeVisible();
    await expect(page.getByText("미입력 시 취득시 기준시가 비율로 안분")).toBeVisible();
  });
});

test.describe("양도 방식 게이팅 — 취득과 독립", () => {
  test("구분양도(직접입력) → 토지·건물 양도가액 칸 노출", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    await saleSplitGroup(page).getByRole("radio", { name: "구분양도 (직접입력)" }).check();
    await expect(landTransfer(page)).toBeVisible();
    await expect(page.getByTestId("split-building-transfer-price")).toBeVisible();
  });

  test("일괄양도(안분) → 양도시 기준시가 칸 노출, 직접입력 칸 숨김", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    await saleSplitGroup(page).getByRole("radio", { name: "일괄양도 (양도시 기준시가 안분)" }).check();
    await expect(landTransfer(page)).toHaveCount(0);
    await expect(landTransferStdPrice(page)).toBeVisible();
  });
});

test("부담부증여 → 파트별 모드 선택 자체 숨김 + 취득·양도가액 칸 모두 숨김 (§159 안분 기준)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await setupSplitAsset(page);
  // ② 양도정보에서 부담부증여 선택 — 3지선다는 inline RadioCardGroup(라벨 "부담부증여 (소령 §159)")
  await expandAssetSection(page, 2);
  await page.getByRole("radio", { name: /부담부증여/ }).check();
  await expandAssetSection(page, 3);
  // 부담부증여는 양도가/취득가 모두 §159 기준시가 비율로 엔진이 자동 산정하므로
  // 파트별 취득 방식 라디오·양도 방식 라디오 자체가 노출되지 않고 안내만 표시된다.
  await expect(landAcqGroup(page)).toHaveCount(0);
  await expect(buildingAcqGroup(page)).toHaveCount(0);
  await expect(saleSplitGroup(page)).toHaveCount(0);
  await expect(landAcq(page)).toHaveCount(0);
  await expect(landTransfer(page)).toHaveCount(0);
  await expect(page.getByTestId("split-burdened-note")).toBeVisible();
});

/**
 * P5 — 별개 취득(토지·건물 취득시기 상이) UI 게이트.
 *
 * 게이트는 `isSeparateAcquisition()`(lib/calc/transfer-tax-split-acq-mode.ts) 단일 소스.
 * 분리 토글만으로는 켜지지 않는다 — 겸용주택·`selfOwns≠both`도 그 토글을 강제로 켜기 때문에,
 * **취득일이 실제로 다를 때만** 상단 축 A(자산 전체 취득가액)를 숨긴다.
 */
async function fillDate(page: Page, testid: string, y: string, m: string, d: string) {
  const root = page.getByTestId(testid);
  await root.getByLabel("연도").fill(y);
  await root.getByLabel("월").fill(m);
  await root.getByLabel("일").fill(d);
}

/** 분리 토글 ON + 취득일을 실제로 다르게 입력 (건물 2018-06-01 / 토지 2015-06-01) */
async function setupSeparateAcq(page: Page) {
  await setupSplitAsset(page);
  await fillDate(page, "acq-date-building", "2018", "06", "01");
  await fillDate(page, "acq-date-land", "2015", "06", "01");
}

// 상단 축 A 라벨은 분리 섹션의 "취득가액 산정 방식 — 토지·건물 독립 선택"과 substring이 겹친다
// → exact:true 필수 (e2e/CLAUDE.md §3 substring 오매칭).
const topAcqModeLabel = (p: Page) => p.getByText("취득가액 산정 방식", { exact: true });

test.describe("P5 — 별개 취득 상단 축 A 숨김", () => {
  test("U1: 취득일 상이 → 상단 '취득가액 산정 방식' 미표시 + 안내 카드 표시", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSeparateAcq(page);
    await expect(topAcqModeLabel(page)).toHaveCount(0);
    await expect(
      page.getByTestId("split-acq-total-note"),
      "총 취득가액이 실재하지 않는다는 설명이 없으면 사용자가 입력칸 소실을 결함으로 읽는다",
    ).toBeVisible();
  });

  test("U2: 토지 실가 / 건물 환산 → 토지만 금액칸", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSeparateAcq(page);
    await buildingAcqGroup(page).getByRole("radio", { name: "환산취득가" }).click();
    await expect(landAcq(page)).toBeVisible();
    await expect(page.getByTestId("split-building-acq-price")).toHaveCount(0);
  });

  test("U4: 양쪽 실가 + 금액 입력 → 파트 금액이 유지된다", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSeparateAcq(page);
    await landAcq(page).fill("300000000");
    await page.getByTestId("split-building-acq-price").fill("250000000");
    // CurrencyInput은 blur 시에만 콤마를 붙인다(포커스 중인 칸은 raw) → 포맷 무관 매칭.
    // 검증 대상은 "두 파트 값이 각각 보존되는가"이지 표시 포맷이 아니다.
    await expect(landAcq(page)).toHaveValue(/^300,?000,?000$/);
    await expect(page.getByTestId("split-building-acq-price")).toHaveValue(/^250,?000,?000$/);
  });

  test("U5: 분리 토글 OFF 복귀 → 상단 입력 복원 (폼 상태 보존)", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSeparateAcq(page);
    await expect(topAcqModeLabel(page)).toHaveCount(0);
    await page.getByRole("switch", { name: /토지·건물 취득일 다름/ }).click();
    await expect(topAcqModeLabel(page)).toBeVisible();
  });

  test("🔴 U6: 취득일 동일 → 상단 입력 유지 (오포섭 회귀 가드)", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    await fillDate(page, "acq-date-building", "2018", "06", "01");
    await fillDate(page, "acq-date-land", "2018", "06", "01");
    await expect(
      topAcqModeLabel(page),
      "취득일이 같으면 총 취득가액이 실재한다 — 겸용·selfOwns가 분리를 강제해도 상단 입력이 필요하다",
    ).toBeVisible();
    await expect(page.getByTestId("split-acq-total-note")).toHaveCount(0);
  });

  test("🔴 U8: 별개 취득 + 파트 환산 → PHD 토글이 계속 보인다 (숨김 부작용 가드)", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    // §164⑤ 대상 취득일(개별주택가격 최초 고시 2005-04-29 이전)
    await fillDate(page, "acq-date-building", "2003", "06", "01");
    await fillDate(page, "acq-date-land", "2000", "06", "01");
    await landAcqGroup(page).getByRole("radio", { name: "환산취득가" }).click();
    await expect(
      page.getByRole("switch", { name: /개별주택가격 미공시/ }),
      "상단 축 A를 숨기면서 PHD 토글까지 함께 소실되면 §164⑤ 3-시점 입력 경로가 사라진다",
    ).toBeVisible();
  });
});
