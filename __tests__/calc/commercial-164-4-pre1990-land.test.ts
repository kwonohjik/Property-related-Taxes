/**
 * §164④ — 상가 부수토지 1990.8.30. 이전 취득 토지등급 환산 배선 anchor.
 *
 * §164⑥ 기준시가합의 토지 성분은 「법 §99①1호 가목의 가액」(개별공시지가)이고
 * (시행규칙 §80③3호), 1990.8.30. 이전 취득이면 §164④가 이를 정한다.
 * 검증: docs/01-plan/features/commercial-164-4-appurtenant-land-verification.md
 *
 * ★ 3중 패턴 — 표시·API 변환·validate가 **같은 함수**로 유효값을 얻는지 확인한다.
 */
import { describe, it, expect } from "vitest";
import {
  derivePre1990CommercialLandPricePerSqmAtAcq,
  effectiveCommercialLandPriceAtAcq,
  isCommercialPre1990Acquisition,
} from "@/lib/calc/transfer-pre1990-commercial-bridge";
import { buildCommercialBuildingValuation } from "@/lib/calc/transfer-tax-api-helpers";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-asset";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const TRANSFER_DATE = "2021-06-01";

/** 취득 1988 상가 — §164⑥ + §164④ 구간. 등급 입력 완비. */
function cbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(),
    assetKind: "commercial_building",
    acquisitionCause: "purchase",
    useEstimatedAcquisition: true,
    cbEra: "pre_disclosure",
    acquisitionDate: "1988-05-10",
    cbExclusiveArea: "36",
    cbSharedArea: "33.52",
    cbLandArea: "12.57",
    cbUnitPriceAtTransfer: "5000000",
    cbUnitPriceAtFirstOrAcq: "3000000",
    cbBuildingStdPriceAtAcq: "69602660",
    cbBuildingStdPriceAtFirst: "69527856",
    cbBuildingStdPriceAtTransfer: "80000000",
    cbLandPricePerSqmAtAcq: "", // ← 비움: §164④ 환산으로 채워져야 한다
    cbLandPricePerSqmAtFirst: "11060632",
    cbLandPricePerSqmAtTransfer: "15000000",
    cbAcqBuildingStdBy164_5: true, // §164⑥ 단서 확인(Phase 1 게이트)
    // §164④ 토지등급 환산 입력
    pre1990Enabled: true,
    pre1990GradeMode: "number",
    pre1990PricePerSqm_1990: "1000000",
    pre1990Grade_current: "120",
    pre1990Grade_prev: "118",
    pre1990Grade_atAcq: "110",
    ...over,
  } as AssetForm;
}

describe("구간 판정", () => {
  it("취득 1988은 개별공시지가 고시 전 구간이다", () => {
    expect(isCommercialPre1990Acquisition(cbAsset())).toBe(true);
  });

  it("경계 — 1990-08-29 해당 / 1990-08-30 미해당", () => {
    expect(isCommercialPre1990Acquisition(cbAsset({ acquisitionDate: "1990-08-29" }))).toBe(true);
    expect(isCommercialPre1990Acquisition(cbAsset({ acquisitionDate: "1990-08-30" }))).toBe(false);
  });

  it("상속은 상속개시일로 판정한다", () => {
    const a = cbAsset({
      acquisitionCause: "inheritance",
      acquisitionDate: "2003-01-01",
      inheritanceStartDate: "1988-05-10",
    });
    expect(isCommercialPre1990Acquisition(a)).toBe(true);
  });
});

describe("파생 — §164④ 토지등급 환산", () => {
  it("취득 1988 + 등급 3종 입력 → ㎡당 가액이 산출된다", () => {
    const v = derivePre1990CommercialLandPricePerSqmAtAcq(cbAsset(), TRANSFER_DATE);
    expect(v).not.toBeNull();
    expect(v!).toBeGreaterThan(0);
  });

  it("등급 입력이 하나라도 없으면 null — 임의 추정 금지", () => {
    expect(
      derivePre1990CommercialLandPricePerSqmAtAcq(cbAsset({ pre1990Grade_atAcq: "" }), TRANSFER_DATE),
    ).toBeNull();
  });

  it("pre1990Enabled가 꺼져 있으면 null", () => {
    expect(
      derivePre1990CommercialLandPricePerSqmAtAcq(cbAsset({ pre1990Enabled: false }), TRANSFER_DATE),
    ).toBeNull();
  });

  it("대지면적이 없으면 null (기준시가합 토지 성분을 만들 수 없다)", () => {
    expect(
      derivePre1990CommercialLandPricePerSqmAtAcq(cbAsset({ cbLandArea: "" }), TRANSFER_DATE),
    ).toBeNull();
  });

  it("1990-08-30 이후 취득은 환산하지 않는다", () => {
    expect(
      derivePre1990CommercialLandPricePerSqmAtAcq(
        cbAsset({ acquisitionDate: "1991-03-01" }),
        TRANSFER_DATE,
      ),
    ).toBeNull();
  });

  it("직접 입력이 있으면 그 값이 우선한다", () => {
    const withDirect = cbAsset({ cbLandPricePerSqmAtAcq: "777777" });
    expect(effectiveCommercialLandPriceAtAcq(withDirect, TRANSFER_DATE)).toBe(777777);
  });
});

describe("★ 3중 패턴 — API 변환과 validate가 같은 유효값을 본다", () => {
  it("API: 취득시 개공지가 비어도 환산값으로 landPriceAtAcquisition이 채워진다", () => {
    const payload = buildCommercialBuildingValuation(cbAsset(), TRANSFER_DATE) as
      | { landPriceAtAcquisition: number }
      | undefined;
    const derived = derivePre1990CommercialLandPricePerSqmAtAcq(cbAsset(), TRANSFER_DATE)!;
    expect(payload).toBeDefined();
    expect(payload!.landPriceAtAcquisition).toBe(derived);
  });

  it("validate: 취득시 개공지가 비어도 환산 가능하면 통과한다 (UI↔validate 모순 없음)", () => {
    expect(validateAssetAcquisition(cbAsset(), "자산1", TRANSFER_DATE)).toBeNull();
  });

  it("validate: 환산도 불가하면 §164④ 안내로 차단한다", () => {
    const err = validateAssetAcquisition(
      cbAsset({ pre1990Grade_atAcq: "" }),
      "자산1",
      TRANSFER_DATE,
    );
    expect(err).toContain("1990.8.30.");
    expect(err).toContain("§164④");
  });

  it("API: 환산도 불가하면 payload가 undefined (엔진 미도달 — validate와 동일 조건)", () => {
    expect(
      buildCommercialBuildingValuation(cbAsset({ pre1990Grade_atAcq: "" }), TRANSFER_DATE),
    ).toBeUndefined();
  });

  it("1990 이후 취득은 종전 메시지를 유지한다 (회귀)", () => {
    const err = validateAssetAcquisition(
      cbAsset({ acquisitionDate: "1998-05-10", cbLandPricePerSqmAtAcq: "" }),
      "자산1",
      TRANSFER_DATE,
    );
    expect(err).toBe("자산1: 취득시 개별공시지가(원/㎡)를 입력하세요.");
  });
});
