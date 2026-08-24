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
import { deriveYearFromEventDate } from "@/lib/calc/building-std-price-form";
import type { BuildingStdPriceFormState } from "@/lib/calc/building-std-price-form";
import type { AddressValue } from "@/components/ui/address-search";
import { useBuildingStdSnapshotStore } from "@/lib/stores/building-std-snapshot-store";
import { pickAcqLocationIndexLandPrice } from "@/lib/calc/phd-acq-land-price-track";

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
  /**
   * 이 모달이 특정 시점 필드에만 연결될 때 지정 — 해당 시점의 적용 버튼만 노출(반대 시점 버튼 숨김).
   * "acquisition" → "취득시 적용"만, "transfer" → "양도시 적용"만. 오적용(반대 필드 덮어쓰기) 방지.
   * 단일 시점만 필요한 자산(일반건물 실가 모드의 양도시 등)에도 안전. onApplyBoth 미지정 시 사용.
   */
  applyTimePoint?: "acquisition" | "transfer";
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
  /**
   * 상위 자산 폼 값 자동입력(prefill) — 지정 시 모달 필드 초기값을 채운다.
   * 상위 폼 값이 있으면 항상 snapshot 복원값보다 우선(빈 값은 미주입 — 사용자 이전 입력 보존).
   * 연도는 날짜에서 deriveYearFromEventDate로 파생(완성형 YYYY-MM-DD만 반환).
   */
  prefill?: {
    floorArea?: string;
    landAreaM2?: string;
    acquisitionDate?: string;
    transferDate?: string;
    /**
     * 취득당시 연도 기준 ㎡당 개별공시지가 — **취득 ≥2001에서만** 주입.
     * 취득 ≤2000의 모달 칸은 2001.1.1 기준이라 이 값(토지값 트랙)을 넣으면 위치지수 오산이다(§164⑤).
     */
    acqLandPricePerSqm?: string;
    /** 2001.1.1 현재 ㎡당 개별공시지가(위치지수 트랙) — **취득 ≤2000에서만** 주입. */
    acqLandPricePerSqm2001?: string;
    /** 양도당시 ㎡당 개별공시지가 — 트랙 구분 없음(같은 필지·같은 시점). */
    transferLandPricePerSqm?: string;
    /**
     * 상속·증여(1시점) 모드의 ㎡당 개별공시지가 — 평가기준일 당시 값.
     *
     * 양도 트랙(`acqLandPricePerSqm`·`transferLandPricePerSqm`)과 **폼 필드가 다르다**
     * (`valLandPrice`). 값이 없으면 모달의 `LandPriceLookupField`로 사용자가 조회·입력한다 —
     * 이 prefill은 그 수고를 없앨 뿐 유일 입력 경로가 아니다.
     *
     * ⚠️ `lockedTaxType="inheritance_gift"` 호출부에서만 의미가 있다. 양도 모드에서 넘기면
     *    폼에 그 값이 앉지만 계산에 쓰이지 않는다(상증 섹션이 렌더되지 않으므로).
     */
    valuationLandPricePerSqm?: string;
  };
  /**
   * 둘째 시점 라벨 override(기본 "양도 시점"). PHD 감면처럼 "취득시 + 최초고시시" 2시점을
   * 한 번에 계산할 때 "최초고시 시점"으로 표시(복합·공동주택 환산 토글 숨김). onApplyBoth와 함께 사용.
   */
  transferSectionLabel?: string;
  /**
   * 모달 안의 「건물 연면적」 **입력 칸을 숨긴다** — 상위 자산 폼(① 기본정보 면적·규모)이
   * 연면적의 단일 입력 자리인 호출부 전용(GB·CB). `prefill.floorArea`가 그 값을 실어 나른다.
   *
   * ⛔ 상위에 연면적 필드가 없는 호출부(상속·증여·PHD 등)에는 켜지 말 것 — 모달이 유일한
   *    입력 경로라 dead-end가 된다. 값이 비면 칸 대신 입력 위치 안내가 뜬다(연면적 0 오산 방지).
   */
  hideFloorAreaInput?: boolean;
}

const fmt = (n: number) => n.toLocaleString("ko-KR");

export function BuildingStdPriceModalButton({
  onApply,
  onApplyBoth,
  applyTimePoint,
  buttonLabel = "건물 기준시가 계산",
  lockedTaxType,
  initialAddress,
  snapshotKey,
  prefill,
  transferSectionLabel,
  hideFloorAreaInput,
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

  // 상위 자산 폼 값 자동입력 — 빈 값은 미주입(사용자 이전 입력 보존). 연도는 완성형 날짜에서만 파생.
  const acqYear = prefill?.acquisitionDate ? deriveYearFromEventDate(prefill.acquisitionDate) : "";
  const transYear = prefill?.transferDate ? deriveYearFromEventDate(prefill.transferDate) : "";
  // 취득 공시지가는 트랙이 갈린다(§164⑤) — 게이트를 여기 단일 관리해 호출부 복제(dual-truth)를 막는다.
  // 취득일 미입력(acqYear="")이면 취득당시 트랙으로 주입되지만, 사용자가 모달에서 ≤2000 연도를 고르는 순간
  // BuildingStdPriceForm의 경계 가드(changeYearWithGuard)가 acqLandPrice를 초기화한다.
  const acqLandPrice = pickAcqLocationIndexLandPrice(
    acqYear ? parseInt(acqYear, 10) : undefined,
    prefill?.acqLandPricePerSqm,
    prefill?.acqLandPricePerSqm2001,
  );
  // 단일 시점 모드 — applyTimePoint가 지정된 호출부는 그 시점 필드에만 값을 주입하므로
  // 반대 시점 입력을 요구하지 않는다. onApplyBoth(2시점 동시 적용)·미지정(시점 자유)은 종전 2시점.
  // ⚠️ 폼 **상태**로 넘겨야 스냅샷 재계산(계산서 서식·PDF)에서 모드가 복원된다.
  const singleTimePoint = onApplyBoth ? undefined : applyTimePoint;
  const prefillForm: Partial<BuildingStdPriceFormState> = {
    // prefill 유무와 무관하게 주입 — 모드는 자동입력값이 아니라 호출부 계약이다
    ...(singleTimePoint ? { singleTimePoint } : {}),
    ...(prefill
    ? {
        ...(prefill.floorArea ? { floorArea: prefill.floorArea } : {}),
        ...(prefill.landAreaM2 ? { landAreaM2: prefill.landAreaM2 } : {}),
        ...(acqLandPrice ? { acqLandPrice } : {}),
        ...(prefill.transferLandPricePerSqm ? { transLandPrice: prefill.transferLandPricePerSqm } : {}),
        // 상증 1시점 트랙 — 양도 트랙과 폼 필드가 다르다(valLandPrice). 빈 값은 미주입.
        ...(prefill.valuationLandPricePerSqm ? { valLandPrice: prefill.valuationLandPricePerSqm } : {}),
        ...(prefill.acquisitionDate
          ? {
              acquisitionEventDate: prefill.acquisitionDate,
              ...(acqYear ? { acquisitionYear: acqYear } : {}),
            }
          : {}),
        ...(prefill.transferDate
          ? { eventDate: prefill.transferDate, ...(transYear ? { transferYear: transYear } : {}) }
          : {}),
      }
    : {}),
  };

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
      <Button type="button" variant="modalLauncher" size="xs" onClick={() => setOpen(true)}>
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
            transferSectionLabel={transferSectionLabel}
            hideFloorAreaInput={hideFloorAreaInput}
            initialAddress={initialAddress}
            /**
             * 🔴 **세목이 어긋나는 복원분만** 버린다 — 호출부 prefill은 항상 살린다.
             *
             * `restoredForm`만 `taxType`을 갖는다(`prefillForm`은 갖지 않는다). 필터를
             * 병합 결과에 걸면 **호출부가 넘긴 prefill까지 함께 사라져** 모달이 통째로 빈다
             * (재개발 호출부 기준 `landAreaM2`·`acquisitionDate`·`transferDate`·공시지가 2종).
             * `singleTimePoint`도 함께 날아가는데, 그건 자동입력값이 아니라 **호출부 계약**이라
             * 사라지면 `applyTimePoint` 런처가 조용히 2시점 모드로 되돌아간다.
             * (2026-08-24 코드 리뷰 Medium — 세목 불일치 가드를 넣으면서 생긴 결함.)
             */
            initialForm={{
              ...(lockedTaxType && restoredForm?.taxType && restoredForm.taxType !== lockedTaxType
                ? {}
                : restoredForm),
              ...prefillForm,
            }}
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
              <BuildingStdPriceResultCard
                result={result}
                floorArea={floorArea}
                transferSectionLabel={transferSectionLabel}
              />
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
                    취득·{transferSectionLabel ? transferSectionLabel.replace(/\s*시점$/, "") : "양도"} 모두 적용 (취득 {fmt(result.acquisition!.standardPrice)} / {transferSectionLabel ? transferSectionLabel.replace(/\s*시점$/, "") : "양도"} {fmt(result.transfer!.standardPrice)})
                  </Button>
                )}
                {result.acquisition && !bothMode && applyTimePoint !== "transfer" && (
                  <Button type="button" size="sm" variant="secondary" onClick={() => apply(result.acquisition!.standardPrice)}>
                    취득시 적용 ({fmt(result.acquisition.standardPrice)})
                  </Button>
                )}
                {result.transfer && !bothMode && applyTimePoint !== "acquisition" && (
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
