/**
 * E2E: 지분 모드(같은 물건 분할취득) 일괄양도 계산 — 브라우저 실검증 (PR #826).
 *
 * 버그: 같은 물건을 지분 60%(상속)+40%(매매)로 나눠 취득 → 100% 양도 시
 *   "자산 기준시가 합이 0 이하 — 안분 불가" 500 오류.
 * 수정: 지분 모드는 확정 양도가액(총계약가×지분율)을 fixedSalePrice로 주입 → 기준시가 안분 없이 지분율 안분.
 *
 * 본 E2E는 폼 상태 → API 변환(buildTransferPayload가 primaryActualSalePrice를 채우는지)
 *   → /api/calc/transfer POST가 200(500 아님) 응답하는 전체 배관을 live app으로 검증한다.
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 * 실행: npx playwright test e2e/transfer-fractional-bundled.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seedForm() {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "housing",
            acquisitionCause: "inheritance",
            ownershipNumerator: "60",
            ownershipDenominator: "100",
            acquisitionDate: "2008-05-05",
            decedentAcquisitionDate: "2001-01-01",
            inheritanceStartDate: "2008-05-05",
            inheritanceValuationMethod: "supplementary",
            publishedValueAtInheritance: "808000000", // 100% 기준
            useSupplementaryHelper: false,
            useEstimatedAcquisition: false,
            residencePeriodMonths: "177",
          },
          {
            ...makeDefaultAsset(2),
            assetKind: "housing",
            acquisitionCause: "purchase",
            ownershipNumerator: "40",
            ownershipDenominator: "100",
            acquisitionDate: "2021-11-11",
            fixedAcquisitionPrice: "1500000000", // 100% 기준 → ×0.4 = 600M
            useEstimatedAcquisition: false,
            residencePeriodMonths: "177",
          },
        ],
        transferDate: "2023-02-16",
        filingDate: "2023-05-31",
        contractTotalPrice: "1700000000",
        householdHousingCount: "1",
        isOneHousehold: true,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seedAndOpen(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

test.describe("지분 모드 분할취득 일괄양도 계산 (PR #826)", () => {
  test("지분 60% 상속 + 40% 매매 → 계산 200 (기준시가 안분 오류 없음)", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page);

    // 마지막 스텝(가산세)까지 이동 — "세금 계산하기" 버튼 노출.
    // 사이드바 네비로 직행(자산·보유·감면 스텝 통과).
    for (const step of ["보유 상황", "감면·공제", "가산세"]) {
      await page.getByRole("button", { name: step }).first().click();
    }

    // 계산 실행 + API 응답 가드 (500이면 실패로 표면화)
    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: /계산하기/ }).click();
    const resp = await calcResponse;

    expect(
      resp.ok(),
      `계산 API 비정상 응답 ${resp.status()} — 기준시가 안분 오류(버그 재발) 의심`,
    ).toBe(true);

    const body = await resp.json();
    expect(body.data.mode).toBe("bundled");

    // 지분율 안분: 자산1 = 1.7B×60% = 1,020,000,000 / 자산2 = 680,000,000
    const primary = body.data.apportionment.apportioned.find(
      (a: { assetId: string }) => a.assetId === "primary",
    );
    expect(primary.allocatedSalePrice).toBe(1_020_000_000);
    const sum = body.data.apportionment.apportioned.reduce(
      (s: number, a: { allocatedSalePrice: number }) => s + a.allocatedSalePrice,
      0,
    );
    expect(sum).toBe(1_700_000_000);

    // 결과 화면 노출 확인
    await expect(page.getByText(/결정세액|납부세액|양도소득/).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("지분 모드 UI: 취득 지분율 라벨·배지 최상단 + 자산2 ① 기본정보 숨김", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndOpen(page);

    const asset1 = page.locator('[data-asset-card-index="0"]');
    const asset2 = page.locator('[data-asset-card-index="1"]');

    // 자산2: ① 기본정보 섹션 숨김 → 안내배너 노출 (기본정보 아코디언 헤더 부재)
    await expect(asset2.getByTestId("fractional-basic-inherited-notice")).toBeVisible();
    await expect(asset2.getByText("자산종류·소재지·면적은 자산 1과 동일하게 적용됩니다.")).toBeVisible();

    // 자산1 ② 양도정보: 지분 모드는 양도가액 자동계산 → "양도시 기준시가"(§166⑥ 안분) 입력 미노출
    await expect(asset1.getByText("양도시 기준시가 (원)")).toHaveCount(0);
    await expect(asset1.getByText("안분 비율 분모 (§166⑥ 단서)")).toHaveCount(0);

    // 자산1 ③ 취득정보 펼치기(칩 점프) → 지분율 라벨 "취득 지분율" + 배지 "100% 기준 입력"
    await asset1.getByRole("button", { name: /취득/ }).first().click();
    await expect(asset1.getByText("취득 지분율").first()).toBeVisible();
    await expect(asset1.getByText("100% 기준 입력").first()).toBeVisible();
    // "공유 지분율"(비-지분 라벨)은 노출되지 않아야 함
    await expect(asset1.getByText("공유 지분율")).toHaveCount(0);

    // 단일 백분율(%) 입력 — 60/100 시드가 "60"으로 표시, 분자/분모 2칸은 없음
    await expect(asset1.getByPlaceholder("지분율")).toBeVisible();
    await expect(asset1.getByPlaceholder("지분율")).toHaveValue("60");
    await expect(asset1.getByPlaceholder("분자")).toHaveCount(0);
    await expect(asset1.getByPlaceholder("분모")).toHaveCount(0);
  });
});
