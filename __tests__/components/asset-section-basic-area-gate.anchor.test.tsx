/**
 * 기본정보 면적 섹션의 assetKind 게이트 — Phase 1~2 반영 (rev.2)
 *
 * Phase 0 baseline: `{asset.assetKind === "land" && (` 단일 게이트로 토지만 노출.
 * Phase 1~2 후: `AREA_SCENARIOS_BY_ASSET_KIND` 등재 자산유형만 노출 —
 *   land(4시나리오) · housing 일반(same·partial). 전용 면적 섹션을 가진 자산유형
 *   (겸용·상가·일반건물·재개발)은 **의도적으로 미렌더**(중복 입력 방지).
 *
 * housing 3건은 Phase 2에서 의도적으로 뒤집힌 anchor다(부재 → 존재).
 * commercial_building·general_building 은 **뒤집히지 않는다** — 전용 3축 섹션이 정본이며
 *   기본정보에 띄우면 같은 면적을 두 번 입력받게 된다(engine.design §4.2).
 *
 * 보존 계약: data-testid="area-scenario-select" — e2e/transfer-replot-increase-estimated.spec.ts:30 사용 중.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { AssetSectionBasic } from "@/components/calc/transfer/asset-sections/AssetSectionBasic";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

// RTL cleanup은 프로젝트 규약상 수동 등록 (memory feedback_rtl_manual_cleanup_required)
afterEach(() => cleanup());

function renderBasic(
  assetKind: AssetForm["assetKind"],
  over: Partial<AssetForm> = {},
  onChange: (patch: Partial<AssetForm>) => void = vi.fn(),
) {
  const asset: AssetForm = {
    ...makeDefaultAsset(1),
    assetKind,
    acquisitionCause: "purchase",
    acquisitionDate: "2010-05-01",
    ...over,
  };

  return render(
    <AssetSectionBasic
      asset={asset}
      onChange={onChange}
      isMultiBundled={false}
      onAddAsset={vi.fn()}
      showFormDates={false}
      transferDate="2026-05-01"
      filingDate=""
      filingOverdue={false}
      filingDeadline=""
      onFormChange={vi.fn()}
    />,
  );
}

describe("R-1 — assetKind별 면적 섹션 렌더 여부", () => {
  it("land: 면적 시나리오 Select가 렌더된다", () => {
    renderBasic("land");
    expect(screen.getByTestId("area-scenario-select")).toBeInTheDocument();
  });

  it("[Phase 2 뒤집힘] housing: 면적 시나리오 Select가 렌더된다", () => {
    renderBasic("housing");
    expect(screen.getByTestId("area-scenario-select")).toBeInTheDocument();
  });

  it("land: 「취득·양도 당시 면적」 단일 입력이 same 기본값에서 노출된다", () => {
    renderBasic("land");
    expect(screen.getByText(/취득·양도 당시 면적 \(㎡\)/)).toBeInTheDocument();
  });

  it("R-5 housing: 라벨이 「토지 면적」 (2026-08-12 단축 — 원칙 C 예외)", () => {
    renderBasic("housing");
    expect(screen.getByText(/토지 면적 \(㎡\)/)).toBeInTheDocument();
  });

  /**
   * 🔄 building 3건은 **Phase F1 β-2에서 뒤집혔다**(2026-07-30).
   *
   * 종전: `acquisitionArea`(축 A 슬롯)가 연면적을 담고 시나리오 Select가 렌더됐다.
   * 정정: 축 B 전용 필드 `buildingFloorArea` 신설 → `acquisitionArea`는 축 A(토지) 전용.
   *       `building`은 토지가 없으므로 **축 A 입력·시나리오 Select 모두 미렌더**이고
   *       면적 시나리오는 `["same"]` 단일로 축소됐다(partial이 환산비율을 왜곡했다 — A-6).
   */
  it("R-5 building: 축 B 전용 입력이 렌더된다 (연면적)", () => {
    renderBasic("building");
    expect(screen.getByTestId("basic-building-floor-area")).toBeInTheDocument();
    expect(screen.getByText(/건물 연면적 \(㎡\)/)).toBeInTheDocument();
  });

  /**
   * 🔴 U-12(2026-07-30) — 축 A를 **끄지 않는다**. 종전 이 테스트는 "토지 제외 자산이므로
   *    축 A 미렌더"를 고정했는데, 그 전제가 틀렸다:
   *
   *    「소득세법」 제99조 제1항 제1호는 **나목**(건물)에 "딸린 토지" 문구를 두지 않고
   *    **다목**(오피스텔·상업용건물)에만 "이에 딸린 토지를 포함한다"를 둔다(같은 조
   *    제3항 제4호에서 확인) → **나목 건물의 부수토지는 가목으로 별도 평가**된다.
   *    라벨 "건물(토지 제외)"는 *기준시가 공시 범위*이지 토지 부재가 아니다.
   *
   *    코드도 그렇게 동작한다 — `toPropertyType(building_non_residential)` → "land"
   *    (`StandardPriceInput.tsx:69~70`)이므로 조회 대상이 **개별공시지가**이고
   *    `acquisitionArea`가 그 곱셈 인자다. 끄면 validate가 "토지 면적을 입력하세요"로
   *    차단하는 dead-end가 된다(`transfer-tax-validate-split.ts:115,155,247`).
   */
  it("🔴 building: 축 A(토지 면적)도 렌더된다 — 부수토지가 가목으로 별도 평가된다", () => {
    renderBasic("building");
    expect(screen.getByTestId("area-scenario-select")).toBeInTheDocument();
    // 라벨은 「토지 면적」이다 — PR #912의 "건물 연면적" 오라벨링은 제거됐다
    expect(screen.getByText(/토지 면적 \(㎡\)/)).toBeInTheDocument();
    expect(screen.queryByText(/취득·양도 당시 건물 연면적 \(㎡\)/)).not.toBeInTheDocument();
  });

  /**
   * 🔄 뒤집힌 anchor (2026-08-04, 사용자 확정 O-1)
   *
   * 종전 계약: "building은 부수토지 판정이 없으니 축 C 미렌더".
   * 변경 근거: 사용자가 **상가·건물은 면적을 앞으로 사용 예정**으로 확정 → 장래 대비
   * 입력을 받는다. 다만 값이 세액에 반영되지 않는 상태이므로 아래 3중 안전장치를 건다:
   *   ① hint가 "아직 세액 계산에 반영되지 않습니다"를 명시
   *   ② 배율 라디오(`appurtenantLandZone`)는 **미노출** — 「소득세법 시행령」 §154⑦은
   *      주택 부수토지 한도라 상가·건물에 대응 개념이 없다
   *   ③ validate에서 필수로 만들지 않는다(계산 차단 금지)
   * 계획: `docs/00-pm/transfer-area-unification-all-asset-kinds.plan.md` P3
   */
  it.each(["building", "commercial_building"] as const)(
    "%s: 축 C(바닥면적) 렌더 — 장래 대비 입력",
    (kind) => {
      renderBasic(kind);
      expect(screen.getByTestId("basic-building-footprint-area")).toBeInTheDocument();
    },
  );

  it.each(["building", "commercial_building"] as const)(
    "%s: 세액 미반영 안내가 표시된다",
    (kind) => {
      renderBasic(kind);
      expect(screen.getByText(/아직 세액 계산에 반영되지 않습니다/)).toBeInTheDocument();
    },
  );

  it.each(["building", "commercial_building"] as const)(
    "%s: 배율 라디오(§154⑦ 주택 전용)는 노출되지 않는다",
    (kind) => {
      renderBasic(kind, { buildingFootprintArea: "100" });
      expect(screen.queryByText("부수토지 소재지 구분")).not.toBeInTheDocument();
    },
  );

  it("housing: 배율 라디오는 그대로 노출된다 (회귀 0)", () => {
    renderBasic("housing", { buildingFootprintArea: "100" });
    expect(screen.getByText("부수토지 소재지 구분")).toBeInTheDocument();
  });

  it("housing: 세액 미반영 안내가 아니라 §154⑦ 안내가 나온다", () => {
    renderBasic("housing");
    expect(screen.getByText(/전량 부수토지로 가정합니다/)).toBeInTheDocument();
    expect(screen.queryByText(/아직 세액 계산에 반영되지 않습니다/)).not.toBeInTheDocument();
  });
});

describe("R-5b — housing 축 B·C 신설 (Phase F1)", () => {
  it("housing: 축 B(건물 연면적) 입력이 렌더된다", () => {
    renderBasic("housing");
    expect(screen.getByTestId("basic-building-floor-area")).toBeInTheDocument();
  });

  it("housing: 축 C(건물 바닥면적) 입력이 렌더된다 — §154⑦ 부수토지 한도", () => {
    renderBasic("housing");
    expect(screen.getByTestId("basic-building-footprint-area")).toBeInTheDocument();
    expect(screen.getByText(/정착면적/)).toBeInTheDocument();
  });

  it("housing: 축 C 미입력 시 거동을 안내한다 (전량 부수토지 가정)", () => {
    renderBasic("housing");
    expect(screen.getByText(/전량 부수토지로 가정/)).toBeInTheDocument();
  });

  it("land: 축 B·C 모두 미렌더 — 축 C는 nblHousingFootprint 소관(법 §104의3①5호)", () => {
    renderBasic("land");
    expect(screen.queryByTestId("basic-building-floor-area")).not.toBeInTheDocument();
    expect(screen.queryByTestId("basic-building-footprint-area")).not.toBeInTheDocument();
  });

  it("겸용주택: 축 B·C 미렌더 — 겸용 전용 섹션이 담당(중복 노출 방지)", () => {
    renderBasic("housing", { isMixedUseHouse: true });
    expect(screen.queryByTestId("basic-building-floor-area")).not.toBeInTheDocument();
    expect(screen.queryByTestId("basic-building-footprint-area")).not.toBeInTheDocument();
  });
});

describe("R-6 — 전용 면적 섹션 보유 자산유형은 기본정보에 미렌더 (중복 입력 방지)", () => {
  // 아래 4건은 Phase 2에서도 뒤집히지 않는다 — 전용 3축 섹션이 정본(engine.design §4.2).
  it("겸용주택(housing + isMixedUseHouse): 미렌더 — mixedUseTotalLandArea가 담당", () => {
    renderBasic("housing", { isMixedUseHouse: true });
    expect(screen.queryByTestId("area-scenario-select")).not.toBeInTheDocument();
  });

  it("commercial_building: 미렌더 — cbLandArea·cbExclusiveArea·cbSharedArea 3축", () => {
    renderBasic("commercial_building");
    expect(screen.queryByTestId("area-scenario-select")).not.toBeInTheDocument();
  });

  it("general_building: 미렌더 — gbLandArea·gbBuildingArea·gbBuildingFootprintArea 3축", () => {
    renderBasic("general_building");
    expect(screen.queryByTestId("area-scenario-select")).not.toBeInTheDocument();
  });

  it("redevelopment_apt: 미렌더 — redevLandArea", () => {
    renderBasic("redevelopment_apt");
    expect(screen.queryByTestId("area-scenario-select")).not.toBeInTheDocument();
  });
});

describe("R-2 — 환지 시나리오는 land 전용 (소득령 §162의2)", () => {
  it("land: 감환지·증환지 옵션이 존재한다", () => {
    renderBasic("land", { areaScenario: "reduction" });
    // 트리거 라벨로 확인 — 현재 선택값이 reduction으로 표시되면 옵션이 유효하다.
    expect(screen.getByTestId("area-scenario-select")).toHaveTextContent(
      /환지처분 \(감환지\)/,
    );
  });

  it("housing: 환지 시나리오 옵션이 노출되지 않는다", () => {
    renderBasic("housing");
    fireEvent.click(screen.getByTestId("area-scenario-select"));
    // 허용 목록은 same·partial 뿐 → 환지 옵션 부재
    expect(screen.queryByText(/환지처분 \(감환지\)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/환지처분 \(증환지\)/)).not.toBeInTheDocument();
    expect(screen.getByText(/일부 양도/)).toBeInTheDocument();
  });
});

describe("R-3 · R-4 — 단일 배치 update (useEffect 미러링 금지)", () => {
  it("R-3 same 단일 입력이 acquisitionArea·transferArea를 한 번에 갱신한다", () => {
    const onChange = vi.fn();
    renderBasic("housing", {}, onChange);

    const input = screen.getByPlaceholderText("면적 입력");
    fireEvent.change(input, { target: { value: "150" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      acquisitionArea: "150",
      transferArea: "150",
    });
  });

  it("R-4 assetKind 변경 시 허용 외 areaScenario를 같은 배치로 리셋한다", () => {
    const onChange = vi.fn();
    // land에서 증환지를 선택한 상태 → housing으로 전환하면 increase가 stale이 된다.
    renderBasic("land", { areaScenario: "increase", entitlementArea: "120" }, onChange);

    fireEvent.click(screen.getByRole("button", { name: "주택" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const patch = onChange.mock.calls[0][0];
    expect(patch.assetKind).toBe("housing");
    expect(patch.areaScenario).toBe("same");
    // 환지 전용 필드도 함께 비운다 — 숨은 분기가 계산에 남지 않도록.
    expect(patch.entitlementArea).toBe("");
    expect(patch.allocatedArea).toBe("");
    expect(patch.priorLandArea).toBe("");
    expect(patch.replottingConfirmDate).toBe("");
  });

  it("R-4 허용되는 시나리오는 assetKind 변경 시 유지된다 (불필요한 리셋 금지)", () => {
    const onChange = vi.fn();
    renderBasic("land", { areaScenario: "partial" }, onChange);

    fireEvent.click(screen.getByRole("button", { name: "주택" }));

    const patch = onChange.mock.calls[0][0];
    expect(patch.assetKind).toBe("housing");
    // partial은 housing에서도 허용 → areaScenario 키 자체가 패치에 없어야 한다.
    expect(patch).not.toHaveProperty("areaScenario");
  });
});
