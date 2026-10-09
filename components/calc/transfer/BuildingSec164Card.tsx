"use client";

/**
 * 2005.4.30. 전 상속·증여 건물 파트(토지는 매매)의 **②(영 §164⑦ 가액의 건물 몫) 입력 카드** — D2-4b.
 *
 * 설계: docs/02-design/features/transfer-acq-cause-mixed-d2-4.ui.design.md §3 · 계획서 §13
 *
 * 「소득세법 시행령」 §163⑨ 단서 2호: 건물 기준시가(단독·다가구주택은 개별주택가격)가 고시되기 전에 상속·증여받은 건물의 취득가액은
 * 상속개시일·증여일 평가액(①)과 영 §164⑤~⑦ 가액(②) 중 **많은 금액**이다. 토지는 따로 샀으므로 ②는 영 §164⑦로 환산한 주택가격의
 * **건물 몫**이다(재산세과-1702 자산별 안분 — 취득당시 토지 기준시가는 약분된다, 브리지 주석).
 *
 * - 노출은 단서 구간의 주택(`buildingSec164Applies` — 유효 D2 ∧ 주택 ∧ 건물 취득일 < 2005-04-30)일 때만.
 * - **주택 구분 칸**: 단독·다가구만 연다(계획서 §13 Q-D24-2). 값은 **명시 선택**만 읽는다 — 표시용 파생 `deriveInheritanceHouseKind`는
 *   미선택을 단독으로 읽어(Check F1) 「선택된 것처럼 보이는데 ④는 안 보내는」 막다른 화면이 된다. 미선택이면 아무것도 체크되지 않는다.
 * - 비교는 법이 정한 계산이라 토글이 없다. 입력 화면에 채택값(max)은 없다 — 채택은 엔진, 결과 화면이 echo로 보인다.
 * - ② 표시값은 **④가 보내는 것과 같은 브리지 함수**(`deriveBuildingSec164Total`)를 읽는다(3중 패턴, effect 미러링 0).
 * - 토지 면적은 기본 정보의 칸(`acquisitionArea`)을 쓴다. 입력 키는 자산 단위 §164⑤~⑦ 위젯과 같은 `inhHouseVal*`(같은 물리량).
 * - 카드 어디에도 「취득 당시 개별주택가격 미공시」(PHD 토글 제목)를 쓰지 않는다 — D2 화면에서 그 문구의 부재를 단언하는 E2E가 있다.
 */
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import {
  MultiPointBuildingStdPriceModal,
  type MultiPointStdPriceApply,
} from "@/components/calc/building-std-price/MultiPointBuildingStdPriceModal";
import { houseKindChangePatch } from "./inheritance/InheritanceHouseKindPicker";
import { LAND_CAUSE_META, type LandCause } from "./land-cause-meta";
import {
  buildingHouseKindSent,
  buildingSec164Applies,
  deriveBuildingSec164Total,
} from "@/lib/calc/transfer-building-sec164-bridge";
import { effectiveBuildingCauseMix } from "@/lib/calc/transfer-land-part-cause";
import { isPartialAreaScenario, sec164AreaSqm } from "@/lib/calc/transfer-pre1990-housing-land-bridge";
import { getOwnershipRatio } from "@/lib/calc/transfer-tax-api-asset-basics";
import { sec164BuildingPartStatus } from "@/lib/calc/sec164-required-fields";
import { isDeemedAcquisitionApplied, sec164AcqTimePointLabel } from "@/lib/calc/transfer-163-9-base-date";
import { landPriceYearOf } from "@/lib/calc/building-std-batch-apply";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { multiplyByArea } from "@/lib/tax-engine/area-utils";
import { BUILDING_CAUSE_APARTMENT_MESSAGE } from "@/lib/tax-engine/transfer-split-part-cause";
import { SPLIT_SEC164_BUILDING_VALUE_LABEL } from "@/lib/tax-engine/transfer-tax-split-display";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 개별주택가격 최초 공시일 — 최초공시 시점 칸의 조회 기준일 */
const HOUSE_FIRST_DISCLOSURE_DATE = "2005-04-30";

const HOUSE_KIND_OPTIONS = [
  { value: "house_individual", label: "단독·다가구주택 (개별주택가격 공시)" },
  { value: "house_apart", label: "공동주택 — 아파트·연립·다세대 (공동주택가격 공시)" },
];

const fmt = (n: number) => n.toLocaleString();

function yearOf(d?: string): number | undefined {
  const y = d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : undefined;
  return y && y > 1900 ? y : undefined;
}

export function BuildingSec164Card(props: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}) {
  const { asset, onChange } = props;
  if (!buildingSec164Applies(asset)) return null;

  const cause = (effectiveBuildingCauseMix(asset) || "inheritance") as LandCause;
  const meta = LAND_CAUSE_META[cause];
  const buildingDate = asset.acquisitionDate;
  // 1984.12.31. 이전 취득은 1985.1.1. 취득 의제(부칙 법률 제4803호 §8) — 취득 당시 건물 기준시가도 그 시점 값이다.
  const acqTimeLabel = sec164AcqTimePointLabel(buildingDate, meta.dateLabel);
  const isDeemedAcq = isDeemedAcquisitionApplied(buildingDate);
  const kind = buildingHouseKindSent(asset);
  const partial = isPartialAreaScenario(asset);
  const status = sec164BuildingPartStatus(asset);
  const total = deriveBuildingSec164Total(asset);
  const ratio = getOwnershipRatio(asset);
  const area = sec164AreaSqm(asset) ?? 0;
  const housePriceAtFirst = parseAmount(asset.inhHouseValHousePriceAtFirst);
  const landAtFirst = multiplyByArea(parseAmount(asset.inhHouseValLandPricePerSqmAtFirst), area);
  const buildingAtFirst = parseAmount(asset.inhHouseValBuildingStdPriceAtFirst);
  const buildingAtAcq = parseAmount(asset.inhHouseValBuildingStdPriceAtInheritance);

  // 2시점(취득·최초공시) 건물 기준시가 일괄 계산 — 양도시 건물 기준시가는 이 비교에 쓰이지 않는다.
  // 국세청 건물 기준시가는 2001.1.1. 최초 고시 — 그 전 취득 시점의 위치지수 공시지가는 모달 안내대로 2001년 값을 넣는다(빈 칸 시드).
  const batchPoints = [
    {
      key: "acquisition" as const,
      label: `취득시(${meta.label})`,
      year: yearOf(buildingDate),
      landPriceYear: landPriceYearOf(buildingDate),
      landPricePerM2: "",
    },
    {
      key: "firstDisclosure" as const,
      label: "최초공시일",
      year: yearOf(HOUSE_FIRST_DISCLOSURE_DATE),
      landPriceYear: landPriceYearOf(HOUSE_FIRST_DISCLOSURE_DATE),
      landPricePerM2: asset.inhHouseValLandPricePerSqmAtFirst,
    },
  ];
  const applyBatch = (v: MultiPointStdPriceApply) => {
    const patch: Partial<AssetForm> = {};
    if (v.firstDisclosure?.housing != null) patch.inhHouseValBuildingStdPriceAtFirst = String(v.firstDisclosure.housing);
    if (v.acquisition?.housing != null) patch.inhHouseValBuildingStdPriceAtInheritance = String(v.acquisition.housing);
    if (Object.keys(patch).length) onChange(patch);
  };

  return (
    <div className="space-y-2" data-testid="building-sec164-card" data-field="buildingSec164Value">
      <ToneCard tone="amber" noDark>
        <p className="text-xs text-amber-900">
          건물을 {buildingDate}에 {meta.label}받았는데 그때는 개별주택가격이 공시되기 전(2005.4.30. 이전)이라, 위 {meta.valueLabel}과 최초
          공시된 개별주택가격으로 환산한 주택가격의 건물 몫(<strong>{SPLIT_SEC164_BUILDING_VALUE_LABEL}</strong>) 중{" "}
          <strong>많은 금액</strong>이 건물 취득가액입니다 (소득세법 시행령 §163조 제9항 단서 2호). 토지 면적은 기본 정보의 토지 면적을
          사용합니다.
        </p>
      </ToneCard>

      <div className="space-y-1.5" data-field="inheritanceAssetKind">
        <p className="text-caption text-muted-foreground font-medium">주택 구분</p>
        <RadioCardGroup
          name={`building-house-kind-${asset.assetId}`}
          tone="amber"
          layout="stack"
          options={HOUSE_KIND_OPTIONS}
          value={kind ?? ""}
          onChange={(v) => onChange(houseKindChangePatch(asset, v))}
        />
      </div>

      {kind === "house_apart" && (
        <ToneCard tone="amber" noDark>
          <p className="text-xs text-amber-900" data-testid="building-sec164-apart-note">
            {BUILDING_CAUSE_APARTMENT_MESSAGE}
          </p>
        </ToneCard>
      )}

      {kind === "house_individual" && (
        <>
          <div className="flex justify-end">
            <MultiPointBuildingStdPriceModal
              points={batchPoints}
              onApply={applyBatch}
              snapshotPrefix={`bsp-${asset.assetId}-d24`}
              jibun={asset.addressJibun || undefined}
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
            />
          </div>

          <p className="text-caption font-semibold text-muted-foreground">최초 공시 시점 ({HOUSE_FIRST_DISCLOSURE_DATE})</p>
          <StandardPriceInput
            propertyKind="house_individual"
            totalPrice={asset.inhHouseValHousePriceAtFirst}
            data-field="inhHouseValHousePriceAtFirst"
            onTotalPriceChange={(v) => onChange({ inhHouseValHousePriceAtFirst: v })}
            jibun={asset.addressJibun || undefined}
            referenceDate={HOUSE_FIRST_DISCLOSURE_DATE}
            label="최초 공시된 개별주택가격"
            hint="홈택스/부동산공시가격알리미 — 최초 공시 시점 개별주택가격(부수토지 포함)"
          />
          <LandPriceLookupField
            label="최초공시 개별공시지가"
            data-field="inhHouseValLandPricePerSqmAtFirst"
            referenceDate={HOUSE_FIRST_DISCLOSURE_DATE}
            pricePerSqm={asset.inhHouseValLandPricePerSqmAtFirst}
            onPricePerSqmChange={(v: string) => onChange({ inhHouseValLandPricePerSqmAtFirst: v })}
            area={area || undefined}
            jibun={asset.addressJibun || undefined}
          />
          <FieldCard
            field="inhHouseValBuildingStdPriceAtFirst"
            label="최초공시 시점 건물 기준시가"
            unit="원"
            hint="국세청 건물 기준시가 — 최초 공시 시점 값. 개별주택가격과 별개입니다."
          >
            <CurrencyInput
              label=""
              hideUnit
              value={asset.inhHouseValBuildingStdPriceAtFirst}
              onChange={(v) => onChange({ inhHouseValBuildingStdPriceAtFirst: v })}
            />
          </FieldCard>

          <p className="text-caption font-semibold text-muted-foreground">
            건물 {acqTimeLabel} 시점 {isDeemedAcq ? `(실제 ${meta.dateLabel} ${buildingDate})` : `(${buildingDate})`}
          </p>
          {isDeemedAcq && (
            <p className="text-caption text-muted-foreground">
              1984.12.31. 이전 취득분은 「소득세법」 부칙(법률 제4803호) §8에 따라 1985.1.1.에 취득한 것으로 보므로, 아래 칸은 실제{" "}
              {meta.dateLabel}이 아니라 1985.1.1. 시점 값입니다.
            </p>
          )}
          <FieldCard
            field="inhHouseValBuildingStdPriceAtInheritance"
            label={`${acqTimeLabel} 시점 건물 기준시가`}
            unit="원"
            hint={`국세청 건물 기준시가 (${acqTimeLabel} 당시).`}
          >
            <CurrencyInput
              label=""
              hideUnit
              value={asset.inhHouseValBuildingStdPriceAtInheritance}
              onChange={(v) => onChange({ inhHouseValBuildingStdPriceAtInheritance: v })}
            />
          </FieldCard>

          {partial ? (
            <ToneCard tone="amber" noDark>
              <p className="text-xs text-amber-900" data-testid="building-sec164-partial-note">
                면적 입력 방식이 「일부 양도」이면 이 비교를 지원하지 않습니다 — 최초공시 당시 부수토지 전체 면적이 정해지지 않고 면적으로
                자동 안분하지 않습니다. 기본 정보에서 면적 입력 방식을 확인하세요.
              </p>
            </ToneCard>
          ) : (
            <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs space-y-1" data-testid="building-sec164-derived">
              {total > 0 ? (
                <>
                  <p>
                    최초 공시된 개별주택가격 {fmt(housePriceAtFirst)} ×{" "}
                    <Frac
                      top={`${acqTimeLabel} 시점 건물 기준시가 ${fmt(buildingAtAcq)}`}
                      bottom={`최초공시 토지 기준시가 ${fmt(landAtFirst)} + 최초공시 건물 기준시가 ${fmt(buildingAtFirst)}`}
                    />
                    {ratio < 1 && ` × 지분 ${Number((ratio * 100).toFixed(4))}%`}
                  </p>
                  <p className="font-medium">
                    {SPLIT_SEC164_BUILDING_VALUE_LABEL} <span className="font-mono tabular-nums" data-testid="building-sec164-total">{fmt(total)}</span>
                  </p>
                  <p className="text-muted-foreground">취득가액은 위 평가액과 이 가액 중 많은 금액입니다 — 어느 쪽인지는 계산 결과에서 확인하세요.</p>
                </>
              ) : (
                <p className="text-muted-foreground">
                  {status.missing.length > 0
                    ? `입력할 칸: ${status.missing.join(" · ")}`
                    : "입력값으로 계산한 건물 몫이 0원입니다 — 개별주택가격·기준시가를 원 단위로 입력했는지 확인하세요."}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
