"use client";

/**
 * §154① 단서 — 1세대1주택 비과세 보유·거주 요건 면제 사유 입력.
 *
 * 1·2·3호 = 보유+거주 면제 / 5호 = 거주만 면제 (소득세법 시행령 §154 ① 단서).
 * 폼은 FLAT(provisoReason 등), API 변환에서 oneHouseExemptionProviso로 조립.
 * 거주 충족(1호 5년·3호 1년)은 거주기간 입력(residencePeriodMonths) 재사용 — 별도 입력 없음.
 */

import { DateInput } from "@/components/ui/date-input";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup, type RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";

type ProvisoReason =
  | "rental_5yr_residence"
  | "expropriation"
  | "overseas_migration"
  | "overseas_residence"
  | "unavoidable"
  | "pre_designation_contract";

type ReasonOrNone = "none" | ProvisoReason;

interface Props {
  provisoReason: "" | ProvisoReason;
  provisoDepartureDate: string;
  provisoExpropriationDate: string;
  provisoBusinessApprovalDate: string;
  provisoPreContractNoHouse: boolean;
  onChange: (
    patch: Partial<{
      provisoReason: "" | ProvisoReason;
      provisoDepartureDate: string;
      provisoExpropriationDate: string;
      provisoBusinessApprovalDate: string;
      provisoPreContractNoHouse: boolean;
    }>,
  ) => void;
}

const OPTIONS: RadioCardOption<ReasonOrNone>[] = [
  { value: "none", label: "해당 없음", testId: "proviso-reason-none" },
  {
    value: "expropriation",
    label: "공익사업 수용 (2호 가목)",
    description: "사업인정 고시일 전 취득 + 양도일·수용일부터 5년 내. 보유·거주 요건 면제",
    testId: "proviso-reason-expropriation",
  },
  {
    value: "overseas_migration",
    label: "해외이주 (2호 나목)",
    description: "출국일 현재 1주택 + 출국일부터 2년 내 양도. 보유·거주 요건 면제",
    testId: "proviso-reason-overseas_migration",
  },
  {
    value: "overseas_residence",
    label: "국외거주·취학·근무 (2호 다목)",
    description: "1년 이상 국외거주 + 출국일부터 2년 내 양도. 보유·거주 요건 면제",
    testId: "proviso-reason-overseas_residence",
  },
  {
    value: "unavoidable",
    label: "부득이한 사유 (3호)",
    description: "1년 이상 거주 + 취학·근무·질병요양 등 부득이한 사유. 보유·거주 요건 면제",
    testId: "proviso-reason-unavoidable",
  },
  {
    value: "rental_5yr_residence",
    label: "임대주택 거주 5년 (1호)",
    description: "건설·공공매입임대주택 + 세대전원 거주 5년 이상. 보유·거주 요건 면제",
    testId: "proviso-reason-rental",
  },
  {
    value: "pre_designation_contract",
    label: "조정 공고 전 계약 (5호)",
    description: "공고일 이전 매매계약+계약금 + 계약금일 무주택. 거주 요건만 면제(보유 2년 필요)",
    testId: "proviso-reason-pre_contract",
  },
];

export function ExemptionProvisoSection({
  provisoReason,
  provisoDepartureDate,
  provisoExpropriationDate,
  provisoBusinessApprovalDate,
  provisoPreContractNoHouse,
  onChange,
}: Props) {
  const reason: ReasonOrNone = provisoReason === "" ? "none" : provisoReason;
  const isOverseas =
    provisoReason === "overseas_migration" || provisoReason === "overseas_residence";

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-micro font-bold text-violet-800 select-none">
          §
        </span>
        <p className="text-xs font-semibold text-violet-700">
          §154① 단서 — 보유·거주 요건 면제 사유 (선택)
        </p>
        <LawArticleModal legalBasis="소득세법 시행령 §154①" label="§154① 단서" />
      </div>
      <p className="text-caption text-violet-700">
        보유 2년(조정취득 시 거주 2년) 미달이라도 아래 사유에 해당하면 1세대1주택 비과세가 적용됩니다.
      </p>
      <RadioCardGroup<ReasonOrNone>
        name="provisoReason"
        tone="violet"
        value={reason}
        onChange={(v) => onChange({ provisoReason: v === "none" ? "" : v })}
        options={OPTIONS}
      />

      {provisoReason === "expropriation" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <FieldCard label="사업인정 고시일" hint="고시일 전 취득한 주택만 해당 (미입력 시 검증 생략)">
            <DateInput
              value={provisoBusinessApprovalDate}
              onChange={(v) => onChange({ provisoBusinessApprovalDate: v })}
            />
          </FieldCard>
          <FieldCard label="수용일" hint="양도일·수용일부터 5년 내 양도 (미입력 시 양도일 기준)">
            <DateInput
              value={provisoExpropriationDate}
              onChange={(v) => onChange({ provisoExpropriationDate: v })}
            />
          </FieldCard>
        </div>
      )}

      {isOverseas && (
        <FieldCard label="출국일" required hint="출국일부터 2년 내 양도 시 적용 (필수)">
          <DateInput
            value={provisoDepartureDate}
            onChange={(v) => onChange({ provisoDepartureDate: v })}
          />
        </FieldCard>
      )}

      {provisoReason === "pre_designation_contract" && (
        <ToggleCard
          variant="card"
          tone="violet"
          title="계약금 지급일 현재 1세대 무주택"
          description="조정대상지역 공고일 이전 매매계약 + 계약금 지급일 현재 1세대 무주택임을 확인합니다. (증빙서류 보관 필요)"
          checked={provisoPreContractNoHouse}
          onCheckedChange={(v) => onChange({ provisoPreContractNoHouse: v })}
        />
      )}

      {(provisoReason === "unavoidable" || provisoReason === "rental_5yr_residence") && (
        <p className="text-caption text-violet-700">
          {provisoReason === "unavoidable"
            ? "위 거주기간 입력이 1년 이상이어야 적용됩니다."
            : "위 거주기간 입력이 5년 이상이어야 적용됩니다."}
        </p>
      )}
    </div>
  );
}
