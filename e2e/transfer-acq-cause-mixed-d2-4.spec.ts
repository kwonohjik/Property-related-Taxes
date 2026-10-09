/**
 * E2E: D2-4b — 2005.4.30. 전 상속·증여 주택 건물 + 토지 매매: 영 §163⑨ 단서 2호 max(평가액, 영 §164⑦ 가액의 건물 몫) 입력·표시
 *
 * 계획서: docs/00-pm/transfer-acq-cause-mixed.plan.md §13 · UI 설계 transfer-acq-cause-mixed-d2-4.ui.design.md §9.4
 *
 * - 카드 노출 → 주택 구분(단독·다가구) → 4칸 입력 → 계산 → 요청 body `buildingSec164Value`·`buildingHouseKind` →
 *   결과 카드·상세명세서가 「평가액 vs 영 §164⑦ 가액의 건물 몫 → 채택」을 엔진 echo 그대로 보인다.
 * - ⑧: 주택 구분 미선택 → 구분 칸, 고른 뒤 빈 칸 → 첫 미완 칸으로 이동(포커스 + 뷰포트). 공동주택은 지원하지 않음.
 * - 부정형 짝: 2005-04-30 이후로 고치면 카드가 사라진다 · 비주택 건물은 종전 안내.
 *
 * ⚠️ 수치의 정본은 vitest anchor(`building-sec164-card.d2-4b.ui.anchor.test.tsx`)다. 워크트리 실행은 E2E_PORT 필수.
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { fillDateAndVerify } from "./_helpers/tax-flow";
import { calculate, card, housing, seedWizard, singleSeed, stmtText } from "./_helpers/split-acq-display";

/** 건물 상속 2003-05-01(피상속인 1990-01-01) + 토지 매매 2020-01-10 · ① 30,000,000 · 토지 면적 200㎡ · 구분양도 */
const d24 = (over: Record<string, unknown> = {}) =>
  housing({
    acquisitionCause: "inheritance",
    acquisitionDate: "2003-05-01",
    inheritanceStartDate: "2003-05-01",
    inheritanceDate: "2003-05-01",
    decedentAcquisitionDate: "1990-01-01",
    landAcquisitionCause: "purchase",
    landCauseHost: "inheritance",
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: "2020-01-10",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300000000",
    buildingAcquisitionPrice: "30000000",
    saleSplitMode: "actual",
    landTransferPrice: "600000000",
    buildingTransferPrice: "300000000",
    ...over,
  });

/** ② = 300,000,000 × 30,000,000 ÷ (1,000,000 × 200 + 50,000,000) = 36,000,000 */
const SEC164 = {
  inhHouseValHousePriceAtFirst: "300000000",
  inhHouseValLandPricePerSqmAtFirst: "1000000",
  inhHouseValBuildingStdPriceAtFirst: "50000000",
  inhHouseValBuildingStdPriceAtInheritance: "30000000",
};

const sec164Card = (p: Page) => p.getByTestId("building-sec164-card");
/** CurrencyInput은 input 자신에, FieldCard는 래퍼에 data-field를 단다 — 둘 다 받는다 */
const field = (p: Page, f: string) => sec164Card(p).locator(`input[data-field="${f}"], [data-field="${f}"] input`).first();
const kindRadio = (p: Page, name: RegExp) => sec164Card(p).locator('[data-field="inheritanceAssetKind"]').getByRole("radio", { name });

async function ready(page: Page) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}

test.describe("D2-4b 2005.4.30. 전 상속 주택 건물 — ② 입력 카드 → 계산 → 채택 표시", () => {
  test("카드 노출 → 단독·다가구 → 4칸 입력 → ② 36,000,000 채택 · body buildingSec164Value · 카드·명세서", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, singleSeed([d24()]));
    await expandAssetSection(page, 3);
    await expect(sec164Card(page)).toBeVisible();
    await expect(sec164Card(page).getByRole("switch")).toHaveCount(0); // 토글 없음 — 법이 정한 비교
    await expect(page.getByTestId("building-cause-date-notice")).toHaveCount(0); // 주택은 날짜 안내 대신 카드
    await expect(page.getByText("취득 당시 개별주택가격 미공시")).toHaveCount(0);

    await kindRadio(page, /단독·다가구주택/).check();
    for (const [k, v] of Object.entries(SEC164)) await field(page, k).fill(v);
    await expect(page.getByTestId("building-sec164-total")).toHaveText("36,000,000");

    const body = await calculate(page);
    expect(body).toMatchObject({
      acquisitionCause: "inheritance",
      landAcquisitionCause: "purchase",
      buildingAcquisitionPrice: 30_000_000,
      buildingSec164Value: 36_000_000,
      buildingHouseKind: "house_individual",
    });
    expect(body.inheritedHouseValuation).toBeUndefined();

    const basis = card(page, "split-card-acq-basis");
    await expect(basis).toBeVisible();
    await expect(basis).toContainText("건물 취득가액 비교");
    await expect(basis).toContainText("단서 2호");
    await expect(card(page, "split-card-acq-basis-reported")).toHaveText("30,000,000");
    await expect(card(page, "split-card-acq-basis-sec164")).toHaveText("36,000,000");
    await expect(card(page, "split-card-acq-basis-adopted")).toHaveText("영 §164⑦ 가액의 건물 몫");
    await expect(card(page, "split-card-acq-building")).toHaveText("36,000,000");

    const acqText = await stmtText(page, "취득가액");
    expect(acqText).toContain("건물(영 §164⑦ 가액의 건물 몫) 36,000,000");
    expect(acqText).toContain("많은 금액(상속개시일 평가액 30,000,000, 영 §164⑦ 가액의 건물 몫 36,000,000)");
  });

  test("평가액이 큰 경우(① 40,000,000) → 평가액 채택 · 파트 태그는 상속개시일 평가액", async ({ page }) => {
    test.setTimeout(150_000);
    await seedWizard(page, singleSeed([d24({ ...SEC164, inheritanceAssetKind: "house_individual", buildingAcquisitionPrice: "40000000" })]));
    await expect(page.getByTestId("building-sec164-total")).toHaveText("36,000,000");
    const body = await calculate(page);
    expect(body).toMatchObject({ buildingSec164Value: 36_000_000, buildingAcquisitionPrice: 40_000_000 });
    await expect(card(page, "split-card-acq-basis-adopted")).toHaveText("상속개시일 평가액");
    await expect(card(page, "split-card-acq-building")).toHaveText("40,000,000");
    expect(await stmtText(page, "취득가액")).toContain("건물(상속개시일 평가액) 40,000,000");
  });

  test("증여 호스트 → 라벨이 증여일·증여 신고가액", async ({ page }) => {
    test.setTimeout(90_000);
    await seedWizard(page, singleSeed([d24({
      acquisitionCause: "gift", landCauseHost: "gift", acquisitionDate: "2002-09-15", inheritanceStartDate: "", inheritanceDate: "", decedentAcquisitionDate: "",
      inheritanceAssetKind: "house_individual",
    })]));
    await expandAssetSection(page, 3);
    await expect(sec164Card(page)).toContainText("증여 신고가액");
    await expect(sec164Card(page).locator('[data-field="inhHouseValBuildingStdPriceAtInheritance"]')).toContainText("증여일 시점 건물 기준시가");
  });

  test("부정형 짝 — 건물 상속개시일을 2005-04-30으로 고치면 카드가 사라진다 · 비주택 건물은 종전 안내", async ({ page }) => {
    test.setTimeout(120_000);
    await seedWizard(page, singleSeed([d24({ ...SEC164, inheritanceAssetKind: "house_individual" })]));
    await expandAssetSection(page, 3);
    await expect(sec164Card(page)).toBeVisible();
    await fillDateAndVerify(page, { year: "2005", month: "04", day: "30" }, { scope: page.getByTestId("acq-date-building") });
    await expect(sec164Card(page)).toHaveCount(0);

    await seedWizard(page, singleSeed([d24({ assetKind: "building" })]));
    await expandAssetSection(page, 3);
    await expect(sec164Card(page)).toHaveCount(0);
    await expect(page.getByTestId("building-cause-date-notice")).toContainText("단독·다가구주택만");
  });
});

test.describe("D2-4b ⑧ — 주택 구분·빈 칸으로 이동 (막다른 길 0)", () => {
  test("구분 미선택 → 「다음」 → 구분 칸 포커스 · 단독 선택 후 → 첫 빈 칸(최초 공시된 개별주택가격) 포커스", async ({ page }) => {
    test.setTimeout(150_000);
    await seedWizard(page, singleSeed([d24()]));
    await ready(page);
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByTestId("validation-issues").getByRole("button", { name: /주택 구분\(단독·다가구주택 \/ 공동주택\)을 선택하세요/ })).toBeVisible();
    const radio = kindRadio(page, /단독·다가구주택/);
    await expect(radio).toBeInViewport();

    await radio.check();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    const input = field(page, "inhHouseValHousePriceAtFirst");
    await expect(input).toBeFocused();
    await expect(input).toBeInViewport();
    await expect(page.getByTestId("validation-issues").getByRole("button", { name: /최초 공시된 개별주택가격 칸을 입력하세요/ })).toBeVisible();
  });

  test("공동주택 → 지원하지 않는 이유 안내 · 「다음」 → 같은 칸 오류(계산하지 않음)", async ({ page }) => {
    test.setTimeout(120_000);
    await seedWizard(page, singleSeed([d24({ inheritanceAssetKind: "house_apart" })]));
    await ready(page);
    await expect(page.getByTestId("building-sec164-apart-note")).toContainText("단독·다가구주택으로 확인된 주택만 지원합니다");
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByTestId("validation-issues").getByRole("button", { name: /단독·다가구주택으로 확인된 주택만 지원합니다/ })).toBeVisible();
  });
});
