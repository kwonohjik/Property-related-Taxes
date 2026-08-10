/**
 * 양도세 매매사례가액 추계(§176의2③1호) RTMS 자동조회 — E2E (Part C)
 *
 * Plan: docs/01-plan/features/rtms-similar-sales-expansion.plan.md §5
 * 검증: 취득가액 산정 방식에서 "매매사례가액" 모드 선택 → SalesCaseSection 노출
 *       (매매사례가액 입력란 + 실거래가 자동조회 버튼 + 취득시 기준시가 개산공제 base).
 *       자동조회 버튼은 취득 주소·면적 미입력 시 disabled.
 *
 * worktree 실행: E2E_PORT=3101 npx playwright test e2e/transfer-sales-case-rtms.spec.ts
 * ⚠️ stale 서버 주의 — lsof -ti :3101 | xargs kill 후 실행.
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/**
 * 매매사례가액 모드 자산 시드. RTMS 자동조회 활성화 3조건을 인자로 조절:
 *   주소(addressJibun) · 시군구코드(acquisitionSigunguCode) · 면적(acquisitionArea).
 */
function seedForm(opts: {
  address?: string;
  sigunguCode?: string;
  area?: string;
}) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2018-05-10",
            isSalesCaseAcquisition: true, // 매매사례가액 추계 모드
            addressJibun: opts.address ?? "",
            acquisitionSigunguCode: opts.sigunguCode ?? "",
            acquisitionArea: opts.area ?? "",
          },
        ],
        transferDate: "2026-07-24",
        filingDate: "2026-09-30",
        contractTotalPrice: "290000000",
        householdHousingCount: "1",
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seedAndOpen(
  page: Page,
  opts: { address?: string; sigunguCode?: string; area?: string },
) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(opts),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  // 취득정보(③) 펼침 — 매매사례가액 섹션이 그 안에 있음
  await expandAssetSection(page, 3);
}

test.describe("양도세 매매사례가액 추계(§176의2③1호)", () => {
  test("매매사례가액 모드 — 섹션 노출 + 자동조회 disabled 안내 + 수동 입력", async ({
    page,
  }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    const card = page.locator('[data-asset-card-index="0"]');
    // 점진적 노출 — 취득정보(③) 펼침 (취득가액 산정방식 선택자가 ③ 안)
    await expandAssetSection(page, 3);

    // 취득가액 산정 방식: "매매사례가액" 모드 버튼 클릭
    await card.getByRole("radio", { name: /매매사례가액/ }).first().click();

    // SalesCaseSection 노출
    await expect(card.getByText("매매사례가액 (원)")).toBeVisible();
    await expect(
      card.getByText("취득시 기준시가 (원) — 개산공제 base"),
    ).toBeVisible();

    // 취득 당시 면적(㎡) 입력란 노출 (RTMS 유사재산 면적 필터 base)
    await expect(card.getByText("취득 당시 면적 (㎡)")).toBeVisible();

    // 자동조회 버튼 — 취득 주소·면적 미입력 시 disabled + 안내
    const autoBtn = card.getByRole("button", {
      name: "실거래가 자동조회 (RTMS)",
    });
    await expect(autoBtn).toBeVisible();
    await expect(autoBtn).toBeDisabled();
    await expect(
      card.getByText(/자동조회를 사용하려면 취득 주소·면적을 먼저 입력/),
    ).toBeVisible();

    // 개산공제 base(취득시 기준시가) 안내 — §176의2③1호 + 개산공제 3% hint 노출
    await expect(
      card.getByText(/필요경비 개산공제\(취득시 기준시가 × 3%\)/),
    ).toBeVisible();
  });

  test("자동조회 활성화 — 주소·시군구코드·면적 3조건 모두 충족 시 버튼 enabled", async ({
    page,
  }) => {
    const card = page.locator('[data-asset-card-index="0"]');
    const autoBtn = card.getByRole("button", {
      name: "실거래가 자동조회 (RTMS)",
    });

    // 3조건 모두 충족 → enabled, 안내 문구 사라짐
    await seedAndOpen(page, {
      address: "경기 수원시 권선구 금곡동 520",
      sigunguCode: "4111500000",
      area: "84.99",
    });
    await expect(autoBtn).toBeEnabled();
    await expect(
      card.getByText(/자동조회를 사용하려면 취득 주소·면적을 먼저 입력/),
    ).toHaveCount(0);
  });

  test("자동조회 비활성 — 면적만 누락 시 disabled 유지", async ({ page }) => {
    const card = page.locator('[data-asset-card-index="0"]');
    const autoBtn = card.getByRole("button", {
      name: "실거래가 자동조회 (RTMS)",
    });

    // 주소·시군구코드 충족, 면적만 누락 → disabled
    await seedAndOpen(page, {
      address: "경기 수원시 권선구 금곡동 520",
      sigunguCode: "4111500000",
      area: "",
    });
    await expect(autoBtn).toBeDisabled();

    // 면적 입력 후 즉시 enabled 전환 (UI 배선 검증)
    await card.getByTestId("sales-case-acq-area").fill("84.99");
    await expect(autoBtn).toBeEnabled();
  });
});
