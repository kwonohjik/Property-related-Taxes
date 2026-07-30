/**
 * Pre-Do anchor — 양도소득세 기본정보 면적 축 확대 (Phase 0)
 *
 * 목적: 「기본정보에 면적 추가 → 비사업용토지 판정·기준시가 계산 활용」 작업의 설계 전제를
 *   Do 착수 전에 실측 고정한다. 계획서 U-1~U-8·R4 해소용.
 *   설계: docs/01-plan/features/transfer-asset-area-basic-info.plan.md
 *         docs/02-design/features/transfer-asset-area-basic-info.{engine,ui}.design.md
 *   상위 정본: docs/02-design/area-taxonomy.md
 *
 * 실측으로 확정된 구조 — 자산유형마다 **전용 전체면적 필드**가 이미 존재한다:
 *   land                  → acquisitionArea / transferArea   (① 기본정보에서 입력 가능)
 *   housing(일반)          → acquisitionArea                   (PHD 섹션에서만 입력 — 갭)
 *   housing+겸용           → mixedUseTotalLandArea             (겸용 전용 섹션)
 *   commercial_building   → cbLandArea + cbExclusiveArea + cbSharedArea
 *   general_building      → gbLandArea + gbBuildingArea + gbBuildingFootprintArea
 *   redevelopment_apt     → redevLandArea
 * → 따라서 본 작업은 "필드 통합"이 아니라 "입력 위치를 ① 기본정보로 승격"이다.
 *   전용 축을 acquisitionArea로 합치면 §164⑥ 3축 산식(대지·전유·공용)이 깨진다.
 *
 * A-2·A-5는 **현행 결함을 고정하는 의도적 anchor**다. Phase 2·5에서 뒤집힌다
 *   (memory feedback_anchor_correction_legal_priority — 갱신 시 법령 정합 우선).
 */
import { describe, it, expect } from "vitest";
import { mapAssetToNblInput } from "@/lib/tax-engine/non-business-land/form-mapper";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-asset";
import { validateNblDetailedJudgment } from "@/lib/calc/transfer-tax-validate-nbl";
import { validateMixedUseAreas } from "@/lib/calc/transfer-tax-validate-mixed-area";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

// ─── 픽스처 ────────────────────────────────────────────────
function landAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-05-01",
    ...over,
  };
}

function housingPhdAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    // PHD §164⑤ 경로: 환산 모드 + usePreHousingDisclosure + 취득일 < 최초고시일
    useEstimatedAcquisition: true,
    usePreHousingDisclosure: true,
    acquisitionDate: "1990-03-01",
    phdFirstDisclosureDate: "1993-02-01",
    phdFirstDisclosureHousingPrice: "50000000",
    ...over,
  };
}

const NBL_CONTEXT = {
  acquisitionDate: new Date("2010-05-01"),
  transferDate: new Date("2026-05-01"),
  parseDate: (s: string) => (s ? new Date(s) : undefined),
  parseNumber: (s: string) => {
    const n = parseFloat((s || "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : undefined;
  },
};

// ══════════════════════════════════════════════════════════
describe("A-1 — acquisitionArea가 비사업용토지 엔진 landArea로 도달", () => {
  it("입력한 면적이 NonBusinessLandInput.landArea에 그대로 전달된다", () => {
    const asset = landAsset({
      nblUseDetailedJudgment: true,
      nblLandType: "farmland",
      nblZoneType: "undesignated",
      acquisitionArea: "1234.56",
      transferArea: "1234.56",
    });

    const input = mapAssetToNblInput(asset as unknown as Record<string, unknown>, NBL_CONTEXT);

    expect(input).not.toBeNull();
    expect(input!.landArea).toBe(1234.56);
  });

  it("면적 미입력 시 landArea=0으로 판정에 진입한다 (form-mapper.ts:70 `?? 0`)", () => {
    const asset = landAsset({
      nblUseDetailedJudgment: true,
      nblLandType: "farmland",
      nblZoneType: "undesignated",
      acquisitionArea: "",
    });

    const input = mapAssetToNblInput(asset as unknown as Record<string, unknown>, NBL_CONTEXT);

    // 0 도달 자체는 현행 동작 — validate가 앞단에서 차단하는 것이 안전망(A-6 참조).
    expect(input!.landArea).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════
describe("A-2 [의도적 결함 고정] — housing PHD가 요구하는 면적의 안내 위치 불일치", () => {
  it("PHD 경로는 acquisitionArea를 필수로 요구한다", () => {
    const err = validateAssetAcquisition(
      housingPhdAsset({ acquisitionArea: "" }),
      "자산1",
      "2026-05-01",
    );
    expect(err).toContain("토지 면적");
  });

  it("오류 메시지가 「자산 기본 정보」를 가리킨다 — 그러나 현행 기본정보 면적 섹션은 land 전용", () => {
    const err = validateAssetAcquisition(
      housingPhdAsset({ acquisitionArea: "" }),
      "자산1",
      "2026-05-01",
    );
    // AssetSectionBasic.tsx:298 게이트가 assetKind==="land"이므로 housing에는 그 칸이 없다.
    // Phase 2(게이트 해제) 후 이 메시지가 사실이 된다 — 그때 이 anchor는 유지되고,
    // 대신 RTL 게이트 anchor(asset-section-basic-area-gate)가 뒤집힌다.
    expect(err).toContain("자산 기본 정보");
  });

  it("면적을 채우면 PHD 면적 검증을 통과해 다음 필수 항목으로 진행한다", () => {
    const err = validateAssetAcquisition(
      housingPhdAsset({ acquisitionArea: "150", transferArea: "150" }),
      "자산1",
      "2026-05-01",
    );
    // 면적 검증은 통과 → 후속 PHD 필드(취득시 단위공시지가) 요구로 넘어간다.
    expect(err).not.toContain("토지 면적");
    expect(err).toContain("공시지가");
  });
});

// ══════════════════════════════════════════════════════════
describe("A-3 — 겸용주택 면적 축은 acquisitionArea와 독립 (mixedUseTotalLandArea)", () => {
  it("겸용 면적 검증은 mixedUseTotalLandArea를 요구한다", () => {
    const asset = {
      ...makeDefaultAsset(1),
      assetKind: "housing" as const,
      isMixedUseHouse: true,
      mixedUseTotalLandArea: "",
      residentialExclusiveArea: "60",
      commercialExclusiveArea: "40",
    } as AssetForm;

    const err = validateMixedUseAreas(asset, "자산1");
    expect(err).not.toBeNull();
  });

  it("acquisitionArea가 비어 있어도 겸용 면적 검증은 그것을 요구하지 않는다", () => {
    const asset = {
      ...makeDefaultAsset(1),
      assetKind: "housing" as const,
      isMixedUseHouse: true,
      mixedUseTotalLandArea: "200",
      residentialExclusiveArea: "60",
      commercialExclusiveArea: "40",
      commonArea: "20",
      residentialFloorArea: "60",
      nonResidentialFloorArea: "40",
      acquisitionArea: "", // ← 비어 있음
    } as AssetForm;

    const err = validateMixedUseAreas(asset, "자산1");
    // 겸용은 전용 축(mixedUseTotalLandArea)으로 자기완결 → acquisitionArea 미요구.
    // 설계 결론: 겸용 "전체 면적"은 신규 필드가 아니라 mixedUseTotalLandArea가 이미 담당.
    if (err !== null) expect(err).not.toContain("취득 당시 면적");
  });
});

// ══════════════════════════════════════════════════════════
describe("A-4 [R4 해소] — NBL 면적 검증은 land 전용이므로 현행 버그 아님", () => {
  it("assetKind !== 'land' 이면 NBL 상세판정 검증을 건너뛴다", () => {
    const asset = {
      ...makeDefaultAsset(1),
      assetKind: "housing" as const,
      nblUseDetailedJudgment: true,
      acquisitionArea: "",
    } as AssetForm;

    // validate-nbl.ts:25 — assetKind 게이트에서 즉시 null
    expect(validateNblDetailedJudgment(asset, "자산1", "2026-05-01")).toBeNull();
  });

  it("land + 상세판정에서는 면적을 요구한다 (기본정보에 입력 칸이 존재 → 안내↔위치 일치)", () => {
    const asset = landAsset({
      nblUseDetailedJudgment: true,
      nblLandType: "farmland",
      nblZoneType: "undesignated",
      acquisitionArea: "",
    });

    const err = validateNblDetailedJudgment(asset, "자산1", "2026-05-01");
    expect(err).toContain("토지 면적");
  });
});

// ══════════════════════════════════════════════════════════
describe("A-5 [Phase 5 뒤집힘] — 면적 안내 위치가 ① 기본정보로 통일", () => {
  it("증환지(increase)는 acquisitionArea를 「① 기본정보」에서 입력하라고 안내한다", () => {
    const asset = landAsset({
      areaScenario: "increase",
      replottingConfirmDate: "2015-03-01",
      acquisitionArea: "",
    });

    const err = validateAssetAcquisition(asset, "자산1", "2026-05-01");
    // Phase 5 정정: "③ 취득정보" → "① 기본정보".
    // 면적 섹션의 실제 위치는 AssetSectionBasic(① 기본정보)이며 PHD 경로 메시지와도 일치한다.
    expect(err).toContain("① 기본정보");
    expect(err).not.toContain("③ 취득정보");
  });

  it("PHD 경로 메시지도 동일하게 자산 기본 정보를 가리킨다 (드리프트 해소)", () => {
    const err = validateAssetAcquisition(
      housingPhdAsset({ acquisitionArea: "" }),
      "자산1",
      "2026-05-01",
    );
    expect(err).toContain("자산 기본 정보");
  });
});

// ══════════════════════════════════════════════════════════
describe("A-6 [Phase 5 뒤집힘] — 자산-수준 partial 불변식 (taxonomy §4.1)", () => {
  // Phase 0 실측(throwaway probe): land + purchase + 취득가액 입력 상태에서
  //   same/partial × (100/150, 150/100, 빈/빈, 100/100) 8조합 전부 null(통과) → 불변식 부재.
  // Phase 5에서 partial 불변식만 추가. 미입력 필수화는 하지 않는다(과도 차단 금지).
  const withPrice = (over: Partial<AssetForm>) =>
    landAsset({ fixedAcquisitionPrice: "300000000", ...over });

  it("partial에서 취득면적 < 양도면적이면 차단된다", () => {
    const err = validateAssetAcquisition(
      withPrice({ areaScenario: "partial", acquisitionArea: "100", transferArea: "150" }),
      "자산1",
      "2026-05-01",
    );
    expect(err).toContain("취득 당시 면적은 양도 당시 면적 이상");
    expect(err).toContain("① 기본정보");
  });

  it("partial에서 취득면적 ≥ 양도면적이면 통과한다", () => {
    for (const [acq, tr] of [["150", "100"], ["100", "100"]]) {
      const err = validateAssetAcquisition(
        withPrice({ areaScenario: "partial", acquisitionArea: acq, transferArea: tr }),
        "자산1",
        "2026-05-01",
      );
      expect(err).toBeNull();
    }
  });

  it("partial 불변식은 housing에도 적용된다 (면적 섹션 노출 자산유형 공통)", () => {
    const err = validateAssetAcquisition(
      {
        ...makeDefaultAsset(1),
        assetKind: "housing",
        acquisitionCause: "purchase",
        acquisitionDate: "2010-05-01",
        fixedAcquisitionPrice: "300000000",
        areaScenario: "partial",
        acquisitionArea: "80",
        transferArea: "120",
      } as AssetForm,
      "자산1",
      "2026-05-01",
    );
    expect(err).toContain("취득 당시 면적은 양도 당시 면적 이상");
  });

  it("면적 한쪽만 입력된 중간 상태는 차단하지 않는다 (입력 중 방해 금지)", () => {
    for (const over of [
      { acquisitionArea: "100", transferArea: "" },
      { acquisitionArea: "", transferArea: "150" },
      { acquisitionArea: "", transferArea: "" },
    ]) {
      const err = validateAssetAcquisition(
        withPrice({ areaScenario: "partial", ...over }),
        "자산1",
        "2026-05-01",
      );
      expect(err).toBeNull();
    }
  });

  it("실지거래가 모드 same에서 면적 미입력은 통과한다 (면적 미소비 경로)", () => {
    const err = validateAssetAcquisition(
      withPrice({ areaScenario: "same", acquisitionArea: "", transferArea: "" }),
      "자산1",
      "2026-05-01",
    );
    // 면적을 쓰지 않는 경로에서 필수화하면 과도 차단 — 소비 경로(NBL·PHD·환산·Pre1990)에서만 요구.
    expect(err).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════
describe("U-7 — 면적 필드 초기값 (makeDefaultAsset)", () => {
  it("areaScenario 기본값은 'same', 면적 2필드는 빈 문자열", () => {
    const a = makeDefaultAsset(1);
    expect(a.areaScenario).toBe("same");
    expect(a.acquisitionArea).toBe("");
    expect(a.transferArea).toBe("");
  });
});
