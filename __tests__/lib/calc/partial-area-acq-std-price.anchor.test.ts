/**
 * B4-1 — 일부양도(`partial`) 취득 기준시가 면적 정정
 *
 * 계획: docs/01-plan/features/transfer-partial-area-apportionment.plan.md §0 C-6 · §3.3 L-4
 *
 * ## 정정 내용
 *
 * 엔진 `acquisitionArea`는 **취득 당시 단가에 곱할 면적**이고, 일부양도에서는 취득 전체가
 * 아니라 **양도한 부분의 면적**이다.
 *
 *   「소득세법 시행령」 제176조의2 제2항 제2호 — 환산가액 = 양도가액 × (취득당시 기준시가 /
 *   양도당시 기준시가). "취득당시의 기준시가"는 법 제114조 제7항 문맥상 **양도자산의**
 *   것이고, 일부양도에서는 양도한 부분이 그 자산이다.
 *
 *   조심 2018부0572(2018.05.03, 기각) — "각 필지별 실지취득가액이 불분명한 경우, 전체
 *   토지의 실지취득가액을 **각 필지의 취득 당시 기준시가 비율로 안분**"
 *
 * 종전에는 전체 취득면적을 넘겨 분자만 과대해졌고, 면적비가 단가비를 상쇄해
 * **양도차익이 0이 되는** 사례까지 발생했다(anchor `basic-info-building-area.anchor.test.ts` B-4).
 *
 * ## 소비처 2곳 모두 양도분을 요구한다
 *
 *   `transfer-tax-split-gain.ts:52`   토지분 취득 기준시가 = 단가 × 이 면적
 *   `transfer-tax-rate-calc.ts:189`   「소득세법 시행령」 제154조 제7항 한도 비교 대상 =
 *                                     **양도하는** 부수토지 면적
 */
import { describe, it, expect } from "vitest";
import { resolveAcqAreaForStdPrice } from "@/lib/calc/transfer-tax-api-helpers";
import { calculateEstimatedAcquisitionPrice } from "@/lib/tax-engine/tax-utils";

describe("B4-1 — partial 시 취득 기준시가 면적은 양도분이다", () => {
  it("🔄 partial: 양도면적을 쓴다 (종전에는 취득 전체면적)", () => {
    expect(
      resolveAcqAreaForStdPrice({
        areaScenario: "partial",
        acquisitionArea: "300",
        transferArea: "100",
      }),
    ).toBe(100);
  });

  it("same: 취득면적 그대로 (UI가 두 값을 동기화한다)", () => {
    expect(
      resolveAcqAreaForStdPrice({
        areaScenario: "same",
        acquisitionArea: "206.6",
        transferArea: "206.6",
      }),
    ).toBe(206.6);
  });

  it("areaScenario 미지정은 same으로 취급한다 (③ normalize 기본값)", () => {
    expect(resolveAcqAreaForStdPrice({ acquisitionArea: "150" })).toBe(150);
  });

  it("감환지(reduction): acquisitionArea 그대로 — UI가 이미 의제취득면적을 계산해 넣는다", () => {
    // `priorLandArea × allocatedArea / entitlementArea` (multi-parcel-transfer.ts:326 동일 산식).
    // 여기서 또 양도면적을 적용하면 **이중 안분**이 된다(계획서 BR4).
    expect(
      resolveAcqAreaForStdPrice({
        areaScenario: "reduction",
        acquisitionArea: "100", // = 의제취득면적 (UI 계산 결과)
        transferArea: "100",
      }),
    ).toBe(100);
  });

  it("증환지(increase): 당초분은 전체 면적 — 증가분은 별도 자산으로 분리된다", () => {
    expect(
      resolveAcqAreaForStdPrice({
        areaScenario: "increase",
        acquisitionArea: "300",
        transferArea: "350",
      }),
    ).toBe(300);
  });

  it("partial + 양도면적 미입력(입력 중): 전체 면적 fallback — 조용한 비활성 금지", () => {
    // undefined로 떨구면 기준시가 경로가 오류 없이 꺼진다. 차단은 validate 소관이다.
    expect(
      resolveAcqAreaForStdPrice({ areaScenario: "partial", acquisitionArea: "300", transferArea: "" }),
    ).toBe(300);
  });

  it("면적 전부 미입력: undefined (엔진이 선택 필드로 처리)", () => {
    expect(resolveAcqAreaForStdPrice({ areaScenario: "partial" })).toBeUndefined();
    expect(resolveAcqAreaForStdPrice({})).toBeUndefined();
  });
});

describe("B4-1 세액 효과 — 환산비율이 단가비만 반영한다", () => {
  const UNIT_ACQ = 500_000; // 취득 당시 ㎡당
  const UNIT_TRANSFER = 1_500_000; // 양도 당시 ㎡당
  const TRANSFER_PRICE = 900_000_000;
  const ACQ_AREA = 300;
  const TR_AREA = 100;

  /** 엔진 산식: 토지 기준시가 = floor(단가 × 면적) (transfer.types.ts:543) */
  const std = (unit: number, area: number) => Math.floor(unit * area);

  it("정정 후 — 분자·분모가 같은 면적이라 비율이 단가비(1/3)가 된다", () => {
    const area = resolveAcqAreaForStdPrice({
      areaScenario: "partial",
      acquisitionArea: String(ACQ_AREA),
      transferArea: String(TR_AREA),
    })!;
    const stdAcq = std(UNIT_ACQ, area); // 50,000,000 (100㎡)
    const stdTransfer = std(UNIT_TRANSFER, TR_AREA); // 150,000,000
    expect(stdAcq / stdTransfer).toBeCloseTo(1 / 3, 10);

    const converted = calculateEstimatedAcquisitionPrice(TRANSFER_PRICE, stdAcq, stdTransfer);
    expect(converted).toBe(300_000_000);
    expect(TRANSFER_PRICE - converted).toBe(600_000_000); // 양도차익
  });

  it("종전 동작 — 전체면적을 쓰면 비율 1.0 · 양도차익 0 (과소과세)", () => {
    const stdAcqOld = std(UNIT_ACQ, ACQ_AREA); // 150,000,000 (300㎡)
    const stdTransfer = std(UNIT_TRANSFER, TR_AREA); // 150,000,000
    expect(stdAcqOld / stdTransfer).toBe(1);
    const converted = calculateEstimatedAcquisitionPrice(TRANSFER_PRICE, stdAcqOld, stdTransfer);
    expect(converted).toBe(900_000_000);
    expect(TRANSFER_PRICE - converted).toBe(0); // 🔴 양도차익 0
  });

  it("양도차익 차이 = 6억 — 정정 전후 세액 영향 규모", () => {
    const gainNew =
      TRANSFER_PRICE -
      calculateEstimatedAcquisitionPrice(TRANSFER_PRICE, std(UNIT_ACQ, TR_AREA), std(UNIT_TRANSFER, TR_AREA));
    const gainOld =
      TRANSFER_PRICE -
      calculateEstimatedAcquisitionPrice(TRANSFER_PRICE, std(UNIT_ACQ, ACQ_AREA), std(UNIT_TRANSFER, TR_AREA));
    expect(gainNew - gainOld).toBe(600_000_000);
  });

  it("⚠️ 부분별 단가가 다르면 사용자가 그 부분의 취득 단가를 입력해야 한다", () => {
    // 면적비 안분 = 기준시가비 안분은 **단가가 같을 때만** 성립한다
    // (조심 2018부0572는 취득 당시 공시지가가 동일한 사안이었다 — 계획서 L-1).
    const UNIT_SOLD_PART = 800_000; // 양도분이 더 비싼 용도지역
    const stdAcqUniform = std(UNIT_ACQ, TR_AREA); // 50,000,000
    const stdAcqPartSpecific = std(UNIT_SOLD_PART, TR_AREA); // 80,000,000
    expect(stdAcqPartSpecific).not.toBe(stdAcqUniform);
    // 두 값이 다르므로 단가 입력이 곧 부분별 가치 반영 수단이다.
  });
});

// ══════════════════════════════════════════════════════════
// B4-3 — 지분(fractional) × 부분비 합성 (BR3 이중 적용 방지)
// ══════════════════════════════════════════════════════════
//
// 계획 BR3은 "취득 기준시가에 부분 비율을 적용하면 지분 `applyRatio`와 **곱셈 합성**된다 →
// 이중 적용·순서 오류"를 경고했다. 실측 결과 **두 축은 서로 다른 차원에 적용된다**:
//
//   지분 `applyRatio` → **금액**에만 (`transfer-tax-api.ts:171,174,216,232,245,255` — 전부 금액)
//   부분비           → **면적**에만 (`resolveAcqAreaForStdPrice`)
//
// 면적에 `applyRatio`를 적용하는 지점은 `lib/calc` 전체에 **0건**이다(grep 실측).
// 따라서 이중 적용이 구조적으로 불가능하다 — 이 describe가 그 사실을 고정한다.

import { applyRatio } from "@/lib/tax-engine/tax-utils";

describe("B4-3 — 지분과 부분비는 다른 차원에 적용된다 (이중 적용 불가)", () => {
  it("부분비는 면적만 바꾼다 — 지분율이 개입하지 않는다", () => {
    const area = resolveAcqAreaForStdPrice({
      areaScenario: "partial",
      acquisitionArea: "300",
      transferArea: "100",
    });
    // 지분 1/3 자산이어도 면적은 그대로 100㎡다(면적은 물건의 크기이지 소유 비율이 아니다).
    expect(area).toBe(100);
  });

  it("지분은 금액만 스케일한다", () => {
    const ratio = 1 / 3;
    expect(applyRatio(300_000_000, ratio)).toBe(100_000_000);
  });

  it("합성 결과 — 면적은 부분비, 금액은 지분비로 각각 1회만 적용된다", () => {
    const UNIT_ACQ = 500_000;
    const ratio = 0.5;

    // 취득 기준시가 총액: 단가 × (부분비 적용된) 면적 — 지분 미적용
    const area = resolveAcqAreaForStdPrice({
      areaScenario: "partial",
      acquisitionArea: "300",
      transferArea: "100",
    })!;
    const stdAcq = Math.floor(UNIT_ACQ * area);
    expect(stdAcq).toBe(50_000_000);

    // 양도가액·취득가액은 지분 적용 — 면적 미개입
    const transferPrice = applyRatio(900_000_000, ratio);
    expect(transferPrice).toBe(450_000_000);

    // 두 축이 같은 값에 곱해지는 지점이 없다 → 0.5 × (100/300)의 이중 축소가 발생하지 않는다
    expect(stdAcq).not.toBe(Math.floor(UNIT_ACQ * area * ratio));
  });
});

// ══════════════════════════════════════════════════════════
// B4-1b — 다필지(parcels[]) 경로 (BR4 감환지 배타성)
// ══════════════════════════════════════════════════════════
//
// 엔진은 필지별로 `standardAtAcq = floor(acqArea × sqmAtAcq)`를 계산한다
// (`multi-parcel-transfer.ts:349`). 단건과 같은 규약을 적용한다.
//
// ## BR4 해소 — 감환지와 배타
//
// 감환지는 `transfer-tax-api.ts`에서 **먼저** 의제취득면적을 계산하므로
// `resolveAcqAreaForStdPrice`에 도달하지 않는다. 도달하더라도 헬퍼가 `reduction`을
// 통과시켜 이중 안분이 두 겹으로 막힌다.
//
// ## `effectiveAcquisitionArea` 확인 (착수 전 선행 조건)
//
// 엔진이 반환하는 `effectiveAcquisitionArea`(`:459`)는 **표시 전용 echo**다 —
// 엔진 내 계산 재사용 0건, UI 소비 0건(grep 실측). 따라서 정정된 면적이 그대로
// 표시되는 것이 맞고, 다른 산식을 오염시키지 않는다.
//
// ## 필지 fallback 함정
//
// 필지의 `areaScenario` 기본값은 **`"partial"`**(`transfer-tax-api.ts:498`)이고
// 헬퍼 기본값은 `"same"`이다. 호출부가 `scenario`를 명시 주입해야 구 세션 필지
// (`areaScenario === undefined`)에서 정정이 조용히 미적용되지 않는다.

describe("B4-1b — 다필지 필지별 취득 기준시가 면적", () => {
  it("필지 partial: 양도면적을 쓴다", () => {
    expect(
      resolveAcqAreaForStdPrice({
        areaScenario: "partial",
        acquisitionArea: "500",
        transferArea: "120",
      }),
    ).toBe(120);
  });

  it("필지 same: 취득면적 그대로", () => {
    expect(
      resolveAcqAreaForStdPrice({
        areaScenario: "same",
        acquisitionArea: "500",
        transferArea: "500",
      }),
    ).toBe(500);
  });

  it("BR4 — 감환지는 헬퍼를 통과한다 (호출부가 먼저 처리하지만 이중 방어)", () => {
    const deemed = (300 * 100) / 300; // priorLandArea × allocatedArea / entitlementArea
    expect(deemed).toBe(100);
    expect(
      resolveAcqAreaForStdPrice({
        areaScenario: "reduction",
        acquisitionArea: String(deemed),
        transferArea: "100",
      }),
    ).toBe(100); // 또 양도분을 적용해 축소하지 않는다
  });

  it("🔴 필지 fallback 함정 — areaScenario 미지정 필지는 명시 주입이 필요하다", () => {
    // 필지 기본값은 "partial"(transfer-tax-api.ts:498)이지만 헬퍼 기본값은 "same"이다.
    const staleParcel = { acquisitionArea: "500", transferArea: "120" };
    // 그대로 넘기면 same으로 판정돼 정정이 미적용된다
    expect(resolveAcqAreaForStdPrice(staleParcel)).toBe(500);
    // 호출부가 scenario를 주입하면 정정된다
    expect(resolveAcqAreaForStdPrice({ ...staleParcel, areaScenario: "partial" })).toBe(120);
  });

  it("증환지 필지는 partial 판정에 걸리지 않는다 (양도면적 > 취득면적)", () => {
    // 증환지는 교부면적 > 권리면적이라 transferArea가 더 크다.
    // areaScenario가 "partial"로 저장돼 있어도 양도면적을 쓰는 것이 산식상 동일하다
    // (엔진이 warning + 별도 취득 분리를 안내한다 — multi-parcel-transfer.ts:340).
    expect(
      resolveAcqAreaForStdPrice({
        areaScenario: "partial",
        acquisitionArea: "300",
        transferArea: "350",
      }),
    ).toBe(350);
  });
});
