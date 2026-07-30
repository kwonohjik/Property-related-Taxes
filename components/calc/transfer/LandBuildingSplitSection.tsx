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

import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { RadioCardGroup, type RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { BuildingStdPriceModalButton } from "@/components/calc/building-std-price/BuildingStdPriceModalButton";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { TransferLandStdPartCard } from "./TransferStdPriceCards";
import { TransferBuildingStdPartCard } from "./TransferStdPriceCards";
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
  /**
   * 취득시 기준시가가 **실제로 계산에 쓰이는가** — `requiresAcqStdPrice` 술어 결과.
   * 엔진·validate와 단일 소스를 공유하기 위해 **호출부가 계산해 주입**한다(재파생 금지).
   */
  acqStdPriceRequired: boolean;
  /** §164⑤ PHD + 양쪽 환산 — 엔진이 3-시점 경로로 early-return해 이 입력을 쓰지 않는다 */
  isPhdBothEstimated: boolean;
  /**
   * 양도시 기준시가를 파트 섹션에 두는가 — `saleStdPlacement(...)`의 파트 2값.
   * **호출부가 계산해 주입**한다(`CompanionAcqPurchaseBlock`) — 축 A와 같은 1회 계산을 공유해야
   * "같은 카드가 축 A·축 B에 동시 노출"이 구조적으로 불가능해진다(하위 재파생 금지).
   */
  saleStdInLandPart: boolean;
  saleStdInBuildingPart: boolean;
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
 * **토지분·건물분 모두 자산 종류와 무관하게 노출한다**(2026-07-30). 종전엔 건물분을 `building`
 * 전용으로 두고 주택은 `결합 총액 − 토지분` 역산만 허용했으나, 그 근거인 §163⑥2호가목은
 * "라목의 주택 **취득당시**의 라목 가액"을 전제한다 — 토지를 먼저 취득하고 건물을 나중에
 * 신축·취득했다면 **토지 취득 당시엔 주택이 없어** 라목 결합 공시가 애초에 존재하지 않는다.
 * 그 경우 §163⑥1호(토지)·2호(건물)가 각각 적용되므로 파트별 독립이 정본이다.
 */
function PartAcqStdPrice(props: {
  part: "land" | "building";
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
  /** 비소유 파트에 렌더할 때의 사유 안내 (`selfOwns ≠ both` — 소유는 없어도 계산에는 필요) */
  notOwnedReason?: string;
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
      // testid는 **카드 wrapper**에 둔다 — 내부 면적 input으로 카드 존재를 대리 판정하면
      // 카드가 남고 면적 칸만 빠졌을 때 거짓 통과한다(계획서 §7 testid 계획).
      <div data-testid="split-land-std-acq-card">
      <ToneCard tone="amber" title="토지 취득시 기준시가 (§99①1호 가목)" noDark>
        {props.notOwnedReason && (
          <p className="text-xs text-amber-800" data-testid="split-land-std-not-owned-note">
            {props.notOwnedReason}
          </p>
        )}
        <LandPriceLookupField
          label="취득시 토지 공시지가"
          pricePerSqm={asset.standardPricePerSqmAtAcq}
          onPricePerSqmChange={(v) => onChange({ standardPricePerSqmAtAcq: v })}
          area={parseDecimal(asset.acquisitionArea) || undefined}
          referenceDate={asset.landAcquisitionDate}
          jibun={asset.addressJibun}
          hint="토지 취득일 직전 고시 개별공시지가 (원/㎡) — 건물 취득일이 아니다 (소득령 §164③)"
          landStdPriceTestId="split-land-std-acq-total"
        />
        <FieldCard label="토지 면적" unit="㎡" hint="토지분 기준시가 = ㎡당 공시지가 × 이 면적">
          <DecimalInput
            value={asset.acquisitionArea}
            onChange={(v) => onChange({ acquisitionArea: v })}
            data-testid="split-land-std-acq-area"
          />
        </FieldCard>
      </ToneCard>
      </div>
    );
  }

  return (
    <div data-testid="split-building-std-acq-card">
    <ToneCard tone="amber" title="건물 취득시 기준시가 (§99①1호 나목)" noDark>
      <FieldCard
        label="취득시 건물기준시가"
        unit="원"
        hint="건물 취득일 직전 고시분 (§164③). 취득시기가 다르므로 결합 공시액에서 역산하면 건물분에 토지 취득시점이 섞인다."
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
          // 같은 ② 섹션에 「양도시 …」 런처가 인접할 수 있으므로 시점을 라벨에 명시한다
          // (기본값 "건물 기준시가 계산"은 부분일치 셀렉터가 두 버튼을 모두 잡는다).
          buttonLabel="취득시 건물 기준시가 계산"
          initialAddress={stdPriceAddress}
          // 「건물 기준시가 계산서」 서식 출력의 스냅샷 소스 — 키가 없으면 서식이 비어 출력된다.
          snapshotKey={`bsp-${asset.assetId}-split-acq`}
          applyTimePoint="acquisition"
          prefill={{
            landAreaM2: asset.acquisitionArea,
            acquisitionDate: asset.acquisitionDate,
            transferDate: props.transferDate,
            // 취득시 위치지수 소스 — 양도시 런처의 `transferLandPricePerSqm`와 대칭.
            // 트랙 분기(취득 ≤2000이면 2001 기준)는 모달이 `pickAcqLocationIndexLandPrice`로 처리한다.
            acqLandPricePerSqm: asset.standardPricePerSqmAtAcq,
          }}
          onApply={(v: number) => onChange({ buildingStandardPriceAtAcq: String(v) })}
        />
      </div>
    </ToneCard>
    </div>
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
  /** 양도시 기준시가 카드가 **이 파트 섹션 안**에 있는가 — 안내 문구가 가리킬 대상이 달라진다 */
  saleStdInPart: boolean;
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
  // estimated — 실입력 칸은 두지 않고 **위치만 지시**한다(입력 칸을 여기 복제하면 dual-truth).
  //
  // ⚠️ 방향은 "위"다. 축 A(양도시 기준시가)는 2026-07-29에 `LandBuildingSaleSplitSection`으로
  //    분리되며 **앞으로** 이동했고, 취득시 카드(PartAcqStdPrice)도 이 안내보다 앞에 렌더된다.
  //    종전 문구는 둘 다 "아래"라고 가리켜 사용자가 입력 위치를 찾지 못했다.
  // 2026-07-30부터 주택도 건물분 카드를 노출하므로(§163⑥2호가목 "취득당시" 요건 — 별개취득에는
  // 라목 결합 공시가 없다) 자산 종류로 갈리지 않는다. 종전 주택 분기(역산 서술)는 폐지.
  const acqSource = `위 「${label} 취득시 기준시가」 카드`;
  // 양도시 기준시가 카드는 배치에 따라 이 섹션 안(구분양도+환산) 또는 축 A(일괄양도)에 있다.
  // 없는 카드 이름을 가리키면 사용자가 입력 위치를 찾지 못한다(2026-07-30 배치 분리).
  const transferSource = props.saleStdInPart
    ? `위 「${label} 양도시 기준시가」 카드`
    : "위 「양도시 기준시가」 카드(양도가액 결정 방식 아래)";
  return (
    <ToneCard tone="amber" noDark bodyClassName="space-y-1">
      <p className="text-xs text-amber-900" data-testid={`split-${props.part}-estimated-note`}>
        {label} 환산취득가 = {label} 양도가액 × (취득시 기준시가 ÷ 양도시 기준시가)
        <br />· 취득시 기준시가 → {acqSource}
        <br />· 양도시 기준시가 → {transferSource}
      </p>
    </ToneCard>
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
  //
  // **노출 게이트는 `requiresAcqStdPrice` 술어**다(2026-07-29). 취득시 기준시가는 취득가액을
  // **환산해야 할 때만** 필요하므로, 양쪽 파트가 실지거래가액이면 계산 어디에도 등장하지 않는다.
  // 종전에는 게이트에 파트 모드가 없어, 같은 값을 받는 자산 전체 블록
  // (`CompanionAcqPurchaseBlock.tsx:554` — 이미 같은 술어로 게이팅)과 **노출/숨김이 서로 모순**이었다.
  // 술어는 호출부가 계산해 내려준다 — 여기서 재파생하면 dual-truth가 된다.
  const isHousingAsset = props.asset?.assetKind === "housing";
  const showLandStdPrice =
    !!props.isSeparateAcq &&
    props.acqStdPriceRequired &&
    // §164⑤ PHD + **양쪽** 환산은 `calcSplitGainPreDisclosure`로 early-return되어
    // (transfer-tax-split-gain.ts:341) 이 입력이 엔진에 도달하지 않는다. 한쪽만 환산이면
    // early-return이 걸리지 않아 카드가 실제로 필요하므로 `양쪽 estimated`로 한정한다.
    !props.isPhdBothEstimated &&
    (props.asset?.assetKind === "building" || isHousingAsset) &&
    !!props.asset &&
    !!props.onAssetChange;
  // **주택도 파트 독립 입력**(2026-07-30 사용자 확정 + §163⑥2호가목 실측). 종전엔 주택을 제외하고
  // `결합 총액 − 토지분` 역산만 허용했으나, 그 규정은 "**취득당시**의 라목 가액"을 전제한다 —
  // 토지를 먼저 취득하고 건물을 나중에 신축·취득했다면 토지 취득 당시엔 주택이 없어 라목 결합
  // 공시가 애초에 없다. 역산하면 건물분에 토지 취득시점이 섞인다(§164③ 직전 고시분 위반).
  const showBuildingStdPrice = showLandStdPrice;
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
            />
          )}
          {props.saleStdInLandPart && props.asset && props.onAssetChange && (
            <TransferLandStdPartCard
              asset={props.asset}
              onChange={props.onAssetChange}
              transferDate={props.transferDate}
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
            saleStdInPart={props.saleStdInLandPart}
          />
        </div>
      )}

      {/* ①' 토지 비소유(`selfOwns === "building_only"`) — 기준시가 카드만 별도 렌더.
          **소유 여부 ≠ 계산 입력 필요 여부.** 토지분 기준시가는 소유권이 아니라 건물분 도출·안분의
          소스다 — 주택(라목)은 `결합 총액 − 토지분` 역산이 건물분의 유일한 경로이므로, 이 카드가
          없으면 `calcAcqStdPair`가 null → `TaxCalculationError`("취득시 ㎡당 개별공시지가와 토지
          면적이 필요합니다")로 **입력 칸 없는 차단**이 된다(계획서 D6, probe 실측).
          엔진도 같은 비대칭을 전제한다 — 취득가액 미입력은 비소유 파트에 한해 허용하면서
          (transfer-tax-split-gain.ts:298) 기준시가는 소유와 무관하게 요구한다(:46-48).
          ⚠️ 취득가액 방식 라디오·금액 칸은 렌더하지 않는다 — 토지 gain은 폐기되므로
             (transfer-tax.ts:315-316) 입력을 요구하면 거짓 요구다. */}
      {!landOwned && showLandStdPrice && (
        <PartAcqStdPrice
          part="land"
          asset={props.asset!}
          onChange={props.onAssetChange!}
          transferDate={props.transferDate}
          notOwnedReason="토지는 타인 소유이나, 건물분 취득시 기준시가를 결합 공시액에서 도출하려면 토지분이 필요합니다 (소득세법 §99①1호 가목·라목)."
        />
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
          {props.saleStdInBuildingPart && props.asset && props.onAssetChange && (
            <TransferBuildingStdPartCard
              asset={props.asset}
              onChange={props.onAssetChange}
              transferDate={props.transferDate}
            />
          )}
          <PartAcqInputs
            part="building"
            mode={props.buildingAcqMode}
            isSeparateAcq={!!props.isSeparateAcq}
            acquisitionPrice={props.buildingAcquisitionPrice}
            onAcquisitionPriceChange={props.onBuildingAcquisitionPriceChange}
            salesCaseValue={props.buildingSalesCaseValue}
            onSalesCaseValueChange={props.onBuildingSalesCaseValueChange}
            saleStdInPart={props.saleStdInBuildingPart}
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
