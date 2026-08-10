"use client";

/**
 * 일반건물 — **양도가액 토지·건물 안분 방식** 섹션 (Phase 2 ⑤).
 *
 * 선택지는 **3지선다**다 — 구분양도(§100②) / 감정평가(「부가가치세법 시행령」 §64①1호) /
 * 기준시가 안분(같은 항 2호). 제목·선택지·전환 patch는 주택 경로와 **공유**한다
 * (`SALE_SPLIT_SECTION_TITLE`·`SALE_SPLIT_MODE_OPTIONS`·`saleSplitModePatch`).
 * ⚠️ 종전 주석의 「양도가액 결정 방식(구분양도 / 일괄양도)」은 #1138 이전 2지선다 시절 문구다.
 *
 * 계획서: `docs/02-design/features/general-building-sale-split-mode.plan.md` §5 · §6
 *
 * ## 조문
 *
 * 「소득세법」 제100조 제2항 — 토지·건물을 함께 양도하면 **각각 구분하여 기장**하는 것이 원칙이고,
 * 안분은 「구분이 불분명할 때」의 예외다. 같은 조 **제3항**은 구분 기장한 가액이 안분계산한 가액과
 * **100분의 30 이상** 차이나면 「불분명한 때로 본다」고 하므로, 구분값을 넣어도 엔진이 판정을 거친다.
 *
 * ## 차단 조합은 렌더하지 않고 **이유를 말한다**
 *
 * 증축(건물 2장)·부담부증여는 구분 기재가 성립하지 않는다(§5 S-10·S-11). 칸을 띄워 두고
 * validate에서 막으면 「입력했는데 계산이 안 되는」 상태가 되므로, 애초에 칸을 열지 않고
 * 사유를 표시한다.
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import {
  SALE_SPLIT_MODE_OPTIONS,
  SALE_SPLIT_SECTION_TITLE,
  SaleAppraisalFields,
  SaleSplitCompareBasisCard,
  SaleSplitExemptionCard,
} from "./SaleSplitBasisExemptionCards";
import { saleSplitModePatch } from "@/lib/calc/transfer-tax-split-acq-mode";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

// 선택지·전환 patch는 주택 경로(`LandBuildingSaleSplitSection`)와 **공유**한다 — 각자 두면
// 같은 축을 다르게 부르거나 비우는 값이 갈린다(2026-08-08 주택 경로 통합).

/**
 * 섹션 제목 — **옵션 단추 라벨과 같은 타이포**로 렌더한다 (2026-08-11 사용자 요청).
 *
 * `ToneCard`의 기본 제목 스타일은 `text-xs font-semibold` + 톤 색인데, 이 카드의 선택지는
 * inline `RadioCardGroup`이라 `text-sm` 기본 굵기·기본 색이다. 제목이 선택지보다 작고 굵어
 * 위계가 뒤집혀 보였다. ⇒ 헤더 `<p>`의 클래스를 자식 `<span>`에서 덮는다 —
 * `ToneCard`는 전 세목이 공유하는 primitive이므로 그쪽은 건드리지 않는다.
 */
const SECTION_TITLE = (
  <span className="text-sm font-normal text-foreground">{SALE_SPLIT_SECTION_TITLE}</span>
);

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 구분 기재를 쓸 수 없는 사유 — 있으면 입력 대신 안내만 표시한다 */
  blockedReason?: string;
  sectionNum?: string;
  /**
   * 증축이 있는가 — **차단 조건이 아니다**(Q-4 확정). 건물 구분값을 본체·증축에 배분하는 방식과
   * 감정평가가액을 쓸 수 없다는 제약을 안내하기 위해서만 쓴다.
   */
  hasExtension?: boolean;
}

export function GeneralBuildingSaleSplitSection({
  asset,
  onChange,
  blockedReason,
  sectionNum,
  hasExtension,
}: Props) {
  const mode = asset.saleSplitMode ?? "apportioned";

  if (blockedReason) {
    return (
      <ToneCard tone="emerald" sectionNum={sectionNum} title={SECTION_TITLE}>
        <p className="text-xs leading-snug text-muted-foreground" data-testid="gb-sale-split-blocked">
          {blockedReason} 양도시 기준시가 비율로 안분합니다 (소득세법 시행령 §166⑥).
        </p>
      </ToneCard>
    );
  }

  return (
    <ToneCard tone="emerald" sectionNum={sectionNum} title={SECTION_TITLE}>
      <div data-testid="gb-sale-split-mode">
        <RadioCardGroup
          name="gbSaleSplitMode"
          tone="emerald"
          layout="inline"
          options={SALE_SPLIT_MODE_OPTIONS}
          value={mode}
          onChange={(v) => onChange(saleSplitModePatch(v) as Partial<AssetForm>)}
        />
      </div>

      {mode === "actual" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <FieldCard label="토지 양도가액" hint="소득세법 §100②">
              <CurrencyInput
                label=""
                hideUnit
                value={asset.landTransferPrice}
                onChange={(v) => onChange({ landTransferPrice: v })}
                placeholder="미입력 시 나머지에서 자동 계산"
                data-testid="gb-land-transfer-price"
              />
            </FieldCard>
            <FieldCard label="건물 양도가액">
              <CurrencyInput
                label=""
                hideUnit
                value={asset.buildingTransferPrice}
                onChange={(v) => onChange({ buildingTransferPrice: v })}
                placeholder="미입력 시 나머지에서 자동 계산"
                data-testid="gb-building-transfer-price"
              />
            </FieldCard>
          </div>
          <p className="text-caption leading-snug text-muted-foreground">
            구분 기재한 금액이 <strong>안분가액과 30% 이상 차이</strong>나면 「구분이 불분명한 때」로 보아
            안분가액을 적용합니다 (소득세법 §100③). 한쪽만 입력하면 나머지는 총액에서 자동 계산되며,
            그 금액도 같은 판정을 받습니다.
          </p>
          {hasExtension && (
            <p className="text-caption leading-snug text-amber-800" data-testid="gb-split-extension-note">
              증축이 있으므로 입력한 <strong>건물 양도가액</strong>은 본체분과 증축분에
              <strong> 양도 당시 기준시가 비율</strong>로 나뉩니다. 30% 판정은 토지와 건물
              <strong> 합계</strong>를 기준으로 합니다. 증축분이 미미하다면 구분 계산 대신
              <strong> 당초 건물의 자본적 지출</strong>로 처리하는 편이 간명합니다.
            </p>
          )}
          <SaleSplitExemptionCard asset={asset} onChange={onChange} />

          {/* 30% 판정의 비교 대상 — 주택 경로와 공유한다(§100③ · 부가령 §64① 서열). */}
          <SaleSplitCompareBasisCard asset={asset} onChange={onChange} />
        </div>
      )}

      {/* 감정평가 안분 — 이 모드에서는 감정평가액이 **안분 basis** 그 자체다 (부가령 §64①1호). */}
      {mode === "appraisal" && (
        <div data-testid="gb-sale-appraisal-basis">
          <SaleAppraisalFields asset={asset} onChange={onChange} />
        </div>
      )}

      {/* 기준시가 안분 — 추가 입력이 없다. 어디서 받는 값인지만 알린다. */}
      {mode === "apportioned" && (
        <p className="text-caption leading-snug text-muted-foreground" data-testid="gb-sale-apportioned-note">
          양도시 토지·건물 기준시가 비율로 안분합니다 (소득세법 시행령 §166⑥). 기준시가는
          <strong> ③ 취득</strong> 탭의 「토지 공시지가」·「건물 기준시가」 카드에서 입력합니다.
        </p>
      )}
    </ToneCard>
  );
}
