import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: §41의2 초과배당 증여 — 주주 테이블 자동산정·소득세 모드·결과 검증
 *
 * anchor 케이스:
 *  주주 3명: 최대주주(60%, 0원), 특수관계인(30%, 1억), 기타(10%, 5백만)
 *  소득세모드 = exempt → 소득세 0원
 *  → 초과배당금액 = 63,000,000
 *  → 증여재산가액 = 63,000,000
 *
 * 산정 근거:
 *  총배당 = 0 + 100,000,000 + 5,000,000 = 105,000,000
 *  특관인 비례배당 = 105,000,000 × 30% = 31,500,000
 *  ① = 100,000,000 - 31,500,000 = 68,500,000
 *  최대주주 과소 = 63,000,000 (비례배당 105M×60% - 0)
 *  기타 과소 = 5,500,000 (비례배당 105M×10% - 5M)
 *  총과소 = 68,500,000
 *  ② = 63,000,000 / 68,500,000
 *  초과배당금액 = 68,500,000 × ② = 63,000,000
 */

/**
 * 공통 증여일(= 배당지급일, §41의2①) 입력 헬퍼.
 * excess_dividend 모달의 DateInput은 공통 증여일 1개뿐 (edDividendDate 폐지).
 * DateInput placeholder="YYYY"/"MM"/"DD" 기반 접근.
 */
async function fillGiftDate(
  dialog: ReturnType<Page["getByTestId"]>,
  yyyy: string,
  mm: string,
  dd: string,
) {
  await dialog.getByPlaceholder("YYYY").fill(yyyy);
  await dialog.getByPlaceholder("MM").fill(mm);
  await dialog.getByPlaceholder("DD").fill(dd);
}

/** 주주 행 추가 후 이름·역할·배당·지분율 입력 */
async function addShareholder(
  dialog: ReturnType<Page["getByTestId"]>,
  opts: {
    name: string;
    role: "major_shareholder" | "related_party" | "other";
    dividend: string;
    ratio: string;
  },
) {
  // 주주 추가 버튼 클릭
  await dialog.getByRole("button", { name: "+ 주주 추가" }).click();

  // 마지막 행을 타겟으로 사용
  const rows = dialog.locator("table tbody tr");
  const row = rows.last();

  // 이름 입력 (placeholder="주주명")
  await row.getByPlaceholder("주주명").fill(opts.name);

  // 역할 설정 — 기본값이 "other". 원하는 role까지 클릭
  // ROLE_CYCLE: major_shareholder → related_party → other → major_shareholder ...
  // 기본값 "other"부터 시작해 목표 role까지 순환
  const roleMap: Record<string, number> = {
    major_shareholder: 1, // other → major (1번)
    related_party: 2,    // other → major → related (2번)
    other: 0,            // already "other"
  };
  const clickCount = roleMap[opts.role];
  const roleBtn = row.getByRole("button", { name: /최대주주등|특수관계인|기타/ });
  for (let i = 0; i < clickCount; i++) {
    await roleBtn.click();
  }

  // 배당금 입력 (placeholder="실수령 배당금")
  await row.getByPlaceholder("실수령 배당금").fill(opts.dividend);

  // 지분율 입력 (placeholder="지분율")
  await row.getByPlaceholder("지분율").fill(opts.ratio);
}

test.describe("§41의2 초과배당 — E2E spec", () => {
  test("주 케이스: 주주 3명 + 소득세 비과세 → 증여재산가액 63,000,000", async ({ page }) => {
    await page.goto("/calc/gift-deemed");

    // 1. 유형 선택 → 모달 오픈
    await page.getByTestId("deemed-type-excess_dividend").click();
    const dialog = page.getByTestId("deemed-detail-dialog");
    await expect(dialog).toBeVisible();

    // 2. 공통 증여일(=배당지급일, §41의2①) 입력 (2025-03-15)
    await fillGiftDate(dialog, "2025", "3", "15");

    // 3. 주주 3명 추가
    // 3-1. 최대주주 (60%, 0원)
    await addShareholder(dialog, {
      name: "최대주주A",
      role: "major_shareholder",
      dividend: "0",
      ratio: "60",
    });

    // 4-2. 특수관계인 (30%, 1억)
    await addShareholder(dialog, {
      name: "특수관계인B",
      role: "related_party",
      dividend: "100000000",
      ratio: "30",
    });

    // 4-3. 기타 (10%, 5백만)
    await addShareholder(dialog, {
      name: "기타C",
      role: "other",
      dividend: "5000000",
      ratio: "10",
    });

    // 5. 소득세 모드 = 비과세 (exempt)
    await dialog.getByTestId("ed-mode-exempt").click();

    // 6. 모달 확인
    await page.getByTestId("deemed-detail-confirm").click();

    // 7. 계산 버튼
    await page.getByTestId("deemed-calc-btn").click();

    // 8. 결과 검증 — 증여재산가액 63,000,000
    const resultValue = page.getByTestId("deemed-result-value");
    await expect(resultValue).toContainText("63,000,000", { timeout: 15_000 });

    // 9. 초과배당금액 자동산정 내역 섹션 표시 확인
    await expect(page.getByTestId("ed-calc-detail")).toBeVisible();

    // 10. 소득세 상당액 상세 섹션 표시 확인
    await expect(page.getByTestId("ed-income-tax-detail")).toBeVisible();
  });

  test("보조 케이스: 동일 주주 + 소득세 율표(undetermined) → 증여재산가액 53,644,000", async ({ page }) => {
    await page.goto("/calc/gift-deemed");

    // 유형 선택
    await page.getByTestId("deemed-type-excess_dividend").click();
    const dialog = page.getByTestId("deemed-detail-dialog");
    await expect(dialog).toBeVisible();

    // 공통 증여일(=배당지급일)
    await fillGiftDate(dialog, "2025", "3", "15");

    // 주주 3명 추가 (동일 구성)
    await addShareholder(dialog, {
      name: "최대주주A",
      role: "major_shareholder",
      dividend: "0",
      ratio: "60",
    });
    await addShareholder(dialog, {
      name: "특수관계인B",
      role: "related_party",
      dividend: "100000000",
      ratio: "30",
    });
    await addShareholder(dialog, {
      name: "기타C",
      role: "other",
      dividend: "5000000",
      ratio: "10",
    });

    // 소득세 모드 = 율표 자동 (undetermined) — INITIAL_DEEMED 기본값이라 별도 클릭 불요.
    // (버그 수정: store default "undetermined" = display = api = validate 4자 일치 — 우회 제거)

    // 모달 확인
    await page.getByTestId("deemed-detail-confirm").click();

    // 계산
    await page.getByTestId("deemed-calc-btn").click();

    // 결과 확인
    // 초과배당금액 63,000,000
    // 소득세 상당액(율표 undetermined, 2025 = 7구간)
    // 63,000,000에서 소득세 상당액(8,060,000 + (63,000,000-57,600,000)×24% = 9,356,000) 차감
    // 증여재산가액 = 63,000,000 - 9,356,000 = 53,644,000
    const resultValue = page.getByTestId("deemed-result-value");
    await expect(resultValue).toContainText("53,644,000", { timeout: 15_000 });

    // 율표 적용 라벨 확인 (7구간 rate table)
    await expect(page.getByTestId("ed-income-tax-detail")).toBeVisible();
  });
});
