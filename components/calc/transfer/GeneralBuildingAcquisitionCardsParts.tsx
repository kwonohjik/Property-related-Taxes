"use client";

/**
 * 일반건물 취득 카드 — **보조 위젯·카드** (800줄 분리, 2026-09-11)
 *
 * `GeneralBuildingAcquisitionCards.tsx` 가 855줄로 정책(트리거 800 · 착지 ≤700)을 넘겨
 * 분리했다. 이음매는 **함수 단위 이동**이다 — 이 블록은 주 컴포넌트를 **하나도 참조하지
 * 않는다**(단방향 실측 후 이동). 반대로 주 컴포넌트가 이 파일의 5개를 전부 쓴다.
 *
 * ⚠️ 원본이 이 파일을 **재export** 하지 않는다 — 이 다섯은 전부 **파일 내부용**이었고
 *    외부 import 사이트가 0건이다(전수 확인). 재export 를 붙이면 eslint 가 「미사용」으로
 *    지우려 든다([[feedback_800line_split_export_preservation]]).
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { CarryoverGiftBlock } from "./CarryoverGiftBlock";
import { effectivePartAcqMode, type PartAcqMode } from "@/lib/calc/transfer-tax-split-acq-mode";
import { capexHint } from "./capexHint";

export function toBuildingCause(
  cause: AssetForm["acquisitionCause"] | undefined,
): NonNullable<AssetForm["gbBuildingAcquisitionCause"]> {
  return cause === "inheritance" || cause === "gift" || cause === "carryover_gift"
    ? cause
    : "purchase";
}

/** 양도일 − 건물취득일 < 5년 여부 판정 (소득세법 §114조의2 ① "5년 이내") */
export function isWithin5Years(buildingAcqDate: string, transferDateStr: string): boolean {
  if (!buildingAcqDate || !transferDateStr) return false;
  const acq = new Date(buildingAcqDate).getTime();
  const trans = new Date(transferDateStr).getTime();
  if (isNaN(acq) || isNaN(trans)) return false;
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  return (trans - acq) / msPerYear < 5;
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

export function PartAcqModeField({
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
export function GbBuildingInheritedValueCard({
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

/**
 * §97의2 **건물 파트** 이월과세 — 분리 OFF 전용 (2026-09-05 · Q09).
 *
 * 분리 ON에서는 건물 카드가 같은 블록을 이미 띄운다(:723 부근). OFF에서는 카드가 하나뿐이라
 * 여기에 놓는다 — 위 `GbBuildingInheritedValueCard`(상속)와 같은 자리·같은 이유다.
 *
 * ⚠️ **모듈 스코프에 둔다** — 렌더 안에서 선언하면 매 렌더 새 컴포넌트 타입이 되어 입력
 *    상태가 초기화된다(`react-hooks/static-components`, pre-commit 하드블록).
 *
 * 증여 **사건** 정보(등기접수일·산출세액·과세가액·적용배제)는 토지 블록 하나가 정본이다 —
 * 여기서 편집한 값은 전부 `buildingCarryover`로 간다.
 */
export function GbBuildingCarryoverCard({
  asset,
  onChange,
  transferDate,
}: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
}) {
  return (
    <ToneCard tone="violet" title="건물 파트 이월과세 (소득세법 §95④·§97의2①1호)">
      <p className="mb-2 text-caption text-violet-800">
        증여자의 취득일·취득가액과 증여 당시 평가액은 <strong>토지·건물이 각각</strong> 다릅니다
        (증여세 신고서에 물건별로 적혀 있습니다). 증여 등기접수일·증여세 산출세액·과세가액은
        위 <strong>토지</strong> 블록에서 한 번만 입력합니다.
      </p>
      <CarryoverGiftBlock
        asset={{ ...asset, carryover: asset.buildingCarryover ?? asset.carryover }}
        transferDate={transferDate ?? ""}
        onChange={(patch) => {
          // 🔑 건물 카드의 편집은 `buildingCarryover`로 간다 — 토지 값을 덮어쓰지 않는다.
          if ("carryover" in patch && patch.carryover) {
            onChange({ buildingCarryover: patch.carryover });
            return;
          }
          onChange(patch);
        }}
      />
    </ToneCard>
  );
}

