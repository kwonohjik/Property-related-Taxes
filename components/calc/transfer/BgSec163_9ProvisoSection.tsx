"use client";

/**
 * 부담부증여 × 「소득세법 시행령」 §163⑨ 단서(의제취득일 이후 · 기준시가 고시 전) — ② §164 가액 칸(토지 §164④ 등급 환산 · 단독주택 §164⑦).
 * 상가 · 오피스텔(§164⑥)은 칸이 ③ 취득정보(`CommercialInheritanceStdPriceSection`)에 이미 있어 여기서는 그 칸을 가리키기만 한다(PR-2).
 * 계획서 `docs/00-pm/bg-163-9-proviso-post-deemed.plan.md` · 사용자 결정 Q-24 a(①은 위 실지 칸) · Q-25 a(비우면 평가액만) · Q-29 a(근거 문구 — §10).
 * 근거: 영 §163⑨ 본문 괄호 「부담부증여의 채무액에 해당하는 부분도 포함」은 대통령령 제30395호(2020.2.11. 공포 · 시행)로 신설됐고 부칙 제2조②에 따라
 * 그 이후 양도분부터 적용된다. 그 전 양도분은 괄호가 없어 해석례(서면5팀-3272)에 기댄다 — 양도일(= 부담부증여일)로 문구를 가른다.
 * 칸은 일반 양도(`PostDeemedInputs`)와 같은 부품 · 같은 store 필드다 — ④ `buildInheritedAcquisitionPayload`가 같은 술어(`bgSec163_9ProvisoKind`)로 싣는다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { TONE } from "@/components/calc/shared/tones";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { Pre1990LandValuationInput } from "@/components/calc/inputs/Pre1990LandValuationInput";
import { HouseValuationSection } from "./inheritance/HouseValuationSection";
import { sec164LandAreaField } from "@/lib/calc/transfer-163-9-base-date";
import type { BgSec163_9ProvisoKind } from "@/lib/calc/bg-163-9-proviso";

const SEC164: Record<BgSec163_9ProvisoKind, string> = { land: "§164④", house: "§164⑦", commercial: "§164⑥" };
/** 영 §163⑨ 본문 「부담부증여의 채무액에 해당하는 부분도 포함」 괄호 시행일(대통령령 제30395호 · 부칙 제2조② 이후 양도분) */
const SEC163_9_BG_PAREN_FROM = "2020-02-11";

const NOT_YET: Record<BgSec163_9ProvisoKind, string> = {
  land: "개별공시지가가 고시되기 전(1990.8.30. 전)",
  house: "이 주택의 개별주택가격이 공시되기 전",
  commercial: "상가 · 오피스텔 기준시가가 처음 고시되기 전(2005.1.1. 전)",
};

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
  kind: BgSec163_9ProvisoKind;
}

export function BgSec163_9ProvisoSection({ asset, onChange, transferDate, kind }: Props) {
  const baseLabel = asset.acquisitionCause === "gift" ? "증여일" : "상속개시일";
  const sec164 = SEC164[kind];
  return (
    <div data-testid="bg-163-9-proviso-section">
    <ToneCard
      tone="amber"
      title={`취득가액 — 평가액과 ${sec164} 가액 중 큰 금액`}
      titleExtra={<LawArticleModal legalBasis="소득세법 시행령 §163 ⑨" label="소령 §163⑨" />}
    >
      <p className={`text-xs ${TONE.amber.title}`}>
        {baseLabel} 현재 {NOT_YET[kind]}이라, 위 실지취득가액 칸의 평가액과
        {kind === "commercial" ? " ③ 취득정보의 「§164⑥ 취득당시 기준시가」 칸" : ` 아래 ${sec164}`} 가액 중 <strong>큰 금액</strong>을 취득가액으로 보고 채무비율을 곱합니다(소득세법 시행령 §159①1호 · §163⑨ 단서 {kind === "land" ? "1호" : "2호"}).
        {kind === "commercial" ? " 그" : " 아래"} 칸을 <strong>모두</strong> 입력한 경우에만 비교하고, 비워 두면 평가액만으로 계산합니다.
      </p>
      <p className="text-caption text-muted-foreground">
        {transferDate && transferDate >= SEC163_9_BG_PAREN_FROM
          ? "근거: 소득세법 시행령 §163⑨ 본문 괄호가 「부담부증여의 채무액에 해당하는 부분」도 상속 · 증여받은 자산에 포함합니다(2020.2.11. 신설 · 그 이후 양도분) — 단서(큰 금액)도 같은 항이라 함께 적용됩니다."
          : "2020.2.11. 전 양도분은 소득세법 시행령 §163⑨ 본문에 부담부증여 괄호가 없어(2020.2.11. 신설) 법문 연결(§159①1호 → 소득세법 §97①1호 → 시행령 §163⑨)과 해석례(서면5팀-3272 — 증여 취득 자산의 취득가액은 §163⑨ 평가액)를 따릅니다. 단서(큰 금액)를 직접 다룬 해석례는 확인하지 못했습니다."}
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
      ) : kind === "house" ? (
        <HouseValuationSection asset={asset} onChange={onChange} transferDate={transferDate} />
      ) : null}
    </ToneCard>
    </div>
  );
}
