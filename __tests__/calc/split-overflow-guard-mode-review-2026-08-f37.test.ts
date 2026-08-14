/**
 * F37 — 일괄양도 기본(안분) 모드에서 split validate의 취득가액·자본적지출 초과 가드가
 * 통째로 꺼지던 결함의 회귀 anchor (코드리뷰 2026-08).
 *
 * ## 결함
 * `validateSplitDirectInputs`의 `if (asset.saleSplitMode !== "actual") return null;`이 V9(§166⑧)
 * 뿐 아니라 그 아래 **②취득가액·③자본적지출 초과 검증까지** 차단했다. ②·③은 `saleSplitMode`와
 * 무관한 축이고(취득가액 2필드·자본적지출 2필드는 모드와 무관하게 전송된다 —
 * `transfer-tax-api-split.ts`), API 기본값이 `saleSplitMode ?? "apportioned"`라 **기본 경로 전체가
 * 미검증**이었다. 파일 머리말이 선언한 계약("엔진은 clamp하지 않는다 — 그 모순 입력을 여기서
 * 차단한다")이 기본 모드에서 성립하지 않았다.
 *
 * ## 실측 (수정 전)
 * 동일 자산(양도 10억·취득 총액 5억·토지 취득가액 900,000,000)에서
 *   · `saleSplitMode="actual"`      → "토지 취득가액이 취득가액(500,000,000원)을 초과합니다" 차단
 *   · `saleSplitMode="apportioned"` → **null 통과** → 엔진 `splitPair`가 건물 취득가액을
 *     −400,000,000으로 도출(세액 −23,760,000 과소)
 *
 * ## ② 게이트 축 정정 (F24와 한 쌍)
 * 종전 ②의 조건은 자산-수준 레거시 플래그(`useEstimatedAcquisition`·`isSalesCaseAcquisition`)였는데
 * API 전송 게이트는 **파트별**(`landAcqDirectActive`/`buildingAcqDirectActive`, F24 이후 소유 축 포함)
 * 이다. 그대로 모드 무관으로 풀면 **잔액이 소비되지 않는 조합까지 막아** 입력 칸 없는 dead-end가
 * 된다(⑧ 규칙). ⇒ 양쪽 파트가 모두 직접입력 모드이고 모두 본인 소유일 때만 검사한다.
 */
import { describe, it, expect } from "vitest";
import { validateSplitDirectInputs } from "@/lib/calc/transfer-tax-validate-split";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

/** 비-별개취득(취득일 동일) — ②는 별개취득에서 의도적으로 비활성이므로 이 경로로 고정한다. */
function nonSep(over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing" as const,
    acquisitionCause: "purchase" as const,
    acquisitionDate: "2018-06-01",
    landAcquisitionDate: "2018-06-01",
    hasSeperateLandAcquisitionDate: true,
    actualSalePrice: "1,000,000,000",
    fixedAcquisitionPrice: "500,000,000",
    landStandardPriceAtTransfer: "600,000,000",
    buildingStandardPriceAtTransfer: "400,000,000",
    ...over,
  } as never;
}

describe("F37 — ② 취득가액 초과 가드는 양도 안분 모드와 무관하다", () => {
  it("🔴 apportioned(기본) + 토지 취득가액 9억(총 5억) → 차단", () => {
    const err = validateSplitDirectInputs(
      nonSep({ saleSplitMode: "apportioned", landAcquisitionPrice: "900,000,000" }),
      "자산 1",
    );
    expect(
      err,
      "기본 모드가 미검증이면 엔진이 건물 취득가액을 −400,000,000으로 도출한다",
    ).toContain("토지 취득가액이 취득가액(500,000,000원)을 초과합니다");
  });

  it("🔴 saleSplitMode 미지정(undefined) → 기본 anbun 취급이지만 ②는 그대로 산다", () => {
    const err = validateSplitDirectInputs(
      nonSep({ saleSplitMode: undefined, landAcquisitionPrice: "900,000,000" }),
      "자산 1",
    );
    expect(err).toContain("초과합니다");
  });

  it("actual(구분양도)에서도 종전대로 차단 (회귀 방어)", () => {
    const err = validateSplitDirectInputs(
      nonSep({
        saleSplitMode: "actual",
        landTransferPrice: "600,000,000",
        landAcquisitionPrice: "900,000,000",
      }),
      "자산 1",
    );
    expect(err).toContain("토지 취득가액이 취득가액(500,000,000원)을 초과합니다");
  });

  it("정상 입력(토지 2억 + 건물 3억 = 총 5억) → 통과", () => {
    expect(
      validateSplitDirectInputs(
        nonSep({
          saleSplitMode: "apportioned",
          landAcquisitionPrice: "200,000,000",
          buildingAcquisitionPrice: "300,000,000",
        }),
        "자산 1",
      ),
    ).toBeNull();
  });
});

describe("F37 — ③ 자본적지출 초과 가드도 모드 무관", () => {
  it("🔴 apportioned(기본) + 토지 자본적지출 5천만(총 3천만) → 차단", () => {
    const err = validateSplitDirectInputs(
      nonSep({
        saleSplitMode: "apportioned",
        directExpenses: "30,000,000",
        landDirectExpenses: "50,000,000",
      }),
      "자산 1",
    );
    expect(err).toContain("자본적지출");
  });
});

describe("F37 — 과잉 차단 금지: 잔액이 소비되지 않는 조합은 그대로 통과", () => {
  it("혼합 파트 모드(토지 환산 + 건물 실가 9억) → 통과 — 토지분은 환산식이라 총액을 참조하지 않는다", () => {
    expect(
      validateSplitDirectInputs(
        nonSep({
          saleSplitMode: "apportioned",
          landAcqMode: "estimated",
          buildingAcqMode: "actual",
          buildingAcquisitionPrice: "900,000,000",
          standardPricePerSqmAtAcq: "3,000,000",
          acquisitionArea: "100",
          standardPriceAtAcq: "400,000,000",
        }),
        "자산 1",
      ),
    ).toBeNull();
  });

  it('selfOwns="building_only" → 통과 — 비소유 토지분의 잔액은 폐기되므로 모순이 성립하지 않는다', () => {
    expect(
      validateSplitDirectInputs(
        nonSep({
          saleSplitMode: "apportioned",
          selfOwns: "building_only",
          buildingAcquisitionPrice: "900,000,000",
          standardPricePerSqmAtAcq: "3,000,000",
          acquisitionArea: "100",
          standardPriceAtAcq: "400,000,000",
        }),
        "자산 1",
      ),
    ).toBeNull();
  });

  it("자산-수준 환산 모드 → 종전대로 미검증 (파트 모드가 환산으로 파생된다)", () => {
    expect(
      validateSplitDirectInputs(
        nonSep({
          saleSplitMode: "apportioned",
          useEstimatedAcquisition: true,
          buildingAcquisitionPrice: "9,999,999,999",
          standardPricePerSqmAtAcq: "3,000,000",
          acquisitionArea: "100",
          standardPriceAtAcq: "400,000,000",
        }),
        "자산 1",
      ),
    ).toBeNull();
  });
});

describe("F37 — V9·①은 구분양도 전용으로 남는다 (게이트를 넓히지 않았다)", () => {
  it("apportioned + §166⑧ 예외 근거 미입력 → 차단하지 않는다 (API가 전송하지 않으므로)", () => {
    expect(
      validateSplitDirectInputs(
        nonSep({ saleSplitMode: "apportioned", saleSplitExemption: "other" }),
        "자산 1",
      ),
    ).toBeNull();
  });

  it("apportioned + 잔존 건물 양도가액 99억 → ① 미검증 (칸 미노출·미전송)", () => {
    expect(
      validateSplitDirectInputs(
        nonSep({ saleSplitMode: "apportioned", buildingTransferPrice: "9,999,999,999" }),
        "자산 1",
      ),
    ).toBeNull();
  });
});
