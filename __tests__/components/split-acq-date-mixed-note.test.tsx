/**
 * anchor: 겸용주택 취득일 2열 자동 강제 시 안내 + PHD 3시점 「계산 제외」 입력 위치 명시 (A안).
 *
 * 계획서: docs/02-design/features/e2e-preexisting-failures-4.plan.md §4 Phase 2
 *
 * 🔴 D-C: 겸용주택 토글이 `hasSeperateLandAcquisitionDate`를 **강제 ON** 하면
 *   (`MixedUseSection.tsx:44-50`) 취득일이 `[토지 | 건물]` 2열이 되는데 **왜 두 칸인지 안내가 없다**.
 *   사용자가 앞 칸(토지)만 채우면 건물 취득일이 비어, PHD 3시점 모달이
 *   "취득시 (연도 미상) — 계산 제외"로 취득 시점을 통째로 빼고 환산취득가 산정이 조용히 축소된다.
 *   그 문구도 **어디를 채워야 하는지** 알려주지 않는다.
 *
 * 불변식:
 *   · 2열 렌더 조건은 **불변** — 겸용 엔진이 토지 취득일을 실제로 소비하므로
 *     (`transfer-tax-mixed-use.ts:136-139` LTHD 기산 등) 단일 칸으로 되돌리면 기능 제거가 된다
 *   · 안내는 **의도하지 않은 강제**(겸용)에만 — 사용자가 직접 켠 경우는 이미 의도 표명이라 노이즈
 *   · 단언은 **testid**로 — 문구 매칭은 재배치 때 또 깨진다(D-B가 그 사례)
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CompanionAcqDateSection } from "@/components/calc/transfer/CompanionAcqDateSection";
import {
  PhdBuildingStdPriceModalButton,
  type PointMeta,
} from "@/components/calc/building-std-price/PhdBuildingStdPriceModalButton";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { BlockProps } from "@/components/calc/transfer/CompanionAcqPurchaseBlock.types";

afterEach(cleanup);

function DateHarness({
  isMixedUse,
  isSplit = true,
}: {
  isMixedUse: boolean;
  isSplit?: boolean;
}) {
  const [asset, setAsset] = useState<AssetForm>({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-03-15",
    landAcquisitionDate: "2005-06-10",
    hasSeperateLandAcquisitionDate: isSplit,
    isMixedUseHouse: isMixedUse,
  } as AssetForm);
  const patch = (p: Partial<AssetForm>) => setAsset((a) => ({ ...a, ...p }));

  const block = {
    acquisitionDate: asset.acquisitionDate,
    onAcquisitionDateChange: (v: string) => patch({ acquisitionDate: v }),
    landAcquisitionDate: asset.landAcquisitionDate,
    onLandAcquisitionDateChange: (v: string) => patch({ landAcquisitionDate: v }),
    hasSeperateLandAcquisitionDate: asset.hasSeperateLandAcquisitionDate,
    onHasSeperateLandAcquisitionDateChange: (v: boolean) =>
      patch({ hasSeperateLandAcquisitionDate: v }),
    asset,
    onAssetChange: patch,
    transferDate: "2026-03-06",
    assetKind: asset.assetKind,
  } as unknown as BlockProps;

  return (
    <CompanionAcqDateSection
      block={block}
      isSplitable
      isSplit={isSplit}
      isMixedUse={isMixedUse}
      acqDateLabel={isSplit ? "건물 취득일" : "취득일"}
      effLandAcqMode="actual"
      effBuildingAcqMode="actual"
    />
  );
}

const mixedNote = () => screen.queryAllByTestId("split-acq-date-mixed-note");

describe("E1·E2 — 겸용 자동 강제 2열 안내 (A-1)", () => {
  it("E1 겸용주택 — 2열 유지 + 안내 노출", () => {
    render(<DateHarness isMixedUse />);
    // 렌더 조건 불변 — 2열이 사라지면 토지 취득일 입력 경로가 없어진다(B안 기각 근거)
    expect(screen.getAllByTestId("acq-date-land")).toHaveLength(1);
    expect(screen.getAllByTestId("acq-date-building")).toHaveLength(1);
    expect(mixedNote(), "왜 두 칸인지 알려주지 않으면 사용자는 한 칸만 채운다").toHaveLength(1);
    expect(mixedNote()[0].textContent).toMatch(/각각/);
  });

  it("E2 겸용 아님(사용자가 직접 켠 분리) — 안내 미노출", () => {
    render(<DateHarness isMixedUse={false} />);
    expect(screen.getAllByTestId("acq-date-land")).toHaveLength(1);
    expect(
      mixedNote(),
      "직접 켠 것은 «취득일이 다르다»는 의도 표명 — 안내는 의도하지 않은 강제에만 붙인다",
    ).toHaveLength(0);
  });

  it("E2-b 분리 OFF — 안내 미노출", () => {
    render(<DateHarness isMixedUse isSplit={false} />);
    expect(mixedNote()).toHaveLength(0);
  });
});

// ── PHD 3시점 모달 (A-2) ────────────────────────────────────────
const POINTS_NO_ACQ: PointMeta[] = [
  { key: "acquisition", label: "취득시", year: undefined, landPricePerM2: "" },
  { key: "firstDisclosure", label: "최초공시일", year: 2015, landPricePerM2: "" },
  { key: "transfer", label: "양도시", year: 2025, landPricePerM2: "" },
];
const POINTS_ALL: PointMeta[] = [
  { key: "acquisition", label: "취득시", year: 2010, landPricePerM2: "" },
  { key: "firstDisclosure", label: "최초공시일", year: 2015, landPricePerM2: "" },
  { key: "transfer", label: "양도시", year: 2025, landPricePerM2: "" },
];

function ModalHarness({ points }: { points: PointMeta[] }) {
  return <PhdBuildingStdPriceModalButton points={points} onApply={() => {}} />;
}

const excludedNote = () => screen.queryAllByTestId("phd-point-excluded-note");

describe("E3·E4 — PHD 3시점 「계산 제외」 안내 (A-2)", () => {
  it("E3 건물 취득일 미입력 → 계산 제외 안내에 **입력 위치**가 있다", () => {
    render(<ModalHarness points={POINTS_NO_ACQ} />);
    fireEvent.click(screen.getByRole("button", { name: /3시점 건물기준시가 일괄 계산/ }));

    expect(excludedNote(), "연도 미상 시점은 1개(취득)").toHaveLength(1);
    expect(
      excludedNote()[0].textContent,
      "어디를 채워야 하는지 알려주지 않으면 사용자가 결함을 해소할 수 없다",
    ).toMatch(/건물 취득일/);
  });

  it("E4 3시점 연도 모두 확정 → 계산 제외 안내 없음 (회귀 가드)", () => {
    render(<ModalHarness points={POINTS_ALL} />);
    fireEvent.click(screen.getByRole("button", { name: /3시점 건물기준시가 일괄 계산/ }));

    expect(excludedNote()).toHaveLength(0);
    expect(screen.getAllByText(/취득당시/).length, "취득 시점 행이 산출 대상에 든다").toBeGreaterThan(0);
  });
});
