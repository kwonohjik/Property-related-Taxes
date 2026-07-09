"use client";

/**
 * 마법사 통합용 "건물 기준시가 계산" 버튼 (Phase G — U-06·U-07).
 * Dialog에 BuildingStdPriceForm + 결과를 띄우고, 시점별 standardPrice를 onApply로 주입.
 * 독립 페이지와 동일 폼 재사용(DRY). 주입 후 사용자 수정 가능(기존 단일 필드 동기화 경로 사용).
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BuildingStdPriceForm } from "./BuildingStdPriceForm";
import { BuildingStdPriceResultCard } from "./BuildingStdPriceResultCard";
import type { BuildingStandardPriceResult } from "@/lib/tax-engine/building-standard-price";
import type { BuildingStdPriceFormState } from "@/lib/calc/building-std-price-form";
import type { AddressValue } from "@/components/ui/address-search";
import { useBuildingStdSnapshotStore } from "@/lib/stores/building-std-snapshot-store";

interface Props {
  /**
   * 선택한 시점의 건물 기준시가(원, 정수)를 받아 대상 필드에 주입.
   * 상증 경로 B는 부수토지 평가액(§61①1호, landStandardPrice)도 함께 전달 — 호출부가 부수토지 필드에 자동 채움.
   */
  onApply?: (standardPrice: number, landStandardPrice?: number) => void;
  /**
   * 지정 시 — result.acquisition·result.transfer가 모두 있으면 결과 카드에
   * "취득·양도 모두 적용" 단일 버튼만 노출(개별 취득/양도 버튼 숨김 → 오적용 방지).
   * 겸용주택 상가건물처럼 한 번 계산으로 두 시점 필드를 동시 채울 때 사용.
   */
  onApplyBoth?: (acquisition: number, transfer: number) => void;
  buttonLabel?: string;
  /** 호출 세목 고정 — 양도="transfer" / 상속·증여="inheritance_gift". 지정 시 세목 라디오 숨김 */
  lockedTaxType?: BuildingStdPriceFormState["taxType"];
  /** 부모 자산 카드 소재지 prefill — 모달 이중입력 방지 */
  initialAddress?: AddressValue;
  /**
   * 입력 스냅샷 저장/복원 키 — 지정 시 적용한 입력을 보관했다가 재오픈 시 복원(정정 지원).
   * 규약: 상증 `bsp-estate-${item.id}` / 양도 `bsp-${asset.assetId}-{gb|cb}-{acq|transfer}`.
   */
  snapshotKey?: string;
}

const fmt = (n: number) => n.toLocaleString("ko-KR");

export function BuildingStdPriceModalButton({
  onApply,
  onApplyBoth,
  buttonLabel = "건물 기준시가 계산",
  lockedTaxType,
  initialAddress,
  snapshotKey,
}: Props) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<BuildingStandardPriceResult | null>(null);
  const [floorArea, setFloorArea] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // 상증 경로 B 부수토지 평가액(§61①1호) — 폼이 입력한 토지면적×공시지가로 산출. 0이면 미전달.
  const [landStandardPrice, setLandStandardPrice] = useState(0);
  // 현재 폼 입력 스냅샷 — 적용 시 스토어에 보관(정정 복원용).
  const [formSnapshot, setFormSnapshot] = useState<BuildingStdPriceFormState | null>(null);
  const saveSnapshot = useBuildingStdSnapshotStore((s) => s.saveSnapshot);
  const restoredForm = useBuildingStdSnapshotStore((s) =>
    snapshotKey ? s.snapshots[snapshotKey] : undefined,
  );

  const apply = (v: number, land?: number) => {
    onApply?.(v, land && land > 0 ? land : undefined);
    if (snapshotKey && formSnapshot) saveSnapshot(snapshotKey, formSnapshot);
    setOpen(false);
    setResult(null);
    setError(null);
    setLandStandardPrice(0);
  };

  // 취득·양도 동시 적용 — 겸용 상가건물 등 한 번 계산으로 두 시점 필드를 함께 채움.
  const applyBoth = (acq: number, transfer: number) => {
    onApplyBoth?.(acq, transfer);
    if (snapshotKey && formSnapshot) saveSnapshot(snapshotKey, formSnapshot);
    setOpen(false);
    setResult(null);
    setError(null);
    setLandStandardPrice(0);
  };

  // onApplyBoth 지정 = 통합 모드 — 개별 취득/양도 버튼을 숨겨 오적용을 원천 차단.
  const bothMode = !!onApplyBoth;
  // 통합 버튼은 취득·양도 단일건물 결과가 모두 있을 때만 노출.
  const showBothButton = bothMode && !!result?.acquisition && !!result?.transfer;

  return (
    <>
      <Button type="button" variant="outline" size="xs" onClick={() => setOpen(true)}>
        {buttonLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[88vh] overflow-y-auto sm:max-w-[min(50.4rem,calc(100%-2rem))] w-full shadow-2xl"
          overlayClassName="bg-black/60"
          forceOverlay
        >
          <DialogHeader>
            <DialogTitle>건물 기준시가 계산</DialogTitle>
            <DialogDescription>
              계산 후 적용할 시점의 금액을 선택하면 입력 필드에 채워집니다.
            </DialogDescription>
          </DialogHeader>

          <BuildingStdPriceForm
            lockedTaxType={lockedTaxType}
            initialAddress={initialAddress}
            initialForm={restoredForm}
            onResult={(r, fa, err, _report, landTotal, snapshot) => {
              setResult(r);
              setFloorArea(fa);
              setError(err);
              setLandStandardPrice(landTotal);
              setFormSnapshot(snapshot);
            }}
          />

          {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          {result && (
            <div className="space-y-3 border-t pt-3">
              <BuildingStdPriceResultCard result={result} floorArea={floorArea} />
              <div className="flex flex-wrap gap-2">
                {result.valuation && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => apply(result.valuation!.standardPrice, landStandardPrice)}
                  >
                    이 금액 적용 ({fmt(result.valuation.standardPrice)})
                  </Button>
                )}
                {showBothButton && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => applyBoth(result.acquisition!.standardPrice, result.transfer!.standardPrice)}
                  >
                    취득·양도 모두 적용 (취득 {fmt(result.acquisition!.standardPrice)} / 양도 {fmt(result.transfer!.standardPrice)})
                  </Button>
                )}
                {result.acquisition && !bothMode && (
                  <Button type="button" size="sm" variant="secondary" onClick={() => apply(result.acquisition!.standardPrice)}>
                    취득시 적용 ({fmt(result.acquisition.standardPrice)})
                  </Button>
                )}
                {result.transfer && !bothMode && (
                  <Button type="button" size="sm" onClick={() => apply(result.transfer!.standardPrice)}>
                    양도시 적용 ({fmt(result.transfer.standardPrice)})
                  </Button>
                )}
                {bothMode && result && !showBothButton && (
                  <p className="text-xs text-muted-foreground">
                    취득·양도 두 시점 정보를 모두 입력해 계산하면 한 번에 적용됩니다.
                  </p>
                )}
                {/* 복합구조(상증 1시점) — compositeTotal 합계 + 부수토지 함께 적용 */}
                {result.compositeTotal != null && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => apply(result.compositeTotal!, landStandardPrice)}
                  >
                    이 금액 적용 ({fmt(result.compositeTotal)})
                  </Button>
                )}
                {/* 복합구조(양도 2시점) — 취득시 합계 적용. ≤2000은 산정기준율 환산값(convertedTotal) */}
                {result.acquisitionComposite && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      apply(
                        result.acqBaseConversion?.convertedTotal ??
                          result.acquisitionComposite!.total,
                      )
                    }
                  >
                    취득시 적용 (
                    {fmt(
                      result.acqBaseConversion?.convertedTotal ??
                        result.acquisitionComposite.total,
                    )}
                    )
                  </Button>
                )}
                {/* 복합구조(양도 2시점) — 양도시 합계 적용 */}
                {result.transferComposite && (
                  <Button type="button" size="sm" onClick={() => apply(result.transferComposite!.total)}>
                    양도시 적용 ({fmt(result.transferComposite.total)})
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
