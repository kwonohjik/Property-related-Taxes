/**
 * E2E: 상속세 동거가족 인적공제 (§20 P1, 시령 §18①) — 브라우저 런타임 검증
 *
 * 검증:
 *   CD-1 결과 분해: 동거가족 손자(남5세 장애) → §20 분해에 미성년(만5세)·
 *        장애인(기대여명 76년)·[동거가족] 라벨 노출 (9억 > 일괄 5억 → 항목별 선택)
 *   CD-2 UI: 동거가족 섹션 헤더·추가·관계 3옵션·장애 성별 위젯·삭제
 *   CD-3 validation (⑧): 동거가족 장애 ON + 성별 미선택 → 계산 차단 + 오류
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · 워크트리 E2E_PORT=3100
 *   data-testid(cohabitant-editor-N, deduction-breakdown-section) 우선.
 */

import { test, expect, type Page } from "@playwright/test";

// ============================================================
// 헬퍼 (inheritance-personal-deduction.spec.ts 패턴 차용)
// ============================================================

async function gotoStep0(page: Page, [y, m, d]: [string, string, string]) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill(y);
  await page.getByLabel("월").first().fill(m);
  await page.getByLabel("일").first().fill(d);
}

async function addChild(page: Page) {
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();
}

async function addCohabitant(page: Page) {
  await page.getByRole("button", { name: /동거가족 추가/ }).click();
}

/** 토지(공시지가 10,000,000원/㎡ × 300㎡ = 30억) 추가 */
async function addLandAsset(page: Page) {
  await page.getByRole("button", { name: /상속재산 추가/ }).click();
  await page.getByRole("button", { name: /토지/ }).first().click();
  await page.getByPlaceholder("면적 입력").fill("300");
  await page.getByPlaceholder("공시지가 단가").fill("10000000");
}

async function proceedToResult(page: Page) {
  await page.getByRole("button", { name: /^다음/ }).click(); // 1→2
  await page.getByRole("button", { name: /^다음/ }).click(); // 2→3
  await page.getByRole("button", { name: /^다음/ }).click(); // 3→4
  await page.getByRole("button", { name: /계산하기/ }).click();
  await expect(page.getByText("상속세 결정세액")).toBeVisible({ timeout: 20_000 });
}

async function openAndExpandAll(page: Page) {
  await page.getByRole("button", { name: /상속공제 상세 내역/ }).click();
  const section = page.getByTestId("deduction-breakdown-section");
  await expect(section.getByText("공제 합계", { exact: true })).toBeVisible({
    timeout: 5_000,
  });
  for (let i = 0; i < 12; i++) {
    const btns = section.getByRole("button", { name: "펼치기" });
    if ((await btns.count()) === 0) break;
    await btns.first().click();
  }
  return section;
}

// ============================================================
// 테스트
// ============================================================

test.describe("상속세 동거가족 인적공제 §20 P1", () => {
  test("CD-1: 동거가족 손자(남5세 장애) → §20 분해 미성년·장애(기대여명76)·[동거가족]", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await gotoStep0(page, ["2023", "1", "1"]);
    await addChild(page); // 상속인 1명 필수 (성년 자녀 — 자녀공제 5천만)

    // 동거가족 손자 (관계 기본 직계비속) 추가
    await addCohabitant(page);
    const dep = page.getByTestId("cohabitant-editor-0");
    await dep.getByLabel("연도").fill("2017");
    await dep.getByLabel("월").fill("3");
    await dep.getByLabel("일").fill("4"); // 2023-01-01 기준 만 5세
    await dep.getByText("장애인", { exact: true }).click();
    await dep.getByText("남성", { exact: true }).click();

    await page.getByRole("button", { name: /^다음/ }).click(); // Step0→1
    await addLandAsset(page); // 토지 30억 → 인적공제 9억 의미
    await proceedToResult(page);

    const section = await openAndExpandAll(page);

    // §20 인적공제 합계 카드
    await expect(
      section.getByText(/인적공제 합계.*§20/).first(),
    ).toBeVisible();
    // 미성년자공제 — 동거가족 손자 만 5세
    await expect(section.getByText(/만 5세/).first()).toBeVisible();
    await expect(section.getByText("미성년자공제 합계")).toBeVisible();
    // 장애인공제 — 남5세 기대여명 76년 (2023 생명표)
    await expect(section.getByText(/기대여명 76년/)).toBeVisible();
    await expect(section.getByText("장애인공제 합계")).toBeVisible();
    // [동거가족] 라벨 구분 (name 없음 → "동거가족")
    await expect(section.getByText(/동거가족/).first()).toBeVisible();
  });

  test("CD-2: 동거가족 섹션 — 추가·관계 3옵션·장애 성별 위젯·삭제", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await gotoStep0(page, ["2025", "1", "1"]);
    await addChild(page);

    // 섹션 헤더 노출
    await expect(
      page.getByText(/동거가족 \(인적공제 대상 부양가족\)/),
    ).toBeVisible();

    await addCohabitant(page);
    const dep = page.getByTestId("cohabitant-editor-0");
    await expect(dep).toBeVisible();

    // 관계 3옵션 (시령 §18①)
    await expect(dep.getByText("직계비속(손자녀)")).toBeVisible();
    await expect(dep.getByText(/직계존속/)).toBeVisible();
    await expect(dep.getByText("형제자매")).toBeVisible();

    // 장애 OFF → 성별 미노출 / ON → 노출
    await expect(dep.getByText(/장애인 성별/)).not.toBeVisible();
    await dep.getByText("장애인", { exact: true }).click();
    await expect(dep.getByText(/장애인 성별/)).toBeVisible();
    await expect(dep.getByText("남성", { exact: true })).toBeVisible();
    await expect(dep.getByText("여성", { exact: true })).toBeVisible();

    // 삭제 → 행 제거 (마지막 제거 시 카드 접힘)
    await dep.getByText(/삭제/).click();
    await expect(page.getByTestId("cohabitant-editor-0")).not.toBeVisible();
  });

  test("CD-3: 동거가족 장애 ON + 성별 미선택 → 계산 차단 (⑧ validation)", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await gotoStep0(page, ["2025", "1", "1"]);
    await addChild(page);

    await addCohabitant(page);
    const dep = page.getByTestId("cohabitant-editor-0");
    await dep.getByLabel("연도").fill("2010");
    await dep.getByLabel("월").fill("1");
    await dep.getByLabel("일").fill("1"); // 만 15세 미성년
    await dep.getByText("장애인", { exact: true }).click(); // 성별 미선택

    await page.getByRole("button", { name: /^다음/ }).click(); // Step0→1
    await addLandAsset(page);
    await page.getByRole("button", { name: /^다음/ }).click(); // 1→2
    await page.getByRole("button", { name: /^다음/ }).click(); // 2→3
    await page.getByRole("button", { name: /^다음/ }).click(); // 3→4
    await page.getByRole("button", { name: /계산하기/ }).click();

    // 검증 오류 + 결과 미표시 (차단)
    await expect(page.getByText(/성별을 입력하세요/)).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText("상속세 결정세액")).not.toBeVisible();
  });
});
