/**
 * 외화 → 원화 정수 환산 — 공용 leaf `lib/tax-engine/fx-krw.ts`의 re-export.
 * 국외 부동산 importer(9곳)·`a1-fx-krw.anchor.test.ts` 경로를 그대로 두려고 얇게 남겼다. 로직·상수는 공용 leaf가 소유한다.
 */
export { FX_MAX_DECIMALS, toKrw, tryToKrw } from "../fx-krw";
