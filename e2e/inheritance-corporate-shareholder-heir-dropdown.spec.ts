/**
 * E2E: 부표 5 영리법인 주주 명세 ⑦ 구분 드롭다운 상속인 연동 (2026-06-05)
 *
 * 계획서: docs/00-pm/inheritance-corporate-shareholder-heir-dropdown.plan.md
 * 정책: [[feedback_browser_verify_with_playwright]] — spec 통과로 브라우저 확인 충족
 *
 * 기능: ⑦ 구분 드롭다운 = 2그룹 optgroup (입력된 상속인 이름 목록 + 기타 관계).
 *   - 입력된 상속인 선택 → ⑧ 성명·⑨ 주민등록번호 자동채움 + read-only (§3-1, D-2)
 *   - addShareholder 기본값: 첫 자연인 상속인 자동 연결 (§3-4)
 *   - 기타 관계(상속인의 배우자 등) 선택 → ⑧⑨ 수동 입력 활성
 *
 * 법령: 상증법 §3의2② (mst 276123) — 납세의무자 4종 한정.
 *
 * 시나리오:
 *   CH-1: 자녀(김철수) + 법인 → 부표5 주주 추가 → 자동연결·⑧ 자동채움·read-only·⑦ 입력상속인 그룹
 *   CH-2: ⑦을 "상속인의 배우자"(그룹2)로 변경 → ⑧ editable + 수동 입력
 */

import { test, expect, type Page } from "@playwright/test";
import { addHeir } from "./_helpers/tax-flow";

/** Step0: 상속개시일 2024-06-10 + 자녀(이름 김철수) + 영리법인 */
async function gotoStep0WithChildAndCorporate(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2024");
  await page.getByLabel("월").first().fill("6");
  await page.getByLabel("일").first().fill("10");

  // 자녀 추가 + 이름 입력 (드롭다운 그룹1에 "김철수 (자녀)"로 노출되어야 함)
  await addHeir(page, "heir", "child");
  // 이름 input은 label-htmlFor 연결이 없어 placeholder로 타겟 (자녀 카드가 첫 카드)
  await page.getByPlaceholder("예: 홍길동").first().fill("김철수");

  // 영리법인 추가 → 부표 5 영리법인 면제 명세 카드 노출
  await addHeir(page, "corporate");

  await expect(
    page.getByText("부표 5 — 영리법인 면제 명세"),
  ).toBeVisible();
}

test.describe("부표5 ⑦ 구분 드롭다운 상속인 연동", () => {
  test("CH-1: 주주 추가 → 첫 상속인 자동연결 + ⑧ 자동채움 read-only + ⑦ 입력상속인 그룹", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoStep0WithChildAndCorporate(page);

    // 주주 추가 → §3-4: 첫 자연인 상속인(김철수) 자동 연결
    await page.getByRole("button", { name: /주주 추가/ }).click();

    // ⑦ 구분 select (입력된 상속인 optgroup 보유) 스코프
    const shSelect = page.locator(
      'select:has(optgroup[label="입력된 상속인"])',
    );
    await expect(shSelect).toBeVisible();
    // 그룹1에 "김철수 (자녀)" 옵션 존재
    await expect(
      shSelect.locator('optgroup[label="입력된 상속인"] option', {
        hasText: "김철수 (자녀)",
      }),
    ).toHaveCount(1);
    // 그룹2 "기타 관계" optgroup 존재
    await expect(
      shSelect.locator('optgroup[label="기타 관계"]'),
    ).toHaveCount(1);

    // ⑧ 성명 자동채움 = "김철수" + read-only
    const nameInput = page.getByPlaceholder("주주 성명");
    await expect(nameInput).toHaveValue("김철수");
    await expect(nameInput).toHaveAttribute("readonly", "");
  });

  test("CH-2: ⑦을 기타 관계(상속인의 배우자)로 변경 → ⑧ 수동 입력 활성", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoStep0WithChildAndCorporate(page);
    await page.getByRole("button", { name: /주주 추가/ }).click();

    const shSelect = page.locator(
      'select:has(optgroup[label="입력된 상속인"])',
    );
    await expect(shSelect).toBeVisible();

    // 그룹2 "상속인의 배우자" 선택 → heirRef 해제, ⑧ editable
    await shSelect.selectOption({ label: "상속인의 배우자" });

    const nameInput = page.getByPlaceholder("주주 성명");
    // read-only 해제 (heirRef 없음)
    await expect(nameInput).not.toHaveAttribute("readonly", "");
    // 자동채움 스냅샷 비워짐 → 수동 입력 가능
    await expect(nameInput).toHaveValue("");
    await nameInput.fill("박며느리");
    await expect(nameInput).toHaveValue("박며느리");
  });
});
