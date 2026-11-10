"use client";

/**
 * 부담부증여 × 「소득세법 시행령」 §163⑨ 단서(의제취득일 이후 · 기준시가 고시 전) — ② §164 가액 칸(토지 §164④ 등급 환산 · 단독주택 §164⑦).
 * 계획서 `docs/00-pm/bg-163-9-proviso-post-deemed.plan.md` · 사용자 결정 Q-24 a(①은 위 실지 칸) · Q-25 a(비우면 평가액만) · Q-27 a(해석례 미확보 명시).
 * 칸은 일반 양도(`PostDeemedInputs`)와 같은 부품 · 같은 store 필드다 — ④ `buildInheritedAcquisitionPayload`가 같은 술어(`bgSec163_9ProvisoKind`)로 싣는다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { TONE } from "@/components/calc/shared/tones";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { Pre1990LandValuationInput } from "@/components/calc/inputs/Pre1990LandValuationInput";
import { HouseValuationSection } from "./inheritance/HouseValuationSection";
import { sec164LandAreaField } from "@/lib/calc/transfer-163-9-base-date";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
  kind: "land" | "house";
}

export function BgSec163_9ProvisoSection({ asset, onChange, transferDate, kind }: Props) {
  const baseLabel = asset.acquisitionCause === "gift" ? "증여일" : "상속개시일";
  const sec164 = kind === "land" ? "§164④" : "§164⑦";
  return (
    <div data-testid="bg-163-9-proviso-section">
    <ToneCard
      tone="amber"
      title={`취득가액 — 평가액과 ${sec164} 가액 중 큰 금액`}
      titleExtra={<LawArticleModal legalBasis="소득세법 시행령 §163 ⑨" label="소령 §163⑨" />}
    >
      <p className={`text-xs ${TONE.amber.title}`}>
        {baseLabel} 현재 {kind === "land" ? "개별공시지가가 고시되기 전(1990.8.30. 전)" : "이 주택의 개별주택가격이 공시되기 전"}이라, 위 실지취득가액 칸의 평가액과
        아래 {sec164} 가액 중 <strong>큰 금액</strong>을 취득가액으로 보고 채무비율을 곱합니다(소득세법 시행령 §159①1호 · §163⑨ 단서 {kind === "land" ? "1호" : "2호"}).
        아래 칸을 <strong>모두</strong> 입력한 경우에만 비교하고, 비워 두면 평가액만으로 계산합니다.
      </p>
      <p className="text-caption text-muted-foreground">
        이 비교를 부담부증여에 직접 적용한 국세청 해석례는 확인하지 못했습니다 — 법문(§159①1호 → 소득세법 §97①1호 → 시행령 §163⑨)을 따라 계산합니다.
      </p>
      {kind === "land" ? (
        <Pre1990LandValuationInput
          form={{
            pre1990Enabled: asset.pre1990Enabled,
            pre1990PricePerSqm_1990: asset.pre1990PricePerSqm_1990,
            pre1990PricePerSqm_atTransfer: asset.pre1990PricePerSqm_atTransfer,
            pre1990Grade_current: asset.pre1990Grade_current,
            pre1990Grade_prev: asset.pre1990Grade_prev,
            pre1990Grade_atAcq: asset.pre1990Grade_atAcq,
            pre1990GradeMode: asset.pre1990GradeMode,
          }}
          onChange={(patch) => onChange(patch)}
          acquisitionArea={asset[sec164LandAreaField(asset)] || undefined}
          jibun={asset.addressJibun || undefined}
          acquisitionDate={asset.acquisitionDate || undefined}
          transferDate={transferDate}
          alwaysOpen
        />
      ) : (
        <HouseValuationSection asset={asset} onChange={onChange} transferDate={transferDate} />
      )}
    </ToneCard>
    </div>
  );
}
