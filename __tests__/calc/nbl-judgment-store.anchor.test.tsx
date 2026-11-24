/**
 * anchor U-2 — 비사업용 토지 판정 메뉴 store (계획서 `nbl-judgment-menu.ui.plan.md` §3)
 * 3중 고정(initial · normalize · updateAsset) · 1건 절단 · 결과 무효화 · 의뢰인 격리 · persist 키.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useNblJudgmentStore } from "@/lib/stores/nbl-judgment-store";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import { createInitialNblJudgmentForm, normalizeNblJudgmentForm } from "@/lib/stores/nbl-judgment-form.types";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { NonBusinessLandJudgmentResponse } from "@/app/api/calc/non-business-land-judgment/route";

const FLAGS = { assetKind: "land", isNonBusinessLand: true, nblUseDetailedJudgment: true } as const;
const fakeResult = { judgment: { isNonBusinessLand: true } } as unknown as NonBusinessLandJudgmentResponse;

beforeEach(() => {
  useNblJudgmentStore.getState().reset();
  useProfessionalStore.setState({ activeClientId: null });
  sessionStorage.clear();
});

describe("[S-1] 세 플래그는 initial · normalize · updateAsset 세 곳에서 강제된다", () => {
  it("initial — 자산 1건, 토지 · 비사업용 검토 · 정밀 판정", () => {
    const f = createInitialNblJudgmentForm();
    expect(f.assets).toHaveLength(1);
    expect(f.assets[0]).toMatchObject(FLAGS);
  });

  it("normalize — 정밀 판정이 꺼진 record·housing 자산을 복원해도 켜진다", () => {
    const raw = { ...createInitialNblJudgmentForm(), assets: [{ ...makeDefaultAsset(1), assetKind: "housing", isNonBusinessLand: false, nblUseDetailedJudgment: false }] };
    expect(normalizeNblJudgmentForm(raw as never).assets[0]).toMatchObject(FLAGS);
  });

  it("updateAsset — 접기 같은 patch가 와도 정밀 판정이 꺼지지 않는다", () => {
    useNblJudgmentStore.getState().updateAsset({ nblUseDetailedJudgment: false, isNonBusinessLand: false, assetKind: "housing" });
    expect(useNblJudgmentStore.getState().formData.assets[0]).toMatchObject(FLAGS);
  });

  it("updateAsset — 다른 칸은 그대로 병합한다", () => {
    useNblJudgmentStore.getState().updateAsset({ addressJibun: "서울 강남구 테스트동 1" });
    useNblJudgmentStore.getState().updateAsset({ acquisitionArea: "1000" });
    const a = useNblJudgmentStore.getState().formData.assets[0];
    expect(a.addressJibun).toBe("서울 강남구 테스트동 1");
    expect(a.acquisitionArea).toBe("1000");
  });
});

describe("[S-2] normalize", () => {
  it("자산 2건 → 1건(첫 건만) · 3개 플래그 강제", () => {
    const raw = { ...createInitialNblJudgmentForm(), transferDate: "2024-06-01", assets: [{ ...makeDefaultAsset(1), addressJibun: "A" }, { ...makeDefaultAsset(2), addressJibun: "B" }] };
    const n = normalizeNblJudgmentForm(raw as never);
    expect(n.assets).toHaveLength(1);
    expect(n.assets[0].addressJibun).toBe("A");
    expect(n.transferDate).toBe("2024-06-01");
  });

  it("구 record(자산 필드 누락)가 migrateAsset으로 채워진다 — 위젯이 읽는 배열이 undefined가 아니다", () => {
    const old = { assetId: "a1", assetKind: "land", acquisitionDate: "2015-01-01", addressJibun: "X" };
    const n = normalizeNblJudgmentForm({ transferDate: "2024-06-01", assets: [old] } as never);
    expect(Array.isArray(n.assets[0].nblGracePeriods)).toBe(true);
    expect(n.assets[0].acquisitionDate).toBe("2015-01-01");
    expect(n.assets[0]).toMatchObject(FLAGS);
  });

  it("null·빈 값·assets 없음 → 초기 폼", () => {
    for (const raw of [null, undefined, {}, { assets: [] }]) {
      const n = normalizeNblJudgmentForm(raw as never);
      expect(n.assets).toHaveLength(1);
      expect(n.assets[0]).toMatchObject(FLAGS);
    }
  });
});

describe("[S-3] 결과 무효화 · 의뢰인 격리", () => {
  it("updateAsset·updateFormData는 같은 set에서 결과를 비운다", () => {
    const s = useNblJudgmentStore.getState();
    s.setResult(fakeResult, "c1");
    s.updateAsset({ addressJibun: "x" });
    expect(useNblJudgmentStore.getState().result).toBeNull();
    expect(useNblJudgmentStore.getState().resultClientId).toBeNull();
    s.setResult(fakeResult, "c1");
    s.updateFormData({ transferDate: "2024-06-01" });
    expect(useNblJudgmentStore.getState().result).toBeNull();
  });

  it("setResult(null)은 clientId도 비운다", () => {
    const s = useNblJudgmentStore.getState();
    s.setResult(fakeResult, "c1");
    expect(useNblJudgmentStore.getState().resultClientId).toBe("c1");
    s.setResult(null, "c1");
    expect(useNblJudgmentStore.getState().resultClientId).toBeNull();
  });

  it("의뢰인이 바뀌면 결과를 비우고 1단계로 — 입력은 유지, 결과가 없으면 단계도 그대로", () => {
    const s = useNblJudgmentStore.getState();
    s.updateAsset({ addressJibun: "keep" });
    s.setStep(2);
    useProfessionalStore.setState({ activeClientId: "c9" });
    expect(useNblJudgmentStore.getState().currentStep).toBe(2); // 결과 없음 — 입력 도중 단계 유지
    s.setResult(fakeResult, "c9");
    s.setStep(3);
    useProfessionalStore.setState({ activeClientId: "c10" });
    const after = useNblJudgmentStore.getState();
    expect(after.result).toBeNull();
    expect(after.currentStep).toBe(0);
    expect(after.formData.assets[0].addressJibun).toBe("keep");
  });
});

describe("[S-4] persist — formData만, 키 nbl-judgment-wizard", () => {
  it("partialize가 formData만 남긴다(result·step 제외)", () => {
    const s = useNblJudgmentStore.getState();
    s.updateAsset({ addressJibun: "persisted" });
    s.setResult(fakeResult, null);
    s.setStep(3);
    const raw = sessionStorage.getItem("nbl-judgment-wizard");
    expect(raw).not.toBeNull();
    const persisted = JSON.parse(raw as string).state;
    expect(Object.keys(persisted)).toEqual(["formData"]);
    expect(persisted.formData.assets[0].addressJibun).toBe("persisted");
  });

  it("reset — 초기 폼·1단계·결과 없음", () => {
    const s = useNblJudgmentStore.getState();
    s.updateAsset({ addressJibun: "x" });
    s.setStep(2);
    s.reset();
    const st = useNblJudgmentStore.getState();
    expect(st.currentStep).toBe(0);
    expect(st.formData.assets[0].addressJibun).toBe("");
  });
});
