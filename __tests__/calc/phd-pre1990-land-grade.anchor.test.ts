/**
 * anchor: 일반 주택 PHD × 영 §164④ 토지등급가액 환산 (2026-09-05 · 코드리뷰 Q01)
 *
 * ## 조문
 *
 * 영 §164⑦ 산식 분자 = 「취득당시의 법 §99①1호 **가목**의 가액과 나목의 가액의 합계액」.
 * 가목 = 토지 = 개별공시지가인데, **1990.8.30. 이전에는 고시되지 않았다.**
 * 영 §164④가 「1990년 8월 30일 개별공시지가가 고시되기 전에 취득한 토지의 취득당시의
 * 기준시가」를 정해 바로 그 자리를 채운다. 상위 위임도 둘을 한 호에서 묶는다 —
 * 법 §99③2호 「…공시되기 전에 취득한 **토지 및 주택**의 취득 당시의 기준시가」.
 *
 * ⚠️ 「토지등급 환산은 `assetKind="land"` 전용(법령상 토지 전용)」이라는 종전 규약 서술은
 *    **오독**이다 — §164④는 「가목 가액」의 정의이지 자산 종류 제한이 아니다.
 *    이 저장소도 이미 겸용주택(`assetKind="housing"`)에서 같은 브리지를 쓰고 있었다.
 *
 * ## 종전 결함
 *
 * 일반 주택 PHD 경로에는 이 브리지가 없어 ⑧이 **존재하지 않는 「취득시 개별공시지가」를
 * 필수로 요구**했다 — 1990.8.30. 이전 취득 주택은 계산 자체가 불가능했다.
 *
 * ## 🔑 면적은 결과에 영향이 없다
 *
 * `pricePerSqmAtAcquisition = floor(pricePerSqm_1990 × appliedRatio)`로 면적과 무관하다
 * (`pre-1990-land-valuation.ts:287`). 면적은 `areaSqm > 0` guard에만 쓰인다 — 그래서
 * 겸용 안분면적(일반 주택에서는 항상 0)을 쓰면 환산이 **통째로 죽는다**. 그것이 일반 주택
 * 전용 래퍼가 `acquisitionArea`를 넘기는 이유다.
 */
import { describe, it, expect } from "vitest";
import {
  derivePre1990PlainHousePhdLandPricePerSqmAtAcq,
  derivePre1990PhdLandPricePerSqmAtAcq,
} from "../../lib/calc/transfer-pre1990-phd-bridge";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "../../lib/stores/calc-wizard-asset";

const TRANSFER_DATE = "2023-02-19";

/** 1990.8.30. 이전 취득 주택 — 등급 3종 + 1990.1.1. 공시지가 입력 완비 */
function pre1990House(overrides: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionDate: "1985-01-01",
    acquisitionArea: "184.2",
    pre1990Enabled: true,
    pre1990GradeMode: "value",
    pre1990PricePerSqm_1990: "1100000",
    pre1990Grade_current: "185000",
    pre1990Grade_prev: "98400",
    pre1990Grade_atAcq: "77100",
    ...overrides,
  } as AssetForm;
}

describe("일반 주택 PHD — §164④ 등급가액 환산이 「취득시 공시지가」를 채운다", () => {
  it("🔴 1990.8.30. 이전 취득 주택에서 ㎡당 환산가액이 산출된다 (종전에는 경로 자체가 없었다)", () => {
    const v = derivePre1990PlainHousePhdLandPricePerSqmAtAcq(pre1990House(), TRANSFER_DATE);
    expect(v).not.toBeNull();
    expect(v!).toBeGreaterThan(0);
  });

  it("겸용 브리지(면적 소스가 주택부수토지 안분)는 일반 주택에서 null — 래퍼가 필요한 이유", () => {
    // 겸용 안분면적은 겸용 전용 필드(mixedUseTotalLandArea 등)에서 나오므로 일반 주택은 0이다.
    // → areaSqm > 0 guard에 걸려 환산이 통째로 죽는다.
    const viaMixed = derivePre1990PhdLandPricePerSqmAtAcq(pre1990House(), TRANSFER_DATE);
    expect(viaMixed).toBeNull();
  });

  it("🔑 면적이 달라도 ㎡당 가액은 같다 (면적은 guard 전용 — 산식 무관)", () => {
    const a = derivePre1990PlainHousePhdLandPricePerSqmAtAcq(
      pre1990House({ acquisitionArea: "184.2" }),
      TRANSFER_DATE,
    );
    const b = derivePre1990PlainHousePhdLandPricePerSqmAtAcq(
      pre1990House({ acquisitionArea: "999.9" }),
      TRANSFER_DATE,
    );
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });
});

describe("게이트 — 열려서는 안 되는 조합에서 null (대조군)", () => {
  it("1990.8.30. 이후 취득 → null (개별공시지가가 고시돼 있으므로 환산 대상 아님)", () => {
    const v = derivePre1990PlainHousePhdLandPricePerSqmAtAcq(
      pre1990House({ acquisitionDate: "1995-06-01" }),
      TRANSFER_DATE,
    );
    expect(v).toBeNull();
  });

  it("pre1990 토글 OFF → null (자동 적용하지 않는다)", () => {
    const v = derivePre1990PlainHousePhdLandPricePerSqmAtAcq(
      pre1990House({ pre1990Enabled: false }),
      TRANSFER_DATE,
    );
    expect(v).toBeNull();
  });

  it("등급 3종 중 하나라도 비면 null (부분 입력으로 계산하지 않는다)", () => {
    for (const missing of ["pre1990Grade_current", "pre1990Grade_prev", "pre1990Grade_atAcq"]) {
      const v = derivePre1990PlainHousePhdLandPricePerSqmAtAcq(
        pre1990House({ [missing]: "" } as Partial<AssetForm>),
        TRANSFER_DATE,
      );
      expect(v, `${missing} 결측`).toBeNull();
    }
  });

  it("면적 미입력 → null (guard)", () => {
    const v = derivePre1990PlainHousePhdLandPricePerSqmAtAcq(
      pre1990House({ acquisitionArea: "" }),
      TRANSFER_DATE,
    );
    expect(v).toBeNull();
  });
});
