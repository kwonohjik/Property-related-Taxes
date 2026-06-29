/**
 * E2E: 상속세 「그 밖의 인적공제」(§20) 보완 — 브라우저 런타임 검증
 *
 * 검증:
 *   PD-1 결과 분해 (G1·G3·G7): 장애 미성년 자녀(만11세 남) → 인적공제 항목별 적용(itemized)
 *        → 결과 분해에 미성년자공제(만 11세, 19세 기준)·장애인공제(기대여명 70년, 남성) 노출
 *        ※ 장애인공제 7억으로 기초+인적 > 일괄 5억 → 항목별 선택 → §20 분해 카드 노출
 *   PD-2 성별 위젯 (G3 UI): 장애인 토글 ON → 성별 RadioCardGroup(남성/여성) 노출, OFF → 숨김
 *   PD-3 validation (⑧): 장애인 ON + 성별 미선택 → 계산 차단 + "성별을 입력하세요" 오류
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · 워크트리 E2E_PORT=3100
 *   data-testid(heir-editor-N, deduction-breakdown-section) 우선.
 */

import { test, expect, type Page } from "@playwright/test";
import {
  fillDateAndVerify,
  addLandAsset as addLandAssetHelper,
  nextSteps,
  calcAndWaitResult,
  addHeir,
  closeHeirEditModal,
} from "./_helpers/tax-flow";

// ============================================================
// 헬퍼
// ============================================================

async function gotoStep0(page: Page, [y, m, d]: [string, string, string]) {
  await page.goto("/calc/inheritance-tax");
  await fillDateAndVerify(page, { year: y, month: m, day: d });
}

async function addChild(page: Page) {
  // RRN 미입력(residentNumber:"") → 성별이 RRN에서 자동도출되지 않아 장애인 성별 위젯이 노출됨(PD-2/3 전제).
  // keepModalOpen → heir-editor-0(생년월일·장애인·성별)와 모달이 열린 상태에서 상호작용.
  await addHeir(page, "heir", "child", { keepModalOpen: true, residentNumber: "" });
}

/** heir-editor-{index} 내부 생년월일 DateInput 채움 */
async function setHeirBirthDate(
  page: Page,
  index: number,
  [y, m, d]: [string, string, string],
) {
  const editor = page.getByTestId(`heir-editor-${index}`);
  await fillDateAndVerify(page, { year: y, month: m, day: d }, { scope: editor });
}

/** 토지(공시지가 1,000,000원/㎡ × 300㎡ = 3억) 추가 */
async function addLandAsset(page: Page) {
  await addLandAssetHelper(page, { area: "300", unitPrice: "1000000" });
}

/** Step1→2→3→4 → 계산하기 → 결과 대기 */
async function proceedToResult(page: Page) {
  await nextSteps(page, 3); // Step1→2→3→4
  await calcAndWaitResult(page);
}

/** 상속공제 상세 내역 펼침 + 모든 detail 카드 ▼ 펼치기 */
async function openAndExpandAll(page: Page) {
  await page.getByRole("button", { name: /상속공제 상세 내역/ }).click();
  const section = page.getByTestId("deduction-breakdown-section");
  // exact:true — "인적공제 합계 (§20)" 의 substring 매칭 방지
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

test.describe("상속세 그 밖의 인적공제 §20 (P0+P2)", () => {
  test("PD-1: 장애 미성년 자녀(만11세 남) → 결과 분해에 미성년(19기준)·장애인(기대여명 70년) 노출", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await gotoStep0(page, ["2025", "1", "1"]);
    await addChild(page);
    await setHeirBirthDate(page, 0, ["2014", "1", "1"]); // 2025-01-01 기준 만 11세

    // 장애인 ON + 성별 남성 (장애인공제 7억 → 기초+인적 > 일괄 5억 → 항목별 선택)
    const editor = page.getByTestId("heir-editor-0");
    await editor.getByText("장애인", { exact: true }).click();
    await editor.getByText("남성", { exact: true }).click();

    await closeHeirEditModal(page); // 상속인 편집 모달 닫고 다음
    await page.getByRole("button", { name: /^다음/ }).click(); // Step0→1
    await addLandAsset(page);
    await proceedToResult(page);

    const section = await openAndExpandAll(page);

    // 인적공제 합계 (§20) 카드 존재 (trigger row + 내부 합계 SubTotalRow → .first())
    await expect(section.getByText(/인적공제 합계.*§20/).first()).toBeVisible();
    // ② 미성년자공제 — 만 11세 per-heir 행 + 합계 (G1: 19세 기준 (19-11)=8천만)
    //   (동일 자녀가 미성년·장애 행 양쪽에 나타나므로 .first())
    await expect(section.getByText(/만 11세/).first()).toBeVisible();
    await expect(section.getByText("미성년자공제 합계")).toBeVisible();
    // ④ 장애인공제 — 남40 아닌 만11세 남 기대여명 70년(ceil(69.9)), 남성 (G3 성별·2023생명표)
    await expect(section.getByText("장애인공제 합계")).toBeVisible();
    await expect(section.getByText(/기대여명 70년/)).toBeVisible();
  });

  test("PD-2: 장애인 토글 ON → 성별 위젯(남성/여성) 노출, OFF → 숨김 (G3 UI)", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await gotoStep0(page, ["2025", "1", "1"]);
    await addChild(page);

    const editor = page.getByTestId("heir-editor-0");

    // 초기: 성별 위젯 미노출
    await expect(editor.getByText(/장애인 성별/)).not.toBeVisible();

    // 장애인 ON → 성별 위젯 + 남성/여성 옵션 노출
    await editor.getByText("장애인", { exact: true }).click();
    await expect(editor.getByText(/장애인 성별/)).toBeVisible();
    await expect(editor.getByText("남성", { exact: true })).toBeVisible();
    await expect(editor.getByText("여성", { exact: true })).toBeVisible();

    // 장애인 OFF → 성별 위젯 숨김 (gender 초기화)
    await editor.getByText("장애인", { exact: true }).click();
    await expect(editor.getByText(/장애인 성별/)).not.toBeVisible();
  });

  test("PD-3: 장애인 ON + 성별 미선택 → 계산 차단 + '성별을 입력하세요' 오류 (⑧ validation)", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await gotoStep0(page, ["2025", "1", "1"]);
    await addChild(page);
    await setHeirBirthDate(page, 0, ["1985", "1", "1"]); // 만 40세

    const editor = page.getByTestId("heir-editor-0");
    await editor.getByText("장애인", { exact: true }).click(); // 장애 ON, 성별 미선택

    await closeHeirEditModal(page); // 상속인 편집 모달 닫고 다음
    await page.getByRole("button", { name: /^다음/ }).click(); // Step0→1
    await addLandAsset(page);
    await nextSteps(page, 3); // 1→2→3→4
    await page.getByRole("button", { name: /계산하기/ }).click();

    // 검증 오류 노출 + 결과 미표시 (차단)
    await expect(page.getByText(/성별을 입력하세요/)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("heading", { name: "상속세 과세 요약" })).not.toBeVisible();
  });
});
