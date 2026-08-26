/**
 * F-08 Pre-Do anchor — 다필지 가중평균 공시지가의 float 나눗셈이 위치지수 구간을 한 칸 강등시킨다.
 *
 * 결함 위치: `lib/tax-engine/building-standard-price-helpers.ts` `weightedAvgLandPrice`
 *   let areaSum = 0; let valueSum = 0;
 *   for (const p of parcels) { areaSum += p.areaM2; valueSum += p.areaM2 * p.pricePerM2; }
 *   return valueSum / areaSum;                       // ← 재양자화 없는 float 몫
 *   그리고 `resolveLocationIndex` 는 `landPricePerM2 >= table.boundaries[i]` 로 구간을 가른다.
 *   정확값이 경계와 일치하는 조합에서 float 가 경계 **아래**로 떨어지면 지수가 한 칸 내려간다.
 *   오차 방향은 강등 한 방향뿐이다(위로 뜨는 경우는 `>=` 라 무해).
 *
 * ⚠️ 함수 주석이 「정수 절사 없이 사용(**구간 경계 영향 없음**)」이라고 단정하는데, 이것이 반증됐다.
 *
 * 🔴 리뷰 서술보다 넓다 — **모든 필지의 지가가 같아도 발생한다.**
 *   면적 66.67㎡ + 12.34㎡, 둘 다 500,000원/㎡ → 정확 평균은 당연히 500,000 인데
 *   float 는 499999.99999999994 를 내고 위치지수가 98 → 94 로 **4포인트** 떨어진다.
 *   지수는 기준시가에 선형으로 실리므로 그대로 약 4% 과소가 된다.
 *
 * 법령: 「상속세 및 증여세법」 제61조 제1항 제2호 위임 하의 국세청 「건물 기준시가 계산방법」 고시
 *   §6⑥(부속토지 면적가중평균) — **고시 본문 미확인**. 다만 「Σ(면적×지가) ÷ Σ면적」이 정확히
 *   경계값이면 그 구간에 속한다는 것은 어떤 독법에서도 성립한다.
 *
 * 실측(2026-08-26 · 평가연도 2025 · 면적 소수 8종 × 지가 8종의 2필지 격자 4,096셀):
 *   지수 강등 **59건**(1.44%). 대표:
 *     a=(66.67, 12.34)  p=(500,000, 500,000)     float 499999.99999999994  지수 94 ← 정확 98
 *     a=(66.67, 12.34)  p=(1,000,000, 1,000,000) float 999999.9999999999   지수 102 ← 정확 105
 *     a=(66.67, 150.55) p=(200,000, 200,000)     float 199999.99999999997  지수 91 ← 정확 92
 *
 * ⚠️ §1·§2 는 **F-08 수정 전에 실패한다** — 의도된 Pre-Do anchor다.
 */
import { describe, it, expect } from "vitest";
import { weightedAvgLandPrice } from "@/lib/tax-engine/building-standard-price-helpers";
import { resolveLocationIndex } from "@/lib/tax-engine/data/building-standard-price";
import type { LandParcel } from "@/lib/tax-engine/types/building-standard-price.types";

const P = (areaM2: number, pricePerM2: number): LandParcel => ({ areaM2, pricePerM2 });

describe("F-08 다필지 가중평균 — §1 동일 지가면 그 지가가 그대로 평균이다 (수정 전 실패)", () => {
  /**
   * 가장 단순한 불변식 — 모든 필지의 ㎡당 지가가 같으면 면적이 무엇이든 가중평균은 그 지가다.
   * 이것이 깨지면 산술이 틀린 것이고, 고시 해석과 무관하다.
   */
  const SAME_PRICE_CASES: [number, number, number][] = [
    [66.67, 12.34, 500_000],
    [66.67, 12.34, 1_000_000],
    [66.67, 12.34, 2_000_000],
    [66.67, 150.55, 200_000],
    [33.33, 66.67, 3_000_000],
  ];

  it.each(SAME_PRICE_CASES)(
    "면적 %s + %s, 지가 모두 %s → 가중평균이 정확히 그 지가여야 한다",
    (a1, a2, price) => {
      expect(weightedAvgLandPrice([P(a1, price), P(a2, price)])).toBe(price);
    },
  );

  it("동일 지가 조합에서 위치지수가 단일 필지와 같아야 한다 (66.67+12.34 @ 500,000)", () => {
    const avg = weightedAvgLandPrice([P(66.67, 500_000), P(12.34, 500_000)]);
    expect(resolveLocationIndex(2025, avg)).toBe(resolveLocationIndex(2025, 500_000));
  });
});

describe("F-08 다필지 가중평균 — §2 격자 전수 (수정 전 실패)", () => {
  /** 면적을 micro-㎡ 정수로 올린 정확 분수 */
  function exactRatio(parcels: LandParcel[]): { num: bigint; den: bigint } {
    let num = 0n;
    let den = 0n;
    for (const p of parcels) {
      const a = BigInt(Math.round(p.areaM2 * 1_000_000));
      den += a;
      num += a * BigInt(Math.round(p.pricePerM2));
    }
    return { num, den };
  }

  const AREAS = [33.33, 66.67, 12.34, 87.66, 150.55, 249.45, 7.77, 92.23];
  const PRICES = [199_000, 200_000, 500_000, 1_000_000, 2_000_000, 3_000_000, 5_000_000, 1_234_567];

  it("정확값이 정수(구간 경계 후보)인 조합에서 float 몫이 그 정수와 달라지지 않는다", () => {
    const diverged: string[] = [];
    let cells = 0;
    for (const a1 of AREAS) {
      for (const a2 of AREAS) {
        for (const p1 of PRICES) {
          for (const p2 of PRICES) {
            cells++;
            const parcels = [P(a1, p1), P(a2, p2)];
            const { num, den } = exactRatio(parcels);
            if (num % den !== 0n) continue; // 정확값이 정수가 아니면 경계 동등이 불가능하다
            const exact = Number(num / den);
            const got = weightedAvgLandPrice(parcels);
            if (got !== exact) {
              if (diverged.length < 6) {
                diverged.push(`a=(${a1},${a2}) p=(${p1},${p2}) got=${got} exact=${exact}`);
              }
            }
          }
        }
      }
    }
    expect(cells).toBe(4096); // 격자 축소 방지 가드
    expect(diverged).toEqual([]);
  });

  it("같은 격자에서 위치지수 강등이 0건이어야 한다 — 현재 59건", () => {
    const dropped: string[] = [];
    for (const a1 of AREAS) {
      for (const a2 of AREAS) {
        for (const p1 of PRICES) {
          for (const p2 of PRICES) {
            const parcels = [P(a1, p1), P(a2, p2)];
            const { num, den } = exactRatio(parcels);
            if (num % den !== 0n) continue;
            const exact = Number(num / den);
            const iGot = resolveLocationIndex(2025, weightedAvgLandPrice(parcels));
            const iExact = resolveLocationIndex(2025, exact);
            if (iGot !== iExact && dropped.length < 6) {
              dropped.push(`a=(${a1},${a2}) p=(${p1},${p2}) 지수 ${iGot} ← 정확 ${iExact}`);
            }
          }
        }
      }
    }
    expect(dropped).toEqual([]);
  });
});

describe("F-08 다필지 가중평균 — §3 역방향 가드 (수정 후에도 불변)", () => {
  it("서로 다른 지가의 가중평균은 종전 값 그대로 (NTS 기타사례 다: 1,000@250만 + 2,000@300만 + 3,000@150만)", () => {
    const avg = weightedAvgLandPrice([
      P(1000, 2_500_000),
      P(2000, 3_000_000),
      P(3000, 1_500_000),
    ]);
    expect(avg).toBeCloseTo(2_166_666.67, 1);
    expect(resolveLocationIndex(2026, avg)).toBe(114);
  });

  it("면적 합계가 0이면 검증 오류", () => {
    expect(() => weightedAvgLandPrice([P(0, 1_000_000)])).toThrow(/면적 합계/);
  });

  it("단일 필지는 그 필지의 지가를 그대로 돌려준다", () => {
    expect(weightedAvgLandPrice([P(123.45, 1_234_567)])).toBe(1_234_567);
  });
});
