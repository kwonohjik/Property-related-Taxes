/**
 * anchor — 안분 basis 서열: **감정평가가액 우선** (Phase 1-B · Q-9 반영)
 *
 * 계획서: `docs/02-design/features/general-building-sale-split-mode.plan.md` §12.3 · §21
 *
 * > ⚠️ **anchor ID 표기**: 계획서 §12.10은 이 단계를 U-6·U-7로 적었으나 1-A anchor 파일이 U-6을
 * >    이미 「방어적 입력」에 썼다. 충돌을 피해 이 파일은 **B-** 접두어를 쓴다.
 *
 * ## 조문 — 「부가가치세법 시행령」 제64조 제1항 (소득세법 시행령 §166⑥이 차용)
 *
 * 1호 본문: 토지·건물 기준시가가 **모두 있는 경우** → 공급계약일 현재 **기준시가** 비율 안분
 * 1호 **단서**: 「**다만, 감정평가가액 … 이 있는 경우에는 그 가액에 비례하여 안분 계산한 금액으로
 *              한다**」 ⇒ **감정평가가액이 기준시가보다 우선**한다
 * 2호 본문: 어느 하나/모두 기준시가가 없고 감정평가가액이 있으면 → 감정평가가액 비율
 *
 * ⇒ 서열: **감정평가가액 > 기준시가**. (2호 단서 장부가액·3호 국세청장 고시는 범위 밖 — §12.3)
 *
 * ## 🔴 2026-08-06 계약 반전 — **시기 요건은 이 엔진이 판정하지 않는다** (Q-9 확정)
 *
 * 종전에는 부가령 §64①1호 괄호의 기간 제한(「공급시기가 속하는 과세기간의 직전 과세기간
 * 개시일부터 … 종료일까지」)을 **유효 창**으로 계산해, 벗어난 감정을 `out_of_window`로 배제하고
 * 기준시가로 후퇴시켰다.
 *
 * 그 판정은 **명문 없는 유추** 위에 서 있었다 — 부가가치세의 「공급시기」를 양도소득세의
 * 「양도시기」로 치환해 읽는 근거가 확정되지 않았다(§19.2: 대법원 판례는 「안분계산하는 **방법**을
 * 준용한다는 의미」라고만 판시했고 본문은 확보하지 못했다).
 *
 * ⇒ **사용자가 감정평가가액으로 안분하겠다고 선택하고 그 가액을 입력하면 그대로 채택**한다.
 *   요건 충족 여부와 책임은 사용자에게 있다.
 *
 * ### 이 반전으로 **사라진 계약** (삭제가 아니라 대상 소멸이다)
 *
 * | 종전 | 지금 |
 * |---|---|
 * | B-2 시기 요건 이탈 → 배제 | **B-2 반전** — 언제 평가했든 채택한다 |
 * | B-3 창 경계(개시일·종료일 포함) | **소멸** — 창이 없으니 경계도 없다 |
 * | B-8 창 산출은 UTC 기준 | **소멸** — 창을 계산하지 않으므로 시간대 이슈 자체가 없다 |
 *
 * B-3·B-8은 「검증을 줄인 것」이 아니라 **검증할 대상이 없어진 것**이다(Phase 1-D의 「조합 공간
 * 소멸」과 같은 성격 — §14.3).
 *
 * ## 고정 계약
 *   B-1  감정평가가액이 있으면 **기준시가를 쓰지 않는다** (1호 단서)
 *   B-2  🔴 **시기와 무관하게 채택한다** — 엔진은 요건을 판정하지 않는다
 *   B-4  감정이 없으면 기준시가 (1호 본문)
 *   B-5  둘 다 없으면 **산출 불가(null)** — 0으로 메우지 않는다
 *   B-6  잔액 흡수 — 토지 + 건물 = 총 양도가액
 *   B-7  감정 한쪽만 입력된 것은 감정으로 쓰지 않는다 (**산술적 필요조건** — 법령 판단 아님)
 *   B-9  기준시가 한쪽이 0인 것은 「없는 것」이 아니다 (B-7과 의도된 비대칭)
 */
import { describe, it, expect } from "vitest";
import { resolveSaleApportionBasis } from "@/lib/tax-engine/sale-split-apportion-basis";

const TOTAL = 1_000_000_000;

/** 기준시가 비율 → 토지 60% (안분: 토지 6억 / 건물 4억) */
const STD = { land: 900_000_000, building: 600_000_000 };
/** 감정가액 비율 → 토지 40% (안분: 토지 4억 / 건물 6억) — 실무 자료 예시와 같은 비율 */
const APPRAISAL = { land: 400_000_000, building: 600_000_000 };

const run = (over: Partial<Parameters<typeof resolveSaleApportionBasis>[0]> = {}) =>
  resolveSaleApportionBasis({
    totalTransferPrice: TOTAL,
    stdPrice: STD,
    ...over,
  });

describe("B-1 — 감정평가가액이 기준시가보다 우선한다 (부가령 §64①1호 단서)", () => {
  it("둘 다 있으면 **감정가액** 비율로 안분한다", () => {
    const r = run({ appraisal: { value: APPRAISAL } });
    expect(r.kind).toBe("appraisal");
    expect(r.apportioned).toEqual({ land: 400_000_000, building: 600_000_000 });
  });

  it("🔴 기준시가 비율(토지 6억)을 **쓰지 않는다** — 두 basis가 갈리는 fixture다", () => {
    const r = run({ appraisal: { value: APPRAISAL } });
    expect(r.apportioned!.land).not.toBe(600_000_000);
  });
});

describe("B-2 — 🔴 시기 요건을 판정하지 않는다 (Q-9 — 계약이 뒤집혔다)", () => {
  /**
   * 종전에는 아래 두 케이스가 **배제**됐다. 이제는 **채택**한다 — 엔진이 법령 요건을 대신
   * 판단하지 않고, 사용자가 감정평가가액으로 안분하겠다고 한 선택을 그대로 따른다.
   */
  it("양도보다 한참 전(2020-01-01)에 평가한 감정도 채택한다", () => {
    const r = run({ appraisal: { value: APPRAISAL } });
    expect(r.kind).toBe("appraisal");
    expect(r.appraisalRejected).toBeUndefined();
  });

  it("배제 사유는 **불완전 입력에만** 남는다 — 시기 사유(`out_of_window`)는 폐지됐다", () => {
    const r = run({ appraisal: { value: { land: 400_000_000, building: 0 } } });
    expect(r.appraisalRejected).toBe("incomplete");
  });
});

describe("B-4·B-5 — 감정이 없을 때", () => {
  it("기준시가만 있으면 기준시가 비율 (1호 본문)", () => {
    const r = run();
    expect(r.kind).toBe("std_price");
    expect(r.apportioned).toEqual({ land: 600_000_000, building: 400_000_000 });
  });

  it("🔴 둘 다 없으면 **산출 불가** — 0으로 메우지 않는다", () => {
    const r = resolveSaleApportionBasis({ totalTransferPrice: TOTAL });
    expect(r.kind).toBeNull();
    expect(r.apportioned).toBeNull();
  });

  it("기준시가 합이 0이면 산출 불가 — 0으로 나누지 않는다", () => {
    const r = run({ stdPrice: { land: 0, building: 0 } });
    expect(r.kind).toBeNull();
    expect(r.apportioned).toBeNull();
  });
});

describe("B-6 — 잔액 흡수", () => {
  it("토지 + 건물 = 총 양도가액 (무한소수 비율에서도)", () => {
    // 토지 1 : 건물 2 는 3으로 나뉘지 않는 총액에서 잔액이 필요하다
    const r = resolveSaleApportionBasis({
      totalTransferPrice: 1_000_000_000,
      stdPrice: { land: 100_000_000, building: 200_000_000 },
    });
    expect(r.apportioned!.land + r.apportioned!.building).toBe(1_000_000_000);
    expect(r.apportioned!.land).toBe(333_333_333); // floor
    expect(r.apportioned!.building).toBe(666_666_667); // 잔액
  });
});

describe("B-7 — 불완전한 감정 입력", () => {
  /**
   * ⚠️ 이 규칙은 **법령 판단이 아니라 산술적 필요조건**이다 — 비율을 내려면 토지·건물 두 값이
   *    있어야 한다. 그래서 Q-9(시기 요건 폐지)에도 **그대로 남는다**.
   */
  it("감정 한쪽만 입력된 것은 감정으로 쓰지 않는다", () => {
    const r = run({ appraisal: { value: { land: 400_000_000, building: 0 } } });
    expect(r.kind).toBe("std_price");
    expect(r.appraisalRejected).toBe("incomplete");
  });
});

/**
 * B-9 — 🔴 **기준시가와 감정가액의 usability 기준이 다르다** (2026-08-06 1-C 통합 중 정정)
 *
 * 최초 구현은 두 basis 모두 「양쪽 다 양수」를 요구했다. 그 판정이 엔진 통합에서 기존 fixture
 * 1건을 차단했다 — `__tests__/tax-engine/transfer-tax/pre-housing-disclosure.test.ts` D-11-1이
 * **양도시 건물 기준시가 0**으로 「토지 100% 안분」을 만들고 있었다.
 *
 * 두 값은 성질이 다르다:
 *   · **기준시가**는 고시·산정값이라 **0도 값일 수 있다**. 부가령 §64①1호는 「기준시가가 **모두
 *     있는 경우**」라 하는데, 0으로 **입력된 것**을 「없는 것」으로 볼 근거(예규·심판례)를 확인하지
 *     못했다 ⇒ 종전 동작을 보존한다(법령 해석만으로 세액 변경 금지).
 *   · **감정평가가액**은 「감정평가법인등이 **평가한** 가액」이므로 0은 미평가를 뜻한다(B-7).
 *
 * ⚠️ 이 비대칭은 **의도된 것**이다. 「일관성」을 이유로 한쪽에 맞추면 D-11-1이 다시 깨지거나
 *    (기준시가를 엄격하게) 감정 미입력이 basis로 채택된다(감정을 느슨하게).
 */
describe("B-9 — 기준시가 한쪽이 0인 것은 「없는 것」이 아니다", () => {
  it("건물 기준시가 0 → 토지 100% 안분 (합계 > 0이면 비율이 성립한다)", () => {
    const r = run({ stdPrice: { land: 627_000_000, building: 0 } });
    expect(r.kind).toBe("std_price");
    expect(r.apportioned).toEqual({ land: TOTAL, building: 0 });
  });

  it("토지 기준시가 0 → 건물 100% 안분", () => {
    const r = run({ stdPrice: { land: 0, building: 600_000_000 } });
    expect(r.kind).toBe("std_price");
    expect(r.apportioned).toEqual({ land: 0, building: TOTAL });
  });

  it("🔴 감정가액은 여전히 엄격하다 — 한쪽 0이면 채택하지 않는다 (B-7과 대조)", () => {
    const r = run({
      stdPrice: { land: 900_000_000, building: 600_000_000 },
      appraisal: { value: { land: 0, building: 600_000_000 } },
    });
    expect(r.kind).toBe("std_price"); // 감정을 쓰지 않았다
    expect(r.appraisalRejected).toBe("incomplete");
  });
});
