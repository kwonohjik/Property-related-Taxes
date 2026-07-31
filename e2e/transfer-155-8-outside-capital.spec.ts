/**
 * §155⑧ 수도권 밖 부득이한 사유 주택 특례 E2E.
 *
 * 계획서: docs/02-design/features/transfer-155-deeming-gaps.plan.md §1.3 (E-3)
 *
 * 배관 검증(①②③④⑫⑬⑭) + ⑦ 결과 근거 표시.
 * ⚠️ 양도 대상은 **일반주택**이다 — 특례 주택은 보유만 한다. 방향이 뒤집히면 결과가 정반대다.
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
        isRegulatedArea: true,
        isUnregistered: false,
        houses: [
          {
            id: "h2",
            region: "non_capital",
            acquisitionDate: "2019-01-01",
            officialPrice: "800000000",
            isInherited: false,
            isLongTermRental: false,
            isApartment: true,
            isOfficetel: false,
            isUnsoldHousing: false,
          },
        ],
        presaleRights: [],
        ...over,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seedAndCalc(page: Page, over: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(over),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByText("산출세액").first().waitFor({ timeout: 20000 });
}

test.describe("§155⑦ 농어촌주택", () => {
  test("3호 귀농 — ⑬⑭ 배관 + 결과 근거 + ⑪⑫ 사후관리 경고", async ({ page }) => {
    test.setTimeout(60_000);
    let sent: Record<string, unknown> | undefined;
    page.on("request", (req) => {
      if (req.url().includes("/api/calc/transfer") && req.method() === "POST") {
        try {
          sent = (JSON.parse(req.postData() ?? "{}") as Record<string, unknown>).ruralHouse as Record<
            string,
            unknown
          >;
        } catch {
          /* ignore */
        }
      }
    });

    await seedAndCalc(page, {
      ruralHouseSpecial: true,
      ruralHouseKind: "return_to_farm",
      ruralHouseOutsideCapitalEupMyeon: true,
      ruralHouseAcquisitionDate: "2023-01-01",
      ruralHouseLandAreaSqm: "500",
      ruralHouseWholeHouseholdMoved: true,
      ruralHouseHighPriceAtAcquisition: false,
    });

    expect(sent?.kind).toBe("return_to_farm");
    expect(sent?.acquisitionDate).toBe("2023-01-01");
    expect(sent?.landAreaSqm).toBe(500);
    // 유형별 무의미 필드는 실리지 않는다(침묵 오판정 방지)
    expect(sent?.decedentResidenceYears).toBeUndefined();

    await expect(page.getByText(/§155⑦3호 귀농/).first()).toBeVisible();
    await expect(page.getByText(/최초로 양도하는 1개/).first()).toBeVisible();
  });

  test("1호 상속 — 피상속인 거주 5년 미만이면 미적용", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page, {
      ruralHouseSpecial: true,
      ruralHouseKind: "inherited",
      ruralHouseOutsideCapitalEupMyeon: true,
      ruralHouseDecedentResidenceYears: "4",
    });
    await expect(page.getByText(/§155⑦/)).toHaveCount(0);
  });
});

test.describe("§155⑧ 수도권 밖 부득이 주택", () => {
  test("미적용 → 2주택 중과 (대조군)", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page);
    await expect(page.getByText(/§155⑧/)).toHaveCount(0);
  });

  test("적용 → 1주택 의제 근거 + 중과 배제 표시", async ({ page }) => {
    test.setTimeout(60_000);
    let sent: Record<string, unknown> | undefined;
    page.on("request", (req) => {
      if (req.url().includes("/api/calc/transfer") && req.method() === "POST") {
        try {
          sent = (JSON.parse(req.postData() ?? "{}") as Record<string, unknown>)
            .unavoidableOutsideCapitalHouse as Record<string, unknown>;
        } catch {
          /* ignore */
        }
      }
    });

    await seedAndCalc(page, {
      unavoidableOutsideCapitalSpecial: true,
      unavoidableOutsideCapitalReason: "work",
      unavoidableOutsideCapitalResolvedDate: "2025-01-01",
    });

    // ⑬⑭ 배관
    expect(sent?.reason).toBe("work");
    expect(sent?.resolvedDate).toBe("2025-01-01");

    // ⑦ 결과 근거 — 내부 id가 아니라 한국어 라벨
    await expect(page.getByText(/§155⑧ 근무상 형편/).first()).toBeVisible();
    // 중과 배제(§167의10①4호)
    await expect(page.getByText("중과 배제 사유").first()).toBeVisible();
  });
});
