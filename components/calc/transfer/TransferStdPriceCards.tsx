"use client";

/**
 * 양도시 기준시가 입력 필드 — 축 A(양도가액 결정)와 축 B(파트별 취득가액) **공용**.
 *
 * `LandBuildingSaleSplitSection`에서 분리(2026-07-30). 같은 필드를 두 위치에서 렌더하되
 * **복제하지 않는다** — 폼 필드가 하나이므로 어디서 입력하든 자동 동기화된다
 * (memory `feedback_ui_engine_dual_truth_avoidance`).
 *
 * 배치 규칙은 `saleStdPlacement`(lib/calc/transfer-tax-split-acq-mode.ts) 단일 소스:
 *   · 일괄양도 → 축 A 한 카드(토지+건물) — 양도가액 안분 비율은 양도가액 축의 값이다
 *   · 구분양도 + 파트 환산 → 그 파트 섹션에 개별 카드 — 환산 분모는 파트의 값이다
 *
 * 계획서: docs/02-design/features/transfer-split-std-price-colocation.plan.md §5.2
 */

import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { BuildingStdPriceModalButton } from "@/components/calc/building-std-price/BuildingStdPriceModalButton";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

interface FieldProps {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
}

/**
 * 양도시 **토지** 기준시가 — `㎡당 개별공시지가 × 면적`(§99①1호 **가목**).
 *
 * ⚠️ 주택(라목)이라도 **양도시 축에서는 역산(`결합 총액 − 토지분`)을 쓰지 않는다.**
 * 취득시 축의 역산은 개산공제 합계를 법정액(§163⑥2호가목)에 맞추기 위한 것이고,
 * 양도시 축은 양도대가를 파트로 나누는 것이라 목적이 다르다 — 부가가치세법 시행령 §64①1호가
 * 정한 대로 **각 파트의 고유 기준시가**를 쓴다. 취득시 규칙을 양도시로 옮기면 안 된다.
 *
 * 기준일은 **양도일**이다 — 취득일이 아니다(§164③ 직전 고시분).
 */
export function TransferLandStdFields({ asset, onChange, transferDate }: FieldProps) {
  /**
   * 단가·면적 → 토지분 총액 기록.
   * 다중 키를 **단일 배치 onChange**로 처리 — 분리 호출 시 stale spread 덮어쓰기가 발생한다
   * (feedback_multikey_patch_stale_spread_overwrite).
   */
  function writeLandStd(perSqm: string, area: string) {
    const patch: Partial<AssetForm> = {
      standardPricePerSqmAtTransfer: perSqm,
      transferArea: area,
    };
    const p = parseAmount(perSqm);
    const a = parseFloat((area || "").replace(/,/g, "")) || 0;
    if (p > 0 && a > 0) {
      // StandardPriceInput·LandPriceLookupField와 동일 절사
      patch.landStandardPriceAtTransfer = String(Math.floor(p * a));
    }
    onChange(patch);
  }

  return (
    <>
      <LandPriceLookupField
        label="양도시 토지 공시지가"
        pricePerSqm={asset.standardPricePerSqmAtTransfer}
        onPricePerSqmChange={(v) => writeLandStd(v, asset.transferArea)}
        area={parseDecimal(asset.transferArea) || undefined}
        onAreaChange={(v) => writeLandStd(asset.standardPricePerSqmAtTransfer, v)}
        referenceDate={transferDate}
        jibun={asset.addressJibun}
        hint="양도일 직전 고시 개별공시지가 (원/㎡) — 취득일이 아니다 (소득령 §164③)"
        landStdPriceTestId="split-land-std-transfer"
        pricePerSqmTestId="split-land-std-transfer-persqm"
      />
      <FieldCard label="토지 면적 (양도 당시)" unit="㎡" hint="양도시 토지 기준시가 = ㎡당 공시지가 × 이 면적">
        <DecimalInput
          value={asset.transferArea}
          onChange={(v) => writeLandStd(asset.standardPricePerSqmAtTransfer, v)}
          data-testid="split-land-std-transfer-area"
        />
      </FieldCard>
    </>
  );
}

/**
 * 양도시 **건물** 기준시가 — 국세청장 산정액(§99①1호 **나목**).
 *
 * 계산기 결과를 덮어쓸 수 있어야 하므로 편집 가능 입력 칸을 유지한다.
 * (반면 토지분(가목)은 `개별공시지가 × 면적`이 정의 그 자체라 별도 고시 총액이 없어
 * 수동 입력 칸을 두지 않는다 — 위 「토지기준시가」 자동 표시가 최종값.)
 *
 * 주택·일반건물 **모두** 계산기 경로로 산정한다(라목 역산 금지 — 위 주석 참조).
 */
export function TransferBuildingStdFields({
  asset,
  onChange,
  transferDate,
  placement,
}: FieldProps & {
  /** hint 문안 분기 — 축 A는 안분 분모를 겸하지만, 파트 배치에서는 환산 분모 전용이다 */
  placement: "saleAxis" | "part";
}) {
  return (
    <FieldCard
      label="양도시 건물 기준시가"
      unit="원"
      hint={
        placement === "saleAxis"
          ? "안분 분모 겸 환산취득가 분모 — 계산기로 산정 (§99①1호 나목)"
          : "환산취득가 분모 — 계산기로 산정 (§99①1호 나목). 위치지수·부속토지 값은 계산기 안에서 입력합니다"
      }
    >
      <div className="space-y-1.5">
        <CurrencyInput
          label=""
          hideUnit
          value={asset.buildingStandardPriceAtTransfer ?? ""}
          onChange={(v) => onChange({ buildingStandardPriceAtTransfer: v })}
          data-testid="split-building-std-transfer"
        />
        <div className="flex justify-end">
          <BuildingStdPriceModalButton
            lockedTaxType="transfer"
            buttonLabel="양도시 건물 기준시가 계산"
            initialAddress={{
              road: asset.addressRoad,
              jibun: asset.addressJibun,
              building: asset.buildingName,
              detail: asset.addressDetail,
              lng: asset.longitude,
              lat: asset.latitude,
              pnu: asset.addressPnu,
              dong: asset.addressDong || undefined,
              ho: asset.addressHo || undefined,
            }}
            // 「건물 기준시가 계산서」 서식 출력의 스냅샷 소스 — 키가 없으면 서식이 비어 출력된다.
            snapshotKey={`bsp-${asset.assetId}-split-transfer`}
            applyTimePoint="transfer"
            prefill={{
              landAreaM2: asset.transferArea,
              // 축 B — 기본정보 「건물 연면적」이 정본. 시점별 모달에 같은 값을 주입해
              // 3시점 불일치를 차단한다(GB·상가 선례, anchor A-3).
              floorArea: asset.buildingFloorArea || undefined,
              acquisitionDate: asset.acquisitionDate,
              transferDate,
              transferLandPricePerSqm: asset.standardPricePerSqmAtTransfer,
            }}
            onApply={(v: number) => onChange({ buildingStandardPriceAtTransfer: String(v) })}
          />
        </div>
      </div>
    </FieldCard>
  );
}

/** 축 A(일괄양도) 래퍼 — 토지·건물을 한 카드에. 안분 비율은 두 값이 함께 있어야 성립한다. */
export function TransferStdPriceCard(props: FieldProps) {
  return (
    <div data-testid="split-sale-std-card">
      <ToneCard tone="emerald" title="양도시 기준시가 (§99①1호 가목·나목)" noDark>
        <TransferLandStdFields {...props} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 items-start">
          <TransferBuildingStdFields {...props} placement="saleAxis" />
        </div>
      </ToneCard>
    </div>
  );
}

/** 축 B 파트 섹션용 카드 — 토지분(가목). */
export function TransferLandStdPartCard(props: FieldProps) {
  return (
    <div data-testid="split-land-std-transfer-card">
      <ToneCard tone="emerald" title="토지 양도시 기준시가 (§99①1호 가목)" noDark>
        <TransferLandStdFields {...props} />
      </ToneCard>
    </div>
  );
}

/** 축 B 파트 섹션용 카드 — 건물분(나목). */
export function TransferBuildingStdPartCard(props: FieldProps) {
  return (
    <div data-testid="split-building-std-transfer-card">
      <ToneCard tone="emerald" title="건물 양도시 기준시가 (§99①1호 나목)" noDark>
        <TransferBuildingStdFields {...props} placement="part" />
      </ToneCard>
    </div>
  );
}
