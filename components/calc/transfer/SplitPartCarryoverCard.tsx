"use client";

/**
 * 파트 이월과세(소득세법 §97의2①) — **한 파트(토지/건물)의 증여자 취득 입력 카드** (P2 C).
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.ui.design.md §2.3·§3.2
 *
 * 증여자가 토지·건물을 다른 날 취득했다면 증여자 취득일·취득가액·자본적지출은 파트마다 다르다. 이 카드는 그 한 파트 분량이다:
 *   증여자 취득일 → 증여자 취득가액 → 증여자가 지출한 자본적 지출 → 증여 신고가액(= 증여세 상당액 안분의 분자 · ②3호 미적용 시 수증자 취득가액)
 *
 * · 증여자 취득가액을 모르면 «환산취득가액» 토글(P6)을 켠다 — 증여자 취득가액 칸 대신 «증여자 취득 당시 이 파트 기준시가» 한 칸을 받는다(분모 = 아래 양도 정보의 양도시 기준시가).
 *   토글은 파트 전용 폼 필드(`partEstimated`) — 자산 전체 이월과세의 `useEstimatedAcquisition`·`estimationMode`와 별개다. 분자 값 칸(`donorStandardPriceAtAcquisition`)만 같은 서브폼 칸을 재사용한다.
 *   PHD·APD 환산은 이 카드에 없다(파트는 기준시가 원값으로만 환산).
 * · 증여 신고가액은 기존 파트 취득가액 칸(`landAcquisitionPrice`·`buildingAcquisitionPrice`)을 그대로 바인딩한다 — 이중 진실 금지(엔진 와이어에 파트 평가액 칸이 없다).
 * · 앵커(`data-field`)는 ⑧(`transfer-tax-validate-split-carryover.ts`)이 이동시키는 키와 같다.
 */
import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import { isFractionalOwnership } from "@/lib/calc/transfer-tax-api-helpers";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset-carryover";

export interface SplitPartCarryoverCardProps {
  part: "land" | "building";
  /** 섹션 번호 배지 */
  sectionNum: number;
  /** 이 파트의 증여자 서브폼 — 토지 `landCarryover`, 건물 `carryover` */
  value: CarryoverTaxationForm;
  onPatch: (patch: Partial<CarryoverTaxationForm>) => void;
  /**
   * 증여 신고가액(파트 취득가액 칸) — C만 이 카드에 둔다. P3 A는 토지 가액 칸이 이미 화면에 있어(매매: 취득가액 산정 방식의 토지 칸 · 신축: 블록의 토지 칸)
   * 생략한다 — 같은 `data-field`가 두 번 생기지 않게.
   */
  valuation?: { value: string; onChange: (v: string) => void; field: "landAcquisitionPrice" | "buildingAcquisitionPrice" };
  /** ⑧ 이동 앵커 접두 — 토지 `landCarryover`, 건물 `carryover` */
  anchorPrefix: "landCarryover" | "carryover";
  /** 양도일 ≥ 2024.1.1. — 증여자 자본적지출은 그 이후 양도분부터 반영된다 */
  isAfter2024: boolean;
  /** 건물 카드: 토글을 켜기 전 자산 전체 입력을 이어받는 칸임을 알린다 */
  inheritedNotice?: boolean;
  /** 지분(공유) 양도인가 — 환산 분자는 지분율로 나누지 않는다는 안내(④ 미스케일)에 쓴다. 생략 = 아니다 */
  asset?: AssetForm;
}

export function SplitPartCarryoverCard(props: SplitPartCarryoverCardProps) {
  const { part, value: c, onPatch, anchorPrefix } = props;
  const name = part === "land" ? "토지" : "건물";
  const tid = `split-carryover-${part}`;
  // P6 — 표시(이 카드)·전송(④)·검증(⑧)이 같은 술어 `partDonorEstimated`를 읽는다. 카드는 파트 이월과세일 때만 렌더되므로 서브폼 값만 본다(`partDonorEstimated`의 게이트와 같다).
  const estimated = c.partEstimated === true;
  const shareMode = props.asset ? isFractionalOwnership(props.asset) : false;
  return (
    <ToneCard tone="amber" sectionNum={props.sectionNum} title={`${name} — 증여자 취득`} bodyClassName="space-y-3">
      <div data-testid={`${tid}-card`} className="space-y-3">
        {props.inheritedNotice && (
          <p className="text-caption text-amber-800 dark:text-amber-200" data-testid="split-carryover-building-inherited-note">
            건물 칸은 자산 전체 이월과세에서 입력하던 증여자 정보와 같은 칸입니다 — 토글을 켜기 전에 입력한 값(증여자 취득가액·환산용 기준시가 포함)이 있다면 <strong>건물 기준</strong> 값인지 확인하세요.
          </p>
        )}
        <FieldCard
          label="증여자 취득일"
          field={`${anchorPrefix}.donorAcquisitionDate`}
          hint={`증여자가 ${name}을(를) 취득한 날 — 보유기간·장기보유특별공제 기산일 (소득세법 §95④ 단서)`}
        >
          <DateInput
            value={c.donorAcquisitionDate}
            onChange={(v) => onPatch({ donorAcquisitionDate: v })}
            data-testid={`${tid}-donor-date`}
          />
        </FieldCard>

        <ToggleCard
          data-field={`${anchorPrefix}.partEstimated`}
          data-testid={`${tid}-estimated`}
          tone="amber"
          size="sm"
          title="증여자 취득가액을 모름 — 환산취득가액"
          description={`증여자가 이 ${name}을(를) 취득할 당시의 실지거래가액을 알 수 없을 때 — 증여자 취득 당시 기준시가로 이 ${name}만 환산합니다 (${TRANSFER.CARRYOVER_ESTIMATED_ACQ})`}
          checked={estimated}
          onCheckedChange={(v) => onPatch({ partEstimated: v })}
        />

        {estimated ? (
          <>
            <FieldCard
              label="증여자 취득 당시 이 파트 기준시가"
              field={`${anchorPrefix}.donorStandardPriceAtAcquisition`}
              hint={
                (part === "land"
                  ? "증여자가 토지를 취득한 날 기준 개별공시지가 × 토지 면적 (물건 전체 값)"
                  : "증여자가 건물을 취득한 날 기준 건물 기준시가 (물건 전체 값)") +
                " — 환산취득가액의 분자입니다. 분모는 아래 양도 정보의 양도시 기준시가(" + name + "분)입니다. " +
                (shareMode ? "지분(공유) 양도여도 지분율로 나누지 말고 공시된 가격을 그대로 입력하세요. " : "") +
                "증여자가 상속·증여로 취득했거나 " + (part === "land" ? "개별공시지가 고시(1990.8.30.) 전" : "건물 기준시가 고시 전") + "에 취득했다면 이 환산이 맞는지 확인이 필요합니다."
              }
            >
              <CurrencyInput
                label=""
                value={c.donorStandardPriceAtAcquisition}
                onChange={(v) => onPatch({ donorStandardPriceAtAcquisition: v })}
                data-testid={`${tid}-donor-std-price`}
              />
            </FieldCard>
            <ToneCard tone="amber" bodyClassName="space-y-1">
              <p className="text-caption text-amber-900 dark:text-amber-200" data-testid={`${tid}-estimated-note`}>
                환산취득가액 = 이 {name}의 양도가액 × <Frac top="증여자 취득 당시 기준시가" bottom="양도시 기준시가" />
              </p>
              <p className="text-caption text-amber-900 dark:text-amber-200">
                필요경비 = 개산공제(증여자 취득 당시 기준시가 × 개산공제율, {TRANSFER.CARRYOVER_ESTIMATED_LUMP_DED}) — 자본적지출과 양도비 합계가 (환산취득가액 + 개산공제)보다 크면 그 합계로 대신합니다 ({TRANSFER.CARRYOVER_ESTIMATED_EXPENSE_PROVISO}).
              </p>
            </ToneCard>
          </>
        ) : (
          <FieldCard
            label="증여자 취득가액"
            field={`${anchorPrefix}.donorAcquisitionPrice`}
            hint={`증여자가 ${name}을(를) 취득할 당시의 금액 (${TRANSFER.CARRYOVER_DONOR_BASIS}) — 증여자가 상속·증여로 취득했다면 상속개시일·증여일 현재 상속세 및 증여세법상 평가액입니다 (${TRANSFER.INHERITED_AFTER_DEEMED}). 실지거래가액을 알 수 없으면 위 «환산취득가액»을 켜세요.`}
          >
            <CurrencyInput
              label=""
              value={c.donorAcquisitionPrice}
              onChange={(v) => onPatch({ donorAcquisitionPrice: v })}
              data-testid={`${tid}-donor-price`}
            />
          </FieldCard>
        )}

        <FieldCard
          label="증여자가 지출한 자본적 지출"
          field={`${anchorPrefix}.donorCapitalExpenditure`}
          hint={
            props.isAfter2024
              ? `증여자가 보유기간 중 ${name}에 지출한 자본적 지출 (소득세법 §97의2①2호) — 수증자가 지출한 자본적 지출은 아래 양도 정보의 ${name} 자본적지출 칸에 입력합니다`
              : "2024.1.1. 이후 양도분부터 적용됩니다 (2023.12.31. 신설)"
          }
        >
          <CurrencyInput
            label=""
            value={c.donorCapitalExpenditure}
            onChange={(v) => onPatch({ donorCapitalExpenditure: v })}
            placeholder={props.isAfter2024 ? "없으면 비워두세요" : "해당 없음"}
            disabled={!props.isAfter2024}
            data-testid={`${tid}-donor-capex`}
          />
        </FieldCard>

        {props.valuation && (
          <FieldCard
            label="증여 신고가액"
            field={props.valuation.field}
            hint={`증여세 신고서에 적은 ${name}의 평가액 — 증여세 상당액 안분의 분자이자, 이월과세를 적용하지 않을 때 수증자의 ${name} 취득가액입니다 (시행령 §163의2②·§163⑨)`}
          >
            <CurrencyInput
              label=""
              value={props.valuation.value}
              onChange={props.valuation.onChange}
              data-testid={`${tid}-gift-valuation`}
            />
          </FieldCard>
        )}
      </div>
    </ToneCard>
  );
}
