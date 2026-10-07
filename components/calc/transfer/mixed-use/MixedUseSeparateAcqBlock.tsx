"use client";

/**
 * 겸용주택 **별개 취득**(토지·건물 취득일 상이) — 파트별 취득가액 산정방식·금액 블록 (B1).
 *
 * 설계: `docs/02-design/features/mixed-use-separate-acq-per-part.ui.design.md` §2·§3.3·§6.
 * 근거: 「소득세법」 §100② 후문(공통되는 취득가액은 해당 자산의 가액에 비례해 안분) **유추** · 소령 §176의2③(추계는 「해당 자산」 단위).
 *
 * `LandBuildingSplitSection`을 쓰지 않는 이유 — 그것은 겸용 엔진이 읽지 않는 입력(파트 기준시가 카드·파트 자본적지출)을 함께 렌더한다.
 * 이 블록은 **파트 산정방식 + 금액 + (건물) 용도별 계약액**만 가진다. 입력 위젯(`PartAcqInputs`)은 같은 것을 공유한다.
 *
 * ## 모델 전환 — 「날짜가 후보를 만들고, 토글이 모델을 고른다」
 *   · 후보 아님(같은 날·chip OFF·비매매) → 렌더 없음(현행 화면).
 *   · 후보 ∧ 토글 OFF → 토글 + 안내(총액 입력은 두 값을 취득시 기준시가 비율로 나눈다) — 화면의 나머지는 현행 총액 모델.
 *   · 후보 ∧ 토글 ON  → 토글 + 파트 블록.
 *   토글은 `mixedAcqPerPartMode` **한 키만** 쓴다 — 총액 모델 필드와 파트 필드는 서로 건드리지 않는다(왕복 무변화).
 *
 * ⚠️ 파생(`mixedPartModes`·계약액 파생 줄)은 **읽기 전용**이다. `useEffect → store` 미러링 금지 — 변경 시에만 명시 기록한다.
 */
import { CurrencyInput, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import {
  isMixedUsePerPartAcq,
  isMixedUsePerPartCandidate,
  mixedBuildingContractActive,
  mixedBuildingContractCommercialDerived,
  mixedPartModes,
} from "@/lib/calc/mixed-use-part-acq-split";
import type { PartAcqMode } from "@/lib/calc/transfer-tax-split-acq-mode";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { ACQ_MODE_OPTIONS, PartAcqInputs } from "../PartAcqInputs";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

/** 파트 라디오 옵션 — 옵션별 testid(`mixed-part-acq-{part}-{mode}`)를 붙인다. */
function modeOptions(part: "land" | "building") {
  return ACQ_MODE_OPTIONS.map((o) => ({ ...o, testId: `mixed-part-acq-${part}-${o.value}` }));
}

const LAND_ESTIMATED_NOTE = (
  <>
    토지 환산취득가 = 토지 양도가액 × <Frac top="취득시 토지 기준시가" bottom="양도시 토지 기준시가" />
    <br />· 취득시 토지 기준시가는 아래 『주택 기준시가』·『상가 기준시가』 영역의 개별공시지가(<strong>토지 취득일</strong> 기준)입니다.
  </>
);
const BUILDING_ESTIMATED_NOTE = (
  <>
    건물 환산취득가 = 건물 양도가액 × <Frac top="취득시 건물 기준시가" bottom="양도시 건물 기준시가" />
    <br />· 취득시 건물 기준시가는 아래 『주택 기준시가』·『상가 기준시가』 영역의 주택건물·상가건물 기준시가(<strong>건물 취득일</strong> 기준)입니다.
  </>
);

export function MixedUseSeparateAcqBlock({ asset, onChange }: Props) {
  if (!isMixedUsePerPartCandidate(asset)) return null;
  const perPart = isMixedUsePerPartAcq(asset);
  const modes = mixedPartModes(asset);
  const assetKey = asset.assetId ?? "primary";

  return (
    <div className="space-y-2">
      {/* 모델 토글 — 모델 키 **한 개만** 쓴다(총액 모델 값·파트 값은 서로 건드리지 않아 왕복해도 무변화). 날짜 2열 바로 아래. */}
      <ToggleCard
        tone="amber"
        size="sm"
        title="토지·건물 취득가액을 각각 입력"
        description="취득일이 달라 토지·건물 가액이 따로 있습니다. 끄면 총 취득가액 하나를 입력합니다(종전 방식)."
        checked={perPart}
        onCheckedChange={(v) => onChange({ mixedAcqPerPartMode: v })}
        data-testid="mixed-per-part-toggle"
        data-field="mixedAcqPerPartMode"
      />

      {!perPart && (
        <div data-testid="mixed-total-model-note">
          <ToneCard tone="amber" bodyClassName="space-y-1">
            <p className="text-xs text-amber-900">
              토지·건물 값을 각각 알면 위 『토지·건물 취득가액을 각각 입력』을 켜세요. 총 취득가액 입력은 토지와 건물의 취득일이
              달라도 두 값을 취득시 기준시가 비율로 나눕니다.
            </p>
          </ToneCard>
        </div>
      )}

      {perPart && (
        <div data-testid="mixed-sep-acq-block" className="space-y-3 rounded-md border border-dashed border-border bg-muted/20 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-xs font-semibold text-muted-foreground">취득가액 산정 방식 — 토지·건물 독립 선택</p>
            <LawArticleModal legalBasis="소득세법 §100②" label="§100② 후문(유추)" />
          </div>
          <ToneCard tone="amber" bodyClassName="space-y-1">
            <p className="text-xs text-amber-900" data-testid="mixed-sep-acq-intro">
              토지와 건물을 서로 다른 시점에 취득했으므로 취득가액은 각각 입력합니다. 토지는 주택부수토지·상가부수토지로{" "}
              <strong>토지 기준시가 비율(같은 필지이므로 면적 비율)</strong>, 건물은 주택건물·상가건물로{" "}
              <strong>용도별 계약액이 있으면 그 금액, 없으면 건물 취득시 기준시가 비율</strong>로 나눕니다 (「소득세법」 제100조 제2항
              후문 유추).
            </p>
          </ToneCard>

          {/* ① 토지 */}
          <PartSection
            num={1}
            title={`토지 취득가액 방식 (취득일 ${asset.landAcquisitionDate})`}
            testId="mixed-part-acq-mode-land"
            radioName={`mixedLandAcqMode-${assetKey}`}
            part="land"
            mode={modes.land}
            onModeChange={(v) => onChange({ landAcqMode: v })}
          >
            <PartAcqInputs
              part="land"
              mode={modes.land}
              isSeparateAcq
              acquisitionPrice={asset.landAcquisitionPrice ?? ""}
              onAcquisitionPriceChange={(v) => onChange({ landAcquisitionPrice: v })}
              salesCaseValue={asset.landSalesCaseValue ?? ""}
              onSalesCaseValueChange={(v) => onChange({ landSalesCaseValue: v })}
              testIdPrefix="mixed-split"
              estimatedNote={LAND_ESTIMATED_NOTE}
            />
            {modes.land !== "estimated" && (
              <p className="text-caption text-muted-foreground" data-testid="mixed-land-split-note">
                주택부수토지·상가부수토지로는 토지 기준시가 비율(같은 필지 → 면적 비율)로 나눕니다. 면적은 위 ① 면적 입력을 따릅니다.
              </p>
            )}
          </PartSection>

          {/* ② 건물 */}
          <PartSection
            num={2}
            title={`건물 취득가액 방식 (취득일 ${asset.acquisitionDate})`}
            testId="mixed-part-acq-mode-building"
            radioName={`mixedBuildingAcqMode-${assetKey}`}
            part="building"
            mode={modes.building}
            onModeChange={(v) => onChange({ buildingAcqMode: v })}
          >
            <PartAcqInputs
              part="building"
              mode={modes.building}
              isSeparateAcq
              acquisitionPrice={asset.buildingAcquisitionPrice ?? ""}
              onAcquisitionPriceChange={(v) => onChange({ buildingAcquisitionPrice: v })}
              salesCaseValue={asset.buildingSalesCaseValue ?? ""}
              onSalesCaseValueChange={(v) => onChange({ buildingSalesCaseValue: v })}
              testIdPrefix="mixed-split"
              estimatedNote={BUILDING_ESTIMATED_NOTE}
            />
            <BuildingContractSplit asset={asset} onChange={onChange} buildingMode={modes.building} />
          </PartSection>

          {(modes.land === "appraisal" || modes.land === "salesCase" || modes.building === "appraisal" || modes.building === "salesCase") && (
            <ToneCard tone="sky" bodyClassName="space-y-1">
              <p className="text-xs text-sky-900" data-testid="mixed-deduction-only-notice">
                감정가액·매매사례가액 파트는 추계 취득가액이라 필요경비는 개산공제(취득시 기준시가 × 율 — 소령 §163⑥)만 인정됩니다. 자본적지출·양도비·
                주택분/상가분 실제 필요경비는 <strong>실거래가 파트에만</strong> 가산됩니다 (「소득세법」 §97②2호 본문).
              </p>
            </ToneCard>
          )}
          {modes.land !== modes.building && (
            <p className="text-caption text-muted-foreground" data-testid="mixed-mixed-combo-note">
              토지·건물 산정방식이 달라도 계산할 수 있습니다(소령 §176의2③ 「해당 자산」 단위). 다만 같은 조합을 직접 다룬 해석례는 확인되지 않았습니다.
            </p>
          )}
          {asset.hasPartialUsageChange && asset.partialChangeDirection && (
            <div data-testid="mixed-sep-exclusion-note">
              <ToneCard tone="rose" bodyClassName="space-y-1">
                <p className="text-xs text-rose-900">
                  보유 중 일부 용도변경과 『토지·건물 취득가액을 각각 입력』은 함께 계산할 수 없습니다 — 각각 입력을 끄거나(총액 입력) 용도변경을 끄세요.
                </p>
              </ToneCard>
            </div>
          )}
          {asset.transferCause === "public_expropriation" && (
            <div data-testid="mixed-sep-exclusion-note-expropriation">
              <ToneCard tone="rose" bodyClassName="space-y-1">
                <p className="text-xs text-rose-900">
                  공익사업 수용 양도 특례와 『토지·건물 취득가액을 각각 입력』은 함께 계산할 수 없습니다 — 각각 입력을 끄거나(총액 입력) 수용 양도를 끄세요.
                </p>
              </ToneCard>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 번호 배지 + 제목 + 4종 라디오 + 파트 입력 슬롯. */
function PartSection({
  num,
  title,
  testId,
  radioName,
  part,
  mode,
  onModeChange,
  children,
}: {
  num: number;
  title: string;
  testId: string;
  radioName: string;
  part: "land" | "building";
  mode: PartAcqMode;
  onModeChange: (v: PartAcqMode) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-micro font-bold text-amber-800 select-none">
          {num}
        </span>
        <p className="text-xs font-semibold text-amber-800">{title}</p>
      </div>
      <div data-testid={testId}>
        <RadioCardGroup name={radioName} tone="amber" layout="inline" options={modeOptions(part)} value={mode} onChange={onModeChange} />
      </div>
      {children}
    </div>
  );
}

/** S-2 — 건물 용도별 계약액. 건물 **실거래가**일 때만 노출(값·토글 상태는 모드를 바꿔도 보존된다). 그 밖의 비-환산 모드는 비율 안내만. */
function BuildingContractSplit({
  asset,
  onChange,
  buildingMode,
}: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  buildingMode: PartAcqMode;
}) {
  if (buildingMode === "estimated") return null;
  const ratioNote = (
    <p className="text-caption text-muted-foreground" data-testid="mixed-bldg-ratio-note">
      주택건물·상가건물로는 건물 취득시 기준시가 비율로 나눕니다 (취득시 주택건물·상가건물 기준시가는 아래 기준시가 영역에 입력).
    </p>
  );
  // 감정·매매사례는 용도별 금액이 S-2 결정(도급계약서·세금계산서)의 범위 밖 — 토글 없이 비율만.
  if (buildingMode !== "actual") return ratioNote;
  const active = mixedBuildingContractActive(asset);
  const derived = mixedBuildingContractCommercialDerived(asset);
  return (
    <div className="space-y-1.5">
      <ToggleCard
        tone="amber"
        size="sm"
        title="건물 용도별 계약액이 구분돼 있음"
        description="주택건물·상가건물의 도급계약서·세금계산서 금액이 따로 있을 때 (없으면 건물 취득시 기준시가 비율로 나눕니다)"
        checked={asset.mixedAcqBuildingContractSplit === true}
        onCheckedChange={(v) => onChange({ mixedAcqBuildingContractSplit: v })}
        data-testid="mixed-bldg-contract-toggle"
      >
        <div className="space-y-1.5">
          <FieldCard
            field="mixedAcqHousingBuildingContractPrice"
            label="주택건물 계약액"
            hint="건물 취득가액(총액) 중 주택건물분입니다. 상가건물분은 총액에서 이 값을 뺀 금액입니다."
          >
            <CurrencyInput
              label=""
              value={asset.mixedAcqHousingBuildingContractPrice ?? ""}
              onChange={(v) => onChange({ mixedAcqHousingBuildingContractPrice: v })}
              required
              data-testid="mixed-bldg-contract-housing"
            />
          </FieldCard>
          <p className="text-xs text-amber-900" data-testid="mixed-bldg-contract-commercial-derived">
            상가건물 계약액 = 건물 취득가액 − 주택건물 계약액 = {active && derived !== null ? formatKRW(derived) : "—"}
          </p>
        </div>
      </ToggleCard>
      {!active && ratioNote}
    </div>
  );
}
