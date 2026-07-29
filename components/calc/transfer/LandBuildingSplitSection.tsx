"use client";

/**
 * 토지/건물 취득·양도가액 독립 산정 섹션 (소득세법 시행령 §166⑥·§168②)
 *
 * `hasSeperateLandAcquisitionDate === true` 시 항상 렌더(토지·건물 취득일이 다른 자산).
 *
 * 취득 축: 토지·건물 각각 4방식(실거래가·환산취득가·감정가액·매매사례가액) **독립** 선택.
 *
 * ⚠️ **양도 축(구분/일괄 + 양도시 기준시가)은 `LandBuildingSaleSplitSection`으로 분리**됐다
 * (2026-07-29) — 계산 규칙 순서가 ① 양도가액 구분 → ② 취득가액이라 축 A가 **앞**에 렌더된다.
 *
 * 계획서: docs/02-design/features/transfer-land-building-independent-valuation-mode.plan.md (§8)
 * · UI 설계: transfer-land-building-independent-valuation-mode.ui.design.md (§2)
 *
 * 미입력 시 엔진 동작(`transfer-tax-split-gain.ts`):
 *   실가·감정: 한쪽만 입력 → 반대쪽 = 총액 − 입력값(잔액) / 둘 다 미입력 → 취득시 기준시가 비율 안분.
 *   매매사례: 파트별 입력 우선, 미입력 시 §166⑥ "구분 불분명" → 취득시 기준시가 비율 안분.
 *   환산: 파트 양도가 × (파트 취득시/양도시 기준시가).
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { RadioCardGroup, type RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { BuildingStdPriceModalButton } from "@/components/calc/building-std-price/BuildingStdPriceModalButton";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { PartAcqMode } from "@/lib/calc/transfer-tax-split-acq-mode";

export type { PartAcqMode };

const ACQ_MODE_OPTIONS: RadioCardOption<PartAcqMode>[] = [
  { value: "actual", label: "실거래가" },
  { value: "estimated", label: "환산취득가" },
  { value: "appraisal", label: "감정가액" },
  { value: "salesCase", label: "매매사례가액" },
];

interface Props {
  /** 토지·건물 소유자 분리 — 본인 소유하지 않는 파트는 모드 선택 비노출 */
  selfOwns: "both" | "building_only" | "land_only";
  /** 부담부증여(§159 자동 산정) — 파트별 모드·양도 분리 선택 자체를 숨긴다(안내만 표시) */
  isBurdenedGift?: boolean;

  landAcqMode: PartAcqMode;
  onLandAcqModeChange: (v: PartAcqMode) => void;
  buildingAcqMode: PartAcqMode;
  onBuildingAcqModeChange: (v: PartAcqMode) => void;

  landAcquisitionPrice: string;
  onLandAcquisitionPriceChange: (v: string) => void;
  buildingAcquisitionPrice: string;
  onBuildingAcquisitionPriceChange: (v: string) => void;
  landSalesCaseValue: string;
  onLandSalesCaseValueChange: (v: string) => void;
  buildingSalesCaseValue: string;
  onBuildingSalesCaseValueChange: (v: string) => void;
  landDirectExpenses: string;
  onLandDirectExpensesChange: (v: string) => void;
  buildingDirectExpenses: string;
  onBuildingDirectExpensesChange: (v: string) => void;

  /** 별개 취득(취득시기 상이) — 축 A 파트별 필수 + 축 B 파트별 독립 입력 게이트 */
  isSeparateAcq?: boolean;
  /** 축 B 취득시 기준시가 — 토지분은 주택·건물 공통, 건물분 명시 입력만 `building` 전용 */
  asset?: AssetForm;
  onAssetChange?: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
}

/**
 * 축 B — 취득시 기준시가 파트별 독립 입력 (`building` + 별개 취득 전용).
 *
 * 토지는 개별공시지가(§99①1호 **가목**, 기준일 = **토지 취득일**), 건물은 국세청장 산정
 * 기준시가(**나목**, 기준일 = **건물 취득일**)로 각각 별도 공시된다. 취득시점이 다르면
 * 각자 자기 취득일의 직전 고시분(소득령 §164③)이어야 하므로, 결합 총액에서 역산하면
 * 건물분에 토지 취득시점이 섞인다.
 *
 * **토지분(가목)은 주택에도 노출한다** — `㎡당 공시지가 × 면적`은 자산 종류와 무관하게
 * 안분 비율·환산 분자·개산공제 base의 유일한 소스다(engine `calcAcqStdPair`).
 * 반면 **건물분(나목) 명시 입력은 `building` 전용**이다 — 주택(라목)은 부수토지 포함
 * 결합 공시라 건물분 단독 공시가 없고, `결합 총액 − 토지분` 역산만이 항등성을 지켜
 * 개산공제 합계를 법정액(§163⑥2호가목)에 맞춘다.
 */
function PartAcqStdPrice(props: {
  part: "land" | "building";
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
  /** 주택(라목) — 건물분은 별도 공시가 없어 `결합 총액 − 토지분`으로 도출됨을 안내 */
  derivedBuildingNote?: boolean;
}) {
  const { asset, onChange } = props;
  const stdPriceAddress = {
    road: asset.addressRoad,
    jibun: asset.addressJibun,
    building: asset.buildingName,
    detail: asset.addressDetail,
    lng: asset.longitude,
    lat: asset.latitude,
    pnu: asset.addressPnu,
  };

  if (props.part === "land") {
    return (
      <ToneCard tone="amber" title="토지 취득시 기준시가 (§99①1호 가목)" noDark>
        <LandPriceLookupField
          label="취득시 토지 공시지가"
          pricePerSqm={asset.standardPricePerSqmAtAcq}
          onPricePerSqmChange={(v) => onChange({ standardPricePerSqmAtAcq: v })}
          area={parseDecimal(asset.acquisitionArea) || undefined}
          referenceDate={asset.landAcquisitionDate}
          jibun={asset.addressJibun}
          hint="토지 취득일 직전 고시 개별공시지가 (원/㎡) — 건물 취득일이 아니다 (소득령 §164③)"
        />
        <FieldCard label="토지 면적" unit="㎡" hint="토지분 기준시가 = ㎡당 공시지가 × 이 면적">
          <DecimalInput
            value={asset.acquisitionArea}
            onChange={(v) => onChange({ acquisitionArea: v })}
            data-testid="split-land-std-acq-area"
          />
        </FieldCard>
        {props.derivedBuildingNote && (
          <p className="text-xs text-amber-800" data-testid="split-housing-building-derived-note">
            건물분 취득시 기준시가는 위 <strong>취득시 기준시가(개별·공동주택가격)</strong>에서 이 토지분을 뺀 값으로
            자동 도출됩니다 — 주택은 부수토지를 포함한 결합 공시라 건물분이 따로 공시되지 않습니다
            (소득세법 §99①1호 라목·시행령 §163⑥2호가목).
          </p>
        )}
      </ToneCard>
    );
  }

  return (
    <ToneCard tone="amber" title="건물 취득시 기준시가 (§99①1호 나목)" noDark>
      <FieldCard
        label="취득시 건물기준시가"
        unit="원"
        hint="건물 취득일 직전 고시분. 미입력 시 결합 총액에서 역산하며, 그 값에는 토지 취득시점이 섞인다."
      >
        <CurrencyInput
          label=""
          hideUnit
          value={asset.buildingStandardPriceAtAcq}
          onChange={(v) => onChange({ buildingStandardPriceAtAcq: v })}
          data-testid="split-building-std-acq"
        />
      </FieldCard>
      <div className="flex justify-end">
        <BuildingStdPriceModalButton
          lockedTaxType="transfer"
          initialAddress={stdPriceAddress}
          // 「건물 기준시가 계산서」 서식 출력의 스냅샷 소스 — 키가 없으면 서식이 비어 출력된다.
          snapshotKey={`bsp-${asset.assetId}-split-acq`}
          applyTimePoint="acquisition"
          prefill={{
            landAreaM2: asset.acquisitionArea,
            acquisitionDate: asset.acquisitionDate,
            transferDate: props.transferDate,
          }}
          onApply={(v: number) => onChange({ buildingStandardPriceAtAcq: String(v) })}
        />
      </div>
    </ToneCard>
  );
}

/** 파트 취득 방식별 조건부 입력 (actual/appraisal은 총액 직접입력, salesCase는 매매사례가, estimated는 안내만) */
function PartAcqInputs(props: {
  part: "land" | "building";
  mode: PartAcqMode;
  /** 별개 취득 — 총액 잔액 도출·안분이 폐지되어 파트별 입력이 **필수**가 된다 */
  isSeparateAcq: boolean;
  acquisitionPrice: string;
  onAcquisitionPriceChange: (v: string) => void;
  salesCaseValue: string;
  onSalesCaseValueChange: (v: string) => void;
}) {
  const label = props.part === "land" ? "토지" : "건물";
  if (props.mode === "actual" || props.mode === "appraisal") {
    const isApr = props.mode === "appraisal";
    return (
      <FieldCard
        label={`${label} ${isApr ? "감정가액" : "취득가액"}`}
        hint={
          props.isSeparateAcq
            ? "취득시기가 다르므로 나머지 금액에서 자동 계산되지 않습니다 (소득세법 §97①1호·§114⑦)"
            : undefined
        }
      >
        <CurrencyInput
          label=""
          value={props.acquisitionPrice}
          onChange={props.onAcquisitionPriceChange}
          required={props.isSeparateAcq}
          // 별개 취득에서는 잔액 규칙이 폐지되어 "미입력 시 자동 계산" 안내가 거짓이 된다.
          placeholder={props.isSeparateAcq ? undefined : "미입력 시 나머지에서 자동 계산"}
          // testid는 방식별로 분리한다 — 저장 필드는 같아도(Q3) E2E에서 두 모드를 구분해야 한다.
          data-testid={isApr ? `split-${props.part}-appraisal-value` : `split-${props.part}-acq-price`}
        />
      </FieldCard>
    );
  }
  if (props.mode === "salesCase") {
    return (
      <FieldCard
        label={`${label} 매매사례가액`}
        hint={
          props.isSeparateAcq
            ? "매매사례 탐색 기간이 파트별 취득일 전후 3개월로 서로 달라 총액을 안분할 수 없습니다 (소득령 §176의2③1호)"
            : "미입력 시 취득시 기준시가 비율로 안분(소득령 §166⑥)"
        }
      >
        <CurrencyInput
          label=""
          value={props.salesCaseValue}
          onChange={props.onSalesCaseValueChange}
          required={props.isSeparateAcq}
          placeholder={props.isSeparateAcq ? undefined : "없으면 비워두세요"}
          data-testid={`split-${props.part}-salescase-value`}
        />
      </FieldCard>
    );
  }
  // estimated — 취득시 기준시가는 위 "취득가액 산정 방식" 섹션의 공용 입력에서 파생(안분),
  // 양도시 기준시가는 아래 공용 칸에서 입력(환산 분모 겸 안분 분모).
  return (
    <p className="text-xs text-muted-foreground italic">
      {label} 환산취득가 = {label} 양도가액 × (취득시/양도시 기준시가) — 아래 양도시 기준시가 입력 필요.
    </p>
  );
}

export function LandBuildingSplitSection(props: Props) {
  // 축 B 취득시 기준시가 입력 — 별개 취득 전용.
  //
  // **토지분은 자산 종류와 무관하게 필요하다** — `㎡당 개별공시지가 × 면적`(§99①1호 가목)이
  // 안분 비율·환산 분자·개산공제 base의 유일한 소스이기 때문이다(engine `calcAcqStdPair`).
  // 종전에는 이 블록 전체가 `building` 전용이라, **주택은 이 두 값을 입력할 칸이 앱 어디에도
  // 없었다** — 공용 `StandardPriceInput`은 주택(`house_individual`)에서 총액 칸만 렌더하고
  // (area 모드는 land·building_non_residential 전용), 면적 블록은 `assetKind === "land"`
  // 게이트다(`AssetSectionBasic`). 그래서 주택 별개취득의 환산·감정·매매사례 파트는
  // 취득가액이 조용히 0으로 산출됐다.
  //
  // **건물분 명시 입력은 여전히 `building` 전용**이다 — 주택(라목)은 부수토지를 포함한
  // 결합 공시라 건물분 단독 공시가 존재하지 않고, `결합 총액 − 토지분` 역산만이
  // `토지분 + 건물분 ≡ 라목 총액` 항등성을 지켜 개산공제 합계를 법정액(§163⑥2호가목)에
  // 맞춘다. 주택에 파트 독립 입력을 열면 그 항등성이 깨진다.
  const isHousingAsset = props.asset?.assetKind === "housing";
  const showLandStdPrice =
    !!props.isSeparateAcq &&
    (props.asset?.assetKind === "building" || isHousingAsset) &&
    !!props.asset &&
    !!props.onAssetChange;
  const showBuildingStdPrice = showLandStdPrice && !isHousingAsset;
  const landOwned = props.selfOwns !== "building_only";
  const buildingOwned = props.selfOwns !== "land_only";

  // 부담부증여 안내(`split-burdened-note`)는 **축 A(LandBuildingSaleSplitSection)에만** 둔다.
  // 양쪽에 두면 같은 testid가 2개가 되어 E2E strict mode가 깨진다.
  if (props.isBurdenedGift) return null;

  return (
    <div className="space-y-3 rounded-md border border-dashed border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="text-xs font-semibold text-muted-foreground">
          취득가액 산정 방식 — 토지·건물 독립 선택
        </p>
        <LawArticleModal legalBasis="소득세법 시행령 §166⑥" label="§166⑥ 안분" />
      </div>

      {/* ① 토지 취득가액 방식 */}
      {landOwned && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-micro font-bold text-amber-800 select-none">
              1
            </span>
            <p className="text-xs font-semibold text-amber-800">토지 취득가액 방식</p>
          </div>
          <div data-testid="part-acq-mode-land">
            <RadioCardGroup
              name="landAcqMode"
              tone="amber"
              layout="inline"
              options={ACQ_MODE_OPTIONS}
              value={props.landAcqMode}
              onChange={props.onLandAcqModeChange}
            />
          </div>
          {showLandStdPrice && (
            <PartAcqStdPrice
              part="land"
              asset={props.asset!}
              onChange={props.onAssetChange!}
              transferDate={props.transferDate}
              derivedBuildingNote={isHousingAsset}
            />
          )}
          <PartAcqInputs
            part="land"
            mode={props.landAcqMode}
            isSeparateAcq={!!props.isSeparateAcq}
            acquisitionPrice={props.landAcquisitionPrice}
            onAcquisitionPriceChange={props.onLandAcquisitionPriceChange}
            salesCaseValue={props.landSalesCaseValue}
            onSalesCaseValueChange={props.onLandSalesCaseValueChange}
          />
        </div>
      )}

      {/* ② 건물 취득가액 방식 */}
      {buildingOwned && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-micro font-bold text-amber-800 select-none">
              2
            </span>
            <p className="text-xs font-semibold text-amber-800">건물 취득가액 방식</p>
          </div>
          <div data-testid="part-acq-mode-building">
            <RadioCardGroup
              name="buildingAcqMode"
              tone="amber"
              layout="inline"
              options={ACQ_MODE_OPTIONS}
              value={props.buildingAcqMode}
              onChange={props.onBuildingAcqModeChange}
            />
          </div>
          {showBuildingStdPrice && (
            <PartAcqStdPrice part="building" asset={props.asset!} onChange={props.onAssetChange!} transferDate={props.transferDate} />
          )}
          <PartAcqInputs
            part="building"
            mode={props.buildingAcqMode}
            isSeparateAcq={!!props.isSeparateAcq}
            acquisitionPrice={props.buildingAcquisitionPrice}
            onAcquisitionPriceChange={props.onBuildingAcquisitionPriceChange}
            salesCaseValue={props.buildingSalesCaseValue}
            onSalesCaseValueChange={props.onBuildingSalesCaseValueChange}
          />
        </div>
      )}

      {/* 자본적지출 — 모드·양도 방식과 무관하게 항상 입력 가능 */}
      <div className="grid grid-cols-2 gap-2">
        <FieldCard label="토지 자본적지출" hint="토지에 귀속되는 자본적지출만 입력, 없으면 비워두세요">
          <CurrencyInput label="" value={props.landDirectExpenses} onChange={props.onLandDirectExpensesChange} placeholder="없으면 비워두세요" />
        </FieldCard>
        <FieldCard label="건물 자본적지출" hint="건물에 귀속되는 자본적지출만 입력, 없으면 비워두세요">
          <CurrencyInput label="" value={props.buildingDirectExpenses} onChange={props.onBuildingDirectExpensesChange} placeholder="없으면 비워두세요" />
        </FieldCard>
      </div>
    </div>
  );
}
