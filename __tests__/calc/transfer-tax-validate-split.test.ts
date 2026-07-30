/**
 * 토지/건물 분리 직접 입력 — 총액 초과 차단 (Phase B).
 *
 * 계획서: docs/02-design/features/land-building-split-mode-gating-and-salescase-drift.plan.md (§3-B)
 *
 * 엔진 splitPair는 한쪽만 입력 시 반대쪽을 잔액으로 도출한다 → 입력 > 총액이면 음수.
 * 엔진은 clamp하지 않으므로(조용한 오답 방지) validate가 차단한다.
 * 판정식은 엔진 export(`isSplitPairOverflow`) 단일 소스 — ⑧ 규칙 준수.
 */
import { describe, it, expect } from "vitest";
import { validateSplitDirectInputs } from "@/lib/calc/transfer-tax-validate-split";
import { isSplitPairOverflow } from "@/lib/tax-engine/transfer-tax-split-gain";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

function splitAsset(over: Partial<ReturnType<typeof makeDefaultAsset>> = {}) {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing" as const,
    hasSeperateLandAcquisitionDate: true,
    saleSplitMode: "actual" as const,
    actualSalePrice: "1,000,000,000",
    fixedAcquisitionPrice: "400,000,000",
    ...over,
  };
}

describe("isSplitPairOverflow — 엔진 판정식 (splitPair 분기와 1:1)", () => {
  it("둘 다 미입력 → 초과 불가(비율 안분)", () => {
    expect(isSplitPairOverflow(1000, undefined, undefined)).toBe(false);
  });
  it("한쪽만 입력 → 그 값이 총액 초과 시 true", () => {
    expect(isSplitPairOverflow(1000, 700, undefined)).toBe(false);
    expect(isSplitPairOverflow(1000, 1200, undefined)).toBe(true);
    expect(isSplitPairOverflow(1000, undefined, 1200)).toBe(true);
  });
  it("둘 다 입력 → 합 ≠ 총액이면 true (초과·미달 **모두**)", () => {
    expect(isSplitPairOverflow(1000, 700, 300)).toBe(false);
    expect(isSplitPairOverflow(1000, 700, 400)).toBe(true); // 초과
    expect(
      isSplitPairOverflow(1000, 300, 300),
      "🔴 합 < 총액도 차단해야 한다 — 양도가액 축에서 양도차익 과소 = 세액 과소가 침묵 통과",
    ).toBe(true);
  });
  it("경계: 정확히 총액 → 모순 아님", () => {
    expect(isSplitPairOverflow(1000, 1000, undefined)).toBe(false);
    expect(isSplitPairOverflow(1000, 600, 400)).toBe(false);
  });
});

describe("validateSplitDirectInputs — 게이트", () => {
  it("취득일 분리 OFF → 미검증", () => {
    expect(
      validateSplitDirectInputs(
        splitAsset({ hasSeperateLandAcquisitionDate: false, buildingTransferPrice: "9,999,999,999" }),
        "자산 1",
      ),
    ).toBeNull();
  });

  it('분리 방식 "기준시가 비율 안분" → 양도가액 overflow 미검증 (칸 미노출, 양도시 기준시가는 입력됨)', () => {
    expect(
      validateSplitDirectInputs(
        splitAsset({
          saleSplitMode: "apportioned",
          landStandardPriceAtTransfer: "500,000,000",
          buildingStandardPriceAtTransfer: "500,000,000",
          buildingTransferPrice: "9,999,999,999",
        }),
        "자산 1",
      ),
    ).toBeNull();
  });
});

describe("validateSplitDirectInputs — 양도시 기준시가 필수 (§7.2, 2026-07-28 사용자 확정)", () => {
  it("apportioned 일괄양도 + 양도시 기준시가 미입력 → 차단", () => {
    const err = validateSplitDirectInputs(splitAsset({ saleSplitMode: "apportioned" }), "자산 1");
    expect(err).toContain("양도시 기준시가");
  });

  it("estimated 파트(환산) + 양도시 기준시가 미입력 → 차단", () => {
    const err = validateSplitDirectInputs(
      splitAsset({ saleSplitMode: "actual", useEstimatedAcquisition: true, landTransferPrice: "600,000,000" }),
      "자산 1",
    );
    expect(err).toContain("양도시 기준시가");
  });

  it("apportioned + 양도시 토지·건물 기준시가 모두 입력 → 통과", () => {
    expect(
      validateSplitDirectInputs(
        splitAsset({
          saleSplitMode: "apportioned",
          landStandardPriceAtTransfer: "500,000,000",
          buildingStandardPriceAtTransfer: "500,000,000",
        }),
        "자산 1",
      ),
    ).toBeNull();
  });

  it("actual 구분양도 + 실가 파트 → 양도시 기준시가 불필요(미입력 통과)", () => {
    expect(validateSplitDirectInputs(splitAsset({ saleSplitMode: "actual", landTransferPrice: "600,000,000" }), "자산 1")).toBeNull();
  });
});

describe("validateSplitDirectInputs — 양도가액 (케이스 6·6-b)", () => {
  it("정상: 건물만 3억 (총 10억) → 통과", () => {
    expect(validateSplitDirectInputs(splitAsset({ buildingTransferPrice: "300,000,000" }), "자산 1")).toBeNull();
  });

  it("케이스 6-b: 건물만 12억 (총 10억) → 차단", () => {
    const err = validateSplitDirectInputs(splitAsset({ buildingTransferPrice: "1,200,000,000" }), "자산 1");
    expect(err).toContain("건물 양도가액");
    expect(err).toContain("음수");
  });

  it("케이스 6: 토지 7억 + 건물 4억 = 11억 (총 10억) → 차단", () => {
    const err = validateSplitDirectInputs(
      splitAsset({ landTransferPrice: "700,000,000", buildingTransferPrice: "400,000,000" }),
      "자산 1",
    );
    expect(err).toContain("합이 양도가액");
  });
});

describe("validateSplitDirectInputs — 취득가액 (케이스 6-c)", () => {
  it("정상: 건물만 1.5억 (총 4억) → 통과", () => {
    expect(validateSplitDirectInputs(splitAsset({ buildingAcquisitionPrice: "150,000,000", landTransferPrice: "600,000,000" }), "자산 1")).toBeNull();
  });

  it("케이스 6-c: 토지 2.5억 + 건물 2억 = 4.5억 (총 4억) → 차단", () => {
    const err = validateSplitDirectInputs(
      splitAsset({ landAcquisitionPrice: "250,000,000", buildingAcquisitionPrice: "200,000,000", landTransferPrice: "600,000,000" }),
      "자산 1",
    );
    expect(err).toContain("합이 취득가액");
  });

  it("환산취득가 모드 → 취득가액 미검증 (총액 미입력, 양도시 기준시가는 입력됨)", () => {
    expect(
      validateSplitDirectInputs(
        splitAsset({
          useEstimatedAcquisition: true,
          landStandardPriceAtTransfer: "500,000,000",
          buildingStandardPriceAtTransfer: "500,000,000",
          buildingAcquisitionPrice: "9,999,999,999",
        }),
        "자산 1",
      ),
    ).toBeNull();
  });

  it("매매사례가액 모드 → 취득가액 미검증 (추계액 · 칸 숨김)", () => {
    expect(
      validateSplitDirectInputs(
        splitAsset({ isSalesCaseAcquisition: true, buildingAcquisitionPrice: "9,999,999,999", landTransferPrice: "600,000,000" }),
        "자산 1",
      ),
    ).toBeNull();
  });
});

describe("validateSplitDirectInputs — 자본적지출 (총액 = directExpenses, 엔진 input.expenses 소스)", () => {
  it("🔴 capitalExpenditure는 총액이 아니다 — 엔진은 directExpenses(=input.expenses)를 쓴다", () => {
    // capitalExpenditure를 총액으로 보면 판정식만 공유하고 피연산자가 달라져 단일 소스가 무효화된다.
    // 엔진은 expenses=0 → 독립 입력으로 처리하므로 모순 자체가 없다 → validate도 통과여야 한다.
    expect(
      validateSplitDirectInputs(
        splitAsset({ capitalExpenditure: "100,000,000", buildingDirectExpenses: "999,999,999", landTransferPrice: "600,000,000" }),
        "자산 1",
      ),
    ).toBeNull();
  });

  it("legacy directExpenses 1억 + 건물만 3천만 → 통과(잔액 7천만)", () => {
    expect(
      validateSplitDirectInputs(
        splitAsset({ directExpenses: "100,000,000", buildingDirectExpenses: "30,000,000", landTransferPrice: "600,000,000" }),
        "자산 1",
      ),
    ).toBeNull();
  });

  it("legacy directExpenses 1억 + 토지 7천만 + 건물 5천만 = 1.2억 → 차단", () => {
    const err = validateSplitDirectInputs(
      splitAsset({
        directExpenses: "100,000,000",
        landDirectExpenses: "70,000,000",
        buildingDirectExpenses: "50,000,000",
        landTransferPrice: "600,000,000",
      }),
      "자산 1",
    );
    expect(err).toContain("자본적지출");
  });
});

describe("validateSplitDirectInputs — 총액 매핑 다분기 경로는 미검증 (dual-truth 회피)", () => {
  it("부담부증여 → 미검증", () => {
    expect(
      validateSplitDirectInputs(
        splitAsset({ transferType: "burdened_gift", buildingTransferPrice: "9,999,999,999" }),
        "자산 1",
      ),
    ).toBeNull();
  });

  it("지분(분수) 모드 → 미검증 (총액이 지분 안분됨)", () => {
    // 판정은 API 정본 getOwnershipRatio(asset) < 1.0 — 기본 자산은 "100"/"100"(비율 1.0)이라 지분 아님.
    expect(
      validateSplitDirectInputs(
        splitAsset({ ownershipNumerator: "1", ownershipDenominator: "2", buildingTransferPrice: "9,999,999,999" }),
        "자산 1",
      ),
    ).toBeNull();
  });

  it("기본 자산(100/100)은 지분 모드가 아니다 — 검증 대상 (회귀 방어)", () => {
    const err = validateSplitDirectInputs(splitAsset({ buildingTransferPrice: "9,999,999,999" }), "자산 1");
    expect(err, "100/100을 지분으로 오판하면 검증이 통째로 죽는다").not.toBeNull();
  });
});

/**
 * V1·V2·V4 — 별개 취득(토지·건물 취득시기 상이) 취득가액 파트별 필수.
 *
 * 엔진(transfer-tax-split-gain.ts calcOnePart)이 미입력을 TaxCalculationError로 차단하므로,
 * validate가 같은 조건을 **필드 오류로 먼저** 알려야 한다(⑧ — UI 통과 ↔ 엔진 차단 모순 금지).
 * 판정 게이트는 엔진 전송값과 동일한 `isSeparateAcquisition()` 단일 소스.
 */
describe("V1·V2 — 별개 취득 파트별 취득가액 필수", () => {
  const sepAsset = (over: Partial<ReturnType<typeof makeDefaultAsset>> = {}) =>
    splitAsset({
      acquisitionDate: "2018-06-01",
      landAcquisitionDate: "2015-06-01",
      saleSplitMode: "actual" as const,
      landTransferPrice: "600,000,000",
      buildingTransferPrice: "400,000,000",
      landStandardPriceAtTransfer: "600,000,000",
      buildingStandardPriceAtTransfer: "400,000,000",
      ...over,
    });

  it("실거래가 + 건물 미입력 → 차단", () => {
    const err = validateSplitDirectInputs(
      sepAsset({ landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "300,000,000" }),
      "자산 1",
    );
    expect(err).toContain("건물 취득가액");
  });

  it("실거래가 + 둘 다 입력 → 통과 (합이 상단 총액 4억과 달라도 정상 — V4)", () => {
    const err = validateSplitDirectInputs(
      sepAsset({
        landAcqMode: "actual",
        buildingAcqMode: "actual",
        landAcquisitionPrice: "300,000,000",
        buildingAcquisitionPrice: "250,000,000",
      }),
      "자산 1",
    );
    expect(
      err,
      "별개 취득은 잔액 규칙이 폐지돼 '합 = 총액' 불변식이 없다 — 총액 초과 검증이 살아있으면 정당 입력이 막힌다",
    ).toBeNull();
  });

  it("매매사례 + 파트 미입력 → §176의2③1호 근거로 차단", () => {
    const err = validateSplitDirectInputs(
      sepAsset({ landAcqMode: "salesCase", buildingAcqMode: "salesCase" }),
      "자산 1",
    );
    expect(err).toContain("매매사례가액");
  });

  it("환산은 대상 아님 — 총액 미참조 구조", () => {
    // V1·V2(파트별 취득가액 필수) 스코프 테스트 — 환산 파트가 요구하는 취득시 기준시가(V4)는
    // 충족시켜 격리한다. V4 자체는 아래 별도 describe에서 검증.
    const err = validateSplitDirectInputs(
      sepAsset({
        landAcqMode: "estimated",
        buildingAcqMode: "estimated",
        standardPricePerSqmAtAcq: "5,000,000",
        acquisitionArea: "200",
        // 2026-07-30 — 주택도 V6(건물분 필수) 대상. 이 테스트 스코프는 V1·V2이므로 충족시켜 격리.
        buildingStandardPriceAtAcq: "100,000,000",
      }),
      "자산 1",
    );
    expect(err).toBeNull();
  });

  it("비소유 파트는 대상 아님 (selfOwns=land_only + 토지만 입력)", () => {
    const err = validateSplitDirectInputs(
      sepAsset({
        selfOwns: "land_only",
        landAcqMode: "actual",
        buildingAcqMode: "actual",
        landAcquisitionPrice: "300,000,000",
      }),
      "자산 1",
    );
    expect(err).toBeNull();
  });

  it("🔴 취득일 동일 → V1 미적용 (총액 잔액 도출이 정당 — 종전 동작)", () => {
    const err = validateSplitDirectInputs(
      sepAsset({
        landAcquisitionDate: "2018-06-01",
        landAcqMode: "actual",
        buildingAcqMode: "actual",
        landAcquisitionPrice: "300,000,000",
      }),
      "자산 1",
    );
    expect(err, "겸용·selfOwns가 분리를 강제해도 취득일이 같으면 총액이 실재한다").toBeNull();
  });
});

/**
 * V3 — 축 B 파트별 독립 all-or-nothing (`building` 전용).
 *
 * 건물분 기준시가(§99①1호 나목)를 명시 입력하면 엔진은 결합 총액을 버리고 토지분을
 * `㎡당 개별공시지가 × 면적`(가목)으로만 산출한다. 그 3요소가 비면 calcAcqStdPair가 null →
 * 분리 계산 전체가 **오류 없이 비활성**된다(PR #837이 고친 §3.1과 동형).
 */
describe("V3 — building 축 B 파트별 독립 all-or-nothing", () => {
  const bAsset = (over: Partial<ReturnType<typeof makeDefaultAsset>> = {}) =>
    splitAsset({
      assetKind: "building" as const,
      acquisitionDate: "2018-06-01",
      landAcquisitionDate: "2015-06-01",
      landAcqMode: "actual" as const,
      buildingAcqMode: "actual" as const,
      landAcquisitionPrice: "300,000,000",
      buildingAcquisitionPrice: "250,000,000",
      landTransferPrice: "600,000,000",
      buildingTransferPrice: "400,000,000",
      landStandardPriceAtTransfer: "600,000,000",
      buildingStandardPriceAtTransfer: "400,000,000",
      standardPricePerSqmAtAcq: "1,000,000",
      acquisitionArea: "200",
      ...over,
    });

  it("건물분 + 토지 3요소 모두 입력 → 통과", () => {
    expect(
      validateSplitDirectInputs(bAsset({ buildingStandardPriceAtAcq: "350,000,000" }), "자산 1"),
    ).toBeNull();
  });

  // ⚠️ 아래 2건은 **환산 모드**로 검증한다(2026-07-29). V3는 `requiresAcqStdPrice` 술어를 거치므로
  //    실가/실가에서는 발동하지 않는다 — 그 조합에서 취득시 기준시가는 계산 어디에도 쓰이지 않고,
  //    UI도 입력 카드를 숨기므로 차단하면 **입력 칸이 없는 dead-end**가 된다
  //    (계획서 transfer-split-part-std-card-gating.plan.md Phase 1-a(1) · anchor G10).
  //    all-or-nothing 불변식 자체는 그대로다 — 적용 범위만 "실제로 필요한 경우"로 좁혔다.
  it("🔴 건물분 입력 + ㎡당 공시지가 미입력 → 차단 (조용한 분리 비활성 방지)", () => {
    const err = validateSplitDirectInputs(
      bAsset({
        landAcqMode: "estimated",
        buildingStandardPriceAtAcq: "350,000,000",
        standardPricePerSqmAtAcq: "",
      }),
      "자산 1",
    );
    expect(err).toContain("공시지가");
  });

  it("🔴 건물분 입력 + 토지 면적 미입력 → 차단", () => {
    const err = validateSplitDirectInputs(
      bAsset({ landAcqMode: "estimated", buildingStandardPriceAtAcq: "350,000,000", acquisitionArea: "" }),
      "자산 1",
    );
    expect(err).not.toBeNull();
  });

  it("실가/실가면 건물분이 잔존해도 차단하지 않는다 (dead-end 방지 — 술어 게이트)", () => {
    // 환산일 때 건물분을 입력한 뒤 실가로 되돌린 상태. 값은 보존되지만 카드는 숨겨진다.
    expect(
      validateSplitDirectInputs(
        bAsset({ buildingStandardPriceAtAcq: "350,000,000", standardPricePerSqmAtAcq: "", acquisitionArea: "" }),
        "자산 1",
      ),
    ).toBeNull();
  });

  it("건물분 미입력 → V3 미적용 (레거시 총액 역산 한시 허용)", () => {
    expect(validateSplitDirectInputs(bAsset({ standardPricePerSqmAtAcq: "" }), "자산 1")).toBeNull();
  });

  it("🔴 주택은 V3 대상 아님 — 라목 결합 공시라 파트 독립 자체가 없다", () => {
    const err = validateSplitDirectInputs(
      bAsset({
        assetKind: "housing",
        buildingStandardPriceAtAcq: "350,000,000",
        standardPricePerSqmAtAcq: "",
      }),
      "자산 1",
    );
    expect(err).toBeNull();
  });
});

/**
 * PR3 — 취득시 기준시가·양도가액 구분 근거 차단 (별개 취득 한정).
 * 계획서: docs/02-design/features/transfer-split-acq-std-gate-relaxation.plan.md §4.5·§4.8
 */
describe("V4 — 취득시 기준시가는 '필요할 때만' 필수 (사용자 확정 규칙 ③)", () => {
  const sep = (over: Partial<ReturnType<typeof makeDefaultAsset>> = {}) =>
    splitAsset({
      acquisitionDate: "2018-06-01",
      landAcquisitionDate: "2015-06-01",
      saleSplitMode: "actual" as const,
      landTransferPrice: "600,000,000",
      buildingTransferPrice: "400,000,000",
      landAcqMode: "actual" as const,
      buildingAcqMode: "actual" as const,
      landAcquisitionPrice: "150,000,000",
      buildingAcquisitionPrice: "100,000,000",
      // 2026-07-30부터 주택도 V6(건물분 필수) 대상이다. 이 describe가 보려는 것은
      // **V4/V5(취득시 기준시가 필요성 판정)**이므로 건물분을 채워 V6와 분리한다.
      buildingStandardPriceAtAcq: "100,000,000",
      ...over,
    });

  it("케이스 a(양쪽 실가) → 취득시 기준시가를 요구하지 않는다", () => {
    expect(validateSplitDirectInputs(sep(), "자산 1")).toBeNull();
  });

  it("🔴 케이스 b(건물 환산) + 취득시 기준시가 미입력 → 차단", () => {
    const err = validateSplitDirectInputs(sep({ buildingAcqMode: "estimated" }), "자산 1");
    expect(err).toContain("개별공시지가");
  });

  it("케이스 b + 단가·면적 입력 → 통과", () => {
    expect(
      validateSplitDirectInputs(
        sep({
          buildingAcqMode: "estimated",
          landStandardPriceAtTransfer: "600,000,000",
          buildingStandardPriceAtTransfer: "400,000,000",
          standardPricePerSqmAtAcq: "5,000,000",
          acquisitionArea: "200",
        }),
        "자산 1",
      ),
    ).toBeNull();
  });

  it("🔴 단가만 있고 면적이 없으면 차단 (엔진 calcAcqStdPair는 둘 다 요구)", () => {
    const err = validateSplitDirectInputs(
      sep({
        buildingAcqMode: "estimated",
        landStandardPriceAtTransfer: "600,000,000",
        buildingStandardPriceAtTransfer: "400,000,000",
        standardPricePerSqmAtAcq: "5,000,000",
        acquisitionArea: "",
      }),
      "자산 1",
    );
    expect(err).toContain("토지 면적");
  });

  it("회귀 0 — 비-별개취득(취득일 동일)은 요구하지 않는다", () => {
    expect(
      validateSplitDirectInputs(
        sep({
          landAcquisitionDate: "2018-06-01", // 건물 취득일과 동일 → 비-별개취득
          buildingAcqMode: "estimated",
          // 비-별개취득은 총액에서 잔액이 도출되므로 파트 금액을 넣지 않는다
          // (넣으면 기존 "합 ≠ 총액" 검증이 먼저 걸린다).
          landAcquisitionPrice: "",
          buildingAcquisitionPrice: "",
          landStandardPriceAtTransfer: "600,000,000",
          buildingStandardPriceAtTransfer: "400,000,000",
        }),
        "자산 1",
      ),
    ).toBeNull();
  });
});

describe("V5 — 구분양도 선택 시 양도가액 구분 근거 필수 (규칙 ①)", () => {
  const sepNoBasis = (over: Partial<ReturnType<typeof makeDefaultAsset>> = {}) =>
    splitAsset({
      acquisitionDate: "2018-06-01",
      landAcquisitionDate: "2015-06-01",
      saleSplitMode: "actual" as const,
      landAcqMode: "actual" as const,
      buildingAcqMode: "actual" as const,
      landAcquisitionPrice: "150,000,000",
      buildingAcquisitionPrice: "100,000,000",
      // V5 스코프(양도가액 구분 근거) 격리 — 2026-07-30부터 주택도 V6 대상이다.
      buildingStandardPriceAtAcq: "100,000,000",
      standardPricePerSqmAtAcq: "5,000,000",
      acquisitionArea: "200",
      ...over,
    });

  it("🔴 구분양도 + 양도가액 2칸 미입력 + 양도시 기준시가도 없음 → 차단", () => {
    // 엔진은 `saleRatio ?? landRatio`로 **취득시** 비율에 후퇴하는데,
    // 규칙 ①은 "구분이 없으면 **양도시** 기준시가 비율"이라 법령과 어긋난다.
    const err = validateSplitDirectInputs(sepNoBasis(), "자산 1");
    expect(err).toContain("양도시 토지 공시지가·면적과 건물 기준시가");
  });

  it("양도가액 한쪽만 입력해도 통과 (반대쪽은 잔액 도출)", () => {
    expect(
      validateSplitDirectInputs(sepNoBasis({ landTransferPrice: "600,000,000" }), "자산 1"),
    ).toBeNull();
  });

  it("양도시 기준시가 2필드로도 통과 (§166⑥ 양도 당시 기준시가 안분)", () => {
    expect(
      validateSplitDirectInputs(
        sepNoBasis({
          landStandardPriceAtTransfer: "600,000,000",
          buildingStandardPriceAtTransfer: "400,000,000",
        }),
        "자산 1",
      ),
    ).toBeNull();
  });
});

/**
 * P0 anchor — 「양도시 기준시가 자동 계산」 설계 전제 실측.
 * 계획서: docs/02-design/features/transfer-split-transfer-std-price-auto.plan.md (§6 P0)
 *
 * validate는 **총액 필드**(land/buildingStandardPriceAtTransfer)만 본다.
 * ㎡당 공시지가·면적을 아무리 채워도 총액이 비면 차단된다 → UI가 총액을 기록해야 한다는 설계 근거.
 * (취득시 축 B는 반대로 3요소를 각각 검증한다 — 엔진이 단가×면적을 스스로 계산하기 때문. §5 대조)
 */
describe("P0 anchor — 양도시 기준시가는 총액 필드로만 검증된다 (자동계산 설계 전제)", () => {
  it("🔴 ㎡당 공시지가 + 양도면적만 입력, 총액 미기록 → 여전히 차단", () => {
    const err = validateSplitDirectInputs(
      splitAsset({
        saleSplitMode: "apportioned",
        standardPricePerSqmAtTransfer: "5,000,000",
        transferArea: "200",
        // landStandardPriceAtTransfer / buildingStandardPriceAtTransfer 미기록
      }),
      "자산 1",
    );
    expect(err).toContain("양도시 기준시가");
  });

  it("토지 총액만 기록(건물 미기록) → 여전히 차단 (부분 입력 보완 없음)", () => {
    const err = validateSplitDirectInputs(
      splitAsset({
        saleSplitMode: "apportioned",
        standardPricePerSqmAtTransfer: "5,000,000",
        transferArea: "200",
        landStandardPriceAtTransfer: "1,000,000,000",
      }),
      "자산 1",
    );
    expect(err).toContain("양도시 기준시가");
  });

  it("단가 × 면적 = 총액을 UI가 기록하면 통과 (자동계산 목표 상태)", () => {
    expect(
      validateSplitDirectInputs(
        splitAsset({
          saleSplitMode: "apportioned",
          standardPricePerSqmAtTransfer: "5,000,000",
          transferArea: "200",
          landStandardPriceAtTransfer: "1,000,000,000", // floor(5,000,000 × 200)
          buildingStandardPriceAtTransfer: "300,000,000",
        }),
        "자산 1",
      ),
    ).toBeNull();
  });
});

/**
 * V4 범위 확대 — 규칙 ①은 **별개취득 여부와 무관**하다 (2026-07-29 확정).
 * 양도가액을 나누는 규칙이므로 취득시기 상이 여부와 관계가 없다.
 */
describe("V4 — 비-별개취득에서도 양도가액 구분 근거 강제", () => {
  const nonSep = (over: Partial<ReturnType<typeof makeDefaultAsset>> = {}) =>
    splitAsset({
      // 취득일 동일 → 비-별개취득(겸용·소유자분리 경로)
      acquisitionDate: "2018-06-01",
      landAcquisitionDate: "2018-06-01",
      saleSplitMode: "actual" as const,
      ...over,
    });

  it("🔴 구분양도 + 양도가액 2칸 미입력 + 양도시 기준시가 없음 → 차단", () => {
    // 종전에는 엔진이 **취득시** 비율로 조용히 안분했다(fallback 폐지 전).
    const err = validateSplitDirectInputs(nonSep(), "자산 1");
    expect(err).toContain("양도시 토지 공시지가·면적과 건물 기준시가");
  });

  it("양도가액 한쪽 입력 → 통과 (반대쪽 잔액 확정)", () => {
    expect(validateSplitDirectInputs(nonSep({ landTransferPrice: "600,000,000" }), "자산 1")).toBeNull();
  });

  it("양도시 기준시가 2필드 → 통과 (§64①1호 양도 당시 비율)", () => {
    expect(
      validateSplitDirectInputs(
        nonSep({ landStandardPriceAtTransfer: "600,000,000", buildingStandardPriceAtTransfer: "400,000,000" }),
        "자산 1",
      ),
    ).toBeNull();
  });
});
