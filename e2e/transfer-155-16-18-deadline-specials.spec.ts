/**
 * §155⑯ 공공기관 지방이전(3년→5년 + 1년 요건 면제) · §155⑱ 처분기한 예외 E2E.
 *
 * 계획서: docs/02-design/features/transfer-155-deeming-gaps.plan.md (E-1·E-2)
 *
 * 엔진 anchor(`__tests__/tax-engine/transfer/temporary-two-house-155-16-18.anchor.test.ts` 16건)가
 * 판정을 커버한다. 여기서 보는 것은 **배관과 표시**다:
 *   ①②③④⑫⑬⑭ 폼 토글·라디오 → API → 엔진 도달 (boolean·enum은 TS가 잡지 못하는 침묵 strip 구간)
 *   ⑤ Step4 판정 카드가 5년 기한·⑱ 치유를 반영하는가
 *
 * worktree 실행: E2E_PORT=3xxx npx playwright test e2e/transfer-155-16-18-deadline-specials.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seedForm(over: Record<string, unknown>) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2018-01-01",
            fixedAcquisitionPrice: "700000000",
            transferPrice: "2000000000",
            residencePeriodYears: "3",
          },
        ],
        transferDate: "2026-06-01",
        filingDate: "2026-08-31",
        contractTotalPrice: "2000000000",
        isOneHousehold: true,
        householdHousingCount: "2",
        isRegulatedArea: false,
        isUnregistered: false,
        temporaryTwoHouseSpecial: true,
        // 신규취득 2020-01-01 → 양도 2026-06-01 = 6년 4개월. 3년·5년 기한 모두 초과.
        newHouseAcquisitionDate: "2020-01-01",
        ...over,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function gotoHolding(page: Page, over: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(over),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).first().click();
}

test.describe("§155⑯·⑱ 처분기한 특례", () => {
  test("기본(특례 없음) — 기한 초과로 요건 B 미충족", async ({ page }) => {
    await gotoHolding(page);
    const verdict = page.getByTestId("temp-two-house-verdict");
    await expect(verdict).toContainText("미충족 · 요건 B");
    await expect(verdict).toContainText("3년 내 종전주택 양도");
  });

  test("§155⑱ 경매 신청 → 기한 초과여도 요건 B 충족으로 표시", async ({ page }) => {
    await gotoHolding(page, { disposalDelayReason: "auction" });
    const verdict = page.getByTestId("temp-two-house-verdict");
    await expect(verdict).toContainText("충족 · 요건 B");
    await expect(verdict).toContainText("§155⑱ 사유로 기한 요건 충족 간주");
  });

  test("§155⑯ → 기한이 5년으로 표시되고 1년 요건 면제 문구가 바뀐다", async ({ page }) => {
    await gotoHolding(page, {
      publicInstitutionRelocation: true,
      newHouseAcquisitionDate: "2022-06-01", // 양도까지 4년 → 3년 초과, 5년 이내
    });
    const verdict = page.getByTestId("temp-two-house-verdict");
    await expect(verdict).toContainText("5년 내 종전주택 양도");
    await expect(verdict).toContainText("충족 · 요건 B");
    await expect(verdict).toContainText("§155⑯ 공공기관 이전으로 1년 요건 면제");
  });

  test("⑫⑬⑭ 배관 — 두 필드가 API 요청 본문에 실려 나간다", async ({ page }) => {
    test.setTimeout(60_000);
    let tth: Record<string, unknown> | undefined;
    page.on("request", (req) => {
      if (req.url().includes("/api/calc/transfer") && req.method() === "POST") {
        try {
          tth = (JSON.parse(req.postData() ?? "{}") as Record<string, unknown>)
            .temporaryTwoHouse as Record<string, unknown>;
        } catch {
          /* ignore */
        }
      }
    });

    await gotoHolding(page, {
      publicInstitutionRelocation: true,
      disposalDelayReason: "kamco",
      newHouseAcquisitionDate: "2022-06-01",
    });
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    await page.getByText("산출세액").first().waitFor({ timeout: 20000 });

    expect(tth?.publicInstitutionRelocation).toBe(true);
    expect(tth?.disposalDelayReason).toBe("kamco");

    // ⑦ 결과에 근거가 남는다 — 내부 id가 아니라 한국어 호 라벨
    await expect(page.getByText(/§155⑯ 지방이전/).first()).toBeVisible();
  });
});
