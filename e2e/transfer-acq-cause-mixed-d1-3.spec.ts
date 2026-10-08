/**
 * E2E: D1-3 토지·건물 취득원인 혼합 — 결과 표시(취득 원인 · 세율 기산일) 배선 확인
 *
 * 계획서: docs/00-pm/transfer-acq-cause-mixed.plan.md §10.2 T-1 · UI 설계 §8
 *
 * 매매 호스트 + 토지 상속(피상속인 2000) 시드 → 계산 → 결과 카드 · 신고서 · 상세명세서가 엔진 echo를 같은 값으로 보인다.
 * 원인이 없으면 세 화면 모두 종전 그대로다(부정형 짝).
 *
 * ⚠️ 수치·문구의 정본은 vitest anchor(`split-part-cause-echo.anchor` · `split-acq-cause-mixed-d1-3.ui.anchor`)다.
 *    워크트리 실행은 E2E_PORT 필수.
 */
import { test, expect } from "@playwright/test";
import { calculate, card, formRow, housing, seedWizard, singleSeed, stmtText } from "./_helpers/split-acq-display";

/** 건물 2018-06-01 매매 + 토지 2025-02-01 상속(피상속인 2000-01-01) · 파트별 실거래가 · 양도 900,000,000 */
const mixed = (over: Record<string, unknown> = {}) =>
  housing({
    landAcquisitionCause: "inheritance",
    landCauseHost: "purchase",
    landAcquisitionDate: "2025-02-01",
    landDecedentAcquisitionDate: "2000-01-01",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300000000",
    // 건물분도 양도차익이 나야 파트별 세율 판정을 거친다(차손이면 자산 단위 세율 — 세율 기산일 행 미표시)
    buildingAcquisitionPrice: "150000000",
    saleSplitMode: "actual",
    landTransferPrice: "600000000",
    buildingTransferPrice: "300000000",
    ...over,
  });

test.describe("D1-3 취득원인 혼합 결과 표시", () => {
  test("매매 + 토지 상속 → 카드 원인·세율 기산일 · 신고서 토지 취득일 = 상속개시일 · 명세서 산출세액 ※", async ({ page }) => {
    await seedWizard(page, singleSeed([mixed()]));
    const body = await calculate(page);
    expect(body).toMatchObject({ landAcquisitionCause: "inheritance", landDecedentAcquisitionDate: "2000-01-01" });

    await expect(card(page, "split-card-cause-land")).toHaveText("상속");
    await expect(card(page, "split-card-cause-building")).toHaveText("매매");
    const basis = card(page, "split-card-rate-basis-land");
    await expect(basis).toContainText("2018-06-01");
    await expect(basis).toContainText("피상속인 취득일 2000-01-01");

    const acq = await formRow(page, "취득일자");
    expect(acq.join(" ")).toContain("2025-02-01");
    expect(acq.join(" ")).toContain("세율 판정 기산일 2018-06-01");

    expect(await stmtText(page, "산출세액")).toContain("토지 상속 2025-02-01 · 세율 기산일 2018-06-01");
  });

  test("부정형 짝 — 토지 원인 없음(같은 날짜·가액) → 원인·기산일 행 없음", async ({ page }) => {
    await seedWizard(page, singleSeed([mixed({ landAcquisitionCause: "", landCauseHost: "", landDecedentAcquisitionDate: "" })]));
    await calculate(page);
    await expect(card(page, "split-card-acq-mode-land")).toBeVisible();
    await expect(page.getByTestId("split-card-cause-land")).toHaveCount(0);
    expect((await formRow(page, "취득일자")).join(" ")).not.toContain("세율 판정 기산일");
    expect(await stmtText(page, "산출세액")).not.toContain("세율 기산일");
  });
});
