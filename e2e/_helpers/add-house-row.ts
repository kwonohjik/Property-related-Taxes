/**
 * 명부 필수화(PR-1, 2026-10-05) 이후 — `"housing"`에서 세대 보유 주택 수를 올리는 유일한
 * 경로는 명부 행 추가다(종전 "2채"/"3채 이상" 버튼은 폐기, Q-6). 행이 엔진 입력 도출(④)에
 * 반영되려면 취득일이 채워져 있어야 한다(`countedHouseRows`). ⑧(계산기 UI 차단)까지 통과하려면
 * 공시가격도 필요하다(`transfer-tax-validate-step1.ts`의 보유 주택 행 검증).
 *
 * 전제: 「보유 상황」 단계에 이미 있다(이 헬퍼는 단계 이동을 하지 않는다).
 */
import type { Page, Locator } from "@playwright/test";

function dateFieldByLabel(scope: Page | Locator, labelText: string) {
  return scope.getByText(labelText, { exact: true }).locator("xpath=..");
}

/**
 * 이미 열려 있는 행 편집 다이얼로그에 취득일만 채운다. 호출부가 다이얼로그 안에서 다른 상태
 * (chip 가시성 등)를 먼저 확인해야 할 때 — `addHouseRow`는 열기·닫기를 전부 해버려 그 틈에
 * 끼어들 수 없다.
 */
export async function fillAcquisitionDateInDialog(dialog: Locator, ymd: string): Promise<void> {
  const [y, m, d] = ymd.split("-");
  const acqContainer = dateFieldByLabel(dialog, "취득일");
  await acqContainer.getByLabel("연도").fill(y);
  await acqContainer.getByLabel("월").fill(m);
  await acqContainer.getByLabel("일").fill(d);
}

export async function addHouseRow(
  page: Page,
  opts: { acquisitionDate: string; officialPrice?: string } = { acquisitionDate: "2018-01-01", officialPrice: "300000000" },
): Promise<void> {
  await page.getByRole("button", { name: /주택 추가/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 3000 });

  await fillAcquisitionDateInDialog(dialog, opts.acquisitionDate);

  if (opts.officialPrice) {
    // CurrencyInput hideLabel — 시각 라벨이 숨어 있어도 aria-label="공시가격"은 항상 붙는다.
    await dialog.getByLabel("공시가격", { exact: true }).fill(opts.officialPrice);
  }

  await dialog.getByRole("button", { name: "완료" }).click();
  await dialog.waitFor({ state: "hidden", timeout: 3000 });
}
