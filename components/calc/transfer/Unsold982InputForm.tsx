"use client";

/**
 * §98의2 지방 미분양주택 — 특칙 전용 입력 폼 (P4, 2026-06-12)
 *
 * 감면세액 없음 — 장특 표2 보유기간별 공제율(양도일 시행 표2) + 기본세율 강제 (법 ①).
 * 농특세 없음. 중과 배제 (소령 §167의3①5호).
 */

import { DateInput } from "@/components/ui/date-input";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

type Unsold982Form = Extract<AssetReductionForm, { type: "unsold_98_2" }>;

interface Props {
  value: Unsold982Form;
  onChange: (patch: Partial<Unsold982Form>) => void;
}

export function Unsold982InputForm({ value, onChange }: Props) {
  return (
    <div className="mt-2 ml-4 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="조세특례제한법 §98의2①" label="§98의2① 지방 미분양주택" />
        <LawArticleModal legalBasis="조세특례제한법 시행령 §98의2" label="조특령 §98의2" />
      </div>

      <ToneCard tone="sky" title="① 취득·계약 시기">
        <div>
          <label className="mb-1 block text-sm font-medium">최초 매매계약일</label>
          <DateInput data-field="reduction.unsold_98_2.contractDate982" value={value.contractDate982} onChange={(v) => onChange({ contractDate982: v })} />
          <p className="mt-1 text-xs text-muted-foreground">
            취득기간 2008.11.3~2010.12.31 — 계약일은 반드시 입력하세요 (자산의 매매계약일 칸은 읽지 않습니다).
            취득일이 기간 외라도 2010.12.31까지 매매계약 체결 + 계약금 납부한 경우 포함됩니다 (법 §98의2①)
          </p>
        </div>
      </ToneCard>

      <ToneCard tone="rose" title="② 자격 요건 확인">
        <ToggleCard
          tone="rose"
          title="수도권 밖 미분양주택 확인"
          description="2008.11.2까지 분양계약이 체결되지 않아 선착순으로 공급되거나, 2008.11.3까지 사업계획승인(신청)한 사업주체가 공급하는 주택 (조특령 §98의2①). 분양전환된 임대주택은 대상이 아닙니다 (국세청 부동산거래관리과-340·-43)"
          checked={value.isNonCapitalUnsold982}
          onCheckedChange={(v) => onChange({ isNonCapitalUnsold982: v })}
        />
        <ToggleCard
          tone="rose"
          title="선착순 공급 취득 또는 사업주체와 최초 매매계약"
          description="령 §98의2①1호(선착순) 또는 2호(사업주체 최초 매매계약 — 2008.11.3 현재 입주자모집공고에 따른 입주자의 계약일이 지나지 아니한 주택에 한정) 요건"
          checked={value.isFirstOrFcfsContract982}
          onCheckedChange={(v) => onChange({ isFirstOrFcfsContract982: v })}
        />
        <div data-field="reduction.unsold_98_2.occupiedAtContract982" className="space-y-1">
          <p className="text-sm font-medium">매매계약일 현재 입주한 사실</p>
          <RadioCardGroup
            name="occupiedAtContract982"
            tone="rose"
            layout="inline"
            value={value.occupiedAtContract982 ?? ""}
            onChange={(v) => onChange({ occupiedAtContract982: v as Unsold982Form["occupiedAtContract982"] })}
            options={[
              { value: "no", label: "입주 사실 없음" },
              { value: "yes", label: "입주 사실 있음" },
              { value: "unknown", label: "모름" },
            ]}
          />
          <p className="text-xs text-muted-foreground">
            입주 사실이 있거나 모르면 적용하지 않습니다 — 조특법·시행령 문언에는 제외 규정이 없고 국세청 해석례(법규과-1582·부동산거래관리과-1012)에 따른 것입니다 (확인 필요).
          </p>
        </div>
      </ToneCard>

      {/*
        D11-05 — 적용 주체 요건. 엔진에는 게이트가 있었으나(`unsold-hybrid-p4.ts:59`) ①④⑤⑫ 어디에도
        입력 경로가 없어 상수 `?? true` fallback으로 **영구 사문**이었다. §99의3 sibling
        (`isResident993`)과 같은 형태로 배선한다 — 기본값은 법문이 상정하는 통상의 경우이되
        **화면에 보이고 끌 수 있어야** 비거주자가 사실대로 신고할 수 있다.
      */}
      <div className="flex flex-wrap gap-2 text-xs">
        <ToggleCard
          variant="chip"
          tone="violet"
          title="거주자"
          description="법 §98의2① 「거주자가 …」 — 체크 해제 시 적용 배제"
          checked={value.isResident982}
          onCheckedChange={(v) => onChange({ isResident982: v })}
        />
      </div>

      <ToneCard tone="emerald" bodyClassName="space-y-1" className="text-caption text-emerald-900 dark:text-emerald-200">
        <p>
          · 적용 효과 (특칙 — 감면세액이 아님): 장기보유특별공제는 양도차익 × 소득세법 §95② 표2
          보유기간별 공제율을 양도일 당시 시행 표2로 적용하고(2020.12.31. 이전 양도분은 연 8%·최대 80%,
          2021.1.1. 이후 양도분은 보유 열 연 4%·최대 40%), 세율은 단기보유 여부와 관계없이 기본
          누진세율(§104①1호)을 적용합니다 (법 §98의2①).
        </p>
        <p>
          · 1세대1주택 표2(보유+거주 합산) 요건을 충족하면 그 공제율이 유지됩니다(특칙이 적용되지 않음). §97의3 특례와 함께 선택하면
          두 조문의 장기보유특별공제액 중 큰 금액 하나를 적용하고 적용하지 않은 금액을 결과에 표시합니다 (적용 순서 규정은 확인 필요).
        </p>
        <p>· 농어촌특별세는 부과되지 않습니다 (감면세액이 없는 특칙).</p>
        <p>· 다주택 중과세율이 적용되지 않습니다 (소득세법 시행령 §167의3①5호).</p>
      </ToneCard>
    </div>
  );
}
