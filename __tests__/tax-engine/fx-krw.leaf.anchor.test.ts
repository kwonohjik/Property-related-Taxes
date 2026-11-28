/**
 * 공용 환산 leaf `lib/tax-engine/fx-krw.ts` — 수량 인자 · 던지지 않는 변형 · 부동산 re-export 동일성.
 * (국외 부동산 `toKrw` 단독 거동은 `foreign-realestate/a1-fx-krw.anchor.test.ts`가 그대로 지킨다 — 이 파일은 신규 면만.)
 */
import { describe, it, expect } from "vitest";
import {
  FX_MAX_DECIMALS,
  fxViolation,
  toKrw,
  toKrwOrNull,
  toKrwUnlessZero,
  tryToKrw,
} from "@/lib/tax-engine/fx-krw";
import * as realestate from "@/lib/tax-engine/foreign-realestate/fx";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";

/** 독립 기준 구현 — 십진 문자열을 직접 쪼개 BigInt로 계산(구현의 decimalizeRatio와 무관). */
function referenceFloor(a: string, r: string, q = 1): number {
  const split = (s: string) => {
    const [i, f = ""] = s.split(".");
    return { n: BigInt(i + f), k: f.length };
  };
  const A = split(a);
  const R = split(r);
  return Number((A.n * R.n * BigInt(q)) / 10n ** BigInt(A.k + R.k));
}

describe("부동산 fx.ts는 공용 leaf의 re-export다 (동작 byte-identical)", () => {
  it("같은 함수 객체를 가리킨다", () => {
    expect(realestate.toKrw).toBe(toKrw);
    expect(realestate.tryToKrw).toBe(tryToKrw);
    expect(realestate.FX_MAX_DECIMALS).toBe(FX_MAX_DECIMALS);
  });

  it("오류 코드·메시지·details는 종전 부동산 toKrw와 같다 (값 고정)", () => {
    const cases: [number, number, string, string, TaxErrorCode][] = [
      [-1, 1300, "p.amountForeign: 음수일 수 없습니다", "p.amountForeign", TaxErrorCode.INVALID_INPUT],
      [1, 0, "p.exchangeRate: 0보다 커야 합니다 (환율 미입력 불가)", "p.exchangeRate", TaxErrorCode.INVALID_INPUT],
      [1e11 + 1, 1300, "p.amountForeign: 100,000,000,000 이하여야 합니다", "p.amountForeign", TaxErrorCode.INVALID_INPUT],
      [1, 1e7 + 1, "p.exchangeRate: 10,000,000 이하여야 합니다", "p.exchangeRate", TaxErrorCode.INVALID_INPUT],
      [1.12345, 1300, "p.amountForeign: 소수 4자리 이하만 입력할 수 있습니다", "p.amountForeign", TaxErrorCode.INVALID_INPUT],
      [1, 1300.12345, "p.exchangeRate: 소수 4자리 이하만 입력할 수 있습니다", "p.exchangeRate", TaxErrorCode.INVALID_INPUT],
      [NaN, 1300, "p.amountForeign: 유한한 숫자여야 합니다", "p.amountForeign", TaxErrorCode.INVALID_INPUT],
    ];
    for (const [a, r, msg, path, code] of cases) {
      let err: unknown;
      try {
        toKrw(a, r, "p");
      } catch (e) {
        err = e;
      }
      expect(err, `${a} × ${r}`).toBeInstanceOf(TaxCalculationError);
      const e = err as TaxCalculationError;
      expect(e.message).toBe(msg);
      expect(e.code).toBe(code);
      expect(e.details?.path).toBe(path);
    }
  });

  it("환산 원화가 안전 정수를 넘으면 CALCULATION_OVERFLOW (path만)", () => {
    // 외화 1e11 × 환율 1e7 = 1e18 > 2^53
    let err: unknown;
    try {
      toKrw(1e11, 1e7, "p");
    } catch (e) {
      err = e;
    }
    const e = err as TaxCalculationError;
    expect(e.code).toBe(TaxErrorCode.CALCULATION_OVERFLOW);
    expect(e.message).toBe("p: 환산 원화가 안전 정수 범위를 넘습니다");
    expect(e.details).toEqual({ path: "p" });
  });
});

describe("quantity — 단가 × 수량 × 환율을 BigInt 곱 1회로", () => {
  it("1주당 100 × 4,000주 × 1,300.10 = 520,040,000 (부동소수 곱은 520,039,999)", () => {
    expect(Math.floor(100 * 4000 * 1300.1)).toBe(520_039_999); // 함정 고정
    expect(toKrw(100, 1300.1, "x", 4000)).toBe(520_040_000);
  });

  it("미리 곱해 넘기면(0.1 × 3) 이미 어긋난다 — quantity로 받는 이유", () => {
    expect(0.1 * 3).not.toBe(0.3);
    expect(toKrw(0.1, 1000, "x", 3)).toBe(300);
    // 0.3 = 0.1×3은 부동소수로 0.30000000000000004라 decimalizeRatio가 복원하지만, 1.1 × 3 같은 곱은 한도(소수 4자리)를 넘는다.
    expect(1.1 * 3).toBe(3.3000000000000003);
    expect(toKrw(1.1, 1000, "x", 3)).toBe(3300);
  });

  it("수량 0은 0원, 음수·소수·비안전 정수는 거부", () => {
    expect(toKrw(100, 1300, "x", 0)).toBe(0);
    for (const q of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN]) {
      const r = tryToKrw(100, 1300, "x", q);
      expect("error" in r, `q=${q}`).toBe(true);
      if ("error" in r) expect(r.error.details?.path).toBe("x.quantity");
    }
  });

  it("격자 전수 — 독립 문자열 기준 구현과 1원도 어긋나지 않는다 (단가 2~4자리 × 주수 × 환율 1~4자리)", () => {
    let seed = 20261128;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    let checked = 0;
    for (let i = 0; i < 20000; i++) {
      const qty = 1 + Math.floor(rnd() * 5000);
      const aDec = Math.floor(rnd() * 5);
      const rDec = Math.floor(rnd() * 5);
      const aInt = Math.floor(rnd() * 900) + 1;
      const rInt = 900 + Math.floor(rnd() * 600);
      const frac = (d: number) => (d === 0 ? "" : "." + String(Math.floor(rnd() * 10 ** d)).padStart(d, "0"));
      const a = `${aInt}${frac(aDec)}`;
      const r = `${rInt}${frac(rDec)}`;
      expect(toKrw(Number(a), Number(r), "g", qty), `${a} × ${qty} × ${r}`).toBe(referenceFloor(a, r, qty));
      checked++;
    }
    expect(checked).toBe(20000);
  });
});

describe("던지지 않는 변형 · 위반 사유", () => {
  it("toKrwOrNull — 한도 위반·빈 입력은 null, 정상은 정확값", () => {
    expect(toKrwOrNull(400000, 1300.1)).toBe(520_040_000);
    expect(toKrwOrNull(100, 1300.1, 4000)).toBe(520_040_000);
    expect(toKrwOrNull(100, 1300.12345)).toBeNull(); // 소수 5자리
    expect(toKrwOrNull(0, 1300)).toBe(0);
    expect(toKrwOrNull(100, 0)).toBeNull();
    expect(toKrwOrNull(NaN, 1300)).toBeNull();
    expect(toKrwOrNull(1e11 + 1, 1300)).toBeNull();
  });

  it("fxViolation — 외화액 0은 환율을 보지 않는다 (엔진 toKrwUnlessZero와 같은 규칙)", () => {
    expect(fxViolation(0, 1300.12345)).toBeNull();
    expect(toKrwUnlessZero(0, 1300.12345)).toBe(0);
    expect(toKrwUnlessZero(0, 0)).toBe(0);
    expect(fxViolation(5, 1300.12345)?.target).toBe("rate");
    expect(fxViolation(5.12345, 1300)?.target).toBe("amount");
    expect(() => toKrwUnlessZero(5, 1300.12345)).toThrow(TaxCalculationError);
  });
});
