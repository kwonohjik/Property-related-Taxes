/**
 * anchor: 저장된 파생 연면적의 부동소수점 잔재 세척 (③ normalize).
 *
 * 발단: 화면에 상가 연면적이 `283.04999999999995`로 노출(2026-07-15 사용자 보고).
 * 이 값은 PR #602가 제거한 구 산식 `round2(전용합+공통) − 주택`의 출력과 자릿수까지 일치한다.
 * 산식은 이미 `residualArea`로 고쳐졌으나(신규 입력 시 283.05 — E2E 실측), **이전에 저장된
 * 이력·세션에는 잔재가 남아** migrate가 세척하지 않으면 그대로 살아 돌아온다.
 *
 * ⚠️ 표시만의 문제가 아니다 — API 변환(`transfer-tax-api-mixed-use.ts:27` parseFloat)이
 *    잔재를 엔진에 넘겨 `floor(단가 × 면적)`을 **1원 깎는다**.
 *
 * 정책: lib/tax-engine/area-utils.ts (round2 + residualArea) · feedback_area_apportion_residual_absorption
 */
import { describe, it, expect } from "vitest";
import { migrateMixedUseFields } from "@/lib/stores/calc-wizard-asset-mixed-use";

/** 사용자 보고 실측값: 전용 300 / 259.2 + 공통 51.46 → 구 산식이 낸 상가 연면적. */
const ARTIFACT = "283.04999999999995";

function migrate(over: Record<string, unknown> = {}): Record<string, unknown> {
  const a: Record<string, unknown> = { ...over };
  migrateMixedUseFields(a);
  return a;
}

describe("파생 연면적 잔재 세척", () => {
  it("★상가 연면적 부동소수점 잔재 → 2자리로 세척", () => {
    expect(migrate({ nonResidentialFloorArea: ARTIFACT }).nonResidentialFloorArea).toBe("283.05");
  });

  it("주택 연면적도 동일 축", () => {
    expect(migrate({ residentialFloorArea: "327.6099999999999" }).residentialFloorArea).toBe("327.61");
  });

  it("잔재가 엔진에 도달하면 금액이 1원 깎인다 (세척의 이유 — 표시 문제 아님)", () => {
    const unit = 6_216_000; // E2E에서 쓰는 양도 상가건물 단가
    expect(Math.floor(unit * parseFloat(ARTIFACT))).toBe(1_759_438_799);
    expect(Math.floor(unit * parseFloat("283.05"))).toBe(1_759_438_800);
  });
});

describe("항등 보존 — 정상값·사용자 입력을 변조하지 않는다", () => {
  it("이미 2자리면 원문 그대로 (재작성 없음)", () => {
    expect(migrate({ nonResidentialFloorArea: "283.05" }).nonResidentialFloorArea).toBe("283.05");
  });

  it("정수·1자리 표기 보존", () => {
    const a = migrate({ residentialFloorArea: "300", nonResidentialFloorArea: "259.2" });
    expect(a.residentialFloorArea).toBe("300");
    expect(a.nonResidentialFloorArea).toBe("259.2");
  });

  it("전용/공통·정착·전체토지는 세척 대상 아님 (사용자 직접입력 — 반올림은 입력 변조)", () => {
    const a = migrate({
      residentialExclusiveArea: "300.123",
      commonArea: "51.469",
      buildingFootprintArea: "100.001",
      mixedUseTotalLandArea: "168.309",
    });
    expect(a.residentialExclusiveArea).toBe("300.123");
    expect(a.commonArea).toBe("51.469");
    expect(a.buildingFootprintArea).toBe("100.001");
    expect(a.mixedUseTotalLandArea).toBe("168.309");
  });
});

/**
 * ⚠️ 이 describe는 **동작 계약**을 고정한다 — 특정 가드 1줄을 pin하지 못한다.
 *    현행 구현에서 ""는 `raw.trim() === ""`와 `Number.isFinite(parseFloat(""))`(=NaN) **양쪽**이
 *    막고 있어, 한쪽만 지워도 이 테스트는 통과한다(역검증 실측). 그래도 가치가 있다:
 *    파서를 이 저장소 표준인 `parseDecimal`(빈값 → **0**)로 교체하면 두 가드가 동시에
 *    무력해져 "" → "0"이 되고, 그때 이 테스트가 잡는다.
 */
/**
 * 2026-07-15 — PHD 패널 전용 입력이 ①카드 단일 소스로 통일되면서, 옛 이력의 입력값을
 * 그냥 버리면 **pre-1990 환산 면적이 조용히 자동 안분으로 바뀌어 세액이 달라진다**.
 * migrate가 의도를 ①카드로 옮긴다.
 */
describe("phdResidentialLandArea → ①카드 override 이관", () => {
  it("★옛 PHD 입력이 ①카드로 이관되고 원본은 비워진다", () => {
    const a = migrate({ phdResidentialLandArea: "90.29" });
    expect(a.mixedResidentialLandAreaOverride).toBe("90.29");
    expect(a.phdResidentialLandArea).toBe("");
  });

  it('적법한 "0"도 이관 (three-state)', () => {
    const a = migrate({ phdResidentialLandArea: "0" });
    expect(a.mixedResidentialLandAreaOverride).toBe("0");
  });

  it("①카드에 이미 값이 있으면 덮어쓰지 않는다 (단일 소스 우선)", () => {
    const a = migrate({ phdResidentialLandArea: "55", mixedResidentialLandAreaOverride: "90.29" });
    expect(a.mixedResidentialLandAreaOverride).toBe("90.29");
    expect(a.phdResidentialLandArea).toBe(""); // 재이관 방지
  });

  it("옛 입력이 없으면 아무 것도 하지 않는다", () => {
    const a = migrate({ phdResidentialLandArea: "" });
    expect(a.mixedResidentialLandAreaOverride).toBe("");
  });
});

describe("three-state 보존 — 빈값을 0으로 만들지 않는다", () => {
  it("★미입력('')은 ''로 유지", () => {
    const a = migrate({ residentialFloorArea: "", nonResidentialFloorArea: "" });
    expect(a.residentialFloorArea).toBe("");
    expect(a.nonResidentialFloorArea).toBe("");
  });

  it("필드 부재 → '' 디폴트 (0 아님)", () => {
    const a = migrate();
    expect(a.residentialFloorArea).toBe("");
    expect(a.nonResidentialFloorArea).toBe("");
  });

  it("적법한 '0' 보존", () => {
    expect(migrate({ nonResidentialFloorArea: "0" }).nonResidentialFloorArea).toBe("0");
  });

  it("비-숫자 문자열은 손대지 않는다", () => {
    expect(migrate({ nonResidentialFloorArea: "abc" }).nonResidentialFloorArea).toBe("abc");
  });
});
