"use client";

/**
 * 일반건물 — 토지·건물 **양도가액 결정 방식**(구분양도 / 일괄양도) 섹션 (Phase 2 ⑤).
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

import { useState } from "react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup, type RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { SaleAppraisalFields, SaleSplitExemptionCard } from "./SaleSplitBasisExemptionCards";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/**
 * ── 안분 방식 **3-way** (2026-08-07 · 사용자 보고로 통합) ──
 *
 * 종전에는 라디오 2개(일괄/구분) + 「감정평가가액으로 안분」 **토글**이 따로 있었다. 그 구조는
 * 「일괄양도 (양도시 **기준시가 비율로** 안분)」을 고른 상태에서 토글을 켜면 실제로는 감정평가액으로
 * 안분되어(`sale-split-apportion-basis.ts`의 부가령 §64① 서열) **라벨이 거짓이 되는** 모순이 있었다.
 *
 * 안분 basis는 축 하나이므로 셋을 한 행 라디오로 합친다. 순서는 **법정 우선순위** 그대로다 —
 * 구분 기장이 원칙(§100②)이고, 안분해야 한다면 감정평가액(부가령 §64①1호)이 기준시가(2호)에 앞선다.
 */
const MODE_OPTIONS: RadioCardOption<"actual" | "appraisal" | "apportioned">[] = [
  { value: "actual", label: "구분양도 (계약서에 구분 기재)" },
  { value: "appraisal", label: "감정평가 (감정평가가액으로 안분)" },
  { value: "apportioned", label: "기준시가 안분 (양도시 기준시가 비율)" },
];

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

  /**
   * 구분양도 하위 「30% 비교 기준」 토글의 열림 — 값의 유무에서 파생한 **로컬** state다.
   * 폼에 상태 필드를 새로 두면 값과 상태 두 벌을 동기화해야 하고, 값 유무로만 판정하면
   * 「입력하다 지웠을 때 접히는」 문제가 생긴다(`SaleSplitBasisExemptionCards` 헤더와 같은 판단).
   * 로컬 state는 store 미러링이 아니므로 `useEffect → store` 금지 정책과 무관하다.
   */
  const [compareOpen, setCompareOpen] = useState(
    () => !!(asset.landAppraisalAtTransfer || asset.buildingAppraisalAtTransfer || asset.appraisalDateAtTransfer),
  );

  if (blockedReason) {
    return (
      <ToneCard tone="emerald" sectionNum={sectionNum} title="양도가액 토지·건물 안분 방식">
        <p className="text-xs leading-snug text-muted-foreground" data-testid="gb-sale-split-blocked">
          {blockedReason} 양도시 기준시가 비율로 안분합니다 (소득세법 시행령 §166⑥).
        </p>
      </ToneCard>
    );
  }

  /**
   * 모드를 바꿀 때 **쓰지 않는 쪽 값을 비운다** — 엔진 스위치가 `saleSplitMode`가 아니라
   * **값의 유무**이기 때문이다(`transfer-tax-api-split.ts:75`). 남겨 두면 화면에 없는 값이
   * 계속 전송돼 안분 기준이 조용히 바뀐다(종전 토글이 OFF에서 값을 비우던 것과 같은 이유).
   *
   * · `apportioned`(기준시가) → 감정평가액을 비운다. 남기면 basis 서열상 감정평가가 이겨
   *   「기준시가 안분」을 골랐는데 감정평가로 계산되는 모순이 재발한다.
   * · `appraisal` → 구분 양도가액을 비운다. 남기면 §100③ 30% 판정이 도는데, 구분 기재를
   *   철회한 사용자의 의도와 어긋난다.
   * · `actual`(구분양도) → **감정평가액은 보존한다** — 그쪽에서는 안분 basis가 아니라
   *   30% 판정의 비교 대상이라 여전히 유효하다.
   */
  const setMode = (v: "actual" | "appraisal" | "apportioned") => {
    if (v === "apportioned") {
      onChange({
        saleSplitMode: v,
        landAppraisalAtTransfer: "",
        buildingAppraisalAtTransfer: "",
        appraisalDateAtTransfer: "",
        landTransferPrice: "",
        buildingTransferPrice: "",
      });
      return;
    }
    if (v === "appraisal") {
      onChange({ saleSplitMode: v, landTransferPrice: "", buildingTransferPrice: "" });
      return;
    }
    onChange({ saleSplitMode: v });
  };

  return (
    <ToneCard tone="emerald" sectionNum={sectionNum} title="양도가액 토지·건물 안분 방식">
      <div data-testid="gb-sale-split-mode">
        <RadioCardGroup
          name="gbSaleSplitMode"
          tone="emerald"
          layout="inline"
          options={MODE_OPTIONS}
          value={mode}
          onChange={setMode}
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

          {/*
            🔑 **30% 판정의 비교 대상**(선택 입력) — 라디오의 「감정평가」와 같은 필드를 쓰지만
               역할이 다르다. 여기서는 안분값을 *적용*하는 게 아니라 구분 기재액과 *비교*한다.

               「소득세법」 제100조 제3항이 구분 기재액을 「안분계산한 가액」과 견주는데, 그 안분값은
               §166⑥ → 「부가가치세법 시행령」 제64조 제1항의 서열(감정평가액 > 기준시가)로 정해진다.
               ⇒ 감정평가서가 있으면 30% 판정도 그것과 해야 하므로, 구분양도에서도 입력 경로를
                 남긴다(3-way 배타로 없애면 감정평가가 있는데 기준시가로 비교하게 된다).
          */}
          <ToggleCard
            tone="emerald"
            checked={compareOpen}
            onCheckedChange={(v) => {
              setCompareOpen(v);
              if (!v) {
                onChange({
                  landAppraisalAtTransfer: "",
                  buildingAppraisalAtTransfer: "",
                  appraisalDateAtTransfer: "",
                });
              }
            }}
            title="30% 판정 비교 기준으로 감정평가가액 사용"
            description="비워두면 양도시 기준시가로 비교합니다 (소득세법 §100③ · 시행령 §166⑥)"
          >
            <SaleAppraisalFields asset={asset} onChange={onChange} />
          </ToggleCard>
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
