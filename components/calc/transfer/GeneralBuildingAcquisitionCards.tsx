"use client";

/**
 * 일반건물(토지+건물 일괄) 취득 정보 2카드
 *
 * assetKind === "general_building" 시 기존 단일 취득원인 영역 대신 표시.
 * 토지 카드 (sky): acquisitionCause + landAcquisitionDate + 원인별 보조 입력
 * 건물 카드 (amber): gbBuildingAcquisitionCause + acquisitionDate + 가산세 배지
 *
 * ## M-1a 취득일 규약 (2026-08-05)
 * `acquisitionDate` = **건물** 취득일 · `landAcquisitionDate` = **토지** 취득일 —
 * 주택·건물(split)과 같은 규약이다. 종전 `gbBuildingAcquisitionDate`는 폐기됐다.
 * 분리 OFF면 두 값이 항상 같다(`setLandAcqDate`/`setBuildingAcqDate`가 함께 기록).
 *
 * 정책 준수:
 *  - useEffect → store 미러링 금지 (onChange 직접 처리)
 *  - useMemo 파생 배지 (penalty badge)
 *  - native radio/checkbox 금지 (RadioCardGroup 사용)
 *  - type="date" 금지 (DateInput 사용)
 *  - placeholder 숫자 예시 금지
 */

import { useMemo } from "react";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { CompanionAcqInheritanceBlock } from "./CompanionAcqInheritanceBlock";
import { CompanionAcqGiftBlock } from "./CompanionAcqGiftBlock";
// BurdenedGiftBlock import 제거 — Phase 2 (2026-05-12): TransferModeBlock에서 사용
import { CarryoverGiftBlock } from "./CarryoverGiftBlock";
import { CompanionAcqPurchaseBlock } from "./CompanionAcqPurchaseBlock";
import { effectivePartAcqMode, type PartAcqMode } from "@/lib/calc/transfer-tax-split-acq-mode";
import { capexHint } from "./capexHint";
import { Pre1990LandValuationInput } from "@/components/calc/inputs/Pre1990LandValuationInput";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import {
  isGbLandPre1990Sec163_9,
  gbLandAcquisitionDate,
  deriveGbPre1990LandPricePerSqmAtAcqString,
} from "@/lib/calc/transfer-pre1990-gb-bridge";

// ── 토지 취득원인 옵션 (이월과세 포함 4종) ──
// Phase 2 (2026-05-12): 부담부증여는 "양도" 사건이므로 취득원인에서 분리.
// 별도 TransferModeBlock(양도 정보 카드)에서 transferType 라디오로 선택.
// 취득원인은 증여자의 당초 취득 정보(매매·상속·증여·이월과세)를 받음.
const LAND_CAUSE_OPTIONS = [
  { value: "purchase",       label: "매매" },
  { value: "inheritance",    label: "상속" },
  { value: "gift",           label: "증여" },
  { value: "carryover_gift", label: "이월과세(증여)" },
] as const;

// ── 건물 취득원인 옵션 (신축 포함 4종, 예제 정렬) ──
const BUILDING_CAUSE_OPTIONS = [
  { value: "purchase",         label: "매매" },
  { value: "inheritance",      label: "상속" },
  { value: "gift",             label: "증여" },
  { value: "newConstruction",  label: "신축(자가건축)" },
] as const;

/**
 * ── 분리 OFF 전용 **단일** 취득원인 옵션 (U-1~U-4 · 2026-08-07) ──
 *
 * 토지 4종 + 「건물 신축」. 마지막 항목은 취득원인이 아니라 **분리로 가는 진입 경로**다 —
 * 토지는 살 수밖에 없으므로 「토지·건물 모두 신축」이라는 상태는 존재하지 않는다.
 * 고르면 분리를 자동 ON 해 곧바로 두 카드로 전환한다(`BUILDING_NEW_SENTINEL`).
 */
const BUILDING_NEW_SENTINEL = "__building_new__";
const UNIFIED_CAUSE_OPTIONS = [
  ...LAND_CAUSE_OPTIONS.map((o) => ({ value: o.value as string, label: o.label })),
  { value: BUILDING_NEW_SENTINEL, label: "건물 신축(자가건축)" },
];

/**
 * 토지 취득원인 → **건물 축**의 대응값 (분리 OFF 불변식).
 *
 * 건물 축에는 이월과세가 없다(`BUILDING_CAUSE_OPTIONS`). 마이그레이션 M-2
 * (`calc-wizard-asset-migrate-phase3.ts:61-75`)가 이미 쓰는 규칙 — 유효하면 그대로,
 * 아니면 `purchase` — 을 그대로 재사용한다. 규칙을 새로 만들면 두 곳이 갈린다.
 */
function toBuildingCause(
  cause: AssetForm["acquisitionCause"] | undefined,
): NonNullable<AssetForm["gbBuildingAcquisitionCause"]> {
  return cause === "inheritance" || cause === "gift" ? cause : "purchase";
}

/** 양도일 − 건물취득일 < 5년 여부 판정 (소득세법 §114조의2 ① "5년 이내") */
function isWithin5Years(buildingAcqDate: string, transferDateStr: string): boolean {
  if (!buildingAcqDate || !transferDateStr) return false;
  const acq = new Date(buildingAcqDate).getTime();
  const trans = new Date(transferDateStr).getTime();
  if (isNaN(acq) || isNaN(trans)) return false;
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  return (trans - acq) / msPerYear < 5;
}

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
}

/**
 * 파트별 「취득가액 산정 방식」 + 그 파트의 실지거래가액·자본적지출 (분리 ON 전용).
 *
 * ⚠️ **모듈 스코프에 둔다** — 렌더 안에서 선언하면 매 렌더 새 컴포넌트 타입이 되어
 *    입력 상태가 초기화된다(`react-hooks/static-components`, pre-commit 하드블록).
 *
 * 값은 `effectivePartAcqMode` 단일 소스로 도출한다 — 파트 라디오를 아직 고르지 않았으면
 * 자산 전체 레거시 플래그에서 파생되므로, 분리를 켠 직후 화면이 종전 선택을 그대로 이어받는다
 * (UI 표시 ≠ 전송값이 되는 dual-truth 회피 — memory `feedback_ui_engine_dual_truth_avoidance`).
 *
 * 선택지는 **실거래가·환산취득가 2종**이다. 감정가액·매매사례가액은 일반건물 자산 단위
 * 라디오에도 없고, 「토지·건물 일괄(증축분 별도)」는 3파트 축이라 분리 ON에서 차단된다(V-3).
 */
const PART_MODE_OPTIONS = [
  { value: "actual", label: "실거래가", description: "계약서상 실지거래가액" },
  { value: "estimated", label: "환산취득가", description: "양도가 × 기준시가 비율" },
];

function PartAcqModeField({
  part,
  asset,
  onChange,
  showCapex,
}: {
  part: "land" | "building";
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 파트 자본적지출 칸 노출 — 두 파트 모두 환산인 경우만 제외(그때는 자산 단위 칸을 쓴다) */
  showCapex: boolean;
}) {
  const isLand = part === "land";
  const label = isLand ? "토지" : "건물";
  const mode: PartAcqMode = effectivePartAcqMode(
    isLand ? asset.landAcqMode : asset.buildingAcqMode,
    asset,
  );
  /**
   * §163⑨ 상속 파트는 **평가액이 취득가액이다** — 파트 취득가액 칸을 노출하지 않는다.
   *
   * API 변환이 상속 평가액을 파트별 실지거래가액 슬롯에 실어 보내므로(`transfer-tax-api-gb`),
   * 이 칸을 함께 띄우면 **두 칸이 같은 값을 다투고 한쪽이 조용히 무시된다**
   * (`feedback_ui_engine_dual_truth_avoidance`). 실제로 종전 C1에서 이 칸에 999,999,999를
   * 넣어도 세액이 변하지 않았다 — 보이는데 아무 효과가 없는 칸이었다.
   */
  const isInheritedPart = isLand
    ? asset.acquisitionCause === "inheritance"
    : asset.gbBuildingAcquisitionCause === "inheritance";
  /**
   * 🔴 **부담부증여는 이 축이 통째로 무효다** (2026-08-08 · V-4).
   *
   * 「소득세법 시행령」 제159조가 양도가액·취득가액을 **채무비율 × 자산별 기준시가**로 정하고,
   * 라우트가 그 값으로 파트 취득가액을 **덮어쓴다**(`general-building-route-actual.ts:336-337`).
   * 파트 자본적지출도 마찬가지다 — 부담부증여 분기는 `estimatedDeduction` 슬롯을 §159 안분값으로
   * 채우므로 `landDirectExpenses`/`buildingDirectExpenses`를 읽지 않는다.
   * 실측: 파트 취득가액에 9,999,999,999를 넣어도 세액이 변하지 않는다
   * (`gb-burdened-gift-split-date.anchor.test.ts`).
   *
   * ⇒ 띄우면 「보이는데 아무 효과가 없는 칸」이 된다 — 바로 위 상속 파트 주석과 같은 이유이자
   *   `LandBuildingSplitSection.tsx:397`이 이미 택한 판단이다
   *   (`feedback_ui_engine_dual_truth_avoidance`).
   *
   * ⚠️ **입력 경로가 사라지지 않는다.** 부담부증여 K-4(실지취득가 안분)는 `bgActualAcquisitionLand`
   *    등 **전용 필드**를 쓰고(`transfer-tax-api-burdened-gift.ts:86-97`) 그 칸은
   *    `BurdenedGiftBlock`에 따로 있다 — 여기서 숨기는 것은 §159가 무시하는 축뿐이다.
   * ⚠️ 분리 ON 전용 문제다 — 분리 OFF에서는 이 컴포넌트 자체가 렌더되지 않고, 자산 단위
   *    산정방식은 `CompanionAcqPurchaseBlock:262`가 이미 부담부증여에서 숨긴다.
   */
  if (asset.transferType === "burdened_gift") return null;
  return (
    <>
      <FieldCard
        label={`${label} 취득가액 산정 방식`}
        hint={
          isInheritedPart
            ? // 조사는 받침 유무로 갈린다 — 토지(모음)는 「는」·건물(받침)은 「은」.
              `상속으로 취득한 ${isLand ? "토지는" : "건물은"} 상속개시일 평가액이 취득당시 실지거래가액입니다 (소득세법 시행령 §163⑨). 금액은 아래 상속 입력란에 적으세요.`
            : undefined
        }
      >
        <RadioCardGroup
          name={`gb${isLand ? "Land" : "Building"}AcqMode`}
          layout="inline"
          value={mode}
          onChange={(v) =>
            onChange(isLand ? { landAcqMode: v as PartAcqMode } : { buildingAcqMode: v as PartAcqMode })
          }
          options={PART_MODE_OPTIONS}
        />
      </FieldCard>
      {/* 실거래가 파트만 금액을 받는다 — 환산 파트는 기준시가로 산정하므로 입력 자체가 없다.
          비-환산 파트의 미입력은 엔진이 차단한다(`general-building-part-acq.ts`).
          상속 파트는 위 주석대로 평가액이 정본이라 이 칸을 띄우지 않는다. */}
      {mode === "actual" && !isInheritedPart && (
        <FieldCard
          label={`${label} 취득가액`}
          unit="원"
          hint={`${label}에 귀속되는 실지거래가액 (소득세법 §97①1호). 별개 취득이라 총액에서 자동 계산되지 않습니다.`}
        >
          <CurrencyInput
            label={`${label} 취득가액`}
            hideUnit
            value={isLand ? asset.landAcquisitionPrice : asset.buildingAcquisitionPrice}
            onChange={(v) =>
              onChange(isLand ? { landAcquisitionPrice: v } : { buildingAcquisitionPrice: v })
            }
          />
        </FieldCard>
      )}
      {/* 자본적지출 — 직접 귀속분은 안분하지 않는다(「소득세법」 제100조 제2항 후문의 유추). */}
      {showCapex && (
        <FieldCard label={`${label} 자본적지출`} unit="원" hint={capexHint(label, mode)}>
          <CurrencyInput
            label={`${label} 자본적지출`}
            hideUnit
            value={isLand ? asset.landDirectExpenses : asset.buildingDirectExpenses}
            onChange={(v) =>
              onChange(isLand ? { landDirectExpenses: v } : { buildingDirectExpenses: v })
            }
          />
        </FieldCard>
      )}
    </>
  );
}

/**
 * §163⑨ 상속개시일 **건물** 평가액 — 분리 OFF면 통합 카드, ON이면 건물 카드에 놓인다.
 *
 * ⚠️ **모듈 스코프에 둔다** — 렌더 안에서 선언하면 매 렌더 새 컴포넌트 타입이 되어 입력 상태가
 *    초기화된다(`react-hooks/static-components`, pre-commit 하드블록).
 *
 * 토지분(`publishedValueAtInheritance`)은 `CompanionAcqInheritanceBlock`이 받는다 — 상속이면
 * **두 칸이 모두** 필요하다(`transfer-tax-validate-gb.ts:154·157`).
 */
function GbBuildingInheritedValueCard({
  asset,
  onChange,
}: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}) {
  return (
    <ToneCard tone="violet" title="상속개시일 건물 신고가액 (소득세법 시행령 §163⑨)">
      <CurrencyInput
        label="건물 평가액"
        value={asset.gbBuildingInheritedValue}
        onChange={(v) => onChange({ gbBuildingInheritedValue: v })}
        hint="상속세 신고서·결정통지서상 건물 평가액(상증법 §60~66). 상속개시일 평가액을 취득가액으로 직접 사용 — 환산·개산공제 미적용"
      />
    </ToneCard>
  );
}

export function GeneralBuildingAcquisitionCards({ asset, onChange, transferDate }: Props) {
  // §114조의2 가산세 5년 이내 여부 (useMemo — useEffect 미러링 금지 정책)
  const showPenaltyBadge = useMemo(() => {
    if (
      asset.gbBuildingAcquisitionCause !== "newConstruction" ||
      !asset.acquisitionDate ||
      !transferDate
    ) return false;
    return isWithin5Years(asset.acquisitionDate, transferDate);
  }, [asset.gbBuildingAcquisitionCause, asset.acquisitionDate, transferDate]);

  /**
   * M-1a 취득일 기록 — 분리 OFF면 **토지·건물이 같은 값**이어야 한다(불변식·계획서 §3.2(1)).
   * 두 키를 **한 번의 onChange**로 함께 넘긴다(다중 키 stale spread 금지 —
   * memory `feedback_multikey_patch_stale_spread_overwrite`). `useEffect` 미러링 아님.
   */
  const isSeparate = !!asset.hasSeperateLandAcquisitionDate;
  const setLandAcqDate = (v: string) =>
    onChange(isSeparate ? { landAcquisitionDate: v } : { acquisitionDate: v, landAcquisitionDate: v });
  const setBuildingAcqDate = (v: string) =>
    onChange(isSeparate ? { acquisitionDate: v } : { acquisitionDate: v, landAcquisitionDate: v });

  /**
   * 분리 토글 — **취득원인 블록 밖(최상단)**에 둔다.
   *
   * 공용 `CompanionAcqDateSection`의 토글을 쓰면 취득원인이 **매매일 때만** 렌더되므로
   * (그 컴포넌트는 `CompanionAcqPurchaseBlock` 안에 있다), 토지 상속 + 건물 신축처럼
   * 분리가 켜져야 하는 조합에서 토글이 화면에서 사라져 **끌 수 없게 된다**.
   * 계획서 §3.1.
   *
   * OFF로 되돌릴 때 토지 취득일을 건물 취득일로 되맞춘다 — 「분리 OFF면 두 날짜가 같다」
   * 불변식(§3.2(1))을 화면 조작만으로도 지키기 위함이며, 두 키를 **한 배치**로 넘긴다.
   */
  /**
   * 파트 자본적지출 노출 조건 — **두 파트 모두 환산인 경우만 제외**(O-1 해소).
   *
   * §97②2호는 파트별로 규칙이 갈린다 — 실가 파트는 같은 항 1호(가산), 환산 파트는 2호 단서(택일).
   * 그래서 조합이 섞이면 파트별 귀속이 있어야 조문대로 계산된다.
   * 두 파트가 모두 환산이면 종전처럼 ④ 필요경비의 자산 단위 칸이 자산총액 판정에 쓰인다.
   */
  const showPartCapex =
    effectivePartAcqMode(asset.landAcqMode, asset) !== "estimated" ||
    effectivePartAcqMode(asset.buildingAcqMode, asset) !== "estimated";

  /**
   * 🔴 토지 카드 하위 블록(상속·증여·이월과세)의 `acquisitionDate` 쓰기를 **토지 축으로 라우팅**.
   *
   * `CompanionAcqInheritanceBlock`은 상속개시일을 `onChange({ acquisitionDate, ... })`로 쓰는데
   * (`:44-48`), M-1a 이후 그 필드는 **건물** 취득일이다. 그대로 두면 토지 카드에서 입력한
   * 상속개시일이 건물 취득일을 덮어쓰고 `landAcquisitionDate`는 갱신되지 않아 파트별
   * 보유기간·세율 기산일이 어긋난다. 매매·증여 경로는 이미 `setLandAcqDate`를 쓰지만
   * 상속·이월과세 블록은 `asset`+`onChange`를 통째로 받으므로 여기서 가로챈다.
   */
  const landCardOnChange = (patch: Partial<AssetForm>) => {
    if (!("acquisitionDate" in patch)) return onChange(patch);
    const { acquisitionDate: v, ...rest } = patch;
    onChange({
      ...rest,
      ...(isSeparate
        ? { landAcquisitionDate: v }
        : { acquisitionDate: v, landAcquisitionDate: v }),
    });
  };

  /**
   * OFF로 되돌릴 때 **날짜와 취득원인을 함께** 되맞춘다 (U-5 · 2026-08-07).
   *
   * 종전에는 날짜만 되맞춰서, 분리 ON에서 「건물=신축」을 골라 둔 뒤 토글을 끄면
   * 화면에는 단일 취득원인 하나만 남는데 `gbBuildingAcquisitionCause`는 `newConstruction`으로
   * 살아 있었다 — **화면에 없는 값이 payload를 가르는** 상태다
   * (`transfer-tax-api-gb.ts:487`이 그대로 싣는다).
   */
  const setSeparate = (next: boolean) =>
    onChange(
      next
        ? { hasSeperateLandAcquisitionDate: true }
        : {
            hasSeperateLandAcquisitionDate: false,
            landAcquisitionDate: asset.acquisitionDate,
            gbBuildingAcquisitionCause: toBuildingCause(asset.acquisitionCause),
          },
    );

  /**
   * 분리 OFF의 단일 취득원인 — **토지·건물 두 축을 한 배치로** 기록한다 (U-2·U-3).
   *
   * 나눠 부르면 뒤 호출이 앞 patch를 stale spread로 덮어쓴다
   * (memory `feedback_multikey_patch_stale_spread_overwrite`).
   *
   * 「건물 신축」만은 취득원인이 아니라 진입 경로다 — 토지 원인은 **건드리지 않고**
   * 분리만 켠다(U-4). 켜는 순간 이 라디오가 언마운트되고 파트별 라디오가 대신 뜨므로
   * 「표시값 ≠ 저장값」이 남지 않는다.
   */
  const setUnifiedCause = (v: string) => {
    if (v === BUILDING_NEW_SENTINEL) {
      onChange({
        gbBuildingAcquisitionCause: "newConstruction",
        hasSeperateLandAcquisitionDate: true,
      });
      return;
    }
    const cause = v as AssetForm["acquisitionCause"];
    onChange({ acquisitionCause: cause, gbBuildingAcquisitionCause: toBuildingCause(cause) });
  };

  return (
    <div className="space-y-3">

      <ToggleCard
        variant="card"
        tone="amber"
        title="토지·건물 취득일 다름"
        description="토지를 먼저 사고 건물을 나중에 짓거나 승계한 경우 ON. 취득일·취득원인·취득가액 산정 방식을 토지·건물 각각 입력합니다."
        checked={isSeparate}
        onCheckedChange={setSeparate}
      />

      {/*
        ── 취득 카드 (sky) ──
        분리 OFF면 **토지·건물 공통 「취득」 카드 하나**, ON이면 「📌 토지 취득」이 된다(U-1·U-6).

        하위 원인별 블록은 두 모드가 **그대로 공유**한다 — `setLandAcqDate`·`landCardOnChange`가
        이미 `isSeparate`로 쓰기 축을 가르므로, 갈라야 하는 것은 카드 제목과 취득원인 라디오뿐이다.
      */}
      <ToneCard tone="sky" bodyClassName="space-y-3" noDark>
        <div className="flex items-center gap-2">
          <span className="text-base">{isSeparate ? "📌" : "🧾"}</span>
          <p className="text-xs font-semibold text-sky-700">
            {isSeparate ? "토지 취득" : "취득 (토지·건물 공통)"}
          </p>
        </div>

        <FieldCard
          label="취득원인"
          hint={
            isSeparate
              ? undefined
              : "토지와 건물을 같은 시점에 함께 취득한 경우입니다. 건물을 나중에 짓거나 따로 승계했다면 위 「토지·건물 취득일 다름」을 켜세요."
          }
        >
          {isSeparate ? (
            <RadioCardGroup
              name="gbLandAcquisitionCause"
              layout="inline"
              value={asset.acquisitionCause ?? ""}
              onChange={(v) =>
                onChange({
                  acquisitionCause: v as AssetForm["acquisitionCause"],
                })
              }
              options={LAND_CAUSE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
          ) : (
            <RadioCardGroup
              name="gbUnifiedAcquisitionCause"
              layout="inline"
              value={asset.acquisitionCause ?? ""}
              onChange={setUnifiedCause}
              options={UNIFIED_CAUSE_OPTIONS}
            />
          )}
        </FieldCard>

        {/* 매매: 취득일 + 환산취득가·감정가 선택 */}
        {asset.acquisitionCause === "purchase" && (
          <CompanionAcqPurchaseBlock
            acquisitionDate={asset.landAcquisitionDate}
            onAcquisitionDateChange={setLandAcqDate}
            useEstimatedAcquisition={asset.useEstimatedAcquisition}
            onUseEstimatedChange={(v) => onChange({ useEstimatedAcquisition: v })}
            isAppraisalAcquisition={asset.isAppraisalAcquisition}
            onIsAppraisalAcquisitionChange={(v) => onChange({ isAppraisalAcquisition: v })}
            gbHasExtension={asset.gbHasExtension}
            onGbHasExtensionChange={(v) => onChange({ gbHasExtension: v })}
            gbExtensionAcquisitionMode={asset.gbExtensionAcquisitionMode}
            onGbExtensionAcquisitionModeChange={(v) =>
              onChange({ gbExtensionAcquisitionMode: v as AssetForm["gbExtensionAcquisitionMode"] })
            }
            fixedAcquisitionPrice={asset.fixedAcquisitionPrice}
            onFixedAcquisitionPriceChange={(v) => onChange({ fixedAcquisitionPrice: v })}
            standardPriceAtAcq={asset.standardPriceAtAcq}
            onStandardPriceAtAcqChange={(v) => onChange({ standardPriceAtAcq: v })}
            standardPriceAtTransfer={asset.standardPriceAtTransfer}
            onStandardPriceAtTransferChange={(v) => onChange({ standardPriceAtTransfer: v })}
            transferDate={transferDate}
            jibun={asset.addressJibun || undefined}
            dong={asset.addressDong || undefined}
            ho={asset.addressHo || undefined}
            assetKind={asset.assetKind}
            acquisitionArea={asset.acquisitionArea || undefined}
            transferArea={asset.transferArea || undefined}
            standardPricePerSqmAtAcq={asset.standardPricePerSqmAtAcq}
            onStandardPricePerSqmAtAcqChange={(v) => onChange({ standardPricePerSqmAtAcq: v })}
            standardPricePerSqmAtTransfer={asset.standardPricePerSqmAtTransfer}
            onStandardPricePerSqmAtTransferChange={(v) =>
              onChange({ standardPricePerSqmAtTransfer: v })
            }
            pre1990Form={{
              pre1990Enabled: asset.pre1990Enabled,
              pre1990PricePerSqm_1990: asset.pre1990PricePerSqm_1990,
              pre1990PricePerSqm_atTransfer: asset.pre1990PricePerSqm_atTransfer,
              pre1990Grade_current: asset.pre1990Grade_current,
              pre1990Grade_prev: asset.pre1990Grade_prev,
              pre1990Grade_atAcq: asset.pre1990Grade_atAcq,
              pre1990GradeMode: asset.pre1990GradeMode,
            }}
            onPre1990Change={(patch) => onChange(patch)}
            buildingType={asset.buildingType}
            onBuildingTypeChange={(v) => onChange({ buildingType: v })}
            constructionDate={asset.constructionDate}
            onConstructionDateChange={(v) => onChange({ constructionDate: v })}
            extensionFloorArea={asset.extensionFloorArea}
            onExtensionFloorAreaChange={(v) => onChange({ extensionFloorArea: v })}
            extensionStdPriceAtAcquisition={asset.extensionStdPriceAtAcquisition}
            onExtensionStdPriceAtAcquisitionChange={(v) => onChange({ extensionStdPriceAtAcquisition: v })}
            selfOwns={asset.selfOwns ?? "both"}
            onSelfOwnsChange={(v) => onChange({ selfOwns: v })}
            hasSeperateLandAcquisitionDate={false}
            onHasSeperateLandAcquisitionDateChange={() => {}}
            landAcquisitionDate={asset.landAcquisitionDate}
            onLandAcquisitionDateChange={(v) => onChange({ landAcquisitionDate: v })}
            landTransferPrice={asset.landTransferPrice}
            onLandTransferPriceChange={(v) => onChange({ landTransferPrice: v })}
            buildingTransferPrice={asset.buildingTransferPrice}
            onBuildingTransferPriceChange={(v) => onChange({ buildingTransferPrice: v })}
            landAcquisitionPrice={asset.landAcquisitionPrice}
            onLandAcquisitionPriceChange={(v) => onChange({ landAcquisitionPrice: v })}
            buildingAcquisitionPrice={asset.buildingAcquisitionPrice}
            onBuildingAcquisitionPriceChange={(v) => onChange({ buildingAcquisitionPrice: v })}
            landDirectExpenses={asset.landDirectExpenses}
            onLandDirectExpensesChange={(v) => onChange({ landDirectExpenses: v })}
            buildingDirectExpenses={asset.buildingDirectExpenses}
            onBuildingDirectExpensesChange={(v) => onChange({ buildingDirectExpenses: v })}
            landStandardPriceAtTransfer={asset.landStandardPriceAtTransfer}
            onLandStandardPriceAtTransferChange={(v) =>
              onChange({ landStandardPriceAtTransfer: v })
            }
            buildingStandardPriceAtTransfer={asset.buildingStandardPriceAtTransfer}
            onBuildingStandardPriceAtTransferChange={(v) =>
              onChange({ buildingStandardPriceAtTransfer: v })
            }
            asset={asset}
            onAssetChange={onChange}
            hideAssetAcqAxis={isSeparate}
          />
        )}

        {/* 분리 ON — 토지 파트 산정방식·취득가액 (자산 전체 축 A는 위에서 숨겼다) */}
        {isSeparate && (
          <PartAcqModeField part="land" asset={asset} onChange={onChange} showCapex={showPartCapex} />
        )}

        {/* 상속: 취득일 + 피상속인 취득일 + 보충적평가 */}
        {asset.acquisitionCause === "inheritance" && (
          <CompanionAcqInheritanceBlock
            asset={asset}
            onChange={landCardOnChange}
            transferDate={transferDate}
          />
        )}

        {/*
          §163⑨1호 — 1990.8.30. 개별공시지가 고시 **전** 상속 토지는 상속개시일 평가액과
          §164④ 가액 중 **많은 금액**이 취득가액이다. 그 시기의 개별공시지가는 **존재하지
          않으므로**(그날이 최초 고시일) 등급환산 없이는 비교값을 입력할 방법이 없다.
          상가 `CommercialInheritanceStdPriceSection`과 같은 배치다.
        */}
        {isGbLandPre1990Sec163_9(asset) && (
          <ToneCard
            tone="amber"
            title={`1990.8.30. 이전 ${asset.acquisitionCause === "gift" ? "증여" : "상속"} 토지 — §164④ 등급환산 (소득세법 시행령 §163⑨1호)`}
          >
            <p className="text-xs text-amber-800">
              {asset.acquisitionCause === "gift" ? "증여일" : "상속개시일"} 현재 개별공시지가가 고시되기 전이라
              토지등급으로 환산합니다. 아래 환산값과 {asset.acquisitionCause === "gift" ? "증여 신고가액" : "상속개시일 평가액"} 중{" "}
              <span className="font-semibold">많은 금액</span>이 토지 취득가액이 됩니다.
            </p>
            <Pre1990LandValuationInput
              form={asset}
              onChange={onChange}
              acquisitionArea={asset.gbLandArea}
              jibun={asset.addressJibun || undefined}
              acquisitionDate={gbLandAcquisitionDate(asset)}
              transferDate={transferDate}
            />
            <LandPriceLookupField
              label="취득시 개별공시지가"
              pricePerSqm={
                asset.gbAcqLandPricePerSqm ||
                deriveGbPre1990LandPricePerSqmAtAcqString(asset, transferDate ?? "")
              }
              onPricePerSqmChange={(v) => onChange({ gbAcqLandPricePerSqm: v })}
              area={parseDecimal(asset.gbLandArea) || undefined}
              referenceDate={gbLandAcquisitionDate(asset) || undefined}
              jibun={asset.addressJibun || undefined}
            />
          </ToneCard>
        )}

        {/* 증여: 취득일 + 증여자 취득일 + 취득가액 */}
        {asset.acquisitionCause === "gift" && (
          <CompanionAcqGiftBlock
            acquisitionDate={asset.landAcquisitionDate}
            onAcquisitionDateChange={setLandAcqDate}
            donorAcquisitionDate={asset.donorAcquisitionDate}
            onDonorAcquisitionDateChange={(v) =>
              onChange({ donorAcquisitionDate: v })
            }
            fixedAcquisitionPrice={asset.fixedAcquisitionPrice}
            onFixedAcquisitionPriceChange={(v) =>
              onChange({ fixedAcquisitionPrice: v })
            }
            isBurdenedGift={asset.transferType === "burdened_gift"}
          />
        )}

        {/* 이월과세(증여): CarryoverGiftBlock */}
        {asset.acquisitionCause === "carryover_gift" && (
          <CarryoverGiftBlock
            asset={asset}
            transferDate={transferDate ?? ""}
            onChange={landCardOnChange}
          />
        )}

        {/*
         * Phase 2 (2026-05-12): 부담부증여 BurdenedGiftBlock은 TransferModeBlock(양도 정보 카드)로 이동.
         * 취득 정보 카드에서는 증여자의 당초 취득 정보(매매·상속·증여·이월과세)만 받음.
         */}

        {/*
          분리 OFF + 상속 — 건물 평가액도 **이 카드 안**에서 받는다.
          OFF에서는 두 취득원인이 항상 같으므로(불변식), 토지가 상속이면 건물도 상속이다.
          §163⑨은 파트별 평가액을 각각 요구한다(`transfer-tax-validate-gb.ts:154·157`).
        */}
        {/* ⚠️ 부담부증여 제외 — §159가 취득가액을 정하므로 이 평가액도 계산에 도달하지 않는다(§10-5). */}
        {asset.transferType !== "burdened_gift" &&
          !isSeparate &&
          asset.gbBuildingAcquisitionCause === "inheritance" && (
          <GbBuildingInheritedValueCard asset={asset} onChange={onChange} />
        )}
      </ToneCard>

      {/* ── 🏗 건물 취득 카드 (amber) — 분리 ON 전용 ── */}
      {isSeparate && (
      <ToneCard tone="amber" bodyClassName="space-y-3" noDark>
        <div className="flex items-center gap-2">
          <span className="text-base">🏗</span>
          <p className="text-xs font-semibold text-amber-700">건물 취득</p>
        </div>

        <FieldCard label="취득원인">
          <RadioCardGroup
            name="gbBuildingAcquisitionCause"
            layout="inline"
            value={asset.gbBuildingAcquisitionCause ?? ""}
            onChange={(v) => {
              const cause = v as NonNullable<AssetForm["gbBuildingAcquisitionCause"]>;
              // ⛔ 종전에는 비-신축 전환 시 건물 취득일을 지웠으나, M-1a 이후 그 필드는
              //    `acquisitionDate`(자산 취득일)다 — 지우면 자산 취득일 자체가 사라진다.
              //    취득원인이 바뀌어도 날짜는 보존한다(계획서 §3.2(2)).
              //
              // Q4: 「신축(자가건축)」은 토지를 산 뒤 건물을 짓는 것이라 취득일이 다를 수밖에 없다
              //     → 분리를 **자동으로 켠다**(한 배치). 아래 안내 문구로 사실을 알린다.
              onChange(
                cause === "newConstruction"
                  ? { gbBuildingAcquisitionCause: cause, hasSeperateLandAcquisitionDate: true }
                  : { gbBuildingAcquisitionCause: cause },
              );
            }}
            options={BUILDING_CAUSE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        </FieldCard>

        {/* Q4 자동 전환 안내 — 조용한 상태 변경 금지 */}
        {asset.gbBuildingAcquisitionCause === "newConstruction" && (
          <p className="rounded-md bg-amber-100/60 px-2.5 py-1.5 text-caption text-amber-800">
            신축(자가건축)은 토지 취득일과 건물 취득일이 다르므로 「토지·건물 취득일 다름」을 자동으로 켰습니다.
          </p>
        )}

        {/* 건물 취득일 — 이 카드 자체가 분리 ON 전용이다. OFF면 위 「취득」 카드의 「취득일」
            하나가 두 파트를 함께 기록한다(불변식 §3.2(1)). 신축은 진입 시 분리가 켜지므로
            입력 경로가 사라지지 않는다. */}
        <FieldCard
          label="건물 취득일"
          hint={
            asset.gbBuildingAcquisitionCause === "newConstruction"
              ? "사용승인서 교부일·사실상 사용일·임시사용승인일 중 빠른 날 (소득세법 시행령 §162①4호)"
              : "건물 매매·상속·증여 등기접수일 또는 잔금청산일"
          }
        >
          <DateInput
            value={asset.acquisitionDate}
            onChange={setBuildingAcqDate}
          />
        </FieldCard>

        {/* §114조의2 가산세 5년 이내 안내 배지 (useMemo 파생) */}
        {showPenaltyBadge && (
          <div className="rounded bg-amber-100/80 border border-amber-300 px-3 py-2 space-y-1">
            <p className="text-xs text-amber-800 font-semibold">
              환산취득가액 가산세 적용 대상 — 건물 환산취득가액의 5% (소득세법 §114조의2 ①)
            </p>
            <p className="text-caption text-amber-700">
              ※ 잠정 안내 — 정확한 가산세 발동 여부는 계산 결과에서 확인
            </p>
          </div>
        )}

        <PartAcqModeField part="building" asset={asset} onChange={onChange} showCapex={showPartCapex} />

        {/* §163⑨ 상속개시일 건물 신고가액 (Phase 1 = 토지·건물 모두 상속) */}
        {asset.transferType !== "burdened_gift" &&
          asset.gbBuildingAcquisitionCause === "inheritance" && (
          <GbBuildingInheritedValueCard asset={asset} onChange={onChange} />
        )}
      </ToneCard>
      )}

    </div>
  );
}
