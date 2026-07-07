import { describe, it, expect } from "vitest";
import { resolveAcqBaseRate, ACQ_BASE_RATE } from "../../../lib/tax-engine/data/building-standard-price";
import { calcAcqBaseBreakdown } from "../../../lib/tax-engine/building-standard-price-helpers";

/**
 * BSP-15 — 취득당시 산정기준율 §8⑤ "내용연수 종료연도 신축연도 치환".
 * 국세청 「건물 기준시가 계산방법」 고시 p.301 §8⑤: 취득연도에서 내용연수를 역산한 종료 연도
 * 이전에 신축된 건물은 그 종료 연도(취득연도 − 내용연수)를 신축연도로 치환.
 * 내용연수: I=40 / II=30 / III=20.
 */
describe("BSP-15 산정기준율 §8⑤ 내용연수 종료연도 치환", () => {
  it("사용자 케이스: III(시멘트블록)·신축1966·취득1999 → 치환 신축1979 = 1.095", () => {
    // 1999 − 20(III) = 1979. built 1966 < 1979 → 치환. (III,1979,1999) = 1.095.
    expect(resolveAcqBaseRate("III", 1966, 1999)).toBe(1.095);
  });

  it("치환 등가성: III·신축1979·취득1999도 동일 1.095 (치환 불필요, 동일 셀)", () => {
    expect(resolveAcqBaseRate("III", 1979, 1999)).toBe(1.095);
  });

  it("그룹 I 대각 컷: I·신축1959·취득2000 → 치환 신축1960 = 1.047", () => {
    // 2000 − 40(I) = 1960. built 1959 < 1960 → 치환. (I,1960,2000) = 1.047.
    expect(resolveAcqBaseRate("I", 1959, 2000)).toBe(1.047);
  });

  it("회귀가드(내용연수 이내 — 치환 없음): III·신축1990·취득2000 = 원값 유지", () => {
    // 2000 − 20 = 1980. built 1990 > 1980 → 치환 없음. (III,1990,2000) 원값.
    expect(resolveAcqBaseRate("III", 1990, 2000)).toBe(1.038);
  });

  it("§8④ 회귀가드(취득<신축 — 완공 전 취득): I·신축2000·취득1999 = undefined 유지", () => {
    // 치환 후에도 (I,2000,1999) 셀 부재 → undefined (data.test.ts:246과 동일).
    expect(resolveAcqBaseRate("I", 2000, 1999)).toBeUndefined();
  });

  it("전수 가드: 취득≥신축 모든 (그룹·신축·취득) 조합 미수록 0건 (§8⑤ 적용)", () => {
    const MIN: Record<string, number> = { I: 1945, II: 1955, III: 1965 };
    const missing: string[] = [];
    for (const g of ["I", "II", "III"] as const) {
      for (let built = MIN[g]; built <= 2000; built++) {
        for (let acq = 1985; acq <= 2000; acq++) {
          if (acq < built) continue; // §8④(완공 전 취득)은 별도 — 전수 대상 제외
          if (resolveAcqBaseRate(g, built, acq) === undefined) missing.push(`${g}/${built}/${acq}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("사용자 케이스 엔진 통합: calcAcqBaseBreakdown throw→값 산출 (홈택스 gold anchor)", () => {
    // 시멘트블록조·단독주택·신축1966·취득1999·면적115·취득공시지가930,000.
    // ⚠️ usageNo는 취득연도(2001) 체계 기준: 2001·2002 체계는 #1 = 단독+아파트 통합(지수 1.0).
    //    현행(2018~) 체계에서 단독주택은 #2지만, 취득당시 기준시가는 2001 지수표를 쓰므로 2001 체계의 #1을 사용.
    // 2001 기저: 신축가격기준액400,000·구조0.6·용도1.0·위치1.0·잔가0.2 → 48,000/㎡ × 115 = 5,520,000.
    //   × 1.095(산정기준율) = 6,044,400 (홈택스 실측 일치).
    const acqPoint = { structureKey: "cement_block", usageNo: 1, landPricePerM2: 930000 };
    const bd = calcAcqBaseBreakdown(1999, acqPoint, 115, 1966);
    expect(bd.acqBaseRate).toBe(1.095);
    expect(bd.standardPrice).toBe(6_044_400);
  });

  it("ACQ_BASE_RATE 표 구조: III 신축1966 행은 취득 1986·1985만 수록(대각 컷 = 신축+20)", () => {
    // §8⑤ 치환의 근거 — 표 자체는 대각선(신축+내용연수)에서 잘림.
    expect(Object.keys(ACQ_BASE_RATE.III[1966]).map(Number).sort((a, b) => b - a)).toEqual([1986, 1985]);
  });
});
