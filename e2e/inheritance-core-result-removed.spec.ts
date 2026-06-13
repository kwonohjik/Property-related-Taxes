/**
 * E2E: 상속세 결과 화면 핵심 결과 카드("상속세 결정세액") 제거 검증
 *
 * 효용 낮은 핵심 결과 카드 삭제(과세 요약과 중복) — 2026-06-13.
 * 결과는 정상 도달("상속세 과세 요약"), 카드 텍스트("상속세 결정세액")는 부재,
 * 과세 요약 내 "결정세액" 행은 유지.
 */

import { test, expect } from "@playwright/test";
import {
  addHeir,
  addLandAsset,
  nextSteps,
  calcAndWaitResult,
} from "./_helpers/tax-flow";

test("핵심 결과 카드 제거 — 결정세액 카드 부재 + 과세 요약 유지", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2024");
  await page.getByLabel("월").first().fill("6");
  await page.getByLabel("일").first().fill("10");
  await addHeir(page, "heir", "child");
  await nextSteps(page, 1);
  await addLandAsset(page, { area: "300", unitPrice: "1000000" });
  await nextSteps(page, 3);
  await calcAndWaitResult(page);

  // 결과 정상 도달 (과세 요약 표시)
  await expect(page.getByRole("heading", { name: "상속세 과세 요약" })).toBeVisible();
  // 삭제된 핵심 카드 텍스트 부재
  await expect(page.getByText("상속세 결정세액")).toHaveCount(0);
  // 과세 요약 내 "결정세액" 행은 유지 (정보 손실 없음)
  await expect(page.getByText("결정세액", { exact: true }).first()).toBeVisible();
});
