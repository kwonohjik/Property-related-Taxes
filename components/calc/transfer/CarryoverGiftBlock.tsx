"use client";

/**
 * 이월과세(증여) 취득 입력 블록 — §97조의2
 *
 * acquisitionCause === "carryover_gift" 시에만 렌더.
 * CompanionAcqGiftBlock(단순 증여 신고가액)과 완전 분리 — 기존 gift 흐름 회귀 없음.
 *
 * 섹션 구성:
 *  ① 증여 기본 정보 (등기접수일·증여자 취득일·증여자 취득원인)
 *  ② 증여자 취득가액 (환산 토글 + 직접 입력)
 *  ③ 필요경비 가산 (증여세 상당액·증여자 자본적지출)
 *  ④ 비교과세 기준 — Scenario B 취득가 (증여 당시 평가액)
 *  ⑤ 적용배제 선언 (CarryoverGiftExclusionSection)
 */

import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { CarryoverGiftExclusionSection } from "./CarryoverGiftExclusionSection";
import { CarryoverEstimationSection } from "./CarryoverEstimationSection";
import { CarryoverDonorBuiltSection } from "./CarryoverDonorBuiltSection";
import { isFractionalOwnership } from "@/lib/calc/transfer-tax-api-helpers";
import { carryoverHouseholdFactVisible } from "@/lib/calc/transfer-tax-api-carryover";
import { gbBgSplitsGiftValuation } from "@/lib/calc/gb-bg-gift-tax-return";
import { bgHouseSplitMode } from "@/lib/calc/bg-house-split";
import { effectiveCarryoverDonorSplit } from "@/lib/calc/transfer-land-part-cause";
import { CarryoverDonorSplitToggle } from "./CarryoverDonorSplitToggle";
import { SplitCarryoverParts } from "./SplitCarryoverParts";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset-carryover";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";

// ── 법령 배지 ────────────────────────────────────────────────────
function LegalBadge({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center rounded border border-border bg-background px-1.5 py-0.5 text-micro font-medium text-muted-foreground">
      {text}
    </span>
  );
}

// ── 증여자 취득원인 라디오 옵션 ──────────────────────────────────
const DONOR_CAUSE_OPTIONS = [
  { value: "purchase" as const, label: "매매" },
  { value: "inheritance" as const, label: "상속" },
  { value: "gift" as const, label: "증여" },
];

/**
 * 지분(공유) 모드에서 **증여세 칸에만** 붙는 예외 안내.
 *
 * `OwnershipRatioBlock`의 배너는 「양도가액·취득가액·필요경비는 물건 전체(100%) 기준으로
 * 입력합니다. 시스템이 지분율을 자동으로 적용합니다」라고 선언한다. 그런데 증여세 3칸
 * (산출세액·과세가액·상당액)은 ④ 변환에서 **의도적으로 미스케일**이다
 * (`lib/calc/transfer-tax-api-carryover.ts` · `-gb-carryover.ts`의 `giftTaxAmount` ·
 * `GIFT_EVENT_SCALE`) — 증여세 신고서에 적힌 실제 금액이고, 「100% 기준 증여세」라는
 * 관측 가능한 금액이 존재하지 않기 때문이다.
 *
 * 🔴 증여세 상당액은 「소득세법」 §97의2① **3호**의 필요경비다(`legal-codes/transfer.ts`
 *    `CARRYOVER_GIFT_TAX_EXPENSE`). ⚠️ **2호가 아니다** — 2호는 아래 「증여자 자본적지출」
 *    칸이다(같은 파일 `:288`·`:291`). 「① 2호 (전단)」은 2023.12.31. 개정 **전** 구조이고
 *    2026-08-10에 이미 정정된 인용이니 되돌리지 말 것.
 *    배너를 문자 그대로 읽어 100%로 환산해 넣으면 필요경비가 지분율의 역수배로
 *    들어간다 ⇒ 예외를 명시한다.
 */
export const SHARE_MODE_GIFT_TAX_HINT =
  " 지분 모드 예외 — 100% 기준으로 환산하지 말고 증여세 신고서에 적힌 금액을 그대로 입력합니다(위 「양도가액·취득가액·필요경비는 100% 기준」 안내가 적용되지 않는 칸입니다).";

// ── Props ──────────────────────────────────────────────────────
interface Props {
  asset: AssetForm;
  /** 양도일 (YYYY-MM-DD) — 시행시기 가드용 */
  transferDate: string;
  onChange: (patch: Partial<AssetForm>) => void;
  /**
   * 일반건물 건물 파트 블록이면 "building" — 검증 오류 이동 앵커 키가 `buildingCarryover.*`가 된다
   * (`transfer-tax-validate-gb-carryover.ts`가 파트별 객체를 가리킨다). 기본은 `carryover.*`.
   */
  part?: "land" | "building";
  /** 함께 양도하는 두 번째 이후 자산 — 파트 이월과세(C)를 쓸 수 없다(토글 대신 안내). */
  isNonPrimaryAsset?: boolean;
  /** 함께 양도하는 다른 자산이 있다(assets.length>1) — C를 켜 둔 첫 자산에 안내한다(엔진 S2′ 400과 같은 사실). */
  hasCompanions?: boolean;
  /**
   * 일반건물 건물 블록 — 증여 사건 서브폼(`gbCarryoverEventSource`)의 「당초 증여 때 채무를 인수했다」 값. 건물 블록은 `carryover` 자리에 건물 서브폼을 받으므로
   * 사건 값을 부모가 따로 넘긴다. 생략하면 이 블록 서브폼의 값이다(사건 블록).
   */
  eventGiftDebtAssumed?: boolean;
}

/** carryover 서브객체 패치 헬퍼 */
function patchCarryover(
  current: CarryoverTaxationForm | undefined,
  patch: Partial<CarryoverTaxationForm>,
): CarryoverTaxationForm {
  return { ...(current ?? CARRYOVER_DEFAULTS), ...patch };
}

/** exclusionDeclared 패치 헬퍼 */
function patchExclusion(
  current: CarryoverTaxationForm | undefined,
  patch: Partial<CarryoverTaxationForm["exclusionDeclared"]>,
): CarryoverTaxationForm {
  const base = current ?? CARRYOVER_DEFAULTS;
  return { ...base, exclusionDeclared: { ...base.exclusionDeclared, ...patch } };
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────
/** 당초 증여자의 건물 취득일 안내 — 둘 다 이월과세(부담부증여 일반건물)의 건물분 칸(분리 OFF)·건물 블록(분리 ON). */
const BUILDING_DONOR_DATE_HINT =
  "당초 증여자가 건물을 취득한 날 — 직접 신축했으면 사용승인서 교부일 등(「소득세법 시행령」 제162조 제1항 제4호). 건물 보유기간·장기보유특별공제 기산일 (소득세법 §95 ④)";

export function CarryoverGiftBlock({ asset, transferDate, onChange, part = "land", isNonPrimaryAsset, hasCompanions, eventGiftDebtAssumed }: Props) {
  const isBuildingPart = part === "building";
  const c = asset.carryover ?? CARRYOVER_DEFAULTS;
  // P2 C — 증여자가 토지·건물을 다른 날 취득(파트 이월과세). 이 값 하나로 카드 구성·⑥·④·⑧이 갈린다(`effectiveCarryoverDonorSplit`).
  //   일반건물 파트 블록(`part` 지정)에서는 쓰지 않는다 — 일반건물은 자체 파트 카드가 있다.
  const splitMode = effectiveCarryoverDonorSplit(asset, { isNonPrimary: isNonPrimaryAsset });

  // 시행시기 가드: 양도일 < 2024-01-01 이면 증여자 자본적지출 비활성
  const isAfter2024 = transferDate >= "2024-01-01";

  /**
   * 일반건물은 하나의 증여가 **토지·건물 두 자산**으로 갈린다 —
   * 증여세 상당액을 엔진이 영 §163의2②로 안분하므로 입력 칸이 달라진다.
   */
  const isGeneralBuilding = asset.assetKind === "general_building";
  /** 부담부증여 일반건물 — 증여세 칸은 같지만 상당액은 ④가 자산 전체로 계산하고 §159가 채무 비율로 나눈다(`gb-bg-gift-tax-return.ts`). */
  const isBurdenedGift = asset.transferType === "burdened_gift";
  /** 토지·건물 둘 다 이월과세인 부담부증여 일반건물 — 평가액을 토지분·건물분으로 받는다(④·⑧과 같은 술어 · `gb-bg-carryover-gift-tax-part-limit.plan.md` Q-2 a · Q-3 b). */
  const splitsGiftValuation = gbBgSplitsGiftValuation(asset);
  /** 주택·건물 부담부증여 토글 C — 당초 증여자가 토지·건물을 다른 날 취득했다. 건물분 증여자 취득일을 일반건물과 같은 키로 받는다(④·⑧ `bgHouseSplitMode`). */
  const houseSplitC = bgHouseSplitMode(asset, { isNonPrimary: isNonPrimaryAsset }) === "carryover";
  /** 증여 사건 블록인가 — 일반건물 건물 블록은 토지도 이월과세면 사건 블록이 아니다(`gbCarryoverEventSource`). 인수채무 토글은 사건 블록에만 둔다. */
  const isEventBlock = !(isGeneralBuilding && isBuildingPart && asset.acquisitionCause === "carryover_gift");
  /** 당초 증여 때 채무를 인수했는가(사건 값) — 켜지면 일반건물은 파트마다 인수채무 칸을 받는다(`carryover-gift-tax-numerator-net.plan.md` Q-2 a · Q-3 a). */
  const debtAssumed = eventGiftDebtAssumed ?? c.giftDebtAssumed;
  /** 일반건물 토지·건물 둘 다 이월과세 — 칸 이름에 토지분·건물분을 붙인다(인수채무는 파트마다 받는다). */
  const gbBothCarryover = isGeneralBuilding && asset.acquisitionCause === "carryover_gift" && asset.gbBuildingAcquisitionCause === "carryover_gift";
  /** 부담부증여 일반건물 건물 블록인데 토지도 이월과세 — 증여 사건은 토지 블록이 정본이라(`gbCarryoverEventSource`) 이 블록의 사건 칸은 ④가 읽지 않는다. */
  const eventOnLandBlock = isGeneralBuilding && isBurdenedGift && isBuildingPart && asset.acquisitionCause === "carryover_gift";
  /**
   * 부담부증여 — 당초 증여자 취득가액은 「당초 증여자」 블록(`bgCoDonor*`)이 정본이다(영 §159와 함께 쓴다). 이 블록의 취득가액·취득원인·환산 칸은 ④·엔진이 쓰지 않는다.
   * 일반건물에서 먼저 정리했고(`gb-bg-on-building-block-fields.plan.md` Q-2 a) 엔진 부담부증여 분기는 자산 종류와 무관하다 — 주택·건물·토지·상업용건물도 같다(2026-10-27 실측: 1원·9.99억 같은 세액).
   */
  const donorBasisInCoDonorBlock = isBurdenedGift;

  /**
   * 지분(공유) 모드 여부 — 판정 술어는 `OwnershipRatioInput`이 쓰는 것과 **같은 소스**다
   * (`isFractionalOwnership` → `isFractionalRatioStr` → `isFractionalRatio`).
   * 두 곳이 각자 판정하면 배너는 뜨는데 예외 안내는 안 뜨는 어긋남이 난다.
   */
  const shareMode = isFractionalOwnership(asset);
  const giftTaxShareHint = shareMode ? SHARE_MODE_GIFT_TAX_HINT : "";

  function updateCarryover(patch: Partial<CarryoverTaxationForm>) {
    onChange({ carryover: patchCarryover(asset.carryover, patch) });
  }

  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-4 dark:bg-amber-950/40">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">이월과세(증여) 정보</p>
        <LegalBadge text="소득세법 §97조의2" />
        <LawArticleModal legalBasis="소득세법 §97의2" label="§97의2" />
      </div>

      {/*
        요건 안내 — 오입력을 **선택 시점에** 줄이는 주 방어.
        「증여」와 「이월과세(증여)」의 차이를 모르면 형제 증여에도 이 원인을 고르게 된다.
      */}
      <p className="text-caption text-amber-800 dark:text-amber-200">
        <strong>배우자 또는 직계존비속</strong>으로부터 증여받고, 증여일부터{" "}
        <strong>10년</strong>(2023.1.1. 전 증여는 5년) 이내에 양도하는 경우에 적용됩니다.
        그 밖의 관계로부터 증여받았다면 취득 원인을 <strong>「증여」</strong>로 선택하세요.
      </p>

      {/* 파트 이월과세(C) 안내 — 함께 양도 자산이 있으면 계산하지 못한다(N8). 1세대1주택 겹침(N4)은 P5에서 §97의2②2호 판정으로 계산한다. */}
      {splitMode && hasCompanions && (
        <div className="space-y-2" data-testid="split-carryover-notices">
          <ToneCard tone="rose" bodyClassName="space-y-1">
            <p className="text-caption text-rose-800 dark:text-rose-200" data-testid="split-carryover-companion-exists-note">
              함께 양도하는 다른 자산이 있으면 토지·건물 파트 이월과세를 아직 계산하지 못합니다 — 파트별 비교과세(§97의2②3호)가 신고 전체의 결정세액을 보지 못하기 때문입니다.
              이 입력은 이 자산 한 건만 양도할 때 쓸 수 있습니다.
            </p>
          </ToneCard>
        </div>
      )}

      {/* ① 증여 기본 정보 */}
      <div className="rounded-md border border-amber-200/70 bg-amber-50/60 p-3 space-y-3 dark:bg-amber-950/40">
        <div className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-micro font-bold text-amber-800 select-none">1</span>
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">증여 기본 정보</p>
        </div>

        {/* Q-1 a — 증여 사건 칸은 토지 블록 한 벌이다(위 안내문). */}
        {!eventOnLandBlock && (
          <FieldCard
            label="증여 등기접수일"
            field="carryover.giftRegistryDate"
            hint="소득세법 §97조의2 ③ — 이월과세 적용기간 기산일 (등기부 기재일)"
            trailing={<LawArticleModal legalBasis="소득세법 §97의2 ③" label="§97의2③" />}
          >
            <DateInput
              value={c.giftRegistryDate}
              onChange={(v) => updateCarryover({ giftRegistryDate: v })}
            />
          </FieldCard>
        )}

        {/* 모드 토글은 영향받는 필드(증여자 취득일) 직전 — 켜면 아래 입력이 토지·건물 파트 카드로 바뀐다. 일반건물 파트 블록에는 두지 않는다. */}
        <CarryoverDonorSplitToggle asset={asset} onChange={onChange} isNonPrimaryAsset={isNonPrimaryAsset} />

        {!splitMode && (<>
        <FieldCard
          label={splitsGiftValuation || houseSplitC ? `${isBuildingPart ? "건물분" : "토지분"} 증여자 취득일` : "증여자 취득일"}
          field={isBuildingPart ? "buildingCarryover.donorAcquisitionDate" : "carryover.donorAcquisitionDate"}
          hint={splitsGiftValuation && isBuildingPart ? BUILDING_DONOR_DATE_HINT : "보유기간·장기보유특별공제 기산일 (소득세법 §95 ④)"}
        >
          <DateInput
            value={c.donorAcquisitionDate}
            onChange={(v) => updateCarryover({ donorAcquisitionDate: v })}
          />
        </FieldCard>
        {/* 분리 OFF 둘 다 이월과세(부담부증여) — 건물분 증여자 취득일도 이 블록에서 받는다. 분리 ON은 건물 블록이 같은 키로 받는다(`gb-bg-donor-building-acquisition-date.plan.md` Q-1 a). */}
        {((splitsGiftValuation && !asset.hasSeperateLandAcquisitionDate) || houseSplitC) && !isBuildingPart && (
          <FieldCard label="건물분 증여자 취득일" field="buildingCarryover.donorAcquisitionDate" hint={BUILDING_DONOR_DATE_HINT}>
            <DateInput
              value={asset.buildingCarryover?.donorAcquisitionDate ?? ""}
              onChange={(v) => onChange({ buildingCarryover: patchCarryover(asset.buildingCarryover, { donorAcquisitionDate: v }) })}
            />
          </FieldCard>
        )}

        {!donorBasisInCoDonorBlock && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">증여자 취득원인</p>
          <RadioCardGroup
            name={`donorAcquisitionCause-${asset.assetId ?? "primary"}`}
            tone="amber"
            layout="inline"
            options={DONOR_CAUSE_OPTIONS}
            value={c.donorAcquisitionCause}
            onChange={(v) => updateCarryover({ donorAcquisitionCause: v as CarryoverTaxationForm["donorAcquisitionCause"] })}
          />
          {/* 이 값은 엔진에 전송되지 않는다(타입 JSDoc 참조) — 아래 ② 취득가액을 어떤 기준으로
              채울지 알려 주는 안내 축이다. 상속·증여는 §163⑨가 실지거래가액을 의제한다. */}
          <p className="text-xs text-muted-foreground">
            {c.donorAcquisitionCause === "purchase"
              ? "아래 ② 증여자 취득가액에 증여자의 실지거래가액을 입력하세요 (소득세법 §97①1호)."
              : "상속·증여로 취득한 경우 증여자의 취득가액은 상속개시일·증여일 현재 「상속세 및 증여세법」 평가액입니다 (소득세법 시행령 §163⑨). 그 금액을 아래 ②에 입력하세요."}
          </p>
        </div>
        )}
        </>)}
      </div>

      {splitMode ? (
        <SplitCarryoverParts asset={asset} onChange={onChange} isAfter2024={isAfter2024} giftTaxShareHint={giftTaxShareHint} />
      ) : (<>
      {/* ② 증여자 취득가액 */}
      <div className="rounded-md border border-amber-200/70 bg-amber-50/60 p-3 space-y-3 dark:bg-amber-950/40">
        <div className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-micro font-bold text-amber-800 select-none">2</span>
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">증여자 취득가액</p>
        </div>

        {donorBasisInCoDonorBlock && (
          <p className="text-caption text-muted-foreground" data-testid="gb-bg-donor-basis-elsewhere">
            부담부증여에서는 당초 증여자의 취득 당시 값을 「이월과세 — 「당초 증여자」 취득 당시 값」에서 입력합니다(「소득세법」 제97조의2 제1항 제1호 · 「소득세법 시행령」 제159조 제1항).
          </p>
        )}

        {/* 부담부증여 일반건물은 켜져 있을 때만 보인다 — 남은 값을 끌 유일한 경로다(⑧이 막는다 · `transfer-tax-validate-bg.ts`). */}
        {(!donorBasisInCoDonorBlock || c.useEstimatedAcquisition) && (
        <ToggleCard
          tone="amber"
          title="환산취득가 사용"
          description="증여자 실거래가를 알 수 없거나, 기준시가 환산·최초공시 전 환산 방식을 적용하는 경우"
          checked={c.useEstimatedAcquisition}
          onCheckedChange={(v) =>
            updateCarryover({
              useEstimatedAcquisition: v,
              // 토글 OFF 시 환산 모드 초기화
              estimationMode: v ? c.estimationMode : null,
            })
          }
        />
        )}

        {/* 환산 OFF: 증여자 실거래가 직접 입력 */}
        {!c.useEstimatedAcquisition && !donorBasisInCoDonorBlock && (
          <FieldCard
            label="증여자 취득가액"
            field={isBuildingPart ? "buildingCarryover.donorAcquisitionPrice" : "carryover.donorAcquisitionPrice"}
            hint="증여자의 실제 취득가액 (매매계약서·상속세신고서 등 증빙 기준)"
          >
            <CurrencyInput
              label=""
              value={c.donorAcquisitionPrice}
              onChange={(v) => updateCarryover({ donorAcquisitionPrice: v })}
            />
          </FieldCard>
        )}

        {/* 환산 ON: 환산 방식 선택 + 방식별 입력 패널 */}
        {c.useEstimatedAcquisition && !donorBasisInCoDonorBlock && (
          <CarryoverEstimationSection
            asset={asset}
            carryover={c}
            transferDate={transferDate}
            onCarryoverChange={(patch) => updateCarryover(patch)}
            onAssetChange={(patch) => onChange(patch)}
            part={part}
            isNonPrimaryAsset={isNonPrimaryAsset}
          />
        )}

        {/* 환산 입력 다음 — 그 건물이 증여자 신축·증축인가 (§114조의2). 노출 술어는 ④ 전송·⑧ 필수와 같다(`donor-built-scope.ts`). */}
        <CarryoverDonorBuiltSection
          asset={asset}
          transferDate={transferDate}
          isNonPrimaryAsset={isNonPrimaryAsset}
          onChange={onChange}
          onCarryoverChange={updateCarryover}
        />
        {/* 일반건물 건물 파트 — 같은 질문을 건물 서브폼(`buildingCarryover`)에서 받는다(PR-5a). 토지 블록(`part="land"`)에는 뜨지 않는다(건물분만 대상, D4). */}
        {isBuildingPart && (
          <CarryoverDonorBuiltSection
            mode="gb"
            asset={asset}
            transferDate={transferDate}
            onChange={onChange}
            onCarryoverChange={updateCarryover}
          />
        )}
      </div>

      {/* ③ 필요경비 가산 — 토지도 이월과세인 부담부증여 건물 블록에서는 칸이 모두 사건 칸이라 섹션째 숨긴다(Q-1 a · Q-3 a). */}
      {!eventOnLandBlock && (
      <div className="rounded-md border border-amber-200/70 bg-amber-50/60 p-3 space-y-3 dark:bg-amber-950/40">
        <div className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-micro font-bold text-amber-800 select-none">3</span>
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">필요경비 가산</p>
        </div>

        {/*
          🔑 **일반건물은 자산이 토지·건물로 갈린다** — 증여세 상당액을 사용자가 안분해 넣으면
             검산이 불가능하고, 두 파트 합이 산출세액을 넘어도 막을 수 없다.
             ⇒ 산출세액·과세가액을 받아 **엔진이 영 §163의2②로 파트별 산정**한다.
             다른 자산종류는 종전대로 안분된 값을 직접 받는다(의미가 다른 값이라 병존시킨다).
        */}
        {isGeneralBuilding ? (
          <>
            <FieldCard
              label="증여세 산출세액"
              field={isBuildingPart ? "buildingCarryover.giftTaxCalculated" : "carryover.giftTaxCalculated"}
              hint={
                (isBurdenedGift
                  ? "「소득세법 시행령」 제163조의2 제2항 제1호 — 증여받은 자산 전체에 대한 증여세 산출세액. 아래 증여 당시 평가액이 과세가액에서 차지하는 비율로 증여세 상당액을 계산하고, 채무 비율로 양도로 보는 부분의 몫을 나눕니다."
                  : "「소득세법 시행령」 제163조의2 제2항 제1호 — 증여받은 자산 전체에 대한 증여세 산출세액. 토지·건물 몫은 아래 과세가액으로 자동 안분됩니다.") +
                giftTaxShareHint
              }
              trailing={<LawArticleModal legalBasis="소득세법 시행령 §163의2" label="시행령 §163의2" />}
            >
              <CurrencyInput
                label=""
                value={c.giftTaxCalculated}
                onChange={(v) => updateCarryover({ giftTaxCalculated: v })}
                placeholder="없으면 0"
              />
            </FieldCard>

            <FieldCard
              label="증여세 과세가액"
              field={isBuildingPart ? "buildingCarryover.giftTaxBase" : "carryover.giftTaxBase"}
              hint={
                "「상속세 및 증여세법」 제47조 과세가액 — 안분 분모입니다. 증여받은 재산 전체 기준." +
                giftTaxShareHint
              }
            >
              <CurrencyInput
                label=""
                value={c.giftTaxBase}
                onChange={(v) => updateCarryover({ giftTaxBase: v })}
              />
            </FieldCard>

            {/* 영 §163의2②2호 분자 「해당 자산가액(증여세가 과세된 증여세 과세가액)」 — 당초 증여 때 인수한 채무를 뺀다. 사건 사실이라 사건 블록에만 둔다. */}
            {isEventBlock && (
              <ToggleCard
                tone="amber"
                title="당초 증여 때 채무를 인수했다"
                description="증여세 신고서에서 증여재산가액에서 뺀 채무가 있으면 켭니다 — 안분의 분자는 그 자산의 증여세 과세가액(평가액 − 인수채무)입니다(「상속세 및 증여세법」 제47조 제1항 · 「소득세법 시행령」 제163조의2 제2항 제2호)."
                checked={c.giftDebtAssumed}
                onCheckedChange={(v) => updateCarryover({ giftDebtAssumed: v })}
                data-testid="carryover-gift-debt-assumed"
              />
            )}
          </>
        ) : (
          <FieldCard
            label="증여세 상당액"
            field="carryover.giftTaxAmount"
            hint={
              "소득세법 시행령 §163의2②: 증여세 산출세액 × 「양도한 해당 자산의 증여세 과세가액(당초 증여 때 인수한 채무를 뺀 금액)을 증여세 과세가액으로 나눈 비율」. 미신고 시 0 입력." +
              giftTaxShareHint
            }
            trailing={<LawArticleModal legalBasis="소득세법 시행령 §163의2" label="시행령 §163의2" />}
          >
            <CurrencyInput
              label=""
              value={c.giftTaxAmount}
              onChange={(v) => updateCarryover({ giftTaxAmount: v })}
              placeholder="없으면 0"
            />
          </FieldCard>
        )}

        {/* 부담부증여 일반건물 · 둘 다 이월과세 — 토지 블록 한 칸이 자산 전체 합계다(건물 블록은 ③ 섹션째 숨긴다 · `gb-bg-on-building-block-fields.plan.md` Q-3 a). */}
        <FieldCard
          label={splitsGiftValuation && !isBuildingPart ? "증여자 자본적지출(토지·건물 합계)" : "증여자 자본적지출"}
          field={isBuildingPart ? "buildingCarryover.donorCapitalExpenditure" : "carryover.donorCapitalExpenditure"}
          hint={
            !isAfter2024
              ? "2024.1.1. 이후 양도분부터 적용 (2023.12.31. 신설)"
              : splitsGiftValuation && !isBuildingPart
                ? "당초 증여자가 토지·건물에 지출한 자본적 지출액을 합쳐 한 번만 입력합니다 — 취득 당시 기준시가 비율로 나눕니다 (소득세법 §97조의2 ① 2호)"
                : "증여자가 보유기간 중 지출한 자본적 지출액 (소득세법 §97조의2 ① 2호)"
          }
          trailing={<LawArticleModal legalBasis="소득세법 §97의2 ① 2호" label="§97의2①2호" />}
        >
          <CurrencyInput
            label=""
            value={c.donorCapitalExpenditure}
            onChange={(v) => updateCarryover({ donorCapitalExpenditure: v })}
            placeholder={isAfter2024 ? "없으면 비워두세요" : "해당 없음"}
            disabled={!isAfter2024}
          />
        </FieldCard>
      </div>
      )}

      {/* ④ 비교과세 기준 — Scenario B 취득가 */}
      <div className="rounded-md border border-amber-200/70 bg-amber-50/60 p-3 space-y-3 dark:bg-amber-950/40">
        <div className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-micro font-bold text-amber-800 select-none">4</span>
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">비교과세 기준 (미적용 시나리오)</p>
        </div>

        <FieldCard
          label={splitsGiftValuation ? `${isBuildingPart ? "건물분" : "토지분"} 증여 당시 평가액` : "증여 당시 평가액"}
          field={isBuildingPart ? "buildingCarryover.giftDateValuation" : "carryover.giftDateValuation"}
          hint={
            splitsGiftValuation
              ? `토지·건물을 함께 증여받았으면 증여세 신고서의 ${isBuildingPart ? "건물" : "토지"} 평가액만 입력합니다${isBuildingPart ? "" : ". 자산 전체 평가액이 들어 있으면(이전에 저장한 계산 포함) 토지 평가액으로 고쳐 주세요"} — 증여세 상당액을 토지분·건물분 평가액 비율로 나눕니다(「소득세법 시행령」 제163조의2 제2항 제2호 — 양도한 해당 자산가액).`
              : isGeneralBuilding && isBurdenedGift
                ? "증여세 상당액 안분의 분자(「소득세법 시행령」 제163조의2 제2항 제2호 — 양도한 해당 자산가액)로 사용. 보충적평가액·시가·감정가 중 해당 금액."
                : "이월과세 미적용 시나리오(B)에서 수증자의 취득가액으로 사용. 보충적평가액·시가·감정가 중 해당 금액."
          }
        >
          <CurrencyInput
            label=""
            value={c.giftDateValuation}
            onChange={(v) => updateCarryover({ giftDateValuation: v })}
            placeholder="증여 당시 보충적평가액 또는 시가"
          />
        </FieldCard>
        {/* 인수채무 — 평가액(B 취득가액)은 그대로 두고 증여세 상당액 분자에서만 뺀다(④ `carryoverAssumedDebt` · ⑧ 필수·평가액 이하). */}
        {isGeneralBuilding && debtAssumed && (
          <FieldCard
            label={gbBothCarryover ? `${isBuildingPart ? "건물분" : "토지분"} 당초 증여 때 인수한 채무` : "당초 증여 때 인수한 채무"}
            field={isBuildingPart ? "buildingCarryover.giftAssumedDebt" : "carryover.giftAssumedDebt"}
            hint={`${gbBothCarryover ? (isBuildingPart ? "건물" : "토지") + "에" : "이 자산에"} 담보된 채무로서 당초 증여 때 인수해 증여세 과세가액에서 빠진 금액 — 증여세 상당액 안분의 분자에서 뺍니다. 위 평가액(미적용 시 취득가액)은 그대로입니다 (「상속세 및 증여세법」 제47조 제1항 · 「소득세법 시행령」 제163조의2 제2항 제2호).`}
          >
            <CurrencyInput
              label=""
              value={c.giftAssumedDebt}
              onChange={(v) => updateCarryover({ giftAssumedDebt: v })}
              placeholder="없으면 0"
            />
          </FieldCard>
        )}
        {/* 분리 OFF는 건물 블록이 없다(부담부증여는 §159 경로라 건물 이월과세 카드를 숨긴다) — 건물분 평가액만 이 블록에서 받는다(Q-3 b). 분리 ON은 건물 블록이 받는다. */}
        {splitsGiftValuation && !isBuildingPart && !asset.hasSeperateLandAcquisitionDate && (
          <FieldCard
            label="건물분 증여 당시 평가액"
            field="buildingCarryover.giftDateValuation"
            hint="증여세 신고서의 건물 평가액 — 증여세 상당액을 위 토지분과 이 건물분 평가액 비율로 나눕니다(「소득세법 시행령」 제163조의2 제2항 제2호)."
          >
            <CurrencyInput
              label=""
              value={asset.buildingCarryover?.giftDateValuation ?? ""}
              onChange={(v) => onChange({ buildingCarryover: patchCarryover(asset.buildingCarryover, { giftDateValuation: v }) })}
              placeholder="증여 당시 보충적평가액 또는 시가"
              data-testid="bg-building-gift-valuation"
            />
          </FieldCard>
        )}
        {splitsGiftValuation && !isBuildingPart && !asset.hasSeperateLandAcquisitionDate && debtAssumed && (
          <FieldCard
            label="건물분 당초 증여 때 인수한 채무"
            field="buildingCarryover.giftAssumedDebt"
            hint="건물에 담보된 채무로서 당초 증여 때 인수해 증여세 과세가액에서 빠진 금액 — 증여세 상당액 안분의 분자에서 뺍니다 (「상속세 및 증여세법」 제47조 제1항 · 「소득세법 시행령」 제163조의2 제2항 제2호)."
          >
            <CurrencyInput
              label=""
              value={asset.buildingCarryover?.giftAssumedDebt ?? ""}
              onChange={(v) => onChange({ buildingCarryover: patchCarryover(asset.buildingCarryover, { giftAssumedDebt: v }) })}
              placeholder="없으면 0"
            />
          </FieldCard>
        )}
      </div>

      </>)}

      {/* ⑤ 적용배제 선언 — 관계·사망·적용배제도 증여 사건 칸이다(Q-1 a). */}
      {!eventOnLandBlock && (
      <div className="rounded-md border border-rose-200/70 bg-rose-50/40 p-3 dark:bg-rose-950/40">
        <CarryoverGiftExclusionSection
          exclusionDeclared={c.exclusionDeclared}
          onChange={(patch) =>
            onChange({ carryover: patchExclusion(asset.carryover, patch) })
          }
          donorRelation={c.donorRelation}
          donorDeceased={c.donorDeceased}
          spouseGiftOneHouseAtGiftDate={c.spouseGiftOneHouseAtGiftDate}
          donorSameHousehold={c.donorSameHousehold}
          donorHouseholdHoldingStartDate={c.donorHouseholdHoldingStartDate}
          donorPriorHouseholdResidenceMonths={c.donorPriorHouseholdResidenceMonths}
          donorAcquisitionDate={c.donorAcquisitionDate}
          showHouseholdFact={carryoverHouseholdFactVisible(asset)}
          // C(통째 증여)도 P5부터 배우자 예외를 묻는다 — ④가 사건에 싣는다(P5-Q4).
          showSpouseOneHouseFact={asset.assetKind !== "general_building"}
          giftRegistryDate={c.giftRegistryDate}
          assetId={asset.assetId}
          onRelationChange={updateCarryover}
        />
      </div>
      )}

    </div>
  );
}
