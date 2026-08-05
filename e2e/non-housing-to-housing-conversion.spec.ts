/**
 * 비주택 → 주택 용도변경 end-to-end (「소득세법」 §95⑤·⑥ · 시행령 §154⑤ 단서).
 *
 * 참조 사례: 『2026 양도·상속·증여세 이론 및 계산실무』 사례 30 (533~538p)
 *   오피스텔을 업무용으로 취득(2018-02-10) → 주거용 전환(2022-11-25) → 양도(2026-01-27)
 *
 * 세액 자체는 anchor(`non-housing-to-housing-conversion.anchor.test.ts`)가 원 단위로 고정한다.
 * 본 스펙은 **UI 배선**을 검증한다 — 입력 미리보기가 엔진과 같은 값을 내는지, 그 입력이
 * 5단 파이프라인(폼 → API 변환 → Zod → Route → 엔진)을 통과해 결과 화면에 닿는지.
 *
 * ⚠️ **sessionStorage 시드 방식**이 양도세 E2E 정본이다(`commercial-building-97-2-swap.spec.ts`).
 *    §95⑤ 게이트(1세대1주택 + 통산 거주 2년 + 2025-01-01 이후 양도)를 충족하는 필드를
 *    빠뜨리면 조용히 표1 단독 경로로 떨어져 20%가 아니라 14%가 나온다.
 *
 * worktree 실행: E2E_PORT=3xxx npx playwright test e2e/non-housing-to-housing-conversion.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** PDF 사례 30 시드 — 15억 양도·6억 취득 고가주택, 거주 3년 */
function seedForm(
  overrides: Record<string, unknown> = {},
  /** 폼-전역 필드 override (조정대상지역 등 — 자산 override와 스프레드 대상이 다르다) */
  formOverrides: Record<string, unknown> = {},
) {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          assetKind: "housing",
          acquisitionCause: "purchase",
          acquisitionDate: "2018-02-10",
          fixedAcquisitionPrice: "600000000",
          actualSalePrice: "1500000000",
          capitalExpenditure: "7300000",
          transferExpense: "0",
          // §95⑤ 토글 — 이 2필드가 혼합 공제율의 유일한 입력이다
          hasNonHousingConversion: true,
          residentialUseStartDate: "2022-11-25",
          // 거주 3년 → 표2 거주분 12%. 이 값이 없으면 표2 대상 판정 자체가 무너진다
          residenceInputMode: "direct",
          residencePeriodMonthsAsset: "36",
          ...overrides,
        }],
        transferDate: "2026-01-27",
        filingDate: "2026-03-31",
        contractTotalPrice: "1500000000",
        isOneHousehold: true,
        householdHousingCount: "1",
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: true,
        isUnregistered: false,
        ...formOverrides,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seed(
  page: Page,
  overrides: Record<string, unknown> = {},
  formOverrides: Record<string, unknown> = {},
) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(overrides, formOverrides),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  // 위젯은 자산 카드 ③ 취득 섹션 안에 있다. 접힌 채로는 DOM에만 있고 보이지 않아
  // toBeVisible 단언이 실패한다(toHaveText는 hidden도 통과하므로 검증이 약해진다).
  await expandAssetSection(page, 3);
}

async function calculate(page: Page) {
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 20000 });
}

test.describe("비주택 → 주택 용도변경 §95⑤·⑥", () => {
  test("입력 미리보기가 기간을 비주택·주택으로 나눠 공제율을 보여준다", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page);

    // 미리보기는 엔진 헬퍼(calcUsagePeriodInfo·calcConversionHoldingPct)를 직접 호출한다 —
    // 여기 값이 어긋나면 화면과 계산이 갈렸다는 뜻이다.
    await expect(page.getByTestId("conversion-total-holding")).toHaveText("7년 11개월");
    await expect(page.getByTestId("conversion-nonhousing-holding")).toContainText("표1 8%");
    await expect(page.getByTestId("conversion-housing-holding")).toContainText("표2 12%");
    await expect(page.getByTestId("conversion-holding-rate")).toHaveText("20%");
    // 20% < 40%라 단서가 발동하지 않는다
    await expect(page.getByTestId("conversion-rate-capped")).toHaveCount(0);
  });

  test("§95⑤1호 단서 — 표1+표2 합계가 40%를 넘으면 자른다", async ({ page }) => {
    test.setTimeout(120_000);
    // 비주택 12년(표1 24%) + 주택 8년(표2 32%) = 56% → 40%
    await seed(page, { acquisitionDate: "2005-01-10", residentialUseStartDate: "2018-01-10" });

    await expect(page.getByTestId("conversion-nonhousing-holding")).toContainText("표1 24%");
    await expect(page.getByTestId("conversion-housing-holding")).toContainText("표2 32%");
    await expect(page.getByTestId("conversion-holding-rate")).toHaveText("40%");
    await expect(page.getByTestId("conversion-rate-capped")).toBeVisible();
  });

  test("시행일 전 양도는 종전 방식으로 계산한다 (부칙 제19933호 제7조)", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page);
    // 양도일을 2024-12-31로 되돌리면 §95⑤이 적용되지 않는다
    await page.evaluate(() => {
      const raw = sessionStorage.getItem("transfer-tax-wizard")!;
      const s = JSON.parse(raw);
      s.state.formData.transferDate = "2024-12-31";
      sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s));
    });
    await page.reload();
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await expandAssetSection(page, 3);

    await expect(
      page.getByText("2025년 1월 1일 이후 양도분부터 적용됩니다").first(),
    ).toBeVisible();
    await expect(page.getByTestId("conversion-holding-rate")).toHaveCount(0);
  });

  test("★ 계산 결과 — 혼합 공제율이 결과 화면·명세서에 닿는다", async ({ page }) => {
    test.setTimeout(180_000);
    await seed(page);
    await calculate(page);

    // 상세 카드 — 보유분이 표1+표2로 나뉜 근거
    await expect(page.getByText("비주택으로 보유한 기간 4년 → 표1").first()).toBeVisible();
    await expect(page.getByText("주택으로 보유한 기간 3년 → 표2").first()).toBeVisible();

    // 산출 단계 산식 — 자기일관(보유 20% + 거주 12% = 32%)
    await expect(
      page.getByText(/비주택 보유 4년 표1 8% \+ 주택 보유 3년 표2 12%/).first(),
    ).toBeVisible();

    // 장기보유특별공제 총액 (anchor: 178,540,000 × 32%)
    await expect(page.getByText("57,132,800").first()).toBeVisible();

    // 명세서 보유/거주 기간분 — 20:12 안분. 총 보유 기준(28:12)이면 39,992,960이 나온다.
    await expect(page.getByText("35,708,000").first()).toBeVisible();
    await expect(page.getByText("21,424,800").first()).toBeVisible();

    // 산출세액·지방소득세 (anchor 고정값)
    await expect(page.getByText("26,177,520").first()).toBeVisible();
    await expect(page.getByText("2,617,752").first()).toBeVisible();
  });

  test("토글을 끄면 종전 표2 경로로 돌아간다 (회귀 0)", async ({ page }) => {
    test.setTimeout(180_000);
    await seed(page, { hasNonHousingConversion: false, residentialUseStartDate: "" });
    await calculate(page);

    // 총 보유 7년 표2 = 28% + 거주 12% = 40% → 178,540,000 × 40%
    await expect(page.getByText("71,416,000").first()).toBeVisible();
    // §95⑤ 상세 카드는 나타나지 않는다
    await expect(page.getByText("비주택 → 주택 용도변경 장기보유특별공제")).toHaveCount(0);
  });
});

/**
 * 토글 배치 — ① 기본정보(겸용주택 옆) / 확장 입력은 ③ 취득정보.
 *
 * 배경: ③은 주택 자산에서 **기본 접힘**이라(`ACQUISITION_AUTO_OPEN_KINDS`에 housing 없음)
 * 토글이 ③에만 있던 동안 사용자가 기능을 찾지 못했다. 아래 3건이 그 회귀를 막는다.
 */
test.describe("§95⑤ 토글 배치 — ① 기본정보 · 겸용주택과 배타", () => {
  const TOGGLE = "건물 전체를 주택으로 용도변경";
  const MIXED = "겸용주택 분리계산";

  test("토글은 ① 기본정보에 있다 — ③ 취득정보를 펼치지 않아도 보인다", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // 빈 폼 기본값은 주택 자산 1건 — ③을 펴지 않은 상태에서 토글이 보여야 한다
    await expect(page.getByRole("switch", { name: TOGGLE })).toBeVisible();
    // 확장 입력은 OFF 상태이므로 아직 없다(시각적 노이즈 0)
    await expect(page.getByText("사실상 주거용 사용 개시일")).toHaveCount(0);
  });

  // BaseUI Switch는 `<span role="switch" aria-disabled>`라 native disabled 속성이 없다 —
  // Playwright `toBeDisabled()`는 aria-disabled를 보지 않으므로 속성으로 단언한다.
  const expectLocked = (page: Page, name: string) =>
    expect(page.getByRole("switch", { name })).toHaveAttribute("aria-disabled", "true");

  test("§95⑤ ON이면 겸용주택 토글이 잠긴다", async ({ page }) => {
    await seed(page); // hasNonHousingConversion: true
    await expectLocked(page, MIXED);
  });

  test("겸용주택 ON이면 §95⑤ 토글이 잠긴다 (반대 방향)", async ({ page }) => {
    await seed(page, { hasNonHousingConversion: false, isMixedUseHouse: true });
    await expectLocked(page, TOGGLE);
  });
});

/**
 * 상속 취득 × 용도변경 — C-21 범위 정정 (2026-08-05)
 *
 * 설계: `docs/02-design/features/non-housing-to-housing-conversion-inheritance-c21.plan.md`
 *
 * §154⑧3호는 "상속받은 **주택**으로서"가 전제인데, C-8이 용도변경일 > 취득일(=상속개시일)을
 * 강제하므로 토글 ON인 상속은 언제나 「상속개시 당시 비주택」이다 ⇒ 통산 요건이 불성립한다.
 *
 * ⚠️ UI 위젯은 바뀌지 않았다(토글이 `acquisitionCause`를 보지 않는다) — **바뀐 것은 동작**이다.
 *    종전에는 validate가 「상속·증여로 취득한 자산입니다」로 막아 계산 자체가 안 됐다.
 *    그래서 이 스펙은 위젯이 아니라 **차단 해제 + 통산 배제가 결과에 닿는지**를 본다.
 */
test.describe("§95⑤ × 상속 취득 — §154⑧3호 통산 배제", () => {
  /** 상속 자산 필수 필드 — `decedentAcquisitionDate`는 용도변경과 무관한 **기존** 요구다. */
  const INHERITED = {
    acquisitionCause: "inheritance",
    decedentAcquisitionDate: "2010-03-05",
    decedentSameHouseholdBeforeInheritance: true,
    decedentCohabitationHoldingStartDate: "2012-06-01",
    decedentCohabitationResidenceMonths: "24",
  };

  test("상속 + 토글 ON이 더 이상 차단되지 않는다 — 계산이 끝까지 간다", async ({ page }) => {
    test.setTimeout(180_000);
    // 실거주 36개월이라 통산 없이도 표2 대상이 성립한다(I-2) → 혼합 공제율 그대로.
    await seed(page, INHERITED);
    await calculate(page);

    // 종전 차단 문구가 나오지 않는다
    await expect(page.getByText(/상속·증여로 취득한 자산입니다/)).toHaveCount(0);
    // 혼합 공제율이 결과에 닿는다 — 보유 20% + 실거주 3년 12% = 32%
    await expect(page.getByText("57,132,800").first()).toBeVisible();
  });

  test("★ 통산으로 표2 대상을 만들지 않는다 — 실거주 1년이면 표1 단독", async ({ page }) => {
    test.setTimeout(180_000);
    // 실거주 12개월 + 피상속인 통산 24개월 = 36개월(3년). 통산하면 표2 대상이 되지만
    // 상속개시 당시 비주택이므로 §154⑧3호가 적용되지 않는다 → 표2 대상 탈락.
    // 조정대상지역을 끄는 이유: 켜두면 거주요건(2년) 미달로 **비과세**까지 갈려 축이 섞인다.
    await seed(
      page,
      { ...INHERITED, residencePeriodMonthsAsset: "12" },
      { wasRegulatedAtAcquisition: false },
    );
    await calculate(page);

    // 표1 단독·전기간 — 총 보유 7년 × 2% = 14% → 178,540,000 × 14%
    await expect(page.getByText("24,995,600").first()).toBeVisible();
    // §95⑤ 혼합 경로로 빠지지 않았다 (통산이 살아 있었다면 32%·57,132,800이 나온다)
    await expect(page.getByText("57,132,800")).toHaveCount(0);
    await expect(page.getByText("비주택 → 주택 용도변경 장기보유특별공제")).toHaveCount(0);
  });
});

/**
 * 이월과세 취득 × 용도변경 — C-21 폐지 (2026-08-05)
 *
 * 설계: `docs/02-design/features/non-housing-to-housing-conversion-carryover-c21.plan.md`
 *
 * 「소득세법」 §95④ 단서가 **전체 보유기간**의 기산일을(증여자 취득일), §95⑥이 그중
 * **주택으로 보유한 기간**의 기산일을(주거용 사용일) 각각 정한다 — 충돌이 아니라 분담이다.
 *
 * ⚠️ UI 위젯은 바뀌지 않았다(토글이 `acquisitionCause`를 보지 않는다) — **바뀐 것은 동작**이다.
 *    종전에는 validate가 「증여로 취득한 자산입니다」로 막아 계산 자체가 안 됐다.
 */
test.describe("§95⑤ × 이월과세 취득 — C-21 폐지", () => {
  /** 이월과세 필수 입력 — 증여자 취득 2012 → 증여 등기 2018 → 주거용 전환 2022 → 양도 2026 */
  const CARRYOVER = {
    acquisitionCause: "carryover_gift",
    // ⚠️ **실제 폼과 같게 비운다.** 이월과세 입력 UI(`CarryoverGiftBlock`)는 `carryover`
    //    서브객체만 받고 자산-수준 `acquisitionDate`를 채우지 않는다. 값이 있으면 C-8이
    //    그 값으로 막혀 **fallback 경로를 타지 않아 검증이 무효**가 된다(2026-08-05 실측).
    acquisitionDate: "",
    carryover: {
      giftRegistryDate: "2018-06-01",
      donorAcquisitionDate: "2012-03-05",
      donorAcquisitionCause: "purchase",
      useEstimatedAcquisition: false,
      donorAcquisitionPrice: "300000000",
      giftDateValuation: "700000000",
      giftTaxAmount: "0",
      donorRelation: "spouse",
    },
  };

  test("이월과세 + 토글 ON이 더 이상 차단되지 않는다 — 계산이 끝까지 간다", async ({ page }) => {
    test.setTimeout(180_000);
    await seed(page, CARRYOVER);
    await calculate(page);

    // 계산 완료의 증거는 `calculate()`가 기다린 「신고서 양식」이다(visible).
    // 종전 차단 문구가 나오지 않는다.
    await expect(page.getByText(/증여로 취득한 자산입니다/)).toHaveCount(0);
    // 이월과세 축도 함께 살아 있다 — 계산 단계 목록에 판정이 들어간다.
    // ⚠️ 이 단계 목록은 **접힌 섹션 안**이라 `toBeVisible`이 아니라 존재로 확인한다
    //    (계산 완료 자체는 위 「신고서 양식」이 visible로 보증한다).
    await expect(page.getByText(/배우자등 이월과세 판정/)).not.toHaveCount(0);
  });

  test("★ 전환일이 증여 등기접수일 이전이면 차단한다 — 시나리오 B가 기간을 못 나눈다", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    // 전환일 2015-01-01 은 증여자 취득일(2012) 뒤·증여 등기일(2018) 앞 —
    // 시나리오 A는 통과하지만 B는 취득일 이전이라 엔진이 throw한다. 폼에서 먼저 막아야 한다.
    await seed(page, { ...CARRYOVER, residentialUseStartDate: "2015-01-01" });

    // 검증은 「세금 계산하기」에서 발화한다 — 단계 이동만으로는 뜨지 않는다.
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    await expect(page.getByText(/증여 등기접수일 이후여야 합니다/).first()).toBeVisible({
      timeout: 15000,
    });
  });
});
