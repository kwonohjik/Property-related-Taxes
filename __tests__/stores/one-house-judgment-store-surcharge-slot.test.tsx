/**
 * P5 anchor — 판정 store의 다주택 중과 슬롯(계획서 `multi-house-surcharge-judgment-menu.plan.md` §5.2 · T7 · R1 · P-9).
 *
 * 두 판정 메뉴는 입력(`formData`)을 함께 쓰고 결과·단계는 메뉴별로 둔다. 지키는 것:
 * - SS-1 입력이 바뀌면 **같은 `set`** 에서 두 메뉴의 결과를 함께 비운다(단계·오류는 둔다)
 * - SS-2 `reset`은 슬롯까지 초기화
 * - SS-3 의뢰인이 바뀌면 결과가 있는 메뉴만 비우고 1단계로 — 입력 도중인 다른 메뉴의 단계는 둔다
 * - SS-4 rehydrate는 슬롯을 초기화하고, persist는 `formData`만 남긴다
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useOneHouseJudgmentStore, createInitialSurchargeSlot } from "@/lib/stores/one-house-judgment-store";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import type { MultiHouseSurchargeJudgmentResponse } from "@/app/api/calc/multi-house-surcharge-judgment/route";
import type { OneHouseExemptionResponse } from "@/app/api/calc/one-house-exemption/route";

/** 무효화 여부만 보므로 필드 정확도는 무관 */
const surchargeStub = { scope: { supported: true }, notices: [] } as unknown as MultiHouseSurchargeJudgmentResponse;
const exemptionStub = { judgment: { isExempt: true } } as unknown as OneHouseExemptionResponse;

const st = () => useOneHouseJudgmentStore.getState();

beforeEach(() => {
  useProfessionalStore.setState({ activeClientId: null });
  st().reset();
});

describe("SS-1 — 입력 변경은 두 메뉴의 결과를 한 번에 비운다", () => {
  it("중과 결과·의뢰인 귀속이 비고, 중과 단계·오류는 그대로다", () => {
    st().setSurchargeStep(3);
    st().setSurchargeError("앞선 오류");
    st().setSurchargeResult(surchargeStub, "c1");
    expect(st().surcharge.resultClientId).toBe("c1");

    st().updateFormData({ transferDate: "2026-03-01" });

    expect(st().surcharge).toEqual({ currentStep: 3, result: null, resultClientId: null, error: "앞선 오류", isLoading: false });
  });

  it("1주택 결과도 같은 갱신에서 빈다 — 구독자가 한쪽만 빈 중간 상태를 보지 않는다", () => {
    st().setResult(exemptionStub, null);
    st().setSurchargeResult(surchargeStub, null);
    const seen: Array<[boolean, boolean]> = [];
    const unsub = useOneHouseJudgmentStore.subscribe((s) => seen.push([s.result === null, s.surcharge.result === null]));
    st().updateFormData({ transferDate: "2026-03-01" });
    unsub();
    expect(seen).toEqual([[true, true]]);
  });

  it("결과 없이 넣은 의뢰인은 귀속되지 않는다(1주택 setResult와 같은 규약)", () => {
    st().setSurchargeResult(null, "c1");
    expect(st().surcharge.resultClientId).toBeNull();
  });
});

describe("SS-2 — reset", () => {
  it("슬롯 전체가 초기값이 된다", () => {
    st().setSurchargeStep(2);
    st().setSurchargeLoading(true);
    st().setSurchargeResult(surchargeStub, "c1");
    st().reset();
    expect(st().surcharge).toEqual(createInitialSurchargeSlot());
  });
});

describe("SS-3 — 의뢰인 전환", () => {
  it("중과 결과만 있으면 중과 슬롯만 비운다 — 1주택 메뉴의 입력 단계는 둔다", () => {
    useProfessionalStore.setState({ activeClientId: "c1" });
    st().setStep(2);
    st().setSurchargeStep(4);
    st().setSurchargeResult(surchargeStub, "c1");

    useProfessionalStore.setState({ activeClientId: "c2" });

    expect(st().surcharge).toEqual(createInitialSurchargeSlot());
    expect(st().currentStep).toBe(2);
  });

  it("1주택 결과만 있으면 1주택만 비운다 — 중과 메뉴의 입력 단계는 둔다", () => {
    useProfessionalStore.setState({ activeClientId: "c1" });
    st().setStep(4);
    st().setResult(exemptionStub, "c1");
    st().setSurchargeStep(2);

    useProfessionalStore.setState({ activeClientId: "c2" });

    expect([st().result, st().currentStep]).toEqual([null, 0]);
    expect(st().surcharge.currentStep).toBe(2);
  });

  it("결과가 없으면 어느 메뉴의 단계도 건드리지 않는다", () => {
    useProfessionalStore.setState({ activeClientId: "c1" });
    st().setStep(2);
    st().setSurchargeStep(3);
    useProfessionalStore.setState({ activeClientId: "c2" });
    expect([st().currentStep, st().surcharge.currentStep]).toEqual([2, 3]);
  });
});

describe("SS-4 — persist", () => {
  it("partialize는 formData만 남긴다(중과 슬롯 제외)", () => {
    st().setSurchargeResult(surchargeStub, null);
    const kept = useOneHouseJudgmentStore.persist.getOptions().partialize!(st());
    expect(Object.keys(kept as object)).toEqual(["formData"]);
  });

  it("rehydrate는 중과 슬롯을 초기화한다", () => {
    const restored = { ...st(), surcharge: { ...createInitialSurchargeSlot(), currentStep: 3, result: surchargeStub } };
    useOneHouseJudgmentStore.persist.getOptions().onRehydrateStorage!(restored)!(restored, undefined);
    expect(restored.surcharge).toEqual(createInitialSurchargeSlot());
  });
});
