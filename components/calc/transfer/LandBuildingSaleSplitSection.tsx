"use client";

/**
 * 축 A — 이 자산의 토지·건물 **양도가액** 결정 섹션 (소득세법 시행령 §166⑥)
 *
 * `LandBuildingSplitSection`(축 B — 취득가액 파트별)에서 분리(2026-07-29).
 *
 * **분리 이유**: 축 B는 자산 전체의 「취득가액 산정 방식」(실거래가/환산/감정/매매사례)이
 * 파트별 입력 칸의 노출을 결정하므로 그 뒤에 와야 한다(`CompanionAcqPurchaseBlock.tsx:711` 근거,
 * 2026-07-16). 반면 축 A는 그 의존이 없고, 확정 계산 규칙 순서가
 * **① 양도가액 구분 → ② 취득가액 산정**(2026-07-29 사용자 확정)이므로 축 B보다 **앞**에 온다.
 * 종전에는 한 컴포넌트라 축 A가 축 B 뒤에 밀려 역순이었다.
 *
 * 계획서: docs/02-design/features/transfer-split-input-flow-reorder.plan.md
 */

import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup, type RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { BuildingStdPriceModalButton } from "@/components/calc/building-std-price/BuildingStdPriceModalButton";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { PartAcqMode } from "@/lib/calc/transfer-tax-split-acq-mode";

const SALE_MODE_OPTIONS: RadioCardOption<"actual" | "apportioned">[] = [
  { value: "actual", label: "구분양도 (직접입력)" },
  { value: "apportioned", label: "일괄양도 (양도시 기준시가 안분)" },
];

interface Props {
  /** 부담부증여(§159 자동 산정) — 양도가액을 직접 입력하지 않는다(안내만 표시) */
  isBurdenedGift?: boolean;

  saleSplitMode: "actual" | "apportioned";
  onSaleSplitModeChange: (v: "actual" | "apportioned") => void;

  landTransferPrice: string;
  onLandTransferPriceChange: (v: string) => void;
  buildingTransferPrice: string;
  onBuildingTransferPriceChange: (v: string) => void;
  buildingStandardPriceAtTransfer: string;
  onBuildingStandardPriceAtTransferChange: (v: string) => void;

  /** 양도시 기준시가는 **환산 분모**로도 쓰인다 — 파트가 환산이면 구분양도여도 필요 */
  landAcqMode: PartAcqMode;
  buildingAcqMode: PartAcqMode;

  asset?: AssetForm;
  onAssetChange?: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
}

/**
 * 양도시 **토지** 기준시가 자동 계산 — `㎡당 개별공시지가 × 면적`(§99①1호 **가목**).
 *
 * ⚠️ 주택(라목)이라도 **양도시 축에서는 역산(`결합 총액 − 토지분`)을 쓰지 않는다.**
 * 취득시 축의 역산은 개산공제 합계를 법정액(§163⑥2호가목)에 맞추기 위한 것이고,
 * 양도시 축은 양도대가를 파트로 나누는 것이라 목적이 다르다 — 부가가치세법 시행령 §64①1호가
 * 정한 대로 **각 파트의 고유 기준시가**를 쓴다. 취득시 규칙을 양도시로 옮기면 안 된다.
 *
 * 기준일은 **양도일**이다 — 취득일이 아니다(§164③ 직전 고시분).
 * 자동 계산 후에도 아래 총액 2칸은 수동 편집 가능하다(홈택스 실제 고시액 우선).
 */
function TransferStdPriceCard(props: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
  buildingStandardPriceAtTransfer: string;
  onBuildingStandardPriceAtTransferChange: (v: string) => void;
}) {
  const { asset, onChange, transferDate } = props;

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
    <ToneCard tone="emerald" title="양도시 기준시가 (§99①1호 가목·나목)" noDark>
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
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 items-start">
        <FieldCard label="토지 면적 (양도 당시)" unit="㎡" hint="양도시 토지 기준시가 = ㎡당 공시지가 × 이 면적">
          <DecimalInput
            value={asset.transferArea}
            onChange={(v) => writeLandStd(asset.standardPricePerSqmAtTransfer, v)}
            data-testid="split-land-std-transfer-area"
          />
        </FieldCard>
        {/* 건물분(나목)은 국세청장 산정액이라 계산기 결과를 덮어쓸 수 있어야 한다 — 편집 가능 유지.
            반면 토지분(가목)은 `개별공시지가 × 면적`이 정의 그 자체라 별도 고시 총액이 없어
            수동 입력 칸을 두지 않는다(위 「토지기준시가」 자동 표시가 최종값). */}
        <FieldCard label="양도시 건물 기준시가" unit="원" hint="안분 분모 겸 환산취득가 분모 — 계산기로 산정 (§99①1호 나목)">
          <div className="space-y-1.5">
            <CurrencyInput
              label=""
              hideUnit
              value={props.buildingStandardPriceAtTransfer}
              onChange={props.onBuildingStandardPriceAtTransferChange}
              data-testid="split-building-std-transfer"
            />
            <TransferBuildingStdPriceButton
              asset={asset}
              onChange={onChange}
              transferDate={transferDate}
            />
          </div>
        </FieldCard>
      </div>
    </ToneCard>
  );
}

/**
 * 양도시 건물 기준시가 —「건물 기준시가 계산서」 모달 런처 (§99①1호 나목).
 * 주택·일반건물 **모두** 이 경로로 산정한다(라목 역산 금지 — 위 주석 참조).
 */
function TransferBuildingStdPriceButton(props: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
}) {
  const { asset, onChange, transferDate } = props;
  return (
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
        }}
        // 「건물 기준시가 계산서」 서식 출력의 스냅샷 소스 — 키가 없으면 서식이 비어 출력된다.
        snapshotKey={`bsp-${asset.assetId}-split-transfer`}
        applyTimePoint="transfer"
        prefill={{
          landAreaM2: asset.transferArea,
          acquisitionDate: asset.acquisitionDate,
          transferDate,
          transferLandPricePerSqm: asset.standardPricePerSqmAtTransfer,
        }}
        onApply={(v: number) => onChange({ buildingStandardPriceAtTransfer: String(v) })}
      />
    </div>
  );
}

export function LandBuildingSaleSplitSection(props: Props) {
  // 양도시 기준시가는 **안분 분모 겸 환산 분모**다(단일 입력 겸용).
  // ⚠️ 「구분양도 + 파트 환산」 조합에서는 아래 축 B에서 환산을 고르는 순간 이 블록이 뒤늦게
  //    나타난다. `saleSplitMode` 기본값이 "apportioned"라 기본 경로에서는 이미 떠 있으므로
  //    감수한다 — 해소하려면 같은 필드를 축 A·B 양쪽에 두는 이원 배치가 되어 dual-truth 위험.
  const needsSaleStdPrice =
    props.saleSplitMode === "apportioned" ||
    props.landAcqMode === "estimated" ||
    props.buildingAcqMode === "estimated";

  if (props.isBurdenedGift) {
    return (
      <div className="space-y-2 rounded-md border border-dashed border-border bg-muted/20 p-3">
        <p className="rounded-md bg-fuchsia-50/60 px-2.5 py-1.5 text-xs text-fuchsia-800" data-testid="split-burdened-note">
          부담부증여는 양도가액·취득가액을 <strong>§159 인수 채무액 기준으로 자동 산정</strong>하므로,
          토지·건물 각 가액은 직접 입력하지 않고 <strong>기준시가 비율로 안분</strong>됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-dashed border-border bg-muted/20 p-3">
      <div className="space-y-1.5">
        <p className="text-sm font-medium leading-tight">
          이 자산의 토지·건물 양도가액 결정 방식
        </p>
        <div data-testid="sale-split-mode">
          <RadioCardGroup
            name="saleSplitMode"
            tone="amber"
            layout="inline"
            options={SALE_MODE_OPTIONS}
            value={props.saleSplitMode}
            onChange={props.onSaleSplitModeChange}
          />
        </div>
        {props.saleSplitMode === "actual" && (
          <div className="grid grid-cols-2 gap-2">
            <FieldCard label="토지 양도가액" hint="소득령 §166⑥">
              <CurrencyInput label="" value={props.landTransferPrice} onChange={props.onLandTransferPriceChange} placeholder="미입력 시 나머지에서 자동 계산" data-testid="split-land-transfer-price" />
            </FieldCard>
            <FieldCard label="건물 양도가액">
              <CurrencyInput label="" value={props.buildingTransferPrice} onChange={props.onBuildingTransferPriceChange} placeholder="미입력 시 나머지에서 자동 계산" data-testid="split-building-transfer-price" />
            </FieldCard>
          </div>
        )}
      </div>

      {needsSaleStdPrice && props.asset && props.onAssetChange && (
        <TransferStdPriceCard
          asset={props.asset}
          onChange={props.onAssetChange}
          transferDate={props.transferDate}
          buildingStandardPriceAtTransfer={props.buildingStandardPriceAtTransfer}
          onBuildingStandardPriceAtTransferChange={props.onBuildingStandardPriceAtTransferChange}
        />
      )}
    </div>
  );
}
