/**
 * Pre-Do anchor — **건물 기준시가 계산기의 연도 순서 미검증**
 * (기준시가 코드리뷰 2026-08-26 F-16 제안 말미의 「별건」).
 *
 * ## 결함
 *
 * 「양도연도 < 취득연도」를 **어느 경로도 검증하지 않는다.** 취득 전에 양도할 수는 없는데,
 * 역순 입력이 아무 경고 없이 **끝까지 계산된다**.
 *
 * 실측(신축 2000 · rc · 용도1 · 200㎡ · 취득 2020 · 양도 2010):
 *
 * | 경로 | validate | 엔진 |
 * |---|---|---|
 * | 일반 2시점 | **null(통과)** | 취득 107,800,000 · 양도 95,000,000 |
 * | 복합구조 | **null(통과)** | 완주 |
 * | 단일시점(양도) | **null(통과)** | 양도 95,000,000 |
 * | 기계식주차 | **null(통과)** | 완주 |
 *
 * 🔑 **이 저장소의 형제 모듈은 모두 같은 규칙을 이미 쓴다** — 양도세
 * (`transfer-tax-validate-asset.ts:69` *"취득일은 양도일보다 이전이어야 합니다."* · `:107`)
 * 와 주식양도세(`stock-transfer-tax-validate.ts:279`). 기준시가 계산기만 예외였다.
 *
 * ## 🔴 차단은 「화면에 그 칸이 있을 때」만 성립한다
 *
 * 양도연도 Select 는 **공동주택 환산 모드**와 **취득 전용(단일시점 acquisition) 모드**에서
 * 숨는다(수정 전 `BuildingStdPriceForm` 「양도 시점」 섹션의 `!apartmentConv && !acqOnly`).
 * 그 상태로 stale 값을
 * 보고 차단하면 **화면에 없는 칸 때문에 막히는 dead-end** 가 된다 — F-16 이 정확히 그
 * 실패모드였다.
 *
 * ⇒ 술어를 손으로 다시 적지 않고 **`transferYearVisible` leaf** 를 신설해 UI 와 ⑧검증이
 *   같은 답을 내게 한다([[feedback_leaf_unification_leaves_one_handwritten_predicate]]).
 *
 * ## ⚠️ 신축연도 축은 **차단하지 않는다** (같은 probe 에서 실측했으나 제외)
 *
 * `builtYear > acquisitionYear` (실측: 취득 기준시가 118,800,000 vs 정상 95,000,000, **+25%**)
 * 와 `builtYear > valuationYear` 도 똑같이 무검증 통과한다. 그러나 재개발·입주권처럼
 * **신축이 취득보다 뒤인 정당한 조합**을 배제할 위험이 있어 판단 근거가 부족하다 —
 * 법령 근거 없이 정상 입력을 막는 방향이므로 **기록만 남기고 별건으로 둔다**.
 *
 * 법령: 「소득세법 시행규칙」 제80조 제1항 제1호 본문 *"취득일이 속하는 연도의 다음 연도
 * 말일 이전에 양도하는 경우"* — 양도가 취득 뒤라는 사실이 요건에 흡수돼 있다.
 * (연도 순서 자체를 정한 명문은 없다 — 「취득 전 양도」가 개념상 불가능한 것이다.)
 *
 * ⚠️ §1 은 **수정 전에 실패한다** — 의도된 Pre-Do anchor다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { initialBuildingStdPriceForm } from "@/lib/calc/building-std-price-form";
import { validateBuildingStdPriceForm } from "@/lib/calc/building-std-price-validate";
import { BuildingStdPriceForm } from "@/components/calc/building-std-price/BuildingStdPriceForm";
import type { BuildingStdPriceFormState } from "@/lib/calc/building-std-price-form";

afterEach(cleanup);

/** 취득 2020 → 양도 2010 (역순). `over` 로 경로를 갈아끼운다. */
function reversed(over: Partial<BuildingStdPriceFormState> = {}): BuildingStdPriceFormState {
  return {
    ...initialBuildingStdPriceForm,
    taxType: "transfer",
    floorArea: "200",
    builtYear: "2000",
    acquisitionYear: "2020",
    transferYear: "2010",
    acqStructureKey: "rc",
    acqUsageNo: "1",
    acqLandPrice: "1,000,000",
    transStructureKey: "rc",
    transUsageNo: "1",
    transLandPrice: "1,100,000",
    ...over,
  } as BuildingStdPriceFormState;
}

describe("연도 순서 — §1 역순 차단 (수정 전 실패)", () => {
  it("★ 일반 2시점", () => {
    expect(validateBuildingStdPriceForm(reversed())).toContain("취득 후에만 양도할 수 있습니다");
  });

  it("★ 복합구조", () => {
    const f = reversed({
      compositeMode: true,
      compositeParts: [
        { label: "1층", structureKey: "rc", usageNo: "1", acqUsageNo: "1", floorArea: "200" },
      ],
    } as never);
    expect(validateBuildingStdPriceForm(f)).toContain("취득 후에만 양도할 수 있습니다");
  });

  it("★ 단일시점(양도) — 취득연도 칸은 §164⑧ 판정용으로 화면에 남아 있다", () => {
    expect(validateBuildingStdPriceForm(reversed({ singleTimePoint: "transfer" })))
      .toContain("취득 후에만 양도할 수 있습니다");
  });

  it("★ 기계식주차", () => {
    const f = reversed({ isMechanicalParking: true, parkingLotCount: "10" } as never);
    expect(validateBuildingStdPriceForm(f)).toContain("취득 후에만 양도할 수 있습니다");
  });

  it("★ 메시지에 두 연도를 함께 적는다 (어느 쪽을 고칠지 알 수 있게)", () => {
    const msg = validateBuildingStdPriceForm(reversed()) ?? "";
    expect(msg).toContain("2010");
    expect(msg).toContain("2020");
  });
});

describe("연도 순서 — §2 역방향 가드 (수정 전후 불변)", () => {
  const forward = (over: Partial<BuildingStdPriceFormState> = {}) =>
    reversed({ acquisitionYear: "2010", transferYear: "2020", ...over });

  it("정상 순서는 통과한다", () => {
    expect(validateBuildingStdPriceForm(forward())).toBeNull();
  });

  it("동일연도(§164⑧)는 역순이 아니다 — 차단하지 않는다", () => {
    const same = forward({
      acquisitionYear: "2015",
      transferYear: "2015",
      holdingMonths: "8",
      adjustMonths: "12",
      sameYearFormula: "prev",
      prevLandPrice: "900,000",
    });
    expect(validateBuildingStdPriceForm(same)).toBeNull();
  });

  it("연도교차 opt-in(§164⑧)도 통과한다", () => {
    const cross = forward({
      acquisitionYear: "2015",
      transferYear: "2016",
      crossYearSameAdjust: true,
      holdingMonths: "8",
      adjustMonths: "12",
      sameYearFormula: "prev",
      prevLandPrice: "900,000",
    });
    expect(validateBuildingStdPriceForm(cross)).toBeNull();
  });

  it("🔴 취득 전용(단일시점 acquisition)은 차단하지 않는다 — 양도연도 칸이 화면에 없다", () => {
    const acqOnly = reversed({ singleTimePoint: "acquisition" });
    const msg = validateBuildingStdPriceForm(acqOnly) ?? "";
    expect(msg).not.toContain("취득 후에만 양도할 수 있습니다");
  });

  it("🔴 공동주택 환산 모드도 차단하지 않는다 — 양도연도 칸이 화면에 없다", () => {
    const conv = reversed({
      apartmentConversionMode: true,
      apartmentConversion: {
        firstNoticeApartmentPrice: "300,000,000",
        firstNoticeYear: "2005",
        landAreaM2: "100",
        totalFloorArea: "200",
        structureKey: "rc",
        usageNo: "1",
        firstNoticeLandPrice: "1,000,000",
        acquisitionLandPrice: "900,000",
        building2001LandPrice: "800,000",
      },
    } as never);
    const msg = validateBuildingStdPriceForm(conv) ?? "";
    expect(msg).not.toContain("취득 후에만 양도할 수 있습니다");
  });

  it("상증(평가 단일시점)에는 양도연도 축이 없다", () => {
    const estate = {
      ...initialBuildingStdPriceForm,
      taxType: "inheritance_gift",
      floorArea: "200",
      builtYear: "2000",
      valuationYear: "2025",
      valStructureKey: "rc",
      valUsageNo: "1",
      valLandPrice: "1,000,000",
    } as BuildingStdPriceFormState;
    expect(validateBuildingStdPriceForm(estate)).toBeNull();
  });
});

describe("연도 순서 — §3 UI 가시성 ↔ 검증 동치 (같은 leaf)", () => {
  function renderWith(over: Partial<BuildingStdPriceFormState>) {
    render(
      <BuildingStdPriceForm
        lockedTaxType="transfer"
        initialForm={{ builtYear: "2000", floorArea: "200", ...over }}
        onResult={() => {}}
      />,
    );
  }

  it("양도연도 칸이 보이는 모드에서만 역순이 차단된다 (2시점)", () => {
    renderWith({ acquisitionYear: "2020", transferYear: "2010" });
    expect(screen.queryByText("양도연도")).not.toBeNull();
    expect(validateBuildingStdPriceForm(reversed())).toContain("취득 후에만 양도할 수 있습니다");
  });

  it("취득 전용 모드는 양도연도 칸이 없고, 검증도 그것을 막지 않는다", () => {
    renderWith({ acquisitionYear: "2020", transferYear: "2010", singleTimePoint: "acquisition" });
    expect(screen.queryByText("양도연도")).toBeNull();
    const msg = validateBuildingStdPriceForm(reversed({ singleTimePoint: "acquisition" })) ?? "";
    expect(msg).not.toContain("취득 후에만 양도할 수 있습니다");
  });
});
