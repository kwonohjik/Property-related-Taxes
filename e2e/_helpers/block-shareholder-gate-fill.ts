/**
 * §94①4 다목(과점주주) **요건 4칸** 공용 입력 헬퍼.
 *
 * 다목 토글을 켜면 `lib/calc/stock-transfer-tax-validate.ts`가 요건 수치를 **요구**한다
 * (「미입력은 차단한다」 — 토글 ON 은 적극적 선언이므로). 그래서 「토글만 켜고 다음 단계로」
 * 가던 종전 spec 들은 Step1에 갇힌다.
 *
 * 🔴 **fixture 를 보강하지 않고 단언만 완화하면 그 spec 의 의미가 조용히 바뀐다** —
 *    기타자산(§94①4)을 검증하던 테스트가 §94①3호(주식)를 검증하게 된다
 *    ([[feedback_fixture_default_masks_gate_defect]]). 그래서 **게이트를 통과하는 값**을 넣는다.
 *
 * vitest 쪽 짝: `__tests__/tax-engine/stock-transfer/_block-shareholder-fixture.ts`
 */
import type { Page } from "@playwright/test";

/** 게이트를 **통과**하는 표준 값 — 부동산등 65% · 소유 70% · 누적 70% */
export const PASSING_BLOCK_SHAREHOLDER = {
  realEstate: "65",
  ownership: "70",
  cumulative: "70",
} as const;

/**
 * 가장 안쪽 FieldCard 를 고른다.
 *
 * ⚠️ `hasText` 는 **바깥 FieldCard(기타자산 해당 여부)까지** 매칭한다 — 기타자산 블록 전체가
 *    FieldCard 이기 때문이다. `.last()` 가 실제 입력 카드다.
 */
function innerCard(page: Page, label: string) {
  return page.locator('[data-slot="field-card"]').filter({ hasText: label }).last();
}

/**
 * 요건 3칸(%) + 합산기간 최초 양도일을 채운다.
 *
 * `firstTransferDate` 는 **이번 양도일로부터 소급 3년 내**여야 한다(영 §158②) — 벗어나면
 * `transfer_window` 로 게이트가 떨어진다.
 */
export async function fillBlockShareholderRequirements(
  page: Page,
  opts: {
    realEstate?: string;
    ownership?: string;
    cumulative?: string;
    /** "YYYY-MM-DD" */
    firstTransferDate: string;
  },
) {
  const { realEstate, ownership, cumulative } = { ...PASSING_BLOCK_SHAREHOLDER, ...opts };

  await innerCard(page, "법인 자산총액 중 부동산등 비율")
    .locator('input[type="text"]')
    .first()
    .fill(realEstate);
  await innerCard(page, "과점주주 소유비율 (본인 + 기타주주)")
    .locator('input[type="text"]')
    .first()
    .fill(ownership);
  await innerCard(page, "소급 3년 누적 양도비율")
    .locator('input[type="text"]')
    .first()
    .fill(cumulative);

  // 날짜는 **카드 안으로 범위를 좁혀서** 채운다 — 전역 nth 는 시장 유형에 따라
  // (대주주 판정 블록의 기준일 등) 인덱스가 밀린다.
  const [y, m, d] = opts.firstTransferDate.split("-");
  const dateCard = innerCard(page, "합산기간 최초 양도일");
  await dateCard.locator('input[aria-label="연도"]').fill(y);
  await dateCard.locator('input[aria-label="월"]').fill(m);
  await dateCard.locator('input[aria-label="일"]').fill(d);
}
