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
import { successorRightAcquisitionTotal } from "@/lib/calc/transfer-successor-right";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
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
          hint="승계취득 이후 조합원 분양계약에 따라 납입한 금액. 없으면 비워두세요. 청산금을 수령한 경우는 현재 지원하지 않습니다."
        >
          <CurrencyInput
            label=""
            value={asset.successorRightAddedContribution}
            onChange={(v) => onChange({ successorRightAddedContribution: v })}
            hideUnit
          />
        </FieldCard>

        {total > 0 && (
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
