/**
 * NBL-STATE-HISTORY-E3-③ UI-B 동반 — A 후속 Low 3건의 **엔진 쪽 단일 소스** anchor.
 *   Low 1  주택 변형 PARTIAL 고지(`NBL_STATE_HISTORY_HOUSING_PARTIAL_AREA_NOTICE`) — 기존 일반 문구는 바이트 동일(기타토지 경로 불변).
 *   Low 3  `housingStateHistoryIsRead` — 엔진이 이력을 읽는 조건(양도일 현재 배율 이내)과 UI `housingAreaLimitState`(⑧ H9·⑤ 안내 게이트)가 **같은 결과**.
 *   Low 4  질문 미선택 문구 — 기본(`building`)은 종전 상수와 바이트 동일 · `house`는 «주택» 변형.
 * 엔진 오라클: 같은 입력을 `buildNblEngineInput → judgeNonBusinessLand`로 돌려 `periodEvaluation.basis`(이내 = `state_history` · 초과 = `not_judged`)를 읽는다.
 */
import { describe, it, expect } from "vitest";
import { E3D_A_ROWS, e3dARowRaw } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-3-table";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { housingAreaLimitState } from "@/lib/calc/nbl-other-state-history-preview";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import { STATE_HISTORY_MODE_REQUIRED_MESSAGE, stateHistoryModeRequiredMessage } from "@/lib/tax-engine/non-business-land/nbl-validation-messages";
import { NBL_STATE_HISTORY_HOUSING_PARTIAL_AREA_NOTICE, NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const m15 = E3D_A_ROWS.find((r) => r.id === "M15")!;
const judge = (raw: Record<string, unknown>) => judgeNonBusinessLand(buildNblEngineInput(raw as never)!, DEFAULT_NON_BUSINESS_LAND_RULES);

describe("Low 3 — UI 게이트 `housingAreaLimitState` = 엔진이 이력을 읽는 조건(`housingStateHistoryIsRead`)", () => {
  // 주택부수토지 500㎡ · 수도권 밖 일반주거(5배): 정착 100 → 허용 500(이내, 경계 포함) · 99.99 → 499.95(초과 0.05) · 40 → 200(초과)
  it.each([
    ["100", "within"],
    ["100.00", "within"],
    ["200", "within"],
    ["99.99", "exceeded"],
    ["40", "exceeded"],
  ] as const)("양도일 현재 정착면적 %s㎡ → UI «%s» ⇔ 엔진 이력 %s", (footprint, state) => {
    const asset = {
      ...makeDefaultAsset(1),
      assetKind: "land", acquisitionDate: "2014-01-01", acquisitionArea: "500",
      nblUseDetailedJudgment: true, nblLandType: "housing_site", nblZoneType: "general_residential", nblIsMetropolitanArea: "no", nblHousingFootprint: footprint,
    } as AssetForm;
    expect(housingAreaLimitState(asset, "2024-01-01")).toBe(state);
    const j = judge({ ...e3dARowRaw(m15), nblHousingFootprint: footprint });
    expect(j.periodEvaluation?.basis).toBe(state === "within" ? "state_history" : "not_judged");
  });

  it("초과이면 엔진은 이력을 읽지 않는다 — 철거 행 정착면적이 비어 있어도 판정·세액이 이력 없음(현행)과 같다(⑧이 요구할 이유가 없다)", () => {
    const base = { ...e3dARowRaw(m15), nblHousingFootprint: "40" };
    const blank = judge({ ...base, nblOtherStateEvents: [{ kind: "building_removed", date: "2016-01-01", houseFootprintBefore: "" }, { kind: "building_built", date: "2023-01-01" }] });
    const none = judge({ ...base, nblOtherStateHistoryMode: "", nblOtherStateEvents: [] });
    expect(blank.isNonBusinessLand).toBe(none.isNonBusinessLand);
    expect(blank.periodEvaluation).toEqual(none.periodEvaluation);
    expect(blank.warnings).toContain(NBL_STATE_HISTORY_HOUSING_PARTIAL_AREA_NOTICE);
  });
});

describe("Low 1 — 주택 변형 PARTIAL 고지", () => {
  it("일반 PARTIAL 문구는 바이트 동일(기타토지·공장·호별 경로) · 주택 변형은 «주택 이력»·현재형이고 서로 다르다", () => {
    expect(NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE).toBe(
      "이 토지는 면적의 일부만 비사업용으로 판정되는 경로라 입력한 건축물 이력(기간별 구간)을 판정에 반영하지 않았습니다. 면적과 기간을 함께 따지는 판정은 지원하지 않습니다 — 확인 필요.",
    );
    expect(NBL_STATE_HISTORY_HOUSING_PARTIAL_AREA_NOTICE).not.toBe(NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE);
    expect(NBL_STATE_HISTORY_HOUSING_PARTIAL_AREA_NOTICE).toContain("주택 이력");
    expect(NBL_STATE_HISTORY_HOUSING_PARTIAL_AREA_NOTICE.endsWith("확인 필요.")).toBe(true);
  });

  it("양도일 현재 초과 + `changed` → 결과 warnings에 주택 변형만 1줄(일반 문구 없음) · 초과 + `unknown`·`unchanged`·`\"\"`는 고지 없음(E0 compat 보존)", () => {
    const j = judge({ ...e3dARowRaw(m15), nblHousingFootprint: "40" });
    expect(j.warnings.filter((w) => w === NBL_STATE_HISTORY_HOUSING_PARTIAL_AREA_NOTICE)).toHaveLength(1);
    expect(j.warnings).not.toContain(NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE);
    for (const mode of ["unknown", "unchanged", ""]) {
      const k = judge({ ...e3dARowRaw(m15), nblHousingFootprint: "40", nblOtherStateHistoryMode: mode, nblOtherStateEvents: [] });
      expect(k.warnings, mode).not.toContain(NBL_STATE_HISTORY_HOUSING_PARTIAL_AREA_NOTICE);
    }
  });
});

describe("Low 4 — 질문 미선택 문구 사건 주체 변형", () => {
  it("기본·`building`은 종전 상수와 바이트 동일", () => {
    expect(stateHistoryModeRequiredMessage()).toBe(STATE_HISTORY_MODE_REQUIRED_MESSAGE);
    expect(stateHistoryModeRequiredMessage("building")).toBe(STATE_HISTORY_MODE_REQUIRED_MESSAGE);
  });
  it("`house` 변형은 «주택이 새로 지어지거나 없어진 적»을 묻고 건축물 문구를 쓰지 않으며 같은 탈출구(「모름」)·«미선택 ≠ 바뀐 적 없음» 안내를 둔다", () => {
    const m = stateHistoryModeRequiredMessage("house");
    expect(m).toContain("이 토지 위 주택이 새로 지어지거나 없어진 적이 있는지 선택하세요");
    expect(m).not.toContain("건축물");
    expect(m).toContain("「모름」");
    expect(m).toContain("미선택은 「바뀐 적 없음」으로 보지 않습니다");
  });
});
