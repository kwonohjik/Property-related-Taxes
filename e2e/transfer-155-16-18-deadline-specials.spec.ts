/**
 * §155⑯ 공공기관 지방이전(3년→5년 + 1년 요건 면제) · §155⑱ 처분기한 예외 E2E.
 *
 * 계획서: docs/02-design/features/transfer-155-deeming-gaps.plan.md (E-1·E-2)
 *
 * 엔진 anchor(`__tests__/tax-engine/transfer/temporary-two-house-155-16-18.anchor.test.ts` 16건)가
 * 판정을 커버한다. 여기서 보는 것은 **배관과 표시**다:
 *   ①②③④⑫⑬⑭ 폼 토글·라디오 → API → 엔진 도달 (boolean·enum은 TS가 잡지 못하는 침묵 strip 구간)
 *   ⑤ 판정 카드가 5년 기한·⑱ 치유를 반영하는가
 *
 * ## 🔄 화면이 **판정 메뉴로 옮겨졌다** (P6-b)
 *
 * §155⑯·⑱은 §155① 일시적 2주택의 **하위 요건**이고, 그 중과 배제는 영 §167의10①15호
 * (「§154①의 요건을 모두 충족」 2요소)라 비과세 판정을 경유한다 ⇒ 계산기 ③에서 판정 메뉴로.
 * **같은 컴포넌트**라 단언은 바뀌지 않는다 — 마운트 화면만 옮긴다.
 *
 * worktree 실행: E2E_PORT=3xxx npx playwright test e2e/transfer-155-16-18-deadline-specials.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { gotoJudgmentStep2 } from "./_helpers/judgment-seed";

/** 판정 메뉴는 주택 수를 **명부**에서 센다 — `householdHousingCount`는 덮어써진다. */
function gotoHolding(page: Page, over: Record<string, unknown> = {}) {
  return gotoJudgmentStep2(page, {
    assets: [
      {
        ...makeDefaultAsset(1),
        addressJibun: "서울 강남구 테스트동 1-1",
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
    isRegulatedArea: false,
    isUnregistered: false,
    temporaryTwoHouseSpecial: true,
    // 신규취득 2020-01-01 → 양도 2026-06-01 = 6년 4개월. 3년·5년 기한 모두 초과.
    newHouseAcquisitionDate: "2020-01-01",
    ...over,
  });
}

/**
 * ⑫⑬⑭ 배관 전용 — **계산기** 폼을 직접 시드한다.
 *
 * 🔑 입력 위젯은 판정 메뉴로 갔지만 **값은 flat 필드라 ④가 그대로 보낸다**. 그것이
 *    P6-b가 지켜야 하는 것이고(OH-21), 그 주장은 계산기에서 계산해 봐야만 관측된다.
 */
async function gotoCalcHolding(page: Page, over: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          assets: [
            {
              ...makeDefaultAsset(1),
              addressJibun: "서울 강남구 테스트동 1-1",
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
          newHouseAcquisitionDate: "2020-01-01",
          ...over,
        },
        pendingMigration: false,
      },
      version: 0,
    },
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

  test("W-2 연접 판정 — 비연접이면 미충족 배지", async ({ page }) => {
    await gotoHolding(page, {
      publicInstitutionRelocation: true,
      relocatedSigunguCode: "4111700000", // 수원 영통
      newHouseSigunguCode: "5011000000", // 제주시
    });
    await expect(page.getByTestId("relocation-region-verdict")).toContainText("연접하지 않습니다");
  });

  test("W-2 연접 판정 — 연접이면 충족 배지 (수원 영통 ↔ 용인 기흥)", async ({ page }) => {
    await gotoHolding(page, {
      publicInstitutionRelocation: true,
      relocatedSigunguCode: "4111700000",
      newHouseSigunguCode: "4146300000",
    });
    await expect(page.getByTestId("relocation-region-verdict")).toContainText("연접한 시·군");
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

    await gotoCalcHolding(page, {
      publicInstitutionRelocation: true,
      disposalDelayReason: "kamco",
      newHouseAcquisitionDate: "2022-06-01",
    });
    // 편집 칸은 판정 메뉴로 갔다 — 대신 읽기 전용 요약이 그 값을 말한다.
    await expect(page.getByTestId("imported-temp-two-house-specials")).toBeVisible();
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    await page.getByText("산출세액").first().waitFor({ timeout: 20000 });

    expect(tth?.publicInstitutionRelocation).toBe(true);
    expect(tth?.disposalDelayReason).toBe("kamco");

    // ⑦ 결과에 근거가 남는다 — 내부 id가 아니라 한국어 호 라벨
    await expect(page.getByText(/§155⑯ 지방이전/).first()).toBeVisible();
  });
});
