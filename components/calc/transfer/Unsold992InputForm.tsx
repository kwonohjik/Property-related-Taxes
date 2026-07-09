"use client";

/**
 * §99의2 신축주택·미분양주택·1세대1주택자 주택 — 하이브리드 입력 폼 (P2, 2026-06-11)
 *
 * 효과: 5년 이내 양도 = 양도소득세 100% 세액감면 (+농특세 20%) /
 *       5년 후 양도 = 5년간 발생 양도소득금액 공제. 거주자·비거주자 모두 적용.
 * 가액·면적: 6억 이하 "이거나" 전용 85㎡ 이하 — 둘 다 초과 시만 제외 (령 §99의2②1호).
 *
 * ① sky 유형 라디오 ② sky 계약·승인 시기 ③ sky 가액·면적 ④ rose 자격 토글
 * ⑤ violet 오피스텔 ⑥ amber 기준시가 + emerald 안내.
 */

import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

type Unsold992Form = Extract<AssetReductionForm, { type: "unsold_99_2" }>;

interface Props {
  value: Unsold992Form;
  onChange: (patch: Partial<Unsold992Form>) => void;
}

function SectionShell({
  num, title, tone, children,
}: { num: string; title: string; tone: "sky" | "amber" | "rose" | "violet"; children: React.ReactNode }) {
  const toneMap = {
    sky: { box: "border-sky-200 bg-sky-50/40", badge: "bg-sky-200 text-sky-800", title: "text-sky-700" },
    amber: { box: "border-amber-200 bg-amber-50/40", badge: "bg-amber-200 text-amber-800", title: "text-amber-700" },
    rose: { box: "border-rose-200 bg-rose-50/40", badge: "bg-rose-200 text-rose-800", title: "text-rose-700" },
    violet: { box: "border-violet-200 bg-violet-50/40", badge: "bg-violet-200 text-violet-800", title: "text-violet-700" },
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

export function Unsold992InputForm({ value, onChange }: Props) {
  const houseType = value.houseType992;
  return (
    <div className="mt-2 ml-4 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="조세특례제한법 §99의2①" label="§99의2① 신축·미분양·1세대1주택" />
        <LawArticleModal legalBasis="조세특례제한법 시행령 §99의2" label="조특령 §99의2" />
        <LawArticleModal legalBasis="농어촌특별세법 §5" label="농특세법 §5" />
      </div>

      <SectionShell num="①" title="대상 주택 유형" tone="sky">
        <RadioCardGroup<Unsold992Form["houseType992"]>
          name="unsold992-house-type"
          tone="sky"
          layout="stack"
          value={houseType}
          onChange={(v) => onChange({ houseType992: v })}
          options={[
            {
              value: "new_or_unsold",
              label: "신축주택·미분양주택",
              description: "사업주체·주택건설사업자·주택도시보증공사·시공자·기업구조조정리츠·신탁업자가 공급하는 주택 또는 오피스텔 (조특령 §99의2①1~7·9호)",
            },
            {
              value: "self_built",
              label: "자기건설 주택",
              description: "2013.4.1~12.31 중 사용승인·사용검사를 받은 자기건설 주택 (조특령 §99의2①8호)",
            },
            {
              value: "existing_one_house",
              label: "1세대1주택자의 주택",
              description: "1세대1주택자(2013.4.1 기준)로부터 취득한 감면대상기존주택 (조특령 §99의2③)",
            },
          ]}
        />
      </SectionShell>

      <SectionShell num="②" title="계약·승인 시기" tone="sky">
        {houseType === "self_built" ? (
          <div>
            <label className="mb-1 block text-xs font-medium">사용승인·사용검사일 (임시사용승인 포함)</label>
            <DateInput
              value={value.usageApprovalDate992}
              onChange={(v) => onChange({ usageApprovalDate992: v })}
            />
            <p className="mt-1 text-micro text-muted-foreground">
              2013.4.1~2013.12.31 과세특례 취득기간 중 사용승인·사용검사 (조특령 §99의2①8호)
            </p>
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-xs font-medium">최초 매매계약일</label>
            <DateInput
              value={value.contractDate992}
              onChange={(v) => onChange({ contractDate992: v })}
            />
            <p className="mt-1 text-micro text-muted-foreground">
              2013.4.1~2013.12.31 중 최초로 체결한 매매계약 — 동기간 중 계약 체결 + 계약금
              지급한 경우 포함 (법 §99의2①)
            </p>
          </div>
        )}
      </SectionShell>

      <SectionShell num="③" title="가액·면적 요건 (하나만 충족해도 적용)" tone="sky">
        <div>
          <label className="mb-1 block text-xs font-medium">실거래 취득가액</label>
          <CurrencyInput
            value={value.acquisitionPrice992}
            onChange={(v) => onChange({ acquisitionPrice992: v })}
            label=""
          />
          <p className="mt-1 text-micro text-muted-foreground">
            취득세 및 그 밖의 부대비용 제외 (조특령 §99의2②1호 후단)
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">연면적 (공동주택·오피스텔은 전용면적, ㎡)</label>
          <DecimalInput
            value={value.exclusiveAreaSqm992}
            onChange={(v) => onChange({ exclusiveAreaSqm992: v })}
          />
          <p className="mt-1 text-micro text-muted-foreground">
            6억원 이하이거나 85㎡ 이하 — 둘 다 초과하는 경우에만 제외됩니다 (령 §99의2②1호)
          </p>
        </div>
      </SectionShell>

      <SectionShell num="④" title="자격 요건 확인" tone="rose">
        {houseType === "new_or_unsold" && (
          <ToggleCard
            tone="rose"
            title="신축주택등 해당 확인"
            description="입주자 계약일 경과 후 2013.3.31까지 미계약 선착순 공급, 입주자 계약일이 2013.4.1 이후 도래하는 공급 주택 등 (조특령 §99의2①1~7·9호)"
            checked={value.meetsHouseTypeRequirement992}
            onCheckedChange={(v) => onChange({ meetsHouseTypeRequirement992: v })}
          />
        )}
        {houseType === "self_built" && (
          <ToggleCard
            tone="rose"
            title="조합원 취득·멸실 재건축 아님"
            description="재개발·재건축·소규모주택정비사업 조합원이 관리처분계획에 따라 취득한 주택, 멸실 후 재건축한 주택은 제외됩니다 (조특령 §99의2①8호 가·나목)"
            checked={value.isNotExcludedSelfBuilt992}
            onCheckedChange={(v) => onChange({ isNotExcludedSelfBuilt992: v })}
          />
        )}
        {houseType === "existing_one_house" && (
          <ToggleCard
            tone="rose"
            title="1세대1주택 양도자 요건 확인"
            description="양도자가 2013.4.1 현재 1세대로서 매매계약일 현재 국내 1주택 보유 + 취득 등기일부터 계약일까지 2년 이상 (일시적 2주택 포함 — 조특령 §99의2③)"
            checked={value.meetsOneHouseSellerRequirement992}
            onCheckedChange={(v) => onChange({ meetsOneHouseSellerRequirement992: v })}
          />
        )}
        <ToggleCard
          tone="rose"
          title="계약 해제 후 재계약 아님"
          description="2013.3.31 이전 계약을 해제한 본인·배우자(직계존비속·형제자매 포함)가 다시 계약한 주택이 아님 (조특령 §99의2②2·3호·⑤2호)"
          checked={value.isNotRecontract992}
          onCheckedChange={(v) => onChange({ isNotRecontract992: v })}
        />
        <ToggleCard
          tone="rose"
          title="감면 대상 주택 확인 날인 매매계약서 보유"
          description="시장·군수·구청장의 확인 날인을 받은 매매계약서를 관할 세무서장에게 제출한 경우에만 감면이 적용됩니다 (법 §99의2④)"
          checked={value.hasConfirmationSeal992}
          onCheckedChange={(v) => onChange({ hasConfirmationSeal992: v })}
        />
      </SectionShell>

      <SectionShell num="⑤" title="오피스텔 (해당 시)" tone="violet">
        <ToggleCard
          tone="violet"
          title="오피스텔"
          description="주택법 시행령 §4 4호 오피스텔 — 취득 후 주거 사용·임대 등록 사후요건이 적용됩니다 (조특령 §99의2①9호)"
          checked={value.isOfficetel992}
          onCheckedChange={(v) => onChange({ isOfficetel992: v })}
        >
          <ToggleCard
            tone="violet"
            title="주민등록 또는 임대등록 요건 충족"
            description="취득일부터 60일이 지난 날부터 양도일까지 취득자·임차인의 주민등록 유지(공실 6개월 이내 인정) 또는 취득일부터 60일 이내 임대용 주택 등록 (조특령 §99의2②4호)"
            checked={value.meetsOfficetelRequirement992}
            onCheckedChange={(v) => onChange({ meetsOfficetelRequirement992: v })}
          />
        </ToggleCard>
      </SectionShell>

      <SectionShell num="⑥" title="기준시가 (취득일부터 5년이 지난 후 양도 시 필수)" tone="amber">
        <div>
          <label className="mb-1 block text-xs font-medium">취득 당시 기준시가</label>
          <CurrencyInput
            value={value.standardPriceAtAcquisition992}
            onChange={(v) => onChange({ standardPriceAtAcquisition992: v })}
            label=""
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">취득일부터 5년이 되는 날의 기준시가</label>
          <CurrencyInput
            value={value.standardPriceAt5Years992}
            onChange={(v) => onChange({ standardPriceAt5Years992: v })}
            label=""
          />
          <p className="mt-1 text-micro text-muted-foreground">
            새로운 기준시가가 고시되기 전이면 직전 기준시가를 적용합니다 (조특령 §40①)
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">양도 당시 기준시가 (비우면 자산 입력값 사용)</label>
          <CurrencyInput
            value={value.standardPriceAtTransfer992}
            onChange={(v) => onChange({ standardPriceAtTransfer992: v })}
            label=""
          />
        </div>
      </SectionShell>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-caption text-emerald-900 space-y-1">
        <p>
          · 적용 효과: 취득일부터 5년 이내 양도 시 양도소득세 100%를 감면하고, 5년이 지난 후
          양도 시 취득일부터 5년간 발생한 양도소득금액을 과세대상소득금액에서 공제합니다 (법 §99의2①).
        </p>
        <p>· 거주자·비거주자 모두 적용됩니다 (법 §99의2①).</p>
        <p>· 농어촌특별세: 감면세액의 20%가 부과됩니다 (농어촌특별세법 §5).</p>
        <p>
          · 다주택 중과: 본 특례 적용 주택 양도 시 중과세율이 적용되지 않습니다
          (소득세법 시행령 §167의3①5호).
        </p>
      </div>
    </div>
  );
}
