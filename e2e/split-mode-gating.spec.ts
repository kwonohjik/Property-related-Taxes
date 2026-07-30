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
import { fillDateAndVerify } from "./_helpers/tax-flow";

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
// 라벨 텍스트가 아니라 testid로 잡는다 — "양도시 토지 기준시가"는 자동 계산 블록의 면적 hint에도
// 부분 문자열로 등장해 getByText가 strict mode violation을 낸다.
/** 양도시 토지 기준시가 — 표시 전용(공시지가 × 면적 자동). input이 아니다(2026-07-29). */
const landTransferStdPrice = (p: Page) => p.getByTestId("split-land-std-transfer");

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
      "분리 모드에서는 비-별개취득 안분·환산 파트를 위해 입력칸이 노출된다(필수 여부는 파트 모드에 따른다)",
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

/**
 * 양도시 기준시가 **배치** — "쓰는 섹션 아래"에만 노출 (사용자 이미지 6·7).
 * 계획서: docs/02-design/features/transfer-split-std-price-colocation.plan.md
 */
test.describe("양도시 기준시가 배치 — 구분양도 + 파트 환산", () => {
  const saleAxisCard = (p: Page) => p.getByTestId("split-sale-std-card");
  const landPartCard = (p: Page) => p.getByTestId("split-land-std-transfer-card");
  const buildingPartCard = (p: Page) => p.getByTestId("split-building-std-transfer-card");

  test("이미지 6 — 토지만 환산 → 토지 섹션에만 양도시 카드, 건물 계산 기능 미노출", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    await saleSplitGroup(page).getByRole("radio", { name: "구분양도 (직접입력)" }).check();
    await landAcqGroup(page).getByRole("radio", { name: "환산취득가" }).check();

    await expect(saleAxisCard(page), "구분양도에는 안분 비율이 없다").toHaveCount(0);
    await expect(landPartCard(page)).toBeVisible();
    await expect(buildingPartCard(page)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /양도시 건물 기준시가 계산/ }),
      "건물이 실지거래가액이면 건물 양도시 기준시가는 계산에 등장하지 않는다",
    ).toHaveCount(0);
  });

  test("이미지 7 — 건물만 환산 → 건물 섹션에만 양도시 카드 + 계산 런처", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    await saleSplitGroup(page).getByRole("radio", { name: "구분양도 (직접입력)" }).check();
    await buildingAcqGroup(page).getByRole("radio", { name: "환산취득가" }).check();

    await expect(saleAxisCard(page)).toHaveCount(0);
    await expect(buildingPartCard(page)).toBeVisible();
    await expect(page.getByRole("button", { name: /양도시 건물 기준시가 계산/ })).toBeVisible();
    await expect(landPartCard(page), "토지가 실지거래가액이면 토지 기준시가 기능은 불필요").toHaveCount(0);
  });

  /**
   * 이미지 9·10·11 — 주택 별개취득도 건물분 취득시 기준시가를 파트 독립으로 입력·계산한다.
   * §163⑥2호가목은 "라목 주택 **취득당시**의 라목 가액"을 전제하는데, 토지를 먼저 취득했으면
   * 그 시점엔 주택이 없어 라목 결합 공시가 존재하지 않는다.
   */
  test("주택 별개취득 + 건물 환산 → 취득시 건물 기준시가 입력·계산 제공", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    // 취득일 분리 — 토지 2025-01-08 / 건물 2025-08-29 (신축 패턴)
    await fillDateAndVerify(page, { year: "2025", month: "01", day: "08" }, {
      scope: page.locator('[data-asset-card-index="0"] [data-slot="field-card"]').filter({ hasText: "토지 취득일" }),
    });
    await fillDateAndVerify(page, { year: "2025", month: "08", day: "29" }, {
      scope: page.locator('[data-asset-card-index="0"] [data-slot="field-card"]').filter({ hasText: "건물 취득일" }),
    });
    await saleSplitGroup(page).getByRole("radio", { name: "구분양도 (직접입력)" }).check();
    await buildingAcqGroup(page).getByRole("radio", { name: "환산취득가" }).check();

    // 이미지 11 — 취득시 건물기준시가 입력칸(주택도 파트 독립)
    await expect(page.getByTestId("split-building-std-acq")).toBeVisible();
    // 결합 총액 입력 블록은 읽기 전용 파생 표시로 대체된다
    await expect(page.getByTestId("split-acq-std-readonly")).toBeVisible();

    // 이미지 10 — 취득시 계산 모달이 **취득 시점** 입력을 제공한다(양도 시점은 숨김)
    await page.getByRole("button", { name: "취득시 건물 기준시가 계산" }).click();
    const modal = page.getByRole("dialog").filter({ hasText: "계산 후 적용할 시점의 금액" });
    await expect(modal).toBeVisible();
    await expect(modal.getByText("취득당시 구조")).toBeVisible();
    await expect(modal.getByText("취득당시 용도")).toBeVisible();
    await expect(modal.getByText("양도당시 구조"), "취득시 전용 모달은 양도 시점을 숨긴다").toHaveCount(0);
  });

  test("일괄양도로 되돌리면 카드가 축 A로 복귀한다 (상호배타)", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    await saleSplitGroup(page).getByRole("radio", { name: "구분양도 (직접입력)" }).check();
    await landAcqGroup(page).getByRole("radio", { name: "환산취득가" }).check();
    await expect(landPartCard(page)).toBeVisible();

    await saleSplitGroup(page).getByRole("radio", { name: "일괄양도 (양도시 기준시가 안분)" }).check();
    await expect(saleAxisCard(page)).toBeVisible();
    await expect(landPartCard(page), "같은 카드가 두 곳에 동시 노출되면 안 된다").toHaveCount(0);
  });
});

test.describe("양도시 기준시가 자동 계산 (§99①1호 · 부가세령 §64①1호 준용)", () => {
  // 계획서: docs/02-design/features/transfer-split-transfer-std-price-auto.plan.md
  // setupSplitAsset은 "주택"을 고르지만, 양도가액 안분은 주택이라도 파트별 독립 공시액을 쓴다
  // (라목 결합 총액 − 토지분 역산 금지 — 2026-07-29 사용자 확정).
  test("㎡당 공시지가 × 양도면적 → 양도시 토지 기준시가 자동 기록", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    await saleSplitGroup(page).getByRole("radio", { name: "일괄양도 (양도시 기준시가 안분)" }).check();

    await page.getByTestId("split-land-std-transfer-persqm").fill("540000");
    await page.getByTestId("split-land-std-transfer-area").fill("206.6");
    await expect(landTransferStdPrice(page)).toHaveText("111,564,000");
  });

  test("🔴 건물분은 계산기로 산정 — 토지 입력이 건물 칸을 자동 도출하지 않는다", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    await saleSplitGroup(page).getByRole("radio", { name: "일괄양도 (양도시 기준시가 안분)" }).check();

    // 주택이어도 「양도시 건물 기준시가 계산」 런처가 있어야 한다
    await expect(page.getByRole("button", { name: /양도시 건물 기준시가 계산/ })).toBeVisible();

    await page.getByTestId("split-land-std-transfer-persqm").fill("540000");
    await page.getByTestId("split-land-std-transfer-area").fill("206.6");
    await expect(
      page.getByTestId("split-building-std-transfer"),
      "라목 역산이 되살아나면 건물 칸이 자동으로 채워진다",
    ).toHaveValue("");
  });

  /**
   * 「양도시 건물 기준시가 계산」 모달은 양도 시점 필드만 쓴다(applyTimePoint="transfer").
   * 계획서: docs/02-design/features/building-std-modal-single-timepoint.plan.md
   */
  test("양도시 건물 기준시가 모달 — 단일 시점(취득 구조·용도·공시지가 미노출)", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    await saleSplitGroup(page).getByRole("radio", { name: "일괄양도 (양도시 기준시가 안분)" }).check();

    await page.getByRole("button", { name: /양도시 건물 기준시가 계산/ }).click();
    const modal = page.getByRole("dialog").filter({ hasText: "계산 후 적용할 시점의 금액" });
    await expect(modal).toBeVisible();

    // 취득 시점 입력은 노출되지 않는다 — §164⑧ 판정용 취득연도 칸만 남는다
    await expect(modal.getByTestId("bsp-transfer-only-note")).toBeVisible();
    await expect(modal.getByText("취득당시 구조")).toHaveCount(0);
    await expect(modal.getByText("취득당시 용도")).toHaveCount(0);
    await expect(modal.getByText("취득당시 ㎡당 개별공시지가")).toHaveCount(0);
    // exact:true — 위 안내 문구에도 "취득연도"가 들어가 substring 매칭이면 strict violation
    await expect(modal.getByText("취득연도", { exact: true })).toBeVisible();

    // 양도 시점 입력은 그대로
    await expect(modal.getByText("양도당시 구조")).toBeVisible();
    await expect(modal.getByText("양도당시 용도")).toBeVisible();
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


  test("🔴 U10: 주택 별개취득 — 취득시 토지 공시지가·면적 입력이 노출된다", async ({ page }) => {
    // 계획서: transfer-split-acq-std-gate-relaxation.plan.md §4.7 (PR2)
    // 종전에는 축 B 블록이 assetKind==="building" 전용이라, 주택은 이 두 값을 입력할 칸이
    // 앱 어디에도 없었다(공용 StandardPriceInput은 주택에서 총액 칸만·면적 블록은 land 전용).
    // → 엔진 calcAcqStdPair가 항상 null → 환산·감정·매매사례 파트 취득가액이 조용히 0.
    // setupSplitAsset은 "주택"을 고른다.
    test.setTimeout(90_000);
    await setupSeparateAcq(page);

    await expect(page.getByTestId("split-land-std-acq-area")).toBeVisible();
    await expect(page.getByText("취득시 토지 공시지가")).toBeVisible();
    // 2026-07-30 — 주택도 건물분을 파트 독립 입력한다. §163⑥2호가목은 "라목 주택 **취득당시**의
    // 라목 가액"을 전제하는데, 토지를 먼저 취득했으면 그 시점엔 주택이 없어 결합 공시가 없다.
    await expect(page.getByTestId("split-building-std-acq")).toBeVisible();
    await expect(
      page.getByTestId("split-housing-building-derived-note"),
      "역산을 하지 않으므로 역산 안내도 없다(dangling reference 방지)",
    ).toHaveCount(0);
  });


  test("🔴 U11: 취득시 기준시가 필수(*) 표시는 실제로 필요할 때만", async ({ page }) => {
    // 계획서: transfer-split-acq-std-gate-relaxation.plan.md §4.6 (PR3)
    // 양쪽 실가 + 양도가액 구분 근거가 있으면 취득시 기준시가는 계산에 쓰이지 않는다(규칙 ③)
    // → 붉은 별표 필수 표시는 거짓이 된다. 엔진·validate와 같은 술어로 구동한다.
    test.setTimeout(90_000);
    await setupSeparateAcq(page);

    // 2026-07-30 — 별개취득에서는 상단 결합 총액 블록이 **읽기 전용 파생 표시**로 대체되어
    // 붉은 별표가 존재하지 않는다(라목 결합 공시가 없으므로 입력 대상이 아니다).
    // 「취득시 기준시가가 실제로 필요한가」는 이제 **파트 카드 노출**로 표현된다 — 같은 술어
    // (`requiresAcqStdPrice`)가 구동하므로 검증 대상만 옮긴다.
    await expect(page.getByTestId("split-acq-std-readonly")).toBeVisible();

    // 기본 상태(일괄양도 + 양도시 기준시가 미입력) → 안분 근거가 없어 취득시 기준시가가 필요
    await expect(page.getByTestId("split-land-std-acq-card")).toBeVisible();

    // 구분양도로 바꾸고 양도가액을 입력하면 안분 근거가 생겨 취득시 기준시가는 불요
    await saleSplitGroup(page).getByRole("radio", { name: "구분양도 (직접입력)" }).check();
    await landTransfer(page).fill("600000000");
    await expect(
      page.getByTestId("split-land-std-acq-card"),
      "양쪽 실가 + 양도가액 구분이 있으면 취득시 기준시가는 계산에 쓰이지 않는다",
    ).toHaveCount(0);
    // 2026-07-29: 「사용되지 않습니다」 안내로 남겨두던 것을 **숨김**으로 바꿨다 — 계산에 쓰이지
    // 않는 칸을 띄워두는 것 자체가 노이즈. 술어가 false면 블록 자체가 사라진다.
    await expect(page.getByText("취득시 기준시가 (원)", { exact: false })).toHaveCount(0);
  });

  test("🔴 U13: 실가/실가 + 양도가액 구분 → 파트별 취득시 기준시가 카드도 사라진다", async ({ page }) => {
    // 계획서: transfer-split-part-std-card-gating.plan.md D1 (사용자 보고 2026-07-29)
    // 결함: 파트 카드 게이트에 취득 모드가 없어, 실가/실가에서도 환산 전용 입력(㎡당 공시지가·면적)이
    //       계속 떴다. 같은 값을 받는 자산 전체 블록은 이미 술어로 숨겨져 **노출/숨김이 서로 모순**.
    test.setTimeout(90_000);
    await setupSeparateAcq(page);

    // 기본 진입(일괄양도 + 양도시 기준시가 미입력) — 술어 ⑤절 true → 카드 노출
    await expect(page.getByTestId("split-land-std-acq-card")).toBeVisible();

    // 구분양도 + 양도가액 입력 → 안분 근거 확보 → 취득시 기준시가 불요
    await saleSplitGroup(page).getByRole("radio", { name: "구분양도 (직접입력)" }).check();
    await landTransfer(page).fill("600000000");

    await expect(
      page.getByTestId("split-land-std-acq-card"),
      "실가/실가에서는 취득시 기준시가가 계산 어디에도 등장하지 않는다(§99①1호 가목)",
    ).toHaveCount(0);
    await expect(
      page.getByTestId("split-housing-building-derived-note"),
      "가리킬 대상이 사라진 안내는 dangling reference",
    ).toHaveCount(0);

    // 환산으로 되돌리면 취득시 카드가 복귀하고, 양도시 카드도 **같은 파트 섹션**에 나타난다
    // (2026-07-30 배치 — 구분양도에서 양도시 기준시가는 그 파트의 환산 분모 전용).
    await landAcqGroup(page).getByRole("radio", { name: "환산취득가" }).check();
    await expect(page.getByTestId("split-land-std-acq-card")).toBeVisible();
    await expect(page.getByTestId("split-land-std-transfer-card")).toBeVisible();
    await expect(page.getByTestId("split-land-estimated-note")).toContainText(
      "위 「토지 양도시 기준시가」 카드",
    );
  });

  test("🔴 U9: 파트별 취득가액을 다 넣으면 '취득가액을 입력하세요'로 차단하지 않는다", async ({ page }) => {
    // 버그(2026-07-29 사용자 보고): 별개 취득은 자산 전체 취득가액 칸이 UI에서 사라지는데
    // validate가 그 총액을 계속 요구해, 파트 금액을 다 넣어도 계산이 영구 차단됐다.
    test.setTimeout(90_000);
    await setupSeparateAcq(page);
    await landAcq(page).fill("150000000");
    await page.getByTestId("split-building-acq-price").fill("100000000");

    await page.getByRole("button", { name: "다음", exact: true }).click();

    await expect(
      page.getByText("취득가액을 입력하세요", { exact: false }),
      "입력할 칸이 화면에 없는 총액을 요구하면 사용자가 오류를 해소할 방법이 없다",
    ).toHaveCount(0);
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

/**
 * U12 — 입력 흐름 재배치(2026-07-29).
 * 계획서: docs/02-design/features/transfer-split-input-flow-reorder.plan.md
 *
 * 🔴 종전: 「토지·건물 취득일 다름」 토글을 켜도 토지 취득일·양도가액 구분이 약 490줄 아래에
 * 렌더돼, 취득가액 산정 방식·취득가액·취득시 기준시가 블록을 모두 지나야 보였다.
 */
test.describe("U12 — 토글 직하 배치", () => {
  test("🔴 토글 ON 직후 토지 취득일·양도가액 구분이 토글과 같은 화면에 보인다", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);

    const grid = page.getByTestId("acq-date-split-grid");
    await expect(grid).toBeVisible();

    const toggleBox = await page.getByText("토지·건물 취득일 다름").first().boundingBox();
    const gridBox = await grid.boundingBox();
    const saleBox = await page.getByTestId("sale-split-mode").boundingBox();
    const viewportH = page.viewportSize()!.height;

    // 토글 → 날짜 2열 → 양도가액 구분 순서 + 한 화면 안
    expect(gridBox!.y).toBeGreaterThan(toggleBox!.y);
    expect(saleBox!.y).toBeGreaterThan(gridBox!.y);
    expect(
      saleBox!.y - toggleBox!.y,
      "양도가액 구분이 토글에서 한 화면 이상 떨어져 있으면 입력 흐름이 끊긴다",
    ).toBeLessThan(viewportH);
  });

  test("축 A(양도가액 구분)가 축 B(취득가액 파트별)보다 앞에 온다 — 확정 규칙 ①→②", async ({ page }) => {
    test.setTimeout(90_000);
    await setupSplitAsset(page);
    const saleBox = await page.getByTestId("sale-split-mode").boundingBox();
    const acqBox = await page.getByTestId("part-acq-mode-land").boundingBox();
    expect(saleBox!.y).toBeLessThan(acqBox!.y);
  });
});
