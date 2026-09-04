"use client";

/**
 * SuccessorRightAcquisitionBlock — 승계조합원 조합원입주권 취득 정보 입력
 *
 * `assetKind === "right_to_move_in"` + ① 기본정보 「조합원 유형」 = **승계조합원**일 때
 * `RedevelopmentBlock`(§166 입력) **대신** 렌더된다.
 *
 * ## 왜 §166 블록이 아닌가
 *
 * 「소득세법 시행령」 §166①은 「조합원이 **당해 조합에 기존건물과 그 부수토지를 제공**하고 취득한
 * 입주자로 선정된 지위를 양도하는 경우」로 요건을 한정한다 — 승계자는 제공한 사실이 없다.
 * ⇒ 인가전/인가후 안분 자체가 성립하지 않고, 양도차익은 §100①·§95①·§97①1호 가목의 일반 원칙
 *   (양도가액 − 취득가액 − 필요경비)으로 계산한다.
 *
 * ## 취득가액 2칸의 근거
 *
 * 국세청 **기준-2025-법규재산-0057**(법규과-1320, 2025-06-19):
 *   「해당 주택의 양도가액에서 필요경비로 차감하는 취득가액은 **종전주택 권리가액과 취득 이후
 *     조합원 분양계약에 따라 납입한 추가분담금** 등을 합산하여 산정하는 것이며, 조합원입주권
 *     취득 당시 **프리미엄**을 지급한 사실이 객관적인 입증자료에 의하여 확인되는 경우에는 해당
 *     가액을 취득가액에 포함할 수 있는 것임」
 *
 * ⇒ ① 승계취득가액(권리가액 상당 + 프리미엄) ② 취득 후 납입 추가분담금 — 두 칸으로 받고
 *   합계를 read-only로 보여 준다. 합산은 API 변환(`transfer-successor-right.ts`)이 하며,
 *   여기서는 **같은 헬퍼**로 미리보기만 만든다(dual-truth 방지).
 *
 * 정책 준수:
 *  - useEffect → store 미러링 금지 (합계는 useMemo 순수 계산, 저장하지 않음)
 *  - 자동 안분 fallback 금지 (미입력은 ⑧ validate가 차단)
 *  - placeholder 숫자 예시 금지 → FieldCard hint 한국어 설명
 */

import { useMemo } from "react";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { successorRightAcquisitionTotal } from "@/lib/calc/transfer-successor-right";
import { successorRightStdPriceAtAcq } from "@/lib/calc/transfer-successor-right";
import { successorRightStdPriceAtTransfer } from "@/lib/calc/transfer-successor-right";
import { successorRightEstimationMode } from "@/lib/calc/transfer-successor-right";
import { SuccessorRightStdPriceSection } from "./SuccessorRightStdPriceSection";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

type AcqMode = ReturnType<typeof successorRightEstimationMode>;

/**
 * 취득가액 산정 방식 — 「소득세법 시행령」 §176의2③의 **추계 순서**를 화면 순서로 그대로 쓴다.
 *   실지거래가액(§97①1호 가목) → 매매사례(③1호) → 감정(③2호) → 환산(③3호)
 *
 * ⚠️ 순서를 바꾸지 말 것. 법정 순위이고, 사용자가 위에서부터 검토하도록 배치한 것이다.
 */
const ACQ_MODE_OPTIONS: { value: AcqMode; label: string; description: string }[] = [
  { value: "actual", label: "실지거래가액", description: "승계취득 시 실제로 지급한 금액 (§97①1호 가목)" },
  { value: "salesCase", label: "매매사례가액", description: "취득일 전후 3개월 이내 동일·유사 자산의 매매사례 (§176의2③1호)" },
  { value: "appraisal", label: "감정가액", description: "취득일 전후 3개월 이내 2 이상 감정평가법인등 평가액의 평균 (§176의2③2호)" },
  { value: "estimated", label: "환산취득가액", description: "양도가액 × (취득당시 기준시가 ÷ 양도당시 기준시가) (§176의2②2호·③3호)" },
];

/**
 * 3개 boolean 플래그를 **하나만 참**으로 좁힌다 — 단일 배치 patch로 돌려주지 않으면
 * 두 번째 `onChange`의 spread가 첫 번째를 덮어써 조합 상태가 남는다
 * (memory `feedback_multikey_patch_stale_spread_overwrite`).
 */
function acqModePatch(mode: AcqMode): Partial<AssetForm> {
  return {
    useEstimatedAcquisition: mode === "estimated",
    isAppraisalAcquisition: mode === "appraisal",
    isSalesCaseAcquisition: mode === "salesCase",
  };
}

export function SuccessorRightAcquisitionBlock({ asset, onChange }: Props) {
  // 표시 전용 합계 — 저장하지 않는다. 산식은 API 변환과 **같은 헬퍼**를 쓴다.
  const { successorRightAcqPrice, successorRightAddedContribution } = asset;
  const total = useMemo(
    () =>
      successorRightAcquisitionTotal({
        successorRightAcqPrice,
        successorRightAddedContribution,
      }),
    [successorRightAcqPrice, successorRightAddedContribution],
  );

  // 산정 방식 — ④ 변환·⑧ validate와 **같은 술어**(dual-truth 방지)
  const mode = successorRightEstimationMode(asset);
  const isActual = mode === "actual";
  // §165① 기준시가 미리보기 — 저장하지 않는다(합산은 ④ 변환과 같은 헬퍼)
  const stdAtAcq = successorRightStdPriceAtAcq(asset);
  const stdAtTransfer = successorRightStdPriceAtTransfer(asset);

  return (
    <div className="space-y-3">
      <ToneCard
        tone="sky"
        sectionNum={1}
        title="조합원입주권 승계취득 정보"
        bodyClassName="space-y-2"
        noDark
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <LawArticleModal legalBasis="소득세법 §97 ① 1호" label="§97①1호 가목" />
          <LawArticleModal legalBasis="소득세법 시행령 §163 ①" label="시행령 §163①" />
        </div>

        <FieldCard
          label="관리처분계획 인가일"
          hint="승계취득이 인가 후임을 확인하는 용도입니다. 승계취득가액 계산에는 쓰이지 않습니다."
        >
          <DateInput
            value={asset.redevApprovalDate}
            onChange={(v) => onChange({ redevApprovalDate: v })}
          />
        </FieldCard>

        {/* 취득가액 산정 방식 — §176의2③ 추계 순서 (R-12). 원조합원은 §166③ 환산 전속이라
            이 라디오가 없다(④ 변환의 `blocksEstimation`이 게이트). */}
        {/* ⚠️ 라벨에 「승계」를 붙인다 — 상단 축 A(`CompanionAcqPurchaseBlock`의 산정방식 라디오)와
            **다른 축**임이 드러나야 한다. 그쪽은 §166 경로(원조합원)의 축이고 이쪽은 §97①1호
            일반 경로의 축이다. 같은 문구를 쓰면 사용자도 셀렉터도 둘을 구분하지 못한다. */}
        <FieldCard
          label="승계취득가액 산정 방식"
          hint="실지거래가액을 확인할 수 없을 때만 추계를 씁니다. 매매사례 → 감정 → 환산 순서로 검토합니다(시행령 §176의2③)."
        >
          <RadioCardGroup
            name={`successorAcqMode-${asset.assetId}`}
            value={mode}
            onChange={(v) => onChange(acqModePatch(v as AcqMode))}
            options={ACQ_MODE_OPTIONS}
          />
        </FieldCard>

        {isActual && (
          <>
            <FieldCard
              label="승계취득가액"
              hint="조합원입주권을 양수하며 실제로 지급한 금액. 권리가액 상당액에 프리미엄을 지급했다면 포함합니다(객관적 입증자료 필요)."
            >
              <CurrencyInput
                label=""
                value={asset.successorRightAcqPrice}
                onChange={(v) => onChange({ successorRightAcqPrice: v })}
                hideUnit
              />
            </FieldCard>

            <FieldCard
              label="취득 후 납입 추가분담금"
              hint="승계취득 이후 조합원 분양계약에 따라 납입한 금액. 없으면 비워두세요. 받은 청산금이 있다면 아래 안내를 확인하세요."
            >
              <CurrencyInput
                label=""
                value={asset.successorRightAddedContribution}
                onChange={(v) => onChange({ successorRightAddedContribution: v })}
                hideUnit
              />
            </FieldCard>
          </>
        )}

        {mode === "salesCase" && (
          <FieldCard
            label="매매사례가액"
          >
            <CurrencyInput
              label=""
              value={asset.similarSalesValue}
              onChange={(v) => onChange({ similarSalesValue: v })}
              hideUnit
            />
          </FieldCard>
        )}

        {mode === "appraisal" && (
          <FieldCard
            label="감정가액"
            hint="취득일 전후 3개월 이내에 2 이상의 감정평가법인등이 평가한 가액의 평균액입니다(기준시가 10억 이하는 1개 가능)."
          >
            <CurrencyInput
              label=""
              value={asset.fixedAcquisitionPrice}
              onChange={(v) => onChange({ fixedAcquisitionPrice: v })}
              hideUnit
            />
          </FieldCard>
        )}

        {!isActual && <SuccessorRightStdPriceSection asset={asset} onChange={onChange} mode={mode} stdAtAcq={stdAtAcq} stdAtTransfer={stdAtTransfer} />}

        {isActual && total > 0 && (
          <div className="rounded-md border border-sky-200 bg-sky-100/60 p-2.5 text-caption text-sky-900 space-y-1">
            <div className="font-semibold">미리보기 — 취득가액 합계</div>
            <div className="font-mono tabular-nums">
              승계취득가액 + 추가분담금 = {total.toLocaleString("ko-KR")}
            </div>
            <div>
              ※ 양도차익 = 양도가액 − 위 합계 − 필요경비(자본적지출·양도비). §166① 인가전·인가후
              안분은 적용되지 않습니다.
            </div>
          </div>
        )}
      </ToneCard>

      {/* 청산금 **수령** — 이 계산의 취득가액을 깎는 사안이 아니라 별개의 양도다.
          종전 hint는 「현재 지원하지 않습니다」로만 적혀 있어 **사용자가 신고 의무 자체를 모를 수** 있었다.
          근거: 국세청 사전-2023-법규재산-0450 (2024-06-27) — 관련 법령이 §88·§98·§105이지 §97이 아니다. */}
      <ToneCard tone="amber" title="청산금을 수령한 경우" bodyClassName="space-y-1.5" noDark>
        <div className="flex flex-wrap items-center gap-1.5">
          <LawArticleModal legalBasis="소득세법 §105" label="§105" />
        </div>
        <p className="text-xs text-amber-800">
          수령한 청산금은 <b>위 취득가액에 넣지 않습니다</b>. 소유권 이전고시일의 <b>다음날</b>을
          양도일로 하는 <b>별개의 양도</b>에 해당하여, 그 청산금에 대해 <b>따로 양도소득세를 신고</b>해야
          합니다. 이 계산기는 그 별건 계산을 지원하지 않습니다.
        </p>
        <p className="text-caption text-amber-700">
          근거: 국세청 사전-2023-법규재산-0450 (2024-06-27) — 승계조합원이 이전고시 후 조합으로부터
          지급받은 청산금 상당액은 양도소득세 과세대상.
        </p>
      </ToneCard>

      <ToneCard tone="rose" title="장기보유특별공제 미적용" bodyClassName="space-y-1.5" noDark>
        <div className="flex flex-wrap items-center gap-1.5">
          <LawArticleModal legalBasis="소득세법 §95 ②" label="§95②" />
        </div>
        <p className="text-xs text-rose-800">
          장기보유특별공제 대상은 조합원입주권 중 <b>조합원으로부터 취득한 것은 제외</b>합니다.
          승계취득한 조합원입주권에는 공제가 적용되지 않습니다.
        </p>
        <p className="text-caption text-rose-700">
          ※ 1세대1조합원입주권 비과세(§89①4호)도 「관리처분계획 인가일 현재 기존주택을 소유하는
          세대」를 요건으로 하므로 승계조합원에게는 적용되지 않습니다.
        </p>
      </ToneCard>
    </div>
  );
}
