"use client";

/**
 * 1990.8.30.~2005.4.29.에 상속·증여받은 **주택 부수토지**(건물은 매매)의 ②(영 §164⑦ 가액의 토지 몫) 입력 카드 — D1-H.
 *
 * 계획서: docs/00-pm/transfer-house-land-163-9-2.plan.md (Q-1~Q-5 권고안) · 근거 부동산거래관리과-364(2010.3.10.)
 *
 * 「소득세법 시행령」 §163⑨ 단서 2호: 건물 기준시가(단독·다가구주택은 개별주택가격)가 고시되기 전에 상속·증여받은 주택부수토지의 취득가액은
 * 상속개시일·증여일 평가액(①)과 영 §164⑦ 가액 중 **많은 금액**이다. 건물은 따로 샀으므로 ②는 영 §164⑦로 환산한 주택가격의 **토지 몫**이다
 * (재산세과-371 자산별 안분 — 취득당시 건물 기준시가는 약분된다, 브리지 주석). D2-4 `BuildingSec164Card`의 거울이다.
 *
 * - 노출은 구간의 주택(`houseLandSec164Applies` — 건물 매매 ∧ 유효 토지 원인 상속·증여 ∧ 토지 취득일 1990-08-30 ~ 2005-04-29)일 때만.
 * - **받을 당시 주택이 있었는가**(Q-1): 있었음 / 없었음 / 모름 — 미선택이면 아무것도 체크되지 않는다(⑧이 선택을 요구한다).
 *   있었음만 비교를 연다. 모름은 평가액만으로 계산하고 결과에 확인 필요를 표시한다(모름 = 불성립).
 * - **주택 구분 칸**: 단독·다가구만 연다(Q-3). 값은 **명시 선택**만 읽는다(D2-4 Check F1과 같다).
 * - ② 표시값은 **④가 보내는 것과 같은 브리지 함수**(`deriveHouseLandSec164Total`)를 읽는다(3중 패턴, effect 미러링 0). 채택값(max)은 없다.
 * - 토지 면적은 기본 정보의 칸(`acquisitionArea`)을 쓴다. 입력 키는 자산 단위 §164⑤~⑦ 위젯과 같은 `inhHouseVal*`(같은 물리량).
 */
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import { houseKindChangePatch } from "./inheritance/InheritanceHouseKindPicker";
import { LAND_CAUSE_META, type LandCause } from "./land-cause-meta";
import {
  deriveHouseLandSec164Total,
  houseLandKindSent,
  houseLandSec164Applies,
  landHouseExistedSent,
} from "@/lib/calc/transfer-house-land-sec164-bridge";
import { effectiveLandAcquisitionCause } from "@/lib/calc/transfer-land-part-cause";
import { isPartialAreaScenario } from "@/lib/calc/transfer-pre1990-housing-land-bridge";
import { sec164AreaSqm } from "@/lib/calc/transfer-pre1990-housing-land-bridge";
import { getOwnershipRatio } from "@/lib/calc/transfer-tax-api-asset-basics";
import { sec164HouseLandPartStatus } from "@/lib/calc/sec164-required-fields";
import { multiplyByArea } from "@/lib/tax-engine/area-utils";
import { HOUSE_LAND_APARTMENT_MESSAGE } from "@/lib/tax-engine/transfer-split-part-cause";
import { SPLIT_SEC164_HOUSE_LAND_VALUE_LABEL } from "@/lib/tax-engine/transfer-tax-split-display";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 개별주택가격 최초 공시일 — 최초공시 시점 칸의 조회 기준일 */
const HOUSE_FIRST_DISCLOSURE_DATE = "2005-04-30";

const EXISTED_OPTIONS = [
  { value: "yes", label: "있었음 — 받을 때 지금의 주택이 그 위에 있었다" },
  { value: "no", label: "없었음 — 받은 뒤에 지은 주택이다" },
  { value: "unknown", label: "모름 — 평가액만으로 계산하고 확인 필요로 표시" },
];

const HOUSE_KIND_OPTIONS = [
  { value: "house_individual", label: "단독·다가구주택 (개별주택가격 공시)" },
  { value: "house_apart", label: "공동주택 — 아파트·연립·다세대 (공동주택가격 공시)" },
];

const fmt = (n: number) => n.toLocaleString();

export function HouseLandSec164Card(props: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}) {
  const { asset, onChange } = props;
  if (!houseLandSec164Applies(asset)) return null;

  const cause = (effectiveLandAcquisitionCause(asset) || "inheritance") as LandCause;
  const meta = LAND_CAUSE_META[cause];
  const landDate = asset.landAcquisitionDate;
  const existed = landHouseExistedSent(asset);
  const kind = houseLandKindSent(asset);
  const partial = isPartialAreaScenario(asset);
  const status = sec164HouseLandPartStatus(asset);
  const total = deriveHouseLandSec164Total(asset);
  const ratio = getOwnershipRatio(asset);
  const area = sec164AreaSqm(asset) ?? 0;
  const housePriceAtFirst = parseAmount(asset.inhHouseValHousePriceAtFirst);
  const landAtAcq = multiplyByArea(parseAmount(asset.inhHouseValLandPricePerSqmAtInheritance), area);
  const landAtFirst = multiplyByArea(parseAmount(asset.inhHouseValLandPricePerSqmAtFirst), area);
  const buildingAtFirst = parseAmount(asset.inhHouseValBuildingStdPriceAtFirst);

  return (
    <div className="space-y-2" data-testid="house-land-sec164-card" data-field="landHouseSec164Value">
      <ToneCard tone="amber" noDark>
        <p className="text-xs text-amber-900">
          토지를 {landDate}에 {meta.label}받았는데 그때는 개별주택가격이 공시되기 전(2005.4.30. 이전)입니다. 받을 당시 지금의 주택이 그 위에
          있었다면 이 토지는 주택 부수토지라서, 위 {meta.valueLabel}과 최초 공시된 개별주택가격으로 환산한 주택가격의 토지 몫(
          <strong>{SPLIT_SEC164_HOUSE_LAND_VALUE_LABEL}</strong>) 중 <strong>많은 금액</strong>이 토지 취득가액입니다 (소득세법 시행령 §163조
          제9항 단서 2호 · 부동산거래관리과-364).
        </p>
      </ToneCard>

      <div className="space-y-1.5" data-field="landHouseExisted">
        <p className="text-caption text-muted-foreground font-medium">토지를 받을 당시 지금의 주택이 그 위에 있었나요?</p>
        <RadioCardGroup
          name={`land-house-existed-${asset.assetId}`}
          tone="amber"
          layout="stack"
          options={EXISTED_OPTIONS}
          value={existed ?? ""}
          onChange={(v) => onChange({ landHouseExisted: v as AssetForm["landHouseExisted"] })}
        />
      </div>

      {existed === "unknown" && (
        <ToneCard tone="amber" noDark>
          <p className="text-xs text-amber-900" data-testid="house-land-sec164-unknown-note">
            받을 당시 주택이 있었는지 확인되지 않으면 이 비교를 하지 않고 평가액만으로 계산합니다. 결과에 확인 필요로 표시됩니다.
          </p>
        </ToneCard>
      )}

      {existed === "yes" && (
        <>
          <div className="space-y-1.5" data-field="inheritanceAssetKind">
            <p className="text-caption text-muted-foreground font-medium">주택 구분</p>
            <RadioCardGroup
              name={`house-land-kind-${asset.assetId}`}
              tone="amber"
              layout="stack"
              options={HOUSE_KIND_OPTIONS}
              value={kind ?? ""}
              onChange={(v) => onChange(houseKindChangePatch(asset, v))}
            />
          </div>

          {kind === "house_apart" && (
            <ToneCard tone="amber" noDark>
              <p className="text-xs text-amber-900" data-testid="house-land-sec164-apart-note">
                {HOUSE_LAND_APARTMENT_MESSAGE}
              </p>
            </ToneCard>
          )}

          {kind === "house_individual" && (
            <>
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
                토지 {meta.dateLabel} 시점 ({landDate})
              </p>
              <LandPriceLookupField
                label={`${meta.dateLabel} 개별공시지가`}
                data-field="inhHouseValLandPricePerSqmAtInheritance"
                referenceDate={landDate}
                pricePerSqm={asset.inhHouseValLandPricePerSqmAtInheritance}
                onPricePerSqmChange={(v: string) => onChange({ inhHouseValLandPricePerSqmAtInheritance: v })}
                area={area || undefined}
                jibun={asset.addressJibun || undefined}
              />

              {partial ? (
                <ToneCard tone="amber" noDark>
                  <p className="text-xs text-amber-900" data-testid="house-land-sec164-partial-note">
                    면적 입력 방식이 「일부 양도」이면 이 비교를 지원하지 않습니다 — 최초공시 당시 부수토지 전체 면적이 정해지지 않고 면적으로
                    자동 안분하지 않습니다. 기본 정보에서 면적 입력 방식을 확인하세요.
                  </p>
                </ToneCard>
              ) : (
                <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs space-y-1" data-testid="house-land-sec164-derived">
                  {total > 0 ? (
                    <>
                      <p>
                        최초 공시된 개별주택가격 {fmt(housePriceAtFirst)} ×{" "}
                        <Frac
                          top={`${meta.dateLabel} 토지 기준시가 ${fmt(landAtAcq)}`}
                          bottom={`최초공시 토지 기준시가 ${fmt(landAtFirst)} + 최초공시 건물 기준시가 ${fmt(buildingAtFirst)}`}
                        />
                        {ratio < 1 && ` × 지분 ${Number((ratio * 100).toFixed(4))}%`}
                      </p>
                      <p className="font-medium">
                        {SPLIT_SEC164_HOUSE_LAND_VALUE_LABEL} <span className="font-mono tabular-nums" data-testid="house-land-sec164-total">{fmt(total)}</span>
                      </p>
                      <p className="text-muted-foreground">취득가액은 위 평가액과 이 가액 중 많은 금액입니다 — 어느 쪽인지는 계산 결과에서 확인하세요.</p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">
                      {status.missing.length > 0
                        ? `입력할 칸: ${status.missing.join(" · ")}`
                        : "입력값으로 계산한 토지 몫이 0원입니다 — 개별주택가격·공시지가·기준시가를 원 단위로 입력했는지 확인하세요."}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
