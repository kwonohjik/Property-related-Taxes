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

describe("multiplyByArea — 참값을 낸다", () => {
  it("UA-1: 부동소수 곱이 1원 깎던 케이스", () => {
    expect(multiplyByArea(5_000_000, 8.04)).toBe(40_200_000);
    // 종전 구현 — 되돌아가면 여기서 드러난다
    expect(Math.floor(5_000_000 * 8.04)).toBe(40_199_999);
  });

  it("UA-2: 전수 스윕 — 0.01~2000.00㎡에서 naive보다 작아지지 않고, 참값과 일치한다", () => {
    let fixed = 0;
    for (let i = 1; i <= 200_000; i++) {
      const area = i / 100;
      const got = multiplyByArea(5_000_000, area);
      const naive = Math.floor(5_000_000 * area);
      // 참값 = 정수 연산
      const exact = Math.floor((5_000_000 * Math.round(area * 100)) / 100);
      expect(got).toBe(exact);
      expect(got).toBeGreaterThanOrEqual(naive);
      if (got !== naive) fixed++;
    }
    expect(fixed).toBe(11_105);
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
