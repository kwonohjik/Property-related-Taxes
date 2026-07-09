"use client";

/**
 * §98의8 준공후미분양주택 — 5년 발생분 50% 공제 입력 폼 (P1, 2026-06-11)
 *
 * 효과: 취득일부터 5년간 발생한 양도소득금액의 50%를 과세대상소득금액에서 공제 (차감형 —
 *       5년 내 세액감면 없음). 농특세 = 감면세액의 20%. 중과 배제 자동 (소령 §167의3①5호).
 *
 * ① sky 계약 정보 ② sky 가액·면적 (6억 AND 135㎡) ③ violet 임대 (령 §98의5⑤ 기산)
 * ④ rose 자격 토글 3종 + emerald 안내. 적격 판정·산식은 엔진 단일 진실.
 */

import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

type Unsold988Form = Extract<AssetReductionForm, { type: "unsold_98_8" }>;

interface Props {
  value: Unsold988Form;
  onChange: (patch: Partial<Unsold988Form>) => void;
}

function SectionShell({
  num, title, tone, children,
}: { num: string; title: string; tone: "sky" | "violet" | "rose"; children: React.ReactNode }) {
  const toneMap = {
    sky: { box: "border-sky-200 bg-sky-50/40", badge: "bg-sky-200 text-sky-800", title: "text-sky-700" },
    violet: { box: "border-violet-200 bg-violet-50/40", badge: "bg-violet-200 text-violet-800", title: "text-violet-700" },
    rose: { box: "border-rose-200 bg-rose-50/40", badge: "bg-rose-200 text-rose-800", title: "text-rose-700" },
  } as const;
  const t = toneMap[tone];
  return (
    <div className={`rounded-lg border ${t.box} p-3 space-y-2`}>
      <div className="flex items-center gap-2">
        <span className={`flex h-5 w-5 items-center justify-center rounded-full ${t.badge} text-micro font-bold select-none`}>
          {num}
        </span>
        <p className={`text-xs font-semibold ${t.title}`}>{title}</p>
      </div>
      {children}
    </div>
  );
}

export function Unsold988InputForm({ value, onChange }: Props) {
  return (
    <div className="mt-2 ml-4 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="조세특례제한법 §98의8①" label="§98의8① 준공후미분양 차감" />
        <LawArticleModal legalBasis="조세특례제한법 시행령 §98의7" label="조특령 §98의7" />
        <LawArticleModal legalBasis="농어촌특별세법 §5" label="농특세법 §5" />
      </div>

      <SectionShell num="①" title="최초 매매계약 정보" tone="sky">
        <div>
          <label className="mb-1 block text-xs font-medium">최초 매매계약일</label>
          <DateInput value={value.contractDate988} onChange={(v) => onChange({ contractDate988: v })} />
          <p className="mt-1 text-micro text-muted-foreground">
            2015.1.1~2015.12.31 중 사업주체등과 최초로 체결한 매매계약 (법 §98의8①).
            취득일·양도일은 자산 기본 입력을 사용합니다
          </p>
        </div>
      </SectionShell>

      <SectionShell num="②" title="가액·면적 요건 (모두 충족)" tone="sky">
        <div>
          <label className="mb-1 block text-xs font-medium">취득가액</label>
          <CurrencyInput
            value={value.acquisitionPrice988}
            onChange={(v) => onChange({ acquisitionPrice988: v })}
            label=""
          />
          <p className="mt-1 text-micro text-muted-foreground">
            6억원 이하 — 취득세 및 그 밖의 부대비용 제외 (조특령 §98의7②1호)
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">연면적 (공동주택은 전용면적, ㎡)</label>
          <DecimalInput
            value={value.exclusiveAreaSqm988}
            onChange={(v) => onChange({ exclusiveAreaSqm988: v })}
          />
          <p className="mt-1 text-micro text-muted-foreground">
            135㎡ 이하 — 취득가액과 면적 요건을 모두 충족해야 합니다 (한쪽만 초과해도 적용 제외)
          </p>
        </div>
      </SectionShell>

      <SectionShell num="③" title="임대 정보 — 5년 이상 임대" tone="violet">
        <div>
          <label className="mb-1 block text-xs font-medium">임대개시일</label>
          <DateInput value={value.rentalStartDate988} onChange={(v) => onChange({ rentalStartDate988: v })} />
          <p className="mt-1 text-micro text-muted-foreground">
            사업자등록(소법 §168)과 임대사업자등록(민특법 §5)을 한 후 임대를 개시한 날부터
            기산합니다 — 등록 전 임대분은 산입되지 않습니다 (조특령 §98의5⑤1호 준용)
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">임대종료일 (비우면 양도일까지 임대 계속)</label>
          <DateInput value={value.rentalEndDate988} onChange={(v) => onChange({ rentalEndDate988: v })} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">상속 합산 임대기간 (개월, 해당 시)</label>
          <DecimalInput
            value={value.inheritedRentalMonths988}
            onChange={(v) => onChange({ inheritedRentalMonths988: v })}
          />
          <p className="mt-1 text-micro text-muted-foreground">
            상속으로 취득한 임대주택은 피상속인의 임대기간을 합산합니다 (조특령 §98의5⑤2호 준용)
          </p>
        </div>
      </SectionShell>

      <SectionShell num="④" title="자격 요건 확인" tone="rose">
        <ToggleCard
          tone="rose"
          title="준공후미분양주택 확인"
          description="사용검사·사용승인 후 2014.12.31까지 분양계약이 체결되지 않아 2015.1.1 이후 선착순으로 공급된 주택 (조특령 §98의7①)"
          checked={value.isUnsoldAfterCompletion988}
          onCheckedChange={(v) => onChange({ isUnsoldAfterCompletion988: v })}
        />
        <ToggleCard
          tone="rose"
          title="사업주체등과 최초 매매계약"
          description="사업주체·주택도시보증공사·시공자(공사대금)·기업구조조정리츠·신탁업자와 최초로 계약 (조특령 §98의7③)"
          checked={value.isFirstContract988}
          onCheckedChange={(v) => onChange({ isFirstContract988: v })}
        />
        <ToggleCard
          tone="rose"
          title="계약 해제 후 재계약 아님"
          description="2014.12.31 이전 계약을 해제한 본인·배우자(직계존비속·형제자매 포함)가 다시 계약한 주택이 아님 (조특령 §98의7②2·3호)"
          checked={value.isNotRecontract988}
          onCheckedChange={(v) => onChange({ isNotRecontract988: v })}
        />
      </SectionShell>

      {/* 5년 후 양도 안분용 기준시가 */}
      <SectionShell num="⑤" title="기준시가 (취득일부터 5년이 지난 후 양도 시 필수)" tone="sky">
        <div>
          <label className="mb-1 block text-xs font-medium">취득 당시 기준시가</label>
          <CurrencyInput
            value={value.standardPriceAtAcquisition988}
            onChange={(v) => onChange({ standardPriceAtAcquisition988: v })}
            label=""
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">취득일부터 5년이 되는 날의 기준시가</label>
          <CurrencyInput
            value={value.standardPriceAt5Years988}
            onChange={(v) => onChange({ standardPriceAt5Years988: v })}
            label=""
          />
          <p className="mt-1 text-micro text-muted-foreground">
            새로운 기준시가가 고시되기 전이면 직전 기준시가를 적용합니다 (조특령 §40①)
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">양도 당시 기준시가 (비우면 자산 입력값 사용)</label>
          <CurrencyInput
            value={value.standardPriceAtTransfer988}
            onChange={(v) => onChange({ standardPriceAtTransfer988: v })}
            label=""
          />
        </div>
      </SectionShell>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-caption text-emerald-900 space-y-1">
        <p>
          · 적용 효과: 취득일부터 5년간 발생한 양도소득금액의 100분의 50에 상당하는 금액을
          양도소득세 과세대상소득금액에서 공제합니다 (법 §98의8①).
        </p>
        <p>· 농어촌특별세: 감면세액의 20%가 부과됩니다 (농어촌특별세법 §5).</p>
        <p>
          · 다주택 중과: 본 특례 적용 주택 양도 시 중과세율이 적용되지 않습니다
          (소득세법 시행령 §167의3①5호).
        </p>
      </div>
    </div>
  );
}
