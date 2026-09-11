/**
 * 「단가 × 면적」 1원 과소산정 anchor — `multiplyByArea()`.
 *
 * 🔴 결함:
 *   `Math.floor(unitPrice * area)`는 면적이 이진 배정도로 정확히 표현되지 않을 때
 *   곱이 참값보다 미세하게 작아지고, `floor`가 그 차이를 **1원**으로 확대한다.
 *
 *     5,000,000 × 8.04 → 40199999.999999996 → floor **40,199,999** (참값 40,200,000)
 *
 *   단가 5,000,000원·면적 0.01~2000.00㎡ 전수 20만 개 중 **11,105건(5.6%)**,
 *   방향은 **항상 과소**다.
 *
 * 🔑 이 저장소는 같은 부류를 이미 한 번 해결했다 — `applyFairMarketRatio`의
 *    「0.70의 double 표현으로 floor가 1원 과소산정 → 정수 분수연산으로 대체」.
 *    같은 처방을 면적에 적용한 것이 `multiplyByArea`다.
 *
 * ⚠️ **기존 fixture는 이 경로를 소수 면적으로 태우지 않았다.** 전환 후 엔진 테스트
 *    12,336건을 계측했더니 실제로 갈린 호출은 **단 1건**(아래 8.04 케이스)이었다 —
 *    즉 「전건 통과」는 안전의 증거일 뿐 **커버리지의 증거가 아니다**
 *    (`feedback_mutation_zero_discrimination_is_not_proof`). 그래서 이 anchor를 둔다.
 */
import { describe, it, expect } from "vitest";
import { multiplyByArea } from "@/lib/tax-engine/area-utils";
import { multiplyByAreaShare } from "@/lib/tax-engine/area-utils";

describe("multiplyByArea — 참값을 낸다", () => {
  it("UA-1: 부동소수 곱이 1원 깎던 케이스", () => {
    expect(multiplyByArea(5_000_000, 8.04)).toBe(40_200_000);
    // 종전 구현 — 되돌아가면 여기서 드러난다
    expect(Math.floor(5_000_000 * 8.04)).toBe(40_199_999);
  });

  /**
   * ⚠️ 루프 **안에서 `expect()`를 부르지 않는다.** 20만 회 × 3 단언 = 60만 호출이라
   *    로컬 1.09초가 CI(2 worker)에서 기본 timeout 5초를 넘겼다(PR #1556 shard 4/4 실패).
   *    집계만 하고 밖에서 한 번 단언한다 — 커버리지는 그대로다.
   */
  it("UA-2: 전수 스윕 — 0.01~2000.00㎡에서 naive보다 작아지지 않고, 참값과 일치한다", () => {
    let fixed = 0;
    let wrong = 0;
    let regressed = 0;
    for (let i = 1; i <= 200_000; i++) {
      const area = i / 100;
      const got = multiplyByArea(5_000_000, area);
      const naive = Math.floor(5_000_000 * area);
      // 참값 = 정수 연산
      const exact = Math.floor((5_000_000 * Math.round(area * 100)) / 100);
      if (got !== exact) wrong++;
      if (got < naive) regressed++;
      if (got !== naive) fixed++;
    }
    expect(wrong).toBe(0); // 전건 참값 일치
    expect(regressed).toBe(0); // 종전보다 작아진 케이스 없음
    expect(fixed).toBe(11_105); // 실제로 고쳐진 수 — 구별력
  });

  it("UA-3: [대조군] 정수 면적은 종전과 완전히 같다", () => {
    for (const a of [1, 10, 100, 330, 1000]) {
      expect(multiplyByArea(5_000_000, a)).toBe(Math.floor(5_000_000 * a));
    }
  });

  it("UA-4: [대조군] 단가·면적이 0이거나 비정상이면 0", () => {
    expect(multiplyByArea(0, 10)).toBe(0);
    expect(multiplyByArea(5_000_000, 0)).toBe(0);
    expect(multiplyByArea(NaN, 10)).toBe(0);
    expect(multiplyByArea(5_000_000, Infinity)).toBe(0);
  });

  it("UA-5: 소수 3자리 이상 면적도 참값 — round2 전 값이 들어와도 깎지 않는다", () => {
    expect(multiplyByArea(1_000_000, 8.045)).toBe(8_045_000);
    expect(multiplyByArea(1_000_000, 12.345)).toBe(12_345_000);
  });

  it("UA-6: MAX_SAFE 초과 곱에서도 BigInt 경로로 참값", () => {
    // 단가 9경 × 면적 → product가 2^53 초과
    const huge = 9_000_000_000_000_000;
    expect(multiplyByArea(huge, 2.5)).toBe(22_500_000_000_000_000);
  });
});

describe("실제 엔진 경로에서도 참값이 나온다", () => {
  it("UA-7: 개별공시지가 × 토지면적 (상속 취득가액 §163⑨ 경로)", async () => {
    const { multiplyByArea: m } = await import("@/lib/tax-engine/area-utils");
    // 공시지가 3,150,000원/㎡ × 132.23㎡ — 참값 416,524,500
    expect(m(3_150_000, 132.23)).toBe(416_524_500);
    expect(Math.floor(3_150_000 * 132.23)).toBe(416_524_499); // 종전 1원 과소
  });
});

describe("multiplyByAreaShare — 지분 3항 곱도 참값", () => {
  it("UA-8: 부동소수 3항 곱이 1원 깎던 케이스", () => {
    expect(multiplyByAreaShare(1_000_000, 0.7, 0.3333)).toBe(233_310);
    expect(Math.floor(0.7 * 0.3333 * 1_000_000)).toBe(233_309); // 종전
  });

  it("UA-9: 전수 조합 — 참값과 일치하고 종전보다 작아지지 않는다", () => {
    let wrong = 0, regressed = 0, fixed = 0;
    const prices = [1_000_000, 3_150_000, 5_000_000, 12_345_000];
    const ratios = [1, 0.5, 0.3333, 0.25, 0.6667, 0.125];
    for (const p of prices) {
      for (let ai = 1; ai <= 2000; ai++) {
        const a = ai / 10;
        for (const r of ratios) {
          const got = multiplyByAreaShare(p, a, r);
          const naive = Math.floor(a * r * p);
          const exact = Number(
            (BigInt(p) * BigInt(Math.round(a * 100)) * BigInt(Math.round(r * 10000))) / 1_000_000n,
          );
          if (got !== exact) wrong++;
          if (got < naive) regressed++;
          if (got !== naive) fixed++;
        }
      }
    }
    expect(wrong).toBe(0);
    expect(regressed).toBe(0);
    expect(fixed).toBe(5_048); // 실측 10.5%
  });

  it("UA-10: [대조군] 지분 1이면 multiplyByArea와 완전히 같다 — 순서를 바꾸지 않았다", () => {
    for (const a of [8.04, 132.23, 100, 0.41]) {
      expect(multiplyByAreaShare(5_000_000, a, 1)).toBe(multiplyByArea(5_000_000, a));
    }
  });

  /**
   * 🔑 **세 후보가 실제로 갈린다** — 그래서 「순서」가 한때 미결이었다(실측 5.6만 조합):
   *
   *   | 후보 | 산식 | ⓐ와 불일치 | 차이 크기 |
   *   |---|---|---|---|
   *   | ⓐ 현행 | `floor(단가 × 면적 × 지분)` | — | — |
   *   | ⓑ | `floor(floor(단가 × 면적) × 지분)` | **5.89%** | 1원 |
   *   | ⓒ | `floor(단가 × round2(면적 × 지분))` | **60.67%** | **수천 원** |
   *
   * ✅ **종결 — ⓐ 확정** (2026-09-10 `5da0765a`. 계획서 `share-ratio-application-order.plan.md`).
   * 「지방세법」 §113①(토지는 **소유 가액을 합산** — 주택 §113③ 같은 전체-과표 규정이 없다) ·
   * 조심2011지0554(「단독·공동을 구분해 **과세표준을 달리 적용하는 것은 과세형평상 불합리**」) ·
   * 그 원리의 실측(지분율 합이 1인 45,000건에서 **ⓐ만 Σ지분가액 = 전체가액이 0건 예외 없이
   * 성립**. ⓑ 1,526건·1원, ⓒ 8,103건·43,000원 어긋남)이 셋 다 ⓐ를 가리켰다.
   *
   * ⛔ ⓑ·ⓒ·「주택 방식(전체 과표 → 세액 안분)」은 **재제안 금지**다. 이 대조군은 그
   *    기각 근거의 수치를 고정한다 — 「갈린다」는 사실 자체는 여전히 참이다.
   */
  it("UA-11: [대조군] 세 후보가 실제로 갈린다 — ⓐ 확정의 근거 수치", () => {
    const p = 1_000_000, a = 0.3, r = 0.1667;
    const round2 = (x: number) => Math.round(x * 100) / 100;
    expect(multiplyByAreaShare(p, a, r)).toBe(50_010); // ⓐ 현행
    expect(Math.floor(multiplyByArea(p, a) * r)).toBe(50_009); // ⓑ — 1원 아래
    expect(multiplyByArea(p, round2(a * r))).toBe(50_000); // ⓒ — 10원 아래

    // ⓐ = 종전 산식의 «참값»이다 — 순서를 바꾼 것이 아니다
    expect(multiplyByAreaShare(p, a, r)).toBeGreaterThanOrEqual(Math.floor(a * r * p));
  });

  /**
   * 🔴 회귀 anchor — PR #1557 초판이 `decompose`에서 자릿수를 `Math.min(6, …)`으로 잘랐다.
   *    면적은 규약상 2자리라 무해했지만 **지분율은 `1/3`처럼 고정밀 값이 정상**이고,
   *    50억 필지에서 **1,666원**이 잘렸다. 「부동소수 오차를 고치는 함수」가 더 큰 오차를
   *    만들고 있었다 — 정밀도 한계는 «임의 상수»가 아니라 «표현 가능 한계»가 정해야 한다.
   */
  it("UA-13: 고정밀 지분율을 자르지 않는다 — 6자리 캡 회귀", () => {
    const p = 5_000_000, a = 1000;
    expect(multiplyByAreaShare(p, a, 1 / 3)).toBe(1_666_666_666);
    expect(multiplyByAreaShare(p, a, 1 / 3)).toBe(Math.floor((p * a) / 3));
    // 6자리로 자르면 나오던 값 — 되돌아가면 여기서 드러난다
    expect(multiplyByAreaShare(p, a, 0.333333)).toBe(1_666_665_000);
    // 사용자가 33.33%를 입력한 경우는 그대로 4자리다(입력 정밀도를 임의로 늘리지 않는다)
    expect(multiplyByAreaShare(p, a, 0.3333)).toBe(1_666_500_000);
  });

  it("UA-12: [대조군] 비정상 입력은 0, 지수표기는 종전 동작으로 되돌아간다", () => {
    expect(multiplyByAreaShare(NaN, 1, 1)).toBe(0);
    expect(multiplyByAreaShare(1_000_000, 1e-7, 1)).toBe(Math.floor(1_000_000 * 1e-7 * 1));
  });
});
