/**
 * E2E: 단건 공유지분(축 A) — 「나머지 지분은 타인 소유」 선언으로 계산이 열린다 (R4).
 *
 * 계획서: `docs/02-design/features/transfer-fractional-single-asset-declaration.plan.md`
 *
 * ## 왜 E2E가 정본 게이트인가
 *
 * 이 결함의 본질이 **「화면엔 입력칸·안내가 있는데 통과 경로가 없다」**(dead-end)였다.
 * 그 상태는 유닛 테스트로는 잡히지 않는다 — validate leaf도, 렌더 테스트도 각자는 정상이고
 * **둘을 이어 붙였을 때** 비로소 막힌다. 그래서 「선언 없이는 막히고, 켜면 계산까지 간다」를
 * live app에서 함께 단언한다.
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 * 실행: E2E_PORT=<worktree 포트> npx playwright test e2e/transfer-fractional-single-asset.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** 24억 물건의 40% 지분 · 1세대1주택 — 12억 문턱을 가로지르는 픽스처(anchor H1과 같은 축). */
function seedForm(declared: boolean) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2009-01-01",
            ownershipNumerator: "40",
            ownershipDenominator: "100",
            ownershipRemainderThirdParty: declared ? "yes" : "",
            fixedAcquisitionPrice: "800000000", // 100% 기준
            standardPriceAtTransfer: "1800000000",
            standardPriceAtAcq: "600000000",
            useEstimatedAcquisition: false,
            residencePeriodMonths: "120",
          },
        ],
        transferDate: "2024-06-01",
        filingDate: "2024-08-31",
        contractTotalPrice: "2400000000", // 물건 전체(100%)
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

async function seedAndOpen(page: Page, declared: boolean) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(declared),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

test.describe("단건 공유지분 — 선언 토글 (R4)", () => {
  test("① 기본정보에 「공유 지분율」과 선언 토글이 함께 뜬다", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndOpen(page, false);
    // 자산 카드는 진입 시 전부 접힘 — ① 기본정보를 펼쳐야 지분율·선언이 보인다.
    await expandAssetSection(page, 1);

    const asset1 = page.locator('[data-asset-card-index="0"]');
    // 단건은 「공유 지분율」 라벨 — 지분 분할 모드의 「취득 지분율」이 아니다.
    await expect(asset1.getByText("공유 지분율").first()).toBeVisible();
    await expect(asset1.getByText("100% 기준 입력").first()).toBeVisible();
    // 🔑 이 토글이 없으면 dead-end다 — 입력칸만 있고 통과 경로가 없다.
    await expect(
      asset1.getByText(/이 물건의 나머지 지분은 타인 소유입니다/).first(),
    ).toBeVisible();
  });

  test("🔴 선언 없이는 계산이 차단된다 (회귀 가드)", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, false);

    for (const step of ["보유 상황", "감면·공제", "가산세"]) {
      await page.getByRole("button", { name: step }).first().click();
    }
    await page.getByRole("button", { name: /계산하기/ }).click();

    await expect(page.getByText(/단독으로 계산할 수 없습니다/).first()).toBeVisible({
      timeout: 15_000,
    });
    // 차단 메시지는 두 갈래를 모두 제시한다 — 어느 쪽이든 사용자가 나아갈 수 있어야 한다.
    await expect(page.getByText(/별도 자산으로 추가/).first()).toBeVisible();
  });

  test("선언을 켜면 계산이 끝까지 간다 + 물건 전체 기준으로 과세된다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, true);

    for (const step of ["보유 상황", "감면·공제", "가산세"]) {
      await page.getByRole("button", { name: step }).first().click();
    }

    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: /계산하기/ }).click();
    const resp = await calcResponse;
    expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);

    const body = await resp.json();
    // ⑬ 지분율과 물건 전체 양도가액이 함께 실렸는가 (요청 body 실검증)
    const sent = resp.request().postDataJSON() as Record<string, unknown>;
    expect(sent.ownershipRatio).toBe(0.4);
    expect(sent.totalPropertyTransferPrice).toBe(2_400_000_000);
    expect(sent.transferPrice).toBe(960_000_000);

    // 🔑 24억 물건이므로 12억 초과 = 고가주택 과세다. 지분분(9.6억)으로 판정하면
    //    전액 비과세로 빠진다 — 그 오판이 없음을 세액으로 단언한다.
    expect(body.data.result.totalTax).toBeGreaterThan(0);

    await expect(page.getByText(/결정세액|납부세액|양도소득/).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
