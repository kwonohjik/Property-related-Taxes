/**
 * anchor: 대장 재대조 보류 14건 2차 판정 — **⑧ 검증 축**(#6·#15).
 *
 * 둘 다 「형제는 이미 그렇게 하는데 여기만 안 한다」 유형이다.
 */
import { describe, it, expect } from "vitest";
import { validateNblDetailedJudgment } from "@/lib/calc/transfer-tax-validate-nbl";
import { validateStep2Reductions } from "@/lib/calc/transfer-tax-validate-reductions";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import {
  createDefaultTransferFormData,
} from "@/lib/stores/calc-wizard-store";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

/* ── #15 NBL 소재지 자동 연동을 ⑧도 본다 ─────────────────────── */

function urbanFarmland(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionDate: "2010-06-01",
    acquisitionArea: "500",
    nblUseDetailedJudgment: true,
    nblLandType: "farmland",
    // 도시지역 주거 — §104조의3①1호나목 읍·면 제외 판정이 필요한 구간
    nblZoneType: "general_residential",
    // NBL 전용 칸은 **비워 둔다**(자동 연동 상태). 양도 물건 소재지만 있다.
    nblLandSigunguCode: "",
    // 「동 / 읍·면」 미해석 코드 — 일반구가 있는 시라 행정구역 단위 선택이 필요하다.
    acquisitionSigunguCode: "4113000000",
    ...over,
  } as AssetForm;
}

describe("#15 — ⑧이 ④·⑤와 같은 소재지 fallback을 본다", () => {
  it("🔑 A-1: NBL 전용 칸이 비어도 자동 연동 코드로 「동/읍·면」 선택을 요구한다", () => {
    const msg = validateNblDetailedJudgment(urbanFarmland(), "토지", "2025-05-01") ?? "";
    expect(msg).toContain("행정구역 단위");
  });

  it("A-2: 양도 물건 소재지도 없으면 요구하지 않는다 — 과차단이 아니다", () => {
    const msg = validateNblDetailedJudgment(
      urbanFarmland({ acquisitionSigunguCode: "" }),
      "토지",
      "2025-05-01",
    );
    expect(msg ?? "").not.toContain("행정구역 단위");
  });
});

/* ── #6 공실 구간의 빈 «날짜» ────────────────────────────────── */

function rentalAsset(vacancyPeriods: { startDate: string; endDate: string }[]): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionDate: "2015-02-10",
    reductions: [
      {
        type: "rental_97_3",
        registrationDate: "2020-01-01",
        rentalStartDate: "2020-01-01",
        hasRentIncreaseViolation: false,
        hasVacancyOverGrace: true,
        vacancyPeriods,
      },
    ],
  } as unknown as AssetForm;
}

const runReductions = (vacancyPeriods: { startDate: string; endDate: string }[]): string => {
  const form = {
    ...createDefaultTransferFormData(),
    transferDate: "2025-05-01",
    assets: [rentalAsset(vacancyPeriods)],
  } as unknown as TransferFormData;
  return validateStep2Reductions(2, form)?.message ?? "";
};

describe("#6 — 공실 구간도 시작일·종료일을 요구한다", () => {
  it("🔑 B-1: 구간을 열어 놓고 날짜를 비우면 차단한다 (종전에는 개수만 봤다)", () => {
    expect(runReductions([{ startDate: "", endDate: "" }])).toContain("공실 구간의 시작일·종료일");
  });

  it("B-2: 한쪽만 비어도 차단한다", () => {
    expect(runReductions([{ startDate: "2021-01-01", endDate: "" }])).toContain(
      "공실 구간의 시작일·종료일",
    );
  });

  it("B-3: 둘 다 채우면 이 사유로는 막지 않는다", () => {
    expect(runReductions([{ startDate: "2021-01-01", endDate: "2021-09-01" }])).not.toContain(
      "공실 구간의 시작일·종료일",
    );
  });
});
