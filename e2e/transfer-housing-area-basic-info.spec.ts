/**
 * 주택 기본정보 면적 입력 — Phase 2 게이트 확대 브라우저 확인
 *
 * 종전: 면적 시나리오 섹션이 `assetKind === "land"` 전용이라 주택에서는 면적 칸이 없었고,
 *   `acquisitionArea` 입력은 PHD(§164⑤) 섹션에만 존재했다 → PHD를 끄면 입력 수단 소멸.
 *   그런데 validate-asset.ts:459는 "(자산 기본 정보)에서 입력하세요"로 안내 → 안내↔위치 불일치.
 *
 * 본 스펙이 확인하는 것:
 *   1. 주택 선택 시 ① 기본정보에 면적 입력 칸이 노출된다 (PHD 토글과 무관)
 *   2. 라벨이 「취득·양도 당시 토지 면적 (㎡)」 (원칙 C — 대상어 명시)
 *   3. 환지 시나리오 옵션은 노출되지 않는다 (소득령 §162의2 = 토지 제도)
 *   4. 면적 칸이 화면에 중복 노출되지 않는다
 *
 * 세액 정확성·validate 경로는 vitest anchor가 검증한다
 *   (__tests__/lib/calc/transfer-asset-area-axis.anchor.test.ts).
 *
 * 비-worktree 실행: npx playwright test e2e/transfer-housing-area-basic-info.spec.ts
 */
import { test, expect } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

test.describe("주택 기본정보 면적 입력 (Phase 2 게이트 확대)", () => {
  test("주택 선택 → 기본정보에 토지 면적 칸 노출 + 환지 옵션 부재", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    await page.getByTestId("transfer-date").getByLabel("연도", { exact: true }).fill("2024");
    await page.getByTestId("transfer-date").getByLabel("월", { exact: true }).fill("06");
    await page.getByTestId("transfer-date").getByLabel("일", { exact: true }).fill("15");

    await expandAssetSection(page, 1);

    // 자산 종류 = 주택 (기본값이 주택이어도 명시 클릭으로 상태 고정)
    await page.getByRole("button", { name: "주택", exact: true }).click();

    // 1) 면적 시나리오 Select가 기본정보에 노출된다
    const scenarioSelect = page.getByTestId("area-scenario-select");
    await expect(scenarioSelect).toBeVisible();

    // 2) 라벨 — 주택은 「토지 면적」으로 대상어 명시
    await expect(page.getByText("취득·양도 당시 토지 면적 (㎡)")).toBeVisible();

    // 3) 환지 옵션 부재 — 허용 목록은 same·partial 뿐
    await scenarioSelect.click();
    await expect(page.getByRole("option", { name: /증환지/ })).toHaveCount(0);
    await expect(page.getByRole("option", { name: /감환지/ })).toHaveCount(0);
    await expect(page.getByRole("option", { name: /일부 양도/ })).toBeVisible();
    await page.keyboard.press("Escape");

    // 4) 면적 입력이 동작하고 화면에 중복 노출되지 않는다
    const areaInput = page.getByPlaceholder("면적 입력");
    await expect(areaInput).toHaveCount(1);
    await areaInput.fill("152.75");
    await expect(areaInput).toHaveValue("152.75");
  });

  test("겸용주택 토글 ON → 기본정보 면적 섹션 미노출 (겸용 전용 섹션이 정본)", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    await page.getByTestId("transfer-date").getByLabel("연도", { exact: true }).fill("2024");
    await page.getByTestId("transfer-date").getByLabel("월", { exact: true }).fill("06");
    await page.getByTestId("transfer-date").getByLabel("일", { exact: true }).fill("15");

    await expandAssetSection(page, 1);
    await page.getByRole("button", { name: "주택", exact: true }).click();

    // 게이트 확대 전제 확인 — 일반 주택에서는 노출
    await expect(page.getByTestId("area-scenario-select")).toBeVisible();

    // 겸용주택 토글 ON → mixedUseTotalLandArea + 겸용 전용 섹션이 전체 면적을 담당하므로
    // 기본정보 면적 섹션은 사라져야 한다(중복 입력 방지).
    await page.getByRole("switch", { name: "겸용주택 분리계산" }).click();
    await expect(page.getByTestId("area-scenario-select")).toHaveCount(0);
  });
});

/**
 * Phase F1 — 기본정보 축 B(건물 연면적)·축 C(건물 바닥면적) 신설 브라우저 확인
 *
 * 해소하는 결함:
 *   F-1 축 C 입력 경로가 겸용 ON·취득원인 신축 게이트 안에만 있어, 주택·겸용OFF·매매
 *       자산은 영구 공백이 되고 엔진이 "전량 부수토지"로 가정했다(anchor A-1).
 *   F-2 축 B 폼 필드가 없어 건물기준시가 모달에 `floorArea` prefill이 없었고, 스냅샷 키가
 *       시점별로 갈려 3시점 불일치가 무검증 통과했다(anchor A-3).
 *
 * 세액 영향은 vitest anchor가 고정한다
 *   (__tests__/tax-engine/transfer-tax/basic-info-building-area.anchor.test.ts).
 */
test.describe("Phase F1 — 기본정보 건물 면적(축 B·C)", () => {
  test("주택: 연면적·바닥면적 칸이 기본정보에 노출되고 입력된다", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await expandAssetSection(page, 1);
    await page.getByRole("button", { name: "주택", exact: true }).click();

    // 축 B — 건물 연면적
    const floorArea = page.getByTestId("basic-building-floor-area");
    await expect(floorArea).toBeVisible();
    await floorArea.fill("245.8");
    await expect(floorArea).toHaveValue("245.8");

    // 축 C — 건물 바닥면적(정착면적) + 미입력 시 거동 안내
    const footprint = page.getByTestId("basic-building-footprint-area");
    await expect(footprint).toBeVisible();
    await expect(page.getByText(/전량 부수토지로 가정/)).toBeVisible();
    await footprint.fill("98.4");
    await expect(footprint).toHaveValue("98.4");

    // 축 A와 3개가 각각 1개씩 — 중복 노출 없음
    await expect(page.getByTestId("basic-building-floor-area")).toHaveCount(1);
    await expect(page.getByTestId("basic-building-footprint-area")).toHaveCount(1);
  });

  /**
   * 🔴 U-12(2026-07-30) — 축 A는 **노출된다**. 종전 이 테스트는 "토지가 없는 자산"을
   *    전제로 축 A 미노출을 고정했으나 틀렸다:
   *
   *    「소득세법」 제99조 제1항 제1호는 **나목**(건물)에 "딸린 토지" 문구를 두지 않고
   *    **다목**(오피스텔·상업용건물)에만 "이에 딸린 토지를 포함한다"를 둔다(같은 조
   *    제3항 제4호에서 확인) → **나목 건물의 부수토지는 가목으로 별도 평가**된다.
   *    라벨 "건물(토지 제외)"는 *기준시가 공시 범위*이지 토지 부재가 아니다.
   *    코드도 그렇다 — `toPropertyType(building_non_residential)` → "land"(개별공시지가).
   */
  test("건물(토지 제외): 축 A(토지 면적) + 축 B(연면적) 노출, 축 C만 미노출", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await expandAssetSection(page, 1);
    await page.getByRole("button", { name: "건물(토지 제외)", exact: true }).click();

    await expect(page.getByTestId("basic-building-floor-area")).toBeVisible();
    // 부수토지가 가목으로 별도 평가되므로 축 A가 필요하다
    await expect(page.getByTestId("area-scenario-select")).toHaveCount(1);
    await expect(page.getByText(/취득·양도 당시 토지 면적 \(㎡\)/)).toBeVisible();
    // 축 C(바닥면적)는 §154⑦ 주택 부수토지 한도 판정용이라 대상 아님
    await expect(page.getByTestId("basic-building-footprint-area")).toHaveCount(0);
  });

  test("겸용주택 ON: 축 B·C도 미노출 (겸용 전용 섹션이 정본)", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await expandAssetSection(page, 1);
    await page.getByRole("button", { name: "주택", exact: true }).click();
    // ToggleCard는 BaseUI `<span role="switch">`다 — `setChecked`는 "Not a checkbox or
    // radio button"으로 실패한다. 프로젝트 관례대로 `.click()`을 쓴다(:73 선례).
    await page.getByRole("switch", { name: "겸용주택 분리계산" }).click();

    await expect(page.getByTestId("basic-building-floor-area")).toHaveCount(0);
    await expect(page.getByTestId("basic-building-footprint-area")).toHaveCount(0);
  });
});
