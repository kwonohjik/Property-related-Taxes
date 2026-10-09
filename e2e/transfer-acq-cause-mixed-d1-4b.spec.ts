/**
 * E2E: D1-4b — 1990.8.30. 전 상속·증여 토지 파트 영 §163⑨ 단서 1호 max(평가액, 영 §164④ 가액) 입력·표시
 *
 * 계획서: docs/00-pm/transfer-acq-cause-mixed.plan.md §11 · UI 설계 transfer-acq-cause-mixed-d1-4.ui.design.md
 *
 * - 매매·신축 두 호스트에서 1988년 상속 토지: ② 카드가 열리고(토글 없음) 등급 입력 → 계산 → 요청 body `landSec164Value` →
 *   결과 카드·상세명세서·신고서가 「평가액 vs 영 §164④ 가액 → 채택」을 엔진 echo 그대로 보인다.
 * - 부분 입력이면 계산 시도가 첫 미완 칸으로 이동시킨다(포커스 + 뷰포트).
 * - 1990.8.30. 이후로 고치면 카드가 사라진다(부정형 짝).
 *
 * ⚠️ 워크트리 실행은 E2E_PORT 필수. 시드는 `landCauseHost`를 함께 넣는다(normalize가 지운다).
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { calculate, card, formRow, housing, multiForm, multiProps, runMulti, seedWizard, singleSeed, stmtText } from "./_helpers/split-acq-display";

/** 건물 2018-06-01 매매 + 토지 1988-05-01 상속(피상속인 1960-01-01) · 파트 실가 · 양도 900,000,000 · 토지 면적 200㎡ */
const mixed = (over: Record<string, unknown> = {}) =>
  housing({
    landAcquisitionCause: "inheritance",
    landCauseHost: "purchase",
    landAcquisitionDate: "1988-05-01",
    landDecedentAcquisitionDate: "1960-01-01",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300000000",
    buildingAcquisitionPrice: "150000000",
    saleSplitMode: "actual",
    landTransferPrice: "600000000",
    buildingTransferPrice: "300000000",
    pre1990GradeMode: "value",
    ...over,
  });

/** 신축 호스트 — 건물 2018-06-01 사용승인 · 신축비용 150,000,000 */
const built = (over: Record<string, unknown> = {}) =>
  mixed({
    acquisitionCause: "newConstruction",
    occupancyApprovalDate: "2018-06-01",
    landCauseHost: "newConstruction",
    buildingAcquisitionPrice: "",
    fixedAcquisitionPrice: "150000000",
    ...over,
  });

const SEC164_BIG = { pre1990Grade_current: "1000", pre1990Grade_prev: "1000", pre1990Grade_atAcq: "1000", pre1990PricePerSqm_1990: "2000000" }; // ② 400,000,000
const SEC164_SMALL = { pre1990Grade_current: "1000", pre1990Grade_prev: "1000", pre1990Grade_atAcq: "800", pre1990PricePerSqm_1990: "100000" }; // ② 16,000,000

const sec164Card = (p: Page) => p.getByTestId("land-sec164-card");
const field = (p: Page, f: string) => sec164Card(p).locator(`[data-field="${f}"] input`);

async function fillSec164(page: Page, v: Record<string, string>) {
  for (const [k, val] of Object.entries(v)) await field(page, k).fill(val);
}

test.describe("D1-4b 1990.8.30. 전 상속 토지 — ② 입력 카드 → 계산 → 채택 표시", () => {
  for (const [host, make] of [["매매", mixed], ["신축", built]] as const) {
    test(`${host} 호스트: 카드 노출 → 등급 입력 → ② 400,000,000 채택 · body landSec164Value · 카드·명세서·신고서`, async ({ page }) => {
      test.setTimeout(150_000);
      await seedWizard(page, singleSeed([make()]));
      await expandAssetSection(page, 3);
      await expect(sec164Card(page)).toBeVisible();
      // 토글이 없다 — 카드가 곧 입력이다
      await expect(sec164Card(page).getByRole("switch")).toHaveCount(0);
      await expect(page.getByTestId("land-cause-date-notice")).toHaveCount(0);

      await fillSec164(page, SEC164_BIG);
      const derived = page.getByTestId("land-sec164-derived");
      await expect(derived.getByTestId("land-sec164-per-sqm")).toHaveText("2,000,000");
      await expect(derived.getByTestId("land-sec164-total")).toHaveText("400,000,000");

      const body = await calculate(page);
      expect(body).toMatchObject({ landAcquisitionCause: "inheritance", landSec164Value: 400_000_000, landAcquisitionPrice: 300_000_000 });

      await expect(card(page, "split-card-acq-basis")).toBeVisible();
      await expect(card(page, "split-card-acq-basis-reported")).toHaveText("300,000,000");
      await expect(card(page, "split-card-acq-basis-sec164")).toHaveText("400,000,000");
      await expect(card(page, "split-card-acq-basis-adopted")).toHaveText("영 §164④ 가액");
      await expect(card(page, "split-card-acq-land")).toHaveText("400,000,000");

      const acqText = await stmtText(page, "취득가액");
      expect(acqText).toContain("토지(영 §164④ 가액) 400,000,000");
      expect(acqText).toContain("많은 금액(상속개시일 평가액 300,000,000, 영 §164④ 가액 400,000,000)");
      const filing = (await formRow(page, "취득가액")).join(" ");
      expect(filing).toContain("400,000,000");
    });
  }

  test("평가액이 큰 경우(② 16,000,000) → 평가액 채택 · 파트 태그는 상속개시일 평가액", async ({ page }) => {
    test.setTimeout(150_000);
    await seedWizard(page, singleSeed([mixed(SEC164_SMALL)]));
    await expect(page.getByTestId("land-sec164-total")).toHaveText("16,000,000");
    const body = await calculate(page);
    expect(body).toMatchObject({ landSec164Value: 16_000_000 });
    await expect(card(page, "split-card-acq-basis-adopted")).toHaveText("상속개시일 평가액");
    await expect(card(page, "split-card-acq-land")).toHaveText("300,000,000");
    expect(await stmtText(page, "취득가액")).toContain("토지(상속개시일 평가액) 300,000,000");
  });

  test("1985.1.1. 전 상속개시일이면 「취득시」 등급 라벨이 의제취득일(1985.1.1.) 규약으로 바뀐다 — 기존 sec164AcqTimePointLabel 재사용(부칙 §8 본문은 미조회 — 확인 필요)", async ({ page }) => {
    test.setTimeout(90_000);
    await seedWizard(page, singleSeed([mixed({ landAcquisitionDate: "1984-05-01" })]));
    await expandAssetSection(page, 3);
    await expect(field(page, "pre1990Grade_atAcq")).toBeVisible();
    await expect(sec164Card(page).locator('[data-field="pre1990Grade_atAcq"]')).toContainText("의제취득일(1985.1.1.) 유효 등급");
    await expect(sec164Card(page)).toContainText("1985.1.1.에 취득한 것으로 봅니다");
    // 긍정 짝: 1988은 종전 「취득시」
    await seedWizard(page, singleSeed([mixed()]));
    await expandAssetSection(page, 3);
    await expect(sec164Card(page).locator('[data-field="pre1990Grade_atAcq"]')).toContainText("취득시 유효 등급");
    await expect(sec164Card(page)).not.toContainText("1985.1.1.에 취득한 것으로 봅니다");
  });

  test("부정형 짝 — 토지 상속개시일을 1991로 고치면 카드가 사라지고 body에 landSec164Value가 없다", async ({ page }) => {
    test.setTimeout(150_000);
    await seedWizard(page, singleSeed([mixed({ ...SEC164_BIG, landAcquisitionDate: "1991-05-01" })]));
    await expect(sec164Card(page)).toHaveCount(0);
    const body = await calculate(page);
    expect(body.landSec164Value).toBeUndefined();
    await expect(page.getByTestId("split-card-acq-basis")).toHaveCount(0);
  });
});

test.describe("D1-4b 다건 — 건별 카드가 같은 echo를 보인다", () => {
  test("다건 건1(매매 + 1988 상속 토지, ② 400,000,000) → 건별 상세 카드에 평가액 vs 영 §164④ 가액 → 채택", async ({ page }) => {
    test.setTimeout(180_000);
    await runMulti(page, "e2e-d14b-multi", "D1-4b 다건 (E2E)", multiProps(() => multiForm(mixed({ ...SEC164_BIG, actualSalePrice: "900000000" }))));
    const basis = page.getByTestId("split-card-acq-basis").first();
    await expect(basis).toBeAttached();
    expect(((await basis.textContent()) ?? "").replace(/\s+/g, " ")).toContain("영 §164④ 가액 400,000,000");
    await expect(page.getByTestId("split-card-acq-basis-adopted").first()).toHaveText("영 §164④ 가액");
  });
});

test.describe("D1-4b ⑧ 부분 입력 → 첫 미완 칸으로 이동", () => {
  const ready = async (page: Page) => {
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="transfer-date"] input');
      return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
    });
  };

  test("직전 등급이 비면 「다음」 → 직전 등급 칸에 포커스(뷰포트 안)", async ({ page }) => {
    test.setTimeout(120_000);
    await seedWizard(page, singleSeed([mixed({ ...SEC164_BIG, pre1990Grade_prev: "" })]));
    await ready(page);
    await page.getByRole("button", { name: "다음", exact: true }).click();
    const input = field(page, "pre1990Grade_prev");
    await expect(input).toBeFocused();
    await expect(input).toBeInViewport();
    await expect(page.getByTestId("validation-issues").getByRole("button", { name: /1990\.8\.30\. 직전 토지등급 칸을 입력하세요/ })).toBeVisible();
  });
});
