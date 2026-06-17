/**
 * P2 조정대상지역 자동판정 — Step4(보유 상황) UI 흐름 E2E
 *
 * 검증: assets[0].regionCode(법정동코드) + 양도일이 있으면 Step4 진입 시
 *   useEffect가 /api/address/regulated-area를 호출(regionCode 우선·Vworld 무관)하여
 *   ① 자동판정 안내 박스 표시 ② 조정대상지역 토글(isRegulatedArea) 자동 체크.
 *
 * regionCode 직접 주입으로 Vworld 주소검색 의존 없이 실측 (자동판정 로직은 vitest로도 커버).
 * worktree 실행: E2E_PORT=3101 npx playwright test e2e/transfer-regulated-auto.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

/** 양도세 마법사를 Step4(보유 상황)로 진입시키고 assets[0]·양도일을 주입 */
async function seedStep4(
  page: Page,
  asset: Record<string, unknown>,
  transferDate: string,
): Promise<boolean> {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  // zustand persist는 첫 set 전 sessionStorage 미기록 → 완전한 state를 직접 생성.
  // merge가 defaultFormData와 병합하고 assets는 migrateAsset로 정규화하므로 부분 formData로 충분.
  // ⚠️ merge STEP_MIGRATION { 2:1 } → 보유 상황(인덱스 1)에 도달하려면 currentStep=2 주입.
  const seeded = await page.evaluate(
    ({ asset, transferDate }) => {
      sessionStorage.setItem(
        "transfer-tax-wizard",
        JSON.stringify({
          state: {
            currentStep: 2, // STEP_MIGRATION[2] = 1 (보유 상황)
            formData: { assets: [asset], transferDate },
            pendingMigration: false,
          },
          version: 0,
        }),
      );
      return true;
    },
    { asset, transferDate },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  return seeded;
}

test.describe("P2 조정대상지역 자동판정 토글", () => {
  test("강남 regionCode → 조정대상지역 ✓ 자동판정 + 토글 자동 체크", async ({ page }) => {
    const ok = await seedStep4(
      page,
      {
        assetKind: "housing",
        regionCode: "1168010900", // 서울 강남구(11680) — 줄곧 지정
        acquisitionDate: "2018-06-01",
        addressJibun: "서울특별시 강남구 역삼동",
      },
      "2021-06-01",
    );
    expect(ok).toBe(true);

    // 자동판정 안내 박스 + '조정대상지역 ✓'
    await expect(page.getByText("조정대상지역 자동 판별")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("조정대상지역 ✓").first()).toBeVisible({ timeout: 15000 });

    // isRegulatedArea 토글 자동 체크 (양도일 기준 조정대상지역)
    await expect(
      page.getByRole("switch", { name: /양도일 기준 조정대상지역/ }),
    ).toBeChecked({ timeout: 15000 });
  });

  test("미수록 시도(제주) regionCode → 미지정 + 신뢰도 경고", async ({ page }) => {
    const ok = await seedStep4(
      page,
      {
        assetKind: "housing",
        regionCode: "5011010100", // 제주시(50110) — 데이터 미수록
        acquisitionDate: "2018-06-01",
        addressJibun: "제주특별자치도 제주시 이도동",
      },
      "2021-06-01",
    );
    expect(ok).toBe(true);

    await expect(page.getByText("조정대상지역 자동 판별")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("미지정").first()).toBeVisible({ timeout: 15000 });
    // 미수록 → low 신뢰도 경고 노출
    await expect(page.getByText(/신뢰도: low/)).toBeVisible({ timeout: 15000 });
  });
});
