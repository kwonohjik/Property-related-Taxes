/**
 * E2E: 의제취득일(1985.1.1.) 전 상속 ③ × 영 §164⑨ 공익수용 (계획서 inheritance-pre-deemed-clause-b-revisit.plan.md §14 · Q-10 A).
 *
 * 상속 자산에는 환산 토글이 없어 종전에는 보상액 칸이 열리지 않았고, ③은 원값 분모로 비교·표시됐다.
 * 이제 ③ 후보면 칸이 열리고, ③은 특례로 낮춘 분모로 비교된다 — 결과 카드의 ③ = 양도차익의 취득가액.
 *
 * 시료: 토지 · 1980 상속(가목 확인 불가 선언) · 양도 10억 · ③ 분자 1천만 · 양도시 1,000,000/㎡ × 200㎡ = 2억
 *   보상 600,000/㎡ → 분모 1.2억 · ③ = 10억 × 1천만 ÷ 1.2억 = 83,333,333 (원값 분모면 50,000,000)
 *
 * 실행: E2E_PORT=<worktree 포트> npx playwright test e2e/transfer-pre-deemed-expropriation.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

function seedForm() {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            addressJibun: "서울 강남구 테스트동 1-1",
            assetKind: "land",
            landNature: "independent_bare_land",
            acquisitionCause: "inheritance",
            acquisitionDate: "1980-03-01",
            decedentAcquisitionDate: "1970-01-01",
            inheritanceAssetKind: "land",
            useEstimatedAcquisition: false,
            standardPriceAtAcq: "10000000",
            standardPriceAtTransfer: "200000000",
            preDeemedClauseAUnconfirmed: true,
            transferCause: "public_expropriation",
            expropriationNoticeDate: "2023-01-01",
            acquisitionArea: "200",
            transferArea: "200",
            actualSalePrice: "1000000000",
            residenceInputMode: "direct",
            residencePeriods: [],
          },
        ],
        transferDate: "2024-03-01",
        filingDate: "2024-05-31",
        contractTotalPrice: "1000000000",
        householdHousingCount: "0",
        isOneHousehold: false,
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
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedForm());
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

const field = (page: Page, f: string) => page.locator(`[data-field="${f}"] input`).first();

test.describe("의제취득일 전 상속 ③ × 공익수용", () => {
  test("환산 토글 없이도 보상액 칸이 열린다 → 입력 → 계산 → body 보상액 · ③ 83,333,333 = 양도차익의 취득가액", async ({ page }) => {
    test.setTimeout(120_000);
    await seedAndOpen(page);
    await expandAssetSection(page, 2);

    // 양도시 ㎡당 공시지가 — 상속 자산은 수용 블록에서만 받는다(시드에 넣지 않고 화면으로 입력 · 면적은 기본정보 칸)
    await page.getByTestId("expr-pre-deemed-std-persqm").fill("1000000");
    await expect(field(page, "compensationPerSqm")).toBeVisible();
    await field(page, "compensationPerSqm").fill("600000");
    await field(page, "compensationBasisStdPrice").fill("800000");

    for (const step of ["보유 상황", "감면·공제", "가산세"]) {
      await page.getByRole("button", { name: step }).first().click();
    }
    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: /계산하기/ }).click();
    const resp = await calcResponse;
    expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()} ${await resp.text()}`).toBe(true);

    const sent = resp.request().postDataJSON() as Record<string, unknown>;
    expect(sent).toMatchObject({
      transferCause: "public_expropriation",
      standardPricePerSqmAtTransfer: 1_000_000,
      transferArea: 200,
      compensationPerSqm: 600_000,
      compensationBasisStdPrice: 800_000,
    });
    expect((sent.inheritedAcquisition as { mode: string }).mode).toBe("pre-deemed");

    const result = (await resp.json()).data.result;
    expect(result.inheritedAcquisitionDetail.preDeemedBreakdown).toMatchObject({ selectedMethod: "converted", convertedAmount: 83_333_333 });
    expect(result.estimatedBase).toBe(83_333_333);
    expect(result.expropriationValuationDetail.denominator).toBe(120_000_000);
  });

  test("특례 칸을 비우면 「다음」에서 막히고, 안내를 누르면 그 칸(① 양도시 ㎡당 공시지가)으로 간다 — ⑧이 ⑫와 같은 판정", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page);
    await page.getByRole("button", { name: "다음", exact: true }).click();
    const issue = page.getByTestId("validation-issues").getByRole("button", { name: /양도시 ㎡당 공시지가\(원\/㎡\)를 입력하세요/ });
    await expect(issue).toBeVisible();
    await issue.click();
    await expect(page.getByTestId("expr-pre-deemed-std-persqm")).toBeFocused();
  });
});
