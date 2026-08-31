/**
 * anchor — §97 시리즈 공실 유예는 **조문마다 다르다** (D1-03 · D2-08)
 *
 * ## 조문 (법제처 원문, 사용자 제공 화면 실측 2026-08-31)
 *
 * **조특령 §97⑤5호** — 「제1호 또는 제3호의 규정을 적용함에 있어서 재정경제부령이 정하는 기간은
 * 이를 주택임대기간에 산입할 것」
 *
 * **조특칙 §44** — 「영 제97조제5항제5호에서 "재정경제부령이 정하는 기간"이라 함은 기존 임차인의
 * 퇴거일부터 다음 임차인의 **입주일**까지의 기간으로서 **3월이내**의 기간을 말한다.」
 *
 * **조특령 §97의5①1호** — 「기존 임차인의 퇴거일부터 다음 임차인의 **주민등록을 이전하는 날**까지의
 * 기간으로서 **6개월 이내**의 기간」
 *
 * ## 준용 경로 — 3월이 걸리는 조문 넷 / 6개월은 §97의5 하나
 *
 * | 조문 | 준용 근거 | §97⑤5호 준용? | 유예 |
 * |---|---|---|---|
 * | §97    | (본조)                          | —        | 3월 |
 * | §97의2 | 조특령 §97의2② 「§97②~⑥ 준용」 | ✅ (⑤ 전체) | 3월 |
 * | §97의3 | 조특령 §97의3④ 「§97⑤1·3·**5**호」 | ✅ | 3월 |
 * | §97의4 | 조특령 §97의4② 「§97⑤1·3·**5**호」 | ✅ | 3월 |
 * | §97의5 | 조특령 §97의5③ 「§97⑤1·3호」      | ❌ **5호 미준용** | 6개월 |
 *
 * ⇒ 6개월은 §97의5 **고유** 규칙이다. 종전 코드는 이 6개월(180일 환산)을 다섯 조문 전부에
 *   전용해, 3~6개월 공실이 임대기간에서 차감되지 않아 **임대기간이 과대 산정**됐다.
 *
 * ## 안전망 실측 (변경 전)
 * 임계 상수를 180 → 90으로 뒤집고 전건(18,077)을 돌렸을 때 **반응한 테스트는 1건뿐**이었다.
 * 특히 `rental-housing-reduction.test.ts`의 「5개월 공실 → 차감 없음」은 단언이
 * `toBeGreaterThanOrEqual(8)`이라 151일을 깎아도 참이어서 통과했다 — 구별력 0.
 * 이 파일은 두 조문이 **실제로 갈리는 구간**을 정확한 값으로 고정한다.
 */
import { describe, it, expect } from "vitest";
import {
  calculateEffectiveRentalPeriod,
  RENTAL_VACANCY_GRACE_MONTHS_97,
  RENTAL_VACANCY_GRACE_MONTHS_97_5,
} from "@/lib/tax-engine/transfer-reductions/rental-97-shared-helpers";

const D = (s: string) => new Date(`${s}T00:00:00`);

describe("조문별 유예 상수", () => {
  it("§97 계열 = 3월 (조특칙 §44) · §97의5 = 6개월 (조특령 §97의5①1호)", () => {
    expect(RENTAL_VACANCY_GRACE_MONTHS_97).toBe(3);
    expect(RENTAL_VACANCY_GRACE_MONTHS_97_5).toBe(6);
  });
});

describe("🔴 3~6개월 공실 — 두 조문이 갈린다 (구별력)", () => {
  // 임대 2014-01-01 ~ 양도 2024-01-01 = 10년. 공실 5개월(2016-01-01~2016-06-01, 152일).
  const start = D("2014-01-01");
  const transfer = D("2024-01-01");
  const vp = [{ startDate: D("2016-01-01"), endDate: D("2016-06-01") }];

  it("§97 계열: 3월 초과이므로 구간 전체 차감 → 9년", () => {
    expect(
      calculateEffectiveRentalPeriod(start, transfer, vp, RENTAL_VACANCY_GRACE_MONTHS_97),
    ).toBe(9);
  });

  it("§97의5: 6개월 이내이므로 차감 없음 → 10년", () => {
    expect(
      calculateEffectiveRentalPeriod(start, transfer, vp, RENTAL_VACANCY_GRACE_MONTHS_97_5),
    ).toBe(10);
  });

  it("같은 사실관계에서 두 조문의 결과가 실제로 다르다", () => {
    const a = calculateEffectiveRentalPeriod(start, transfer, vp, RENTAL_VACANCY_GRACE_MONTHS_97);
    const b = calculateEffectiveRentalPeriod(start, transfer, vp, RENTAL_VACANCY_GRACE_MONTHS_97_5);
    expect(a).not.toBe(b);
  });
});

describe("경계 — 「이내」는 포함이다", () => {
  const start = D("2014-01-01");
  const transfer = D("2024-01-01");

  it("정확히 3월 공실은 차감하지 않는다 (§97 계열)", () => {
    const vp = [{ startDate: D("2016-01-01"), endDate: D("2016-04-01") }]; // 딱 3월
    expect(
      calculateEffectiveRentalPeriod(start, transfer, vp, RENTAL_VACANCY_GRACE_MONTHS_97),
    ).toBe(10);
  });

  it("3월 + 1일이면 구간 전체를 차감한다", () => {
    const vp = [{ startDate: D("2016-01-01"), endDate: D("2016-04-02") }];
    // 92일 차감 → 10년에서 92일 모자라 9년
    expect(
      calculateEffectiveRentalPeriod(start, transfer, vp, RENTAL_VACANCY_GRACE_MONTHS_97),
    ).toBe(9);
  });

  it("정확히 6개월 공실은 차감하지 않는다 (§97의5)", () => {
    const vp = [{ startDate: D("2016-01-01"), endDate: D("2016-07-01") }]; // 딱 6개월
    expect(
      calculateEffectiveRentalPeriod(start, transfer, vp, RENTAL_VACANCY_GRACE_MONTHS_97_5),
    ).toBe(10);
  });

  it("달력 월로 잰다 — 2월을 낀 3월 유예도 「이내」로 본다", () => {
    // 2016-01-31 → 3월 후 = 2016-04-30 (윤년 2월 포함, 90일이 아니라 90일 초과)
    const vp = [{ startDate: D("2016-01-31"), endDate: D("2016-04-30") }];
    expect(
      calculateEffectiveRentalPeriod(start, transfer, vp, RENTAL_VACANCY_GRACE_MONTHS_97),
    ).toBe(10);
  });
});

describe("초과 시 「초과분만」이 아니라 구간 전체를 차감한다", () => {
  it("조문이 산입 대상을 「…까지의 기간으로서 3월이내의 기간」으로 정의하므로 구간째 제외", () => {
    const start = D("2014-01-01");
    const transfer = D("2024-01-01"); // 3652일
    const vp = [{ startDate: D("2016-01-01"), endDate: D("2017-01-01") }]; // 366일
    const years = calculateEffectiveRentalPeriod(
      start, transfer, vp, RENTAL_VACANCY_GRACE_MONTHS_97,
    );
    // 초과분만(366−91=275일) 차감했다면 3377일 → 9년. 전체(366일) 차감이면 3286일 → 8년.
    expect(years).toBe(8);
  });
});
