"use client";

/**
 * CorporateInfoSection — V2 평가 법인 기본 정보 + §54④ 사유 + 부동산과다보유 + 회사 규모
 *
 * 별지 부표3 1쪽 매핑:
 *   1.평가대상 비상장법인 (① 발행주식총수·1주당 액면가·자본금 등)
 *   2.순자산가치만 평가하는 경우 (가~바 = §54④ 1·2·3·5·6호)
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md
 * UI Design: docs/02-design/features/inheritance-unlisted-stock-valuation.ui.design.md §2-1·§4
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup, type RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { DateInput } from "@/components/ui/date-input";
import { CapitalChangeTable } from "./CapitalChangeTable";
import type { UnlistedNetAssetOnlyReason, UnlistedCapitalChange } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

/** Date ↔ YYYY-MM-DD string 변환 헬퍼 */
function dateToStr(d: Date | undefined): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function strToDate(s: string): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  return new Date(s);
}

const NET_ASSET_ONLY_OPTIONS: RadioCardOption<UnlistedNetAssetOnlyReason>[] = [
  {
    value: "liquidation",
    label: "1호 — 청산절차 진행·사업계속 곤란",
    description: "신고기한 이내 청산절차 진행 중이거나 사업주 사망 등으로 사업계속 곤란한 법인 (무조건 순자산가치)",
  },
  {
    value: "lt3y",
    label: "2호 — 사업개시 전·3년 미만·휴업·폐업",
    description: "사업개시 전 법인, 사업개시 후 3년 미만 법인, 휴업·폐업 중인 법인 (무조건 순자산가치)",
  },
  {
    value: "real_estate_80",
    label: "3호 — 부동산 비율 80% 이상",
    description: "법인 자산총액 중 부동산 비율 80% 이상",
    hint: "가중평균 < 1주당 순자산가치인 경우만 순자산가치 적용 (단서)",
  },
  {
    value: "stock_holding_80",
    label: "5호 — 주식 등 가액 80% 이상",
    description: "법인 자산총액 중 주식 등 가액 80% 이상 (KoreanLaw 검증: 4호 삭제 → 5호)",
    hint: "가중평균 < 1주당 순자산가치인 경우만 순자산가치 적용 (단서)",
  },
  {
    value: "remaining_3y",
    label: "6호 — 잔여 존속기한 3년 이내",
    description: "정관에 존속기한이 확정된 법인으로 평가기준일 현재 잔여 존속기한 3년 이내 (무조건 순자산가치)",
  },
];

const COMPANY_SIZE_OPTIONS: RadioCardOption<"small" | "medium" | "large">[] = [
  {
    value: "small",
    label: "중소기업",
    description: "「중소기업기본법」 §2 — 상증법 §63③ 할증 배제 (상증령 §53⑥·§53⑧9호)",
  },
  {
    value: "medium",
    label: "중견기업 (매출 5천억 미만)",
    description: "「중견기업 성장촉진법」 §2 + 직전 3개 사업연도 매출 평균 5천억 미만 — 상증령 §53⑦·§53⑧9호 할증 배제",
  },
  {
    value: "large",
    label: "일반기업",
    description: "중소·중견 아님 — 최대주주 시 ×120% 할증 (§63③)",
  },
];

export interface CorporateInfoSectionProps {
  corpName: string;
  representative?: string;
  businessRegistrationNumber?: string;
  capital?: number;
  businessStartDate?: Date;
  evaluationDate?: Date;
  faceValuePerShare: number;
  totalShares: number;
  ownedShares: number;
  isRealEstateHeavy: boolean;
  netAssetOnlyReason?: UnlistedNetAssetOnlyReason;
  isMaxShareholder: boolean;
  companySize: "small" | "medium" | "large";
  isContinuousLossLastThreeYears: boolean;
  /** 자본금 변동(증자·감자) 이력 — 섹션 1 내부에 임베드 (§56③·⑤ + §17의3⑤) */
  capitalChanges: UnlistedCapitalChange[];
  onCapitalChangesChange: (next: UnlistedCapitalChange[]) => void;
  onChange: (patch: {
    corpName?: string;
    representative?: string;
    businessRegistrationNumber?: string;
    capital?: number;
    businessStartDate?: Date | undefined;
    evaluationDate?: Date | undefined;
    faceValuePerShare?: number;
    totalShares?: number;
    ownedShares?: number;
    isRealEstateHeavy?: boolean;
    netAssetOnlyReason?: UnlistedNetAssetOnlyReason | undefined;
    isMaxShareholder?: boolean;
    companySize?: "small" | "medium" | "large";
    isContinuousLossLastThreeYears?: boolean;
  }) => void;
}

export function CorporateInfoSection({
  corpName,
  representative,
  businessRegistrationNumber,
  capital,
  businessStartDate,
  evaluationDate,
  faceValuePerShare,
  totalShares,
  ownedShares,
  isRealEstateHeavy,
  netAssetOnlyReason,
  isMaxShareholder,
  companySize,
  isContinuousLossLastThreeYears,
  capitalChanges,
  onCapitalChangesChange,
  onChange,
}: CorporateInfoSectionProps) {
  return (
    <div className="space-y-4">
      {/* 1. 평가대상 비상장법인 */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">1</span>
          <p className="text-xs font-semibold text-sky-700">평가대상 비상장법인 (별지 1쪽)</p>
        </div>
        <FieldCard label="법인명" required>
          <input
            type="text"
            value={corpName}
            onChange={(e) => onChange({ corpName: e.target.value })}
            placeholder="법인명 입력"
            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900"
            data-testid="unlisted-v2-corp-name"
          />
        </FieldCard>
        <FieldCard label="사업자등록번호" hint="000-00-00000 (선택)">
          <input
            type="text"
            value={businessRegistrationNumber ?? ""}
            onChange={(e) => onChange({ businessRegistrationNumber: e.target.value })}
            placeholder="사업자등록번호 (선택)"
            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900"
            data-testid="unlisted-v2-biz-reg-no"
          />
        </FieldCard>
        <FieldCard label="대표자">
          <input
            type="text"
            value={representative ?? ""}
            onChange={(e) => onChange({ representative: e.target.value })}
            placeholder="대표자 이름 (선택)"
            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900"
          />
        </FieldCard>
        <FieldCard label="사업개시일" required>
          <DateInput
            value={dateToStr(businessStartDate)}
            onChange={(s) => onChange({ businessStartDate: strToDate(s) })}
          />
        </FieldCard>
        <FieldCard label="평가기준일" required hint="상속개시일 또는 증여일">
          <DateInput
            value={dateToStr(evaluationDate)}
            onChange={(s) => onChange({ evaluationDate: strToDate(s) })}
          />
        </FieldCard>
        <FieldCard label="1주당 액면가액" required unit="원">
          <CurrencyInput
            label="액면가"
            value={String(faceValuePerShare || "")}
            onChange={(v) => onChange({ faceValuePerShare: Number(v.replace(/,/g, "")) || 0 })}
            placeholder="1주당 액면가액"
            hideUnit
          />
        </FieldCard>
        <FieldCard label="발행주식총수" required unit="주" hint="평가기준일 현재">
          <CurrencyInput
            label="발행주식총수"
            value={String(totalShares || "")}
            onChange={(v) => onChange({ totalShares: Number(v.replace(/,/g, "")) || 0 })}
            placeholder="발행주식총수"
            hideUnit
          />
        </FieldCard>
        <FieldCard label="자본금" unit="원" hint="제1쪽 1번 (선택)">
          <CurrencyInput
            label="자본금"
            value={String(capital || "")}
            onChange={(v) => onChange({ capital: Number(v.replace(/,/g, "")) || 0 })}
            placeholder="자본금"
            hideUnit
          />
        </FieldCard>
        {/* 자본금 변동사항 (증자·감자) — 발행주식총수·자본금 바로 아래에 임베드 (sectionNum 미전달 → 번호 없음) */}
        <CapitalChangeTable capitalChanges={capitalChanges} onChange={onCapitalChangesChange} />
        <FieldCard label="보유 주식수" required unit="주" hint="피상속인·수증인 소유">
          <CurrencyInput
            label="보유주식"
            value={String(ownedShares || "")}
            onChange={(v) => onChange({ ownedShares: Number(v.replace(/,/g, "")) || 0 })}
            placeholder="보유 주식수"
            hideUnit
          />
        </FieldCard>
      </div>

      {/* 부동산과다보유 토글 */}
      <ToggleCard
        tone="amber"
        title="부동산과다보유법인 (상증령 §54① 본문 괄호)"
        description="자산총액 중 토지·건물·부동산권리 ≥ 50%인 법인 (소법 §94①4호다목) — 가중치 반전"
        checked={isRealEstateHeavy}
        onCheckedChange={(on) => onChange({ isRealEstateHeavy: on })}
      >
        <p className="text-[11px] text-amber-800 mt-1">
          가중치 반전: 일반 <span className="font-mono">(순손익×3 + 순자산×2)/5</span> →
          부동산과다 <span className="font-mono">(순손익×2 + 순자산×3)/5</span>
        </p>
      </ToggleCard>

      {/* §54④ 순자산 단독 평가 사유 */}
      <ToggleCard
        tone="rose"
        title="순자산가치만 평가 (상증령 §54④)"
        description="ON: 5가지 사유 중 선택 — 가중평균 대신 1주당 순자산가치 적용"
        checked={!!netAssetOnlyReason}
        onCheckedChange={(on) => {
          if (on) onChange({ netAssetOnlyReason: "lt3y" });
          else onChange({ netAssetOnlyReason: undefined });
        }}
      >
        <div className="space-y-2">
          <p className="text-[11px] text-rose-700 dark:text-rose-300">
            ※ KoreanLaw 검증: 4호 삭제 → 5호 (주식 80%). 1·2·6호 무조건 / 3·5호 단서 (가중평균 &lt; 순자산일 때만)
          </p>
          <RadioCardGroup<UnlistedNetAssetOnlyReason>
            name="v2-netAssetOnlyReason"
            tone="rose"
            options={NET_ASSET_ONLY_OPTIONS}
            value={netAssetOnlyReason ?? ""}
            onChange={(next) => onChange({ netAssetOnlyReason: next })}
            layout="stack"
          />
        </div>
      </ToggleCard>

      {/* §55③ 결손법인 영업권 자동 배제 */}
      <ToggleCard
        tone="amber"
        title="평가기준일 직전 3년 계속 결손법인 (상증령 §55③ 3호)"
        description="ON: 영업권 평가액 자동 0 처리 (§55③ 3호 자동 배제)"
        checked={isContinuousLossLastThreeYears}
        onCheckedChange={(on) => onChange({ isContinuousLossLastThreeYears: on })}
      />

      {/* 최대주주 + 회사 규모 */}
      <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-[10px] font-bold text-violet-800 select-none">2</span>
          <p className="text-xs font-semibold text-violet-700">최대주주 할증평가 (상증법 §63③ + 상증령 §53)</p>
        </div>
        <ToggleCard
          tone="violet"
          title="최대주주 등 해당 여부"
          description="상증령 §53④ — 보유주식 가장 많은 1인 + §53⑤ 평가기준일 소급 1년 내 양도·증여 합산"
          checked={isMaxShareholder}
          onCheckedChange={(on) => onChange({ isMaxShareholder: on })}
        />
        {isMaxShareholder && (
          <RadioCardGroup<"small" | "medium" | "large">
            name="v2-companySize"
            tone="violet"
            options={COMPANY_SIZE_OPTIONS}
            value={companySize}
            onChange={(next) => onChange({ companySize: next })}
            layout="stack"
          />
        )}
      </div>
    </div>
  );
}
