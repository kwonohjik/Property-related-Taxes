"use client";

/**
 * 가업상속공제 사후관리 추징 시뮬레이터 (PR-2b)
 *
 * 법령: 상증법 §18의2⑤⑨⑩ + 상증령 §15⑧⑩⑪⑮⑯⑰⑱㉕ (KoreanLaw MCP 검증 2026-06-04)
 *
 * 영농 사후관리(/calc/inheritance-postmgmt)와 병렬 — 순수 엔진을 클라이언트에서 직접 호출(API 불필요).
 * 상속개시일부터 5년 이내 위반 시 추징·이자상당액·수정신고 기한을 시뮬레이션.
 */

import { Suspense, useMemo, useState } from "react";
import { expandToggleClass, expandToggleLabel } from "@/components/calc/results/shared/ExpandToggleButton";
import { useSearchParams } from "next/navigation";

import { CurrencyInput, parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { Button } from "@/components/ui/button";
import { calcInheritanceFilingDeadline } from "@/lib/tax-engine/deductions/family-business";
import { CURRENT_SURCHARGE_RATE } from "@/lib/tax-engine/data/installment-surcharge-rates";
import {
  buildAmendmentReturnData,
  familyBusinessAmendmentDeadline,
  calcFamilyBusinessPostMgmt,
} from "@/lib/tax-engine/credits/family-business-postmgmt-orchestrator";
import type { FamilyBusinessViolationType } from "@/lib/tax-engine/credits/family-business-postmanagement";
import type {
  CessationSubType,
  FamilyBusinessPostMgmtInput,
  FamilyBusinessPostMgmtResult,
  JustifiableReasonCode,
  ViolationEvent,
} from "@/lib/tax-engine/types/inheritance-gift.types";

const FB_CAP_30Y = 60_000_000_000; // §18의2① 최대 600억

const VIOLATION_TYPE_OPTIONS: Array<{ value: FamilyBusinessViolationType; label: string; description: string }> = [
  { value: "asset_disposal", label: "가업용 자산 40%↑ 처분", description: "§18의2⑤1호 (처분비율 추가 곱)" },
  { value: "business_cessation", label: "가업 미종사", description: "§18의2⑤2호 (대표이사 미종사·업종변경·휴폐업)" },
  { value: "share_decrease", label: "지분 감소", description: "§18의2⑤3호" },
  { value: "employment_drop", label: "고용 미달 (정규직&총급여)", description: "§18의2⑤4호 (각 목 모두 90% 미달)" },
];

const CESSATION_SUBTYPE_OPTIONS: Array<{ value: CessationSubType; label: string; description: string }> = [
  { value: "ceo_not_serving", label: "대표이사 미종사", description: "§15⑪1호 (OFZ 면제 대상)" },
  { value: "industry_change", label: "주된 업종 변경", description: "§15⑪2호 (OFZ 면제 대상)" },
  { value: "business_pause", label: "1년↑ 휴업·폐업", description: "§15⑪3호 (OFZ 면제 대상 아님)" },
];

/**
 * §15⑧의 정당한 사유는 **호마다 대상 위반 유형이 다르다** — 1호는 법 §18의2⑤1호(자산처분),
 * 2호는 ⑤2호(가업 미종사), 3호는 ⑤3호(지분 감소)에만 적용된다. **⑤4호(고용 미달)에는
 * 정당한 사유 규정이 아예 없다**(상증령 §15⑧ 1~3호가 전부 — 2026-02-27 시행본 확인).
 *
 * 🔴 엔진은 이 대응을 대조하지 않는다 — `family-business-postmgmt-orchestrator.ts`의 위반
 * 루프는 `justifiableReasons`에 항목이 있으면 위반 유형을 보지 않고 `exempted: true`로 넘긴다.
 * 즉 **UI가 유일한 게이트**다. 호가 어긋난 사유를 고를 수 있으면 추징세액이 전액 0으로 떨어진다.
 */
const JUSTIFIABLE_REASON_OPTIONS: Array<{
  value: JustifiableReasonCode;
  label: string;
  /** 이 사유가 정당한 사유로 인정되는 위반 유형 (§15⑧ 각 호가 지정하는 법 §18의2⑤ 각 호) */
  forViolation: FamilyBusinessViolationType;
}> = [
  // §15⑧ 1호 (법 §18의2⑤1호 = 자산처분 예외)
  { value: "expropriation", label: "1호가. 수용·협의매수·시설개체·사업장이전", forViolation: "asset_disposal" },
  { value: "state_donation_asset", label: "1호나. 국가·지자체 증여", forViolation: "asset_disposal" },
  { value: "heir_death", label: "1호다. 가업상속인 사망", forViolation: "asset_disposal" },
  { value: "reorganization", label: "1호라. 합병·분할·통합·법인전환", forViolation: "asset_disposal" },
  { value: "useful_life", label: "1호마. 내용연수 도래", forViolation: "asset_disposal" },
  { value: "industry_change_replace", label: "1호바. 업종변경 대체취득", forViolation: "asset_disposal" },
  { value: "rnd_use", label: "1호사. 처분금액 R&D 사용", forViolation: "asset_disposal" },
  // §15⑧ 2호 (법 §18의2⑤2호 = 가업 미종사 예외)
  { value: "heir_death_cessation", label: "2호가. 가업상속인 사망", forViolation: "business_cessation" },
  { value: "state_donation_cessation", label: "2호나. 국가·지자체 증여", forViolation: "business_cessation" },
  { value: "military_illness", label: "2호다. 병역·질병 부득이", forViolation: "business_cessation" },
  // §15⑧ 3호 (법 §18의2⑤3호 = 지분 감소 예외)
  { value: "reorg_share_transfer", label: "3호가. 조직변경 주식 처분", forViolation: "share_decrease" },
  { value: "third_party_dilution", label: "3호나. 특수관계 외 유상증자 희석", forViolation: "share_decrease" },
  { value: "heir_death_succession", label: "3호다. 상속인 사망(승계 종사)", forViolation: "share_decrease" },
  { value: "state_donation_share", label: "3호라. 국가·지자체 증여", forViolation: "share_decrease" },
  { value: "listing_dilution", label: "3호마. 상장요건 충족 감자", forViolation: "share_decrease" },
  { value: "uniform_capital_decrease", label: "3호바. 균등 감자", forViolation: "share_decrease" },
  { value: "court_decision", label: "3호사. 법원결정 무상감자·출자전환", forViolation: "share_decrease" },
];

/** 해당 위반 유형에서 고를 수 있는 §15⑧ 정당한 사유. ⑤4호(고용 미달)는 빈 배열이다. */
function justifiableReasonsFor(type: FamilyBusinessViolationType) {
  return JUSTIFIABLE_REASON_OPTIONS.filter((o) => o.forViolation === type);
}

interface ViolationRow {
  date: string;
  type: FamilyBusinessViolationType;
  cessationSubType: CessationSubType;
  disposedAssetValue: string;
  totalBusinessAssetValue: string;
  priorDisposedExcluded: string;
  justifiableReasonCode: JustifiableReasonCode | "";
}

function emptyViolation(): ViolationRow {
  return {
    date: "",
    type: "asset_disposal",
    cessationSubType: "ceo_not_serving",
    disposedAssetValue: "",
    totalBusinessAssetValue: "",
    priorDisposedExcluded: "",
    justifiableReasonCode: "",
  };
}

function sanitizeAmountParam(raw: string | null, cap: number): string {
  if (!raw) return "";
  const num = parseAmount(raw);
  if (!Number.isFinite(num) || num <= 0) return "";
  return String(Math.min(num, cap));
}

export default function FamilyBusinessPostMgmtPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">로딩 중…</div>}>
      <FamilyBusinessPostMgmtPageInner />
    </Suspense>
  );
}

function FamilyBusinessPostMgmtPageInner() {
  const searchParams = useSearchParams();

  const [appliedDeduction, setAppliedDeduction] = useState(
    sanitizeAmountParam(searchParams.get("originalDeduction"), FB_CAP_30Y),
  );
  // 추징 재계산 base — 상속개시 당시 상속세 과세표준(가업공제 적용 후). 메인 진입 시 baseTaxable prefill.
  const [baseTaxableAmount, setBaseTaxableAmount] = useState(
    sanitizeAmountParam(searchParams.get("baseTaxable"), 100_000_000_000_000),
  );
  const [deathDate, setDeathDate] = useState(searchParams.get("deathDate") ?? "");
  const [amendOpen, setAmendOpen] = useState(false);
  const [filingDeadline, setFilingDeadline] = useState(searchParams.get("filingDeadline") ?? "");
  const [ofzExemptionActive, setOfzExemptionActive] = useState(searchParams.get("ofz") === "1");
  /**
   * 🔴 IG-095: 「직접입력 모드로 공제받은 사례」는 **이월된 사실**이지 사용자가 고르는 조건이 아니다.
   * 메인 마법사 결과뷰가 `?direct=1`로 넘겨주며(`InheritanceTaxResultView`의 사후관리 링크),
   * 계산에는 전혀 쓰이지 않는다 — 엔진 input 타입에도, orchestrator에도 소비 지점이 없다.
   *
   * 종전엔 이것을 **계산에 영향을 주는 OFZ 토글 바로 아래 interactive ToggleCard**로 그렸다.
   * 사용자가 켜고 결과가 그대로인 것을 보면 계산 오류로 오인하고, 반대로 끄면 이월된 사실이
   * 화면에서 왜곡된다 ⇒ 읽기 전용 배지로 강등한다(제거하면 prefill 신호 자체가 사라진다).
   */
  const usedDirectInput = searchParams.get("direct") === "1";
  // cgt — 양도세 환원 공제(§18의2⑩). 양도세 결과뷰에서 creditAmount prefill (PR-5 연동)
  const [cgtCreditAmount, setCgtCreditAmount] = useState(searchParams.get("cgt") ?? "");
  /**
   * 🔴 G-08: 이자상당액 이자율 — **현행 고시**를 기본값으로 둔다.
   *
   * 종전 `"0.022"`는 저장소가 보유한 고시 연혁 표 14개 값 어디에도 없는 값이었다
   * (`installment-surcharge-rates.ts` — 0.037·0.04·0.034·0.029·0.025·0.018·0.016·0.018·
   * 0.021·0.018·0.012·0.029·0.035·0.031). 현행은 국세기본법 시행규칙 §19의3의 연 1천분의 31.
   *
   * 🔑 **위반일이 아니라 현행 율이다.** 상증령 §15⑯3호는 「**부과 당시**의 「국세기본법
   *    시행령」 제43조의3제2항 본문에 따른 이자율」이라 하는데, 부과는 아직 일어나지 않은
   *    장래의 일이고 이 화면에는 부과일 입력 칸이 없다. 위반일로 lookup 하면 조문이 지목하지
   *    않은 시점의 율을 쓰게 된다 ⇒ 현행 고시를 제시하고 사용자 override 를 열어 둔다.
   */
  const [interestRate, setInterestRate] = useState(String(CURRENT_SURCHARGE_RATE));

  const [violations, setViolations] = useState<ViolationRow[]>([emptyViolation()]);

  const [employmentEnabled, setEmploymentEnabled] = useState(false);
  const [fiveYearAvg, setFiveYearAvg] = useState("");
  const [priorTwoYearAvg, setPriorTwoYearAvg] = useState("");
  const [fiveYearSalary, setFiveYearSalary] = useState("");
  const [priorTwoYearSalary, setPriorTwoYearSalary] = useState("");

  const [result, setResult] = useState<FamilyBusinessPostMgmtResult | null>(null);
  const fromMain = !!searchParams.get("originalDeduction");

  // 신고기한 자동 채움 (deathDate 입력 시 §67 단일소스)
  const autoFilingDeadline = deathDate.length === 10 ? calcInheritanceFilingDeadline(deathDate) : "";
  const effectiveFilingDeadline = filingDeadline || autoFilingDeadline;

  const updateViolation = (idx: number, patch: Partial<ViolationRow>) => {
    setViolations((prev) =>
      prev.map((v, i) => {
        if (i !== idx) return v;
        const next = { ...v, ...patch };
        // 위반 유형이 바뀌면 다른 호의 정당한 사유는 더 이상 인정되지 않는다 (§15⑧ 호별 대응).
        // 값을 남겨두면 select에서 사라진 사유가 그대로 엔진에 도달해 추징이 전액 면제된다 —
        // 엔진은 위반 유형을 대조하지 않는다(orchestrator의 justifiableReasons 분기).
        if (
          next.justifiableReasonCode !== "" &&
          !justifiableReasonsFor(next.type).some((o) => o.value === next.justifiableReasonCode)
        ) {
          next.justifiableReasonCode = "";
        }
        return next;
      }),
    );
  };

  const canCalculate = useMemo(() => {
    return (
      parseAmount(appliedDeduction) > 0 &&
      // 재계산 base는 명시 입력 필수(빈칸=silent 0 방지) — 0도 유효값이므로 문자열 비어있지 않음으로 판정
      baseTaxableAmount.trim().length > 0 &&
      parseAmount(baseTaxableAmount) >= 0 &&
      deathDate.length === 10 &&
      effectiveFilingDeadline.length === 10 &&
      // 🔴 IG-092: `Number("")`는 0이라 **빈칸이 게이트를 통과**하고, 엔진에 0이 들어가
      // §15⑯ 이자상당액이 조용히 0으로 계산됐다. 게다가 빈칸일 때 placeholder가 현행 율을
      // 보여줘 「기본값이 적용된다」로 읽힌다. 바로 위 baseTaxableAmount가 같은 이유로
      // `.trim().length > 0` 가드를 두고 「빈칸=silent 0 방지」라고 적어 둔 것과 같은 층위다.
      interestRate.trim().length > 0 &&
      Number(interestRate) >= 0 &&
      Number(interestRate) <= 1 &&
      violations.length > 0 &&
      violations.every((v) => v.date.length === 10)
    );
  }, [appliedDeduction, baseTaxableAmount, deathDate, effectiveFilingDeadline, interestRate, violations]);

  const handleCalculate = () => {
    const events: ViolationEvent[] = violations.map((v) => ({
      date: v.date,
      type: v.type,
      cessationSubType: v.type === "business_cessation" ? v.cessationSubType : undefined,
      disposedAssetValue: v.type === "asset_disposal" ? parseAmount(v.disposedAssetValue) : undefined,
      totalBusinessAssetValue: v.type === "asset_disposal" ? parseAmount(v.totalBusinessAssetValue) : undefined,
      priorDisposedExcluded:
        v.type === "asset_disposal" && parseAmount(v.priorDisposedExcluded) > 0
          ? parseAmount(v.priorDisposedExcluded)
          : undefined,
    }));
    const justifiableReasons = violations
      .map((v, i) => ({ violationRef: i, reasonCode: v.justifiableReasonCode }))
      .filter((j): j is { violationRef: number; reasonCode: JustifiableReasonCode } => j.reasonCode !== "");

    const input: FamilyBusinessPostMgmtInput = {
      appliedDeduction: parseAmount(appliedDeduction),
      baseTaxableAmount: parseAmount(baseTaxableAmount),
      deathDate,
      filingDeadline: effectiveFilingDeadline,
      ofzExemptionActive,
      violations: events,
      justifiableReasons: justifiableReasons.length > 0 ? justifiableReasons : undefined,
      cgtCreditAmount: parseAmount(cgtCreditAmount) > 0 ? parseAmount(cgtCreditAmount) : undefined,
      annualInterestRate: Number(interestRate),
      employmentTracking: employmentEnabled
        ? {
            fiveYearData: [{ monthEnd: "avg", regularEmployees: Number(fiveYearAvg) || 0 }],
            priorTwoYearData: [{ monthEnd: "avg", regularEmployees: Number(priorTwoYearAvg) || 0 }],
            fiveYearTotalSalary: parseAmount(fiveYearSalary),
            priorTwoYearTotalSalary: parseAmount(priorTwoYearSalary),
          }
        : undefined,
    };
    setResult(calcFamilyBusinessPostMgmt(input));
  };

  /**
   * 🔴 IG-013: 기한은 **사건마다** 진행된다(§18의2⑨ — 「해당하는 날이 속하는 달의 말일부터 6개월」).
   * 종전엔 `violations[0].date`를 썼는데 `violations`는 입력 순서일 뿐 날짜순이 아니어서,
   * 나중에 입력한 더 이른 사건의 기한이 화면에서 사라졌다. 면제된 사건은 §5항 부과 자체가
   * 없으므로 ⑨의 신고·납부 의무도 없다 ⇒ **추징 대상(비면제) 위반만** 기한 산정에 넣는다.
   */
  const recaptureDates = (result?.perViolationDetail ?? [])
    .filter((d) => !d.exempted && d.event.date)
    .map((d) => d.event.date)
    .sort();
  const earliestRecaptureDate = recaptureDates[0];
  const distinctRecaptureDates = Array.from(new Set(recaptureDates));
  /** ②에 「고용 미달」 위반이 추징 대상으로 들어와 있는가 (③ 판정과의 모순 검출용). */
  const hasEmploymentDropRecapture = (result?.perViolationDetail ?? []).some(
    (d) => !d.exempted && d.event.type === "employment_drop",
  );
  const amendment =
    result && earliestRecaptureDate ? buildAmendmentReturnData(result, earliestRecaptureDate) : null;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">가업상속공제 사후관리 시뮬레이터</h1>
        <p className="text-sm text-muted-foreground">
          상증법 §18의2⑤·⑨·⑩ + 상증령 §15 추징·이자상당액·수정신고 기한 계산.
          상속개시일부터 5년 이내 위반 시 사용.
        </p>
      </header>

      {fromMain && (
        <div className="rounded-md border border-blue-200 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-800 p-3 text-xs text-blue-700 dark:text-blue-300">
          ⓘ 메인 마법사에서 진입 — 가업상속공제액·상속개시일·신고기한이 사전 입력되었습니다. 필요 시 수정 가능합니다.
        </div>
      )}

      {/* ① 기본 정보 */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">① 기본 정보</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <CurrencyInput
            label="가업상속공제 적용액 (추징 원금)"
            value={appliedDeduction}
            onChange={setAppliedDeduction}
            hint="원 상속 시 적용된 §18의2 공제액"
          />
          <CurrencyInput
            label="상속개시 당시 상속세 과세표준 (공제 적용 후)"
            value={baseTaxableAmount}
            onChange={setBaseTaxableAmount}
            hint="추징세액 재계산 기준액 — 신고서상 과세표준(§18의2⑤). 산입액을 더해 상속세를 재계산"
          />
          <CurrencyInput
            label="양도소득세 환원 공제 (§18의2⑩, 선택)"
            value={cgtCreditAmount}
            onChange={setCgtCreditAmount}
            hint="가업상속 자산 양도 시 양도세 상당액 (없으면 비워두세요)"
          />
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
              상속개시일 (사망일) — 5년 가드 기준
            </label>
            <DateInput value={deathDate} onChange={setDeathDate} />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
              상속세 신고기한 (§67)
            </label>
            <DateInput value={filingDeadline} onChange={setFilingDeadline} />
            {!filingDeadline && autoFilingDeadline && (
              <p className="text-micro text-muted-foreground">
                자동: {autoFilingDeadline} (사망월 말일 + 6개월). 직접 입력 시 우선.
              </p>
            )}
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
              {/* 🔴 G-19: 국세기본법 제43조는 「과세표준신고의 관할」이고 제43조의3은 없다.
                  이자율의 근거는 국세기본법 **시행령** §43의3② 본문 → 시행규칙 §19의3다. */}
              이자율 (국세기본법 시행령 §43의3② 본문 → 시행규칙 §19의3) (소수)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={interestRate}
              onChange={(e) => setInterestRate(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder={String(CURRENT_SURCHARGE_RATE)}
            />
            <p className="text-micro text-muted-foreground">
              현행 {(CURRENT_SURCHARGE_RATE * 100).toFixed(1)}% (국세기본법 시행규칙 §19의3 — 연 1천분의 31).
              상증령 §15⑯3호는 <strong>부과 당시</strong>의 율을 적용하므로 고시가 바뀌면 직접 입력하세요.
            </p>
          </div>
        </div>
        <ToggleCard
          tone="emerald"
          checked={ofzExemptionActive}
          onCheckedChange={setOfzExemptionActive}
          title="기회발전특구 특례 활성 (§15㉕)"
          description="활성 시 가업 미종사 중 대표이사 미종사·업종변경(§15⑪1·2호)이 자동 면제됩니다. (1년 휴·폐업 3호는 면제 대상 아님)"
        />
        {usedDirectInput && (
          <div
            className="rounded-md border border-violet-200 bg-violet-50/40 dark:bg-violet-950/20 dark:border-violet-800 p-3 text-xs text-violet-700 dark:text-violet-300"
            data-testid="fb-postmgmt-direct-input-badge"
          >
            ⓘ <strong>직접입력 모드로 공제받은 사례</strong> — 메인 마법사에서 이월된 사실입니다.
            요건 우회(직접입력) 사례도 사후관리 대상이며, 이 표시는 추징 계산에는 영향을 주지 않습니다.
          </div>
        )}
      </section>

      {/* ② 위반 사건 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">② 위반 사건</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => setViolations((p) => [...p, emptyViolation()])}>
            + 사건 추가
          </Button>
        </div>
        {violations.map((v, idx) => (
          <div key={idx} data-testid={`violation-${idx}`} className="rounded-lg border border-rose-200 bg-rose-50/40 dark:bg-rose-950/20 dark:border-rose-800 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-200 text-micro font-bold text-rose-800">
                {idx + 1}
              </span>
              {violations.length > 1 && (
                <button
                  type="button"
                  onClick={() => setViolations((p) => p.filter((_, i) => i !== idx))}
                  className="text-caption text-rose-600 hover:text-rose-800 underline"
                >
                  삭제
                </button>
              )}
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">위반 발생일</label>
              <DateInput value={v.date} onChange={(d) => updateViolation(idx, { date: d })} />
            </div>
            <RadioCardGroup<FamilyBusinessViolationType>
              name={`violation-type-${idx}`}
              layout="stack"
              tone="rose"
              value={v.type}
              options={VIOLATION_TYPE_OPTIONS}
              onChange={(t) => updateViolation(idx, { type: t })}
            />
            {v.type === "business_cessation" && (
              <RadioCardGroup<CessationSubType>
                name={`cessation-${idx}`}
                layout="stack"
                tone="amber"
                value={v.cessationSubType}
                options={CESSATION_SUBTYPE_OPTIONS}
                onChange={(s) => updateViolation(idx, { cessationSubType: s })}
              />
            )}
            {v.type === "asset_disposal" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <CurrencyInput label="처분 자산가액" value={v.disposedAssetValue} onChange={(x) => updateViolation(idx, { disposedAssetValue: x })} />
                <CurrencyInput label="전체 가업용 자산가액" value={v.totalBusinessAssetValue} onChange={(x) => updateViolation(idx, { totalBusinessAssetValue: x })} />
                <CurrencyInput label="종전 처분 제외분 (§15⑩, 선택)" value={v.priorDisposedExcluded} onChange={(x) => updateViolation(idx, { priorDisposedExcluded: x })} />
              </div>
            )}
            {justifiableReasonsFor(v.type).length > 0 ? (
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">정당한 사유 (§15⑧, 선택 — 인정 시 추징 면제)</label>
                <select
                  data-testid={`justifiable-reason-${idx}`}
                  value={v.justifiableReasonCode}
                  onChange={(e) => updateViolation(idx, { justifiableReasonCode: e.target.value as JustifiableReasonCode | "" })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">해당 없음 (추징 적용)</option>
                  {justifiableReasonsFor(v.type).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground" data-testid={`justifiable-reason-none-${idx}`}>
                고용 미달(§18의2⑤4호)에는 정당한 사유 규정이 없습니다 (상증령 §15⑧은 1~3호만 규정).
              </p>
            )}
          </div>
        ))}
      </section>

      {/* ③ 정규직·총급여 (간이) */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">③ 정규직·총급여 (§18의2⑤4호, 선택)</h2>
        <ToggleCard
          tone="sky"
          checked={employmentEnabled}
          onCheckedChange={setEmploymentEnabled}
          title="정규직·총급여 유지 판정 (간이)"
          data-testid="fb-postmgmt-employment-toggle"
          description="5년 평균과 직전 2년 평균을 입력하면 4호(각 목 모두 90% 미달 = 위반) 판정. 60개월 정밀 모드는 후속."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">5년 평균 정규직 수</label>
              <input type="text" inputMode="decimal" data-testid="fb-postmgmt-five-year-avg" value={fiveYearAvg} onChange={(e) => setFiveYearAvg(e.target.value)} onFocus={(e) => e.target.select()}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">직전 2년 평균 정규직 수 (기준)</label>
              <input type="text" inputMode="decimal" data-testid="fb-postmgmt-prior-two-year-avg" value={priorTwoYearAvg} onChange={(e) => setPriorTwoYearAvg(e.target.value)} onFocus={(e) => e.target.select()}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <CurrencyInput label="5년 평균 총급여액 (연평균)" value={fiveYearSalary} onChange={setFiveYearSalary} />
            <CurrencyInput label="직전 2년 평균 총급여액 (연평균, 기준)" value={priorTwoYearSalary} onChange={setPriorTwoYearSalary} />
          </div>
        </ToggleCard>
      </section>

      <Button type="button" onClick={handleCalculate} disabled={!canCalculate} className="w-full">
        추징세액 계산
      </Button>

      {/* ④ 결과 */}
      {result && (
        <section className="rounded-xl border-2 border-primary bg-primary/5 p-5 space-y-4" data-testid="fb-postmgmt-result">
          <h2 className="text-sm font-semibold">사후관리 추징 결과</h2>
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">순 추징세액 (양도세 환원 공제 후)</p>
            <p className="text-3xl font-bold tracking-tight" data-testid="fb-postmgmt-net">{formatKRW(result.netRecapture)}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm pt-1">
              <div>
                <p className="text-xs text-muted-foreground">추징세액 합계 (재계산 증가분)</p>
                <p className="font-semibold font-mono tabular-nums">{formatKRW(result.totalRecapture)}</p>
                <p className="text-micro text-muted-foreground">과세가액 산입액 {formatKRW(result.totalAddback)} 재계산 (§18의2⑤)</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">이자상당액 (§15⑯)</p>
                <p className="font-semibold font-mono tabular-nums text-amber-600 dark:text-amber-400">+ {formatKRW(result.totalInterest)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">양도세 환원 (§⑩)</p>
                <p className="font-semibold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">− {formatKRW(result.cgtCreditApplied)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">납부세액 (추징+이자)</p>
                <p className="font-semibold font-mono tabular-nums">{formatKRW(result.netRecapture + result.totalInterest)}</p>
              </div>
            </div>
          </div>

          {/* 위반별 표 */}
          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold mb-2">위반별 상세</p>
            <table className="w-full text-caption">
              <thead>
                <tr className="text-muted-foreground text-left">
                  <th className="py-1">위반일</th>
                  <th>유형</th>
                  <th className="text-right">추징</th>
                  <th className="text-right">이자</th>
                  <th>신고·납부 기한 (§⑨)</th>
                  <th>면제</th>
                </tr>
              </thead>
              <tbody>
                {result.perViolationDetail.map((d, i) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className="py-1">{d.event.date}</td>
                    <td>{VIOLATION_TYPE_OPTIONS.find((o) => o.value === d.event.type)?.label ?? d.event.type}</td>
                    <td className="text-right font-mono tabular-nums">{formatKRW(d.recapture)}</td>
                    <td className="text-right font-mono tabular-nums">{formatKRW(d.interest)}</td>
                    <td className="font-mono tabular-nums" data-testid={`fb-postmgmt-deadline-${i}`}>
                      {d.exempted || !d.event.date ? "—" : familyBusinessAmendmentDeadline(d.event.date)}
                    </td>
                    <td>{d.exempted ? `면제 (${d.exemptionReason})` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 정규직 4호 AND 판정 */}
          {result.employmentResult && (
            <div className="border-t border-border pt-3 text-xs space-y-1">
              <p className="font-semibold">정규직·총급여 §⑤4호 판정 (각 목 모두 미달 = 위반)</p>
              <p>정규직 5년 평균 {result.employmentResult.fiveYearAvg} / 기준 {result.employmentResult.threshold.toFixed(1)} → {result.employmentResult.employmentDrop ? "미달" : "유지"}</p>
              <p>총급여 → {result.employmentResult.salaryDrop ? "미달" : "유지"}</p>
              <p className={result.employmentResult.bothViolated ? "font-bold text-rose-600" : "text-emerald-600"}>
                4호 위반: {result.employmentResult.bothViolated ? "예 (가 AND 나)" : "아니오"}
              </p>
              {/* 🔴 IG-012: ③ 판정과 ② 선택이 어긋날 수 있다. 엔진의 위반 루프는 employmentResult를
                  보지 않으므로, ②에서 「고용 미달」을 고르면 판정이 「아니오」여도 공제액 전액이
                  추징된다. 한 화면이 반대되는 두 결론을 내지 않도록 그 사실을 명시한다. */}
              {!result.employmentResult.bothViolated && hasEmploymentDropRecapture && (
                <p className="rounded-md border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800 p-2 text-amber-800 dark:text-amber-300" data-testid="fb-postmgmt-employment-conflict">
                  ⚠️ ③ 판정은 <strong>4호 위반 아님</strong>인데 ②에 「고용 미달」 위반 사건이 입력되어 있습니다.
                  추징세액은 ②의 입력만으로 산정되므로(③ 판정은 계산에 반영되지 않습니다), 위 추징액은
                  4호 위반을 전제로 한 금액입니다. 둘 중 어느 쪽이 사실인지 확인하세요.
                </p>
              )}
            </div>
          )}

          {/* 수정신고 + 6개월 배너 */}
          {amendment && result.totalRecapture > 0 && (
            <div className="border-t border-border pt-3 space-y-2">
              <div
                className="rounded-md border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300"
                data-testid="fb-postmgmt-deadline-banner"
              >
                ⏰ <strong>신고·납부 기한 (§18의2⑨)</strong>: {amendment.amendmentDeadline}까지 (사유발생 월말 + 6개월)
                {distinctRecaptureDates.length > 1 && (
                  <span className="mt-1 block font-normal" data-testid="fb-postmgmt-multi-deadline">
                    추징 대상 위반이 {distinctRecaptureDates.length}건이고 발생일이 서로 달라, 기한도 사건마다 따로 진행됩니다.
                    위 날짜는 그중 <strong>가장 이른</strong> 기한이며 건별 기한은 「위반별 상세」 표에 있습니다.
                  </span>
                )}
              </div>
              <div>
                <button
                  type="button"
                  aria-expanded={amendOpen}
                  onClick={() => setAmendOpen((v) => !v)}
                  className="flex items-center gap-2 text-xs font-semibold"
                >
                  <span>상속세 수정신고 데이터 (별지 제9호서식)</span>
                  <span className={expandToggleClass("slate")} aria-hidden>{expandToggleLabel(amendOpen)}</span>
                </button>
                <ul className={`${amendOpen ? "" : "hidden print:block "}mt-2 space-y-1 text-caption`}>
                  <li className="flex justify-between"><span className="text-muted-foreground">추가 결정세액</span><span className="font-mono tabular-nums">{formatKRW(amendment.additionalDeterminedTax)}</span></li>
                  <li className="flex justify-between">{/* 🔴 G-41: 「가산세」가 아니다 — 상증법 §18의2⑤ 후단은 「이자상당액을 그 부과하는
                      상속세에 **가산**한다」이고, 별지9호에서도 ㉕(이자상당액)과 ㊱(신고불성실가산세)는
                      다른 칸이다. 국세기본법 §47의3① 괄호도 이자상당가산액을 가산세 base 에서 제외한다. */}
                  <span className="text-muted-foreground">이자상당액 (별지9호 ㉕)</span><span className="font-mono tabular-nums">{formatKRW(amendment.interestPenalty)}</span></li>
                  <li className="flex justify-between"><span className="text-muted-foreground">양도세 환원 공제(기납부)</span><span className="font-mono tabular-nums">{formatKRW(amendment.cgtCreditReceived)}</span></li>
                  <li className="flex justify-between font-semibold"><span>최종 납부세액</span><span className="font-mono tabular-nums">{formatKRW(amendment.netPayable)}</span></li>
                </ul>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
