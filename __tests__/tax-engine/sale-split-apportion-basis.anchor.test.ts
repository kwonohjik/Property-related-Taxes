/**
 * Pre-Do anchor — 안분 basis 서열: **감정평가가액 우선** (Phase 1-B)
 *
 * 계획서: `docs/02-design/features/general-building-sale-split-mode.plan.md` §12.3
 * 이 파일은 **구현 전에** 작성돼 현행에서 실패한다(정책 `feedback_pre_anchor_verification`).
 *
 * > ⚠️ **anchor ID 표기**: 계획서 §12.10은 이 단계를 U-6·U-7로 적었으나 1-A anchor 파일이 U-6을
 * >    이미 「방어적 입력」에 썼다. 충돌을 피해 이 파일은 **B-** 접두어를 쓴다
 * >    (계획서 U-6 → B-1 · U-7 → B-2·B-3에 대응).
 *
 * ## 조문 — 「부가가치세법 시행령」 제64조 제1항 (소득세법 시행령 §166⑥이 차용)
 *
 * 1호 본문: 토지·건물 기준시가가 **모두 있는 경우** → 공급계약일 현재 **기준시가** 비율 안분
 * 1호 **단서**: 「**다만, 감정평가가액 … 이 있는 경우에는 그 가액에 비례하여 안분 계산한 금액으로
 *              한다**」 ⇒ **감정평가가액이 기준시가보다 우선**한다
 * 2호 본문: 어느 하나/모두 기준시가가 없고 감정평가가액이 있으면 → 감정평가가액 비율
 *
 * ⇒ 서열: **감정평가가액 > 기준시가**. (2호 단서 장부가액·3호 국세청장 고시는 Phase 1 범위 밖 — §12.3)
 *
 * ## 🔴 감정평가가액의 **시기 요건**
 *
 * 같은 호 괄호: 「공급시기 … 가 속하는 과세기간의 **직전 과세기간 개시일부터** 공급시기가 속하는
 * 과세기간의 **종료일까지** … 감정평가법인등이 평가한 감정평가가액」
 *
 * 「소득세법」 제5조 제1항: 「소득세의 과세기간은 **1월 1일부터 12월 31일까지** 1년으로 한다」
 * ⇒ 유효 창 = **[(양도연도 − 1)-01-01, 양도연도-12-31]**
 *
 * ⚠️ **두 겹의 유추**를 명시한다:
 *   ① 「공급시기」를 **양도시기**로 읽는 것 — §166⑥이 부가령 §64①을 차용하는 구조상 자연스러우나
 *      명문은 아니다(계획서 Q-9 — 예규 확인 권장)
 *   ② §5②③(사망·출국 시 과세기간이 1월 1일~사망일·출국일로 **단축**)은 **반영하지 않는다** —
 *      「양도 후 사망 + 감정」 조합은 유추 위에 유추를 쌓는다. 역년 전제로 구현하고 범위 밖으로 둔다
 *
 * ## 고정 계약
 *   B-1  감정평가가액이 있으면 **기준시가를 쓰지 않는다** (1호 단서)
 *   B-2  시기 요건을 벗어난 감정은 **배제**하고 기준시가로 후퇴한다
 *   B-3  창 경계 — 직전 과세기간 **개시일**·양도 과세기간 **종료일**은 창 안이다
 *   B-4  감정이 없으면 기준시가 (1호 본문)
 *   B-5  둘 다 없으면 **산출 불가(null)** — 0으로 메우지 않는다
 *   B-6  잔액 흡수 — 토지 + 건물 = 총 양도가액
 *   B-7  감정 한쪽만 입력된 것은 감정으로 쓰지 않는다
 */
import { describe, it, expect } from "vitest";
import { resolveSaleApportionBasis } from "@/lib/tax-engine/sale-split-apportion-basis";

const TOTAL = 1_000_000_000;
const TRANSFER = new Date("2026-06-01");

/** 기준시가 비율 → 토지 60% (안분: 토지 6억 / 건물 4억) */
const STD = { land: 900_000_000, building: 600_000_000 };
/** 감정가액 비율 → 토지 40% (안분: 토지 4억 / 건물 6억) — 실무 자료 예시와 같은 비율 */
const APPRAISAL = { land: 400_000_000, building: 600_000_000 };

const run = (over: Partial<Parameters<typeof resolveSaleApportionBasis>[0]> = {}) =>
  resolveSaleApportionBasis({
    totalTransferPrice: TOTAL,
    transferDate: TRANSFER,
    stdPrice: STD,
    ...over,
  });

describe("B-1 — 감정평가가액이 기준시가보다 우선한다 (부가령 §64①1호 단서)", () => {
  it("둘 다 있으면 **감정가액** 비율로 안분한다", () => {
    const r = run({ appraisal: { value: APPRAISAL, appraisedAt: new Date("2025-06-01") } });
    expect(r.kind).toBe("appraisal");
    // 감정 비율 토지 40% → 4억 (기준시가 비율이면 6억이 나온다)
    expect(r.apportioned).toEqual({ land: 400_000_000, building: 600_000_000 });
  });

  it("🔴 기준시가 비율(토지 6억)을 **쓰지 않는다** — 두 basis가 갈리는 fixture다", () => {
    const withAppraisal = run({
      appraisal: { value: APPRAISAL, appraisedAt: new Date("2025-06-01") },
    });
    const stdOnly = run();
    expect(stdOnly.apportioned!.land).toBe(600_000_000); // 기준시가 basis
    expect(withAppraisal.apportioned!.land).toBe(400_000_000); // 감정 basis
    expect(withAppraisal.apportioned!.land).not.toBe(stdOnly.apportioned!.land);
  });
});

describe("B-2 — 시기 요건을 벗어난 감정은 배제한다", () => {
  it("직전 과세기간 개시일 **전**(2024-12-31) → 배제하고 기준시가로 후퇴", () => {
    const r = run({ appraisal: { value: APPRAISAL, appraisedAt: new Date("2024-12-31") } });
    expect(r.kind).toBe("std_price");
    expect(r.appraisalRejected).toBe("out_of_window");
    expect(r.apportioned!.land).toBe(600_000_000); // 기준시가 basis
  });

  it("양도 과세기간 종료일 **후**(2027-01-01) → 배제", () => {
    const r = run({ appraisal: { value: APPRAISAL, appraisedAt: new Date("2027-01-01") } });
    expect(r.kind).toBe("std_price");
    expect(r.appraisalRejected).toBe("out_of_window");
  });

  it("배제 사유를 **표시용으로 남긴다** — 사용자가 왜 무시됐는지 알아야 한다", () => {
    const r = run({ appraisal: { value: APPRAISAL, appraisedAt: new Date("2024-06-01") } });
    expect(r.appraisalRejected).toBe("out_of_window");
    expect(r.appraisalWindow?.from.toISOString().slice(0, 10)).toBe("2025-01-01");
    expect(r.appraisalWindow?.to.toISOString().slice(0, 10)).toBe("2026-12-31");
  });
});

describe("B-3 — 창 경계는 포함이다", () => {
  it("직전 과세기간 개시일(2025-01-01) 정확히 → 채택", () => {
    const r = run({ appraisal: { value: APPRAISAL, appraisedAt: new Date("2025-01-01") } });
    expect(r.kind).toBe("appraisal");
    expect(r.appraisalRejected).toBeUndefined();
  });

  it("양도 과세기간 종료일(2026-12-31) 정확히 → 채택", () => {
    const r = run({ appraisal: { value: APPRAISAL, appraisedAt: new Date("2026-12-31") } });
    expect(r.kind).toBe("appraisal");
  });
});

describe("B-4·B-5 — 감정이 없을 때", () => {
  it("기준시가만 있으면 기준시가 비율 (1호 본문)", () => {
    const r = run();
    expect(r.kind).toBe("std_price");
    expect(r.apportioned).toEqual({ land: 600_000_000, building: 400_000_000 });
  });

  it("🔴 둘 다 없으면 **산출 불가** — 0으로 메우지 않는다", () => {
    const r = resolveSaleApportionBasis({
      totalTransferPrice: TOTAL,
      transferDate: TRANSFER,
    });
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
      transferDate: TRANSFER,
      stdPrice: { land: 100_000_000, building: 200_000_000 },
    });
    expect(r.apportioned!.land + r.apportioned!.building).toBe(1_000_000_000);
    expect(r.apportioned!.land).toBe(333_333_333); // floor
    expect(r.apportioned!.building).toBe(666_666_667); // 잔액
  });
});

describe("B-7 — 불완전한 감정 입력", () => {
  it("감정 한쪽만 입력된 것은 감정으로 쓰지 않는다", () => {
    const r = run({
      appraisal: { value: { land: 400_000_000, building: 0 }, appraisedAt: new Date("2025-06-01") },
    });
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
      appraisal: { value: { land: 0, building: 600_000_000 }, appraisedAt: new Date("2025-06-01") },
    });
    expect(r.kind).toBe("std_price"); // 감정을 쓰지 않았다
    expect(r.appraisalRejected).toBe("incomplete");
  });
});

/**
 * B-8 — 시간대 관례: **UTC로 통일** (2026-08-06)
 *
 * `lib/api/date-coerce.ts:45`의 `toDate`가 ISO 날짜 문자열을 `new Date(value)`로 파싱하므로
 * 엔진에 도달하는 날짜는 **UTC 자정**이다. 창을 `Date.UTC`로 만들면서 연도를 `getFullYear()`(로컬)로
 * 읽으면 두 체계가 섞여, KST(+9) 환경에서 UTC 연말 타임스탬프의 창이 1년 밀린다.
 *
 * 이 anchor는 **로컬 시간대와 무관하게** 통과해야 한다.
 */
describe("B-8 — 창 산출은 UTC 기준이다", () => {
  it("양도일 UTC 자정(2026-01-01) → 창 [2025-01-01, 2026-12-31]", () => {
    const r = resolveSaleApportionBasis({
      totalTransferPrice: TOTAL,
      transferDate: new Date("2026-01-01"),
      stdPrice: STD,
      appraisal: { value: APPRAISAL, appraisedAt: new Date("2025-01-01") },
    });
    expect(r.appraisalWindow!.from.toISOString().slice(0, 10)).toBe("2025-01-01");
    expect(r.appraisalWindow!.to.toISOString().slice(0, 10)).toBe("2026-12-31");
    expect(r.kind).toBe("appraisal"); // 창 하한 경계 = 채택
  });

  it("🔴 UTC 연말 타임스탬프(2025-12-31T15:00Z)는 **2025년** 과세기간이다", () => {
    // KST로는 2026-01-01이라 `getFullYear()`를 쓰면 창이 [2025-01-01, 2026-12-31]로 밀린다.
    // UTC 기준이면 [2024-01-01, 2025-12-31]이므로 2024-06-01 감정이 창 안이다.
    const r = resolveSaleApportionBasis({
      totalTransferPrice: TOTAL,
      transferDate: new Date("2025-12-31T15:00:00Z"),
      stdPrice: STD,
      appraisal: { value: APPRAISAL, appraisedAt: new Date("2024-06-01") },
    });
    expect(r.appraisalWindow!.from.toISOString().slice(0, 10)).toBe("2024-01-01");
    expect(r.kind).toBe("appraisal");
  });
});
