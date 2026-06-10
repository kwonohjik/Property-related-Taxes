/**
 * 건물 기준시가 계산기 — 엔진 (Orchestrator)
 *
 * 출처: 국세청 「건물 기준시가 계산방법」 고시(첨부 PDF). 법령 위임근거: 소법 §99①1호나목·소령 §164⑤⑧③·상증법 §61①2호.
 * 설계: docs/02-design/features/building-standard-price.engine.design.md
 *
 * ⚠️ Phase A(데이터 전사) 완료. **Phase B(엔진 코어) 미구현** — 본 파일은 타입 re-export + stub.
 *   Phase B에서 calcBuildingStandardPrice 구현 후 anchor.test.ts의 describe.skip 해제.
 */
import type {
  BuildingStandardPriceInput,
  BuildingStandardPriceResult,
} from "./types/building-standard-price.types";

export type {
  BuildingStandardPriceInput,
  BuildingStandardPriceResult,
  BuildingPointInput,
  BuildingStdPriceBreakdown,
  BuildingStdPriceTaxType,
  SpecialAdjustmentFeatures,
  SameYearFormula,
} from "./types/building-standard-price.types";

/**
 * 건물 기준시가 계산 진입점(양도/상속·증여 공통).
 * ⚠️ Phase B 미구현 — 호출 시 throw. 데이터 레이어는 `data/building-standard-price/`에 완비됨.
 */
export function calcBuildingStandardPrice(
  _input: BuildingStandardPriceInput,
): BuildingStandardPriceResult {
  throw new Error(
    "calcBuildingStandardPrice: Phase B 엔진 미구현 (데이터 레이어만 완료). docs/02-design/features/building-standard-price.engine.design.md 참조",
  );
}
