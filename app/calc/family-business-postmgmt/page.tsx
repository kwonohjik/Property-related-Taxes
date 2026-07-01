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
import {
  buildAmendmentReturnData,
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

const JUSTIFIABLE_REASON_OPTIONS: Array<{ value: JustifiableReasonCode; label: string }> = [
  // §15⑧ 1호 (자산처분 예외)
  { value: "expropriation", label: "1호가. 수용·협의매수·시설개체·사업장이전" },
  { value: "state_donation_asset", label: "1호나. 국가·지자체 증여" },
  { value: "heir_death", label: "1호다. 가업상속인 사망" },
  { value: "reorganization", label: "1호라. 합병·분할·통합·법인전환" },
  { value: "useful_life", label: "1호마. 내용연수 도래" },
  { value: "industry_change_replace", label: "1호바. 업종변경 대체취득" },
  { value: "rnd_use", label: "1호사. 처분금액 R&D 사용" },
  // §15⑧ 2호 (가업 미종사 예외)
  { value: "heir_death_cessation", label: "2호가. 가업상속인 사망" },
  { value: "state_donation_cessation", label: "2호나. 국가·지자체 증여" },
  { value: "military_illness", label: "2호다. 병역·질병 부득이" },
  // §15⑧ 3호 (지분 감소 예외)
  { value: "reorg_share_transfer", label: "3호가. 조직변경 주식 처분" },
  { value: "third_party_dilution", label: "3호나. 특수관계 외 유상증자 희석" },
  { value: "heir_death_succession", label: "3호다. 상속인 사망(승계 종사)" },
  { value: "state_donation_share", label: "3호라. 국가·지자체 증여" },
  { value: "listing_dilution", label: "3호마. 상장요건 충족 감자" },
  { value: "uniform_capital_decrease", label: "3호바. 균등 감자" },
  { value: "court_decision", label: "3호사. 법원결정 무상감자·출자전환" },
];

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
  const [deathDate, setDeathDate] = useState(searchParams.get("deathDate") ?? "");
  const [amendOpen, setAmendOpen] = useState(false);
  const [filingDeadline, setFilingDeadline] = useState(searchParams.get("filingDeadline") ?? "");
  const [ofzExemptionActive, setOfzExemptionActive] = useState(searchParams.get("ofz") === "1");
  const [usedDirectInput, setUsedDirectInput] = useState(searchParams.get("direct") === "1");
  // cgt — 양도세 환원 공제(§18의2⑩). 양도세 결과뷰에서 creditAmount prefill (PR-5 연동)
  const [cgtCreditAmount, setCgtCreditAmount] = useState(searchParams.get("cgt") ?? "");
  const [interestRate, setInterestRate] = useState("0.022");

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
    setViolations((prev) => prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  };

  const canCalculate = useMemo(() => {
    return (
      parseAmount(appliedDeduction) > 0 &&
      deathDate.length === 10 &&
      effectiveFilingDeadline.length === 10 &&
      Number(interestRate) >= 0 &&
      Number(interestRate) <= 1 &&
      violations.length > 0 &&
      violations.every((v) => v.date.length === 10)
    );
  }, [appliedDeduction, deathDate, effectiveFilingDeadline, interestRate, violations]);

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

  const amendment =
    result && violations.length > 0 ? buildAmendmentReturnData(result, violations[0].date) : null;

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
              <p className="text-[10px] text-muted-foreground">
                자동: {autoFilingDeadline} (사망월 말일 + 6개월). 직접 입력 시 우선.
              </p>
            )}
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
              국세기본법 §43의3② 이자율 (소수)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={interestRate}
              onChange={(e) => setInterestRate(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="0.022"
            />
            <p className="text-[10px] text-muted-foreground">예: 0.022 = 연 2.2% (시점별 개정 — 국세청 고시 확인)</p>
          </div>
        </div>
        <ToggleCard
          tone="emerald"
          checked={ofzExemptionActive}
          onCheckedChange={setOfzExemptionActive}
          title="기회발전특구 특례 활성 (§15㉕)"
          description="활성 시 가업 미종사 중 대표이사 미종사·업종변경(§15⑪1·2호)이 자동 면제됩니다. (1년 휴·폐업 3호는 면제 대상 아님)"
        />
        <ToggleCard
          tone="violet"
          checked={usedDirectInput}
          onCheckedChange={setUsedDirectInput}
          title="직접입력 모드로 공제받은 사례"
          description="요건 우회(직접입력) 사례도 사후관리 대상입니다 (표시용)."
        />
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
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-200 text-[10px] font-bold text-rose-800">
                {idx + 1}
              </span>
              {violations.length > 1 && (
                <button
                  type="button"
                  onClick={() => setViolations((p) => p.filter((_, i) => i !== idx))}
                  className="text-[11px] text-rose-600 hover:text-rose-800 underline"
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
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">정당한 사유 (§15⑧, 선택 — 인정 시 추징 면제)</label>
              <select
                value={v.justifiableReasonCode}
                onChange={(e) => updateViolation(idx, { justifiableReasonCode: e.target.value as JustifiableReasonCode | "" })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">해당 없음 (추징 적용)</option>
                {JUSTIFIABLE_REASON_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
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
          description="5년 평균과 직전 2년 평균을 입력하면 4호(각 목 모두 90% 미달 = 위반) 판정. 60개월 정밀 모드는 후속."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">5년 평균 정규직 수</label>
              <input type="text" inputMode="decimal" value={fiveYearAvg} onChange={(e) => setFiveYearAvg(e.target.value)} onFocus={(e) => e.target.select()}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">직전 2년 평균 정규직 수 (기준)</label>
              <input type="text" inputMode="decimal" value={priorTwoYearAvg} onChange={(e) => setPriorTwoYearAvg(e.target.value)} onFocus={(e) => e.target.select()}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <CurrencyInput label="5년 총급여액" value={fiveYearSalary} onChange={setFiveYearSalary} />
            <CurrencyInput label="직전 2년 총급여액 (기준)" value={priorTwoYearSalary} onChange={setPriorTwoYearSalary} />
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
                <p className="text-xs text-muted-foreground">추징세액 합계</p>
                <p className="font-semibold font-mono tabular-nums">{formatKRW(result.totalRecapture)}</p>
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
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-muted-foreground text-left">
                  <th className="py-1">위반일</th>
                  <th>유형</th>
                  <th className="text-right">추징</th>
                  <th className="text-right">이자</th>
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
            </div>
          )}

          {/* 수정신고 + 6개월 배너 */}
          {amendment && result.totalRecapture > 0 && (
            <div className="border-t border-border pt-3 space-y-2">
              <div className="rounded-md border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
                ⏰ <strong>신고·납부 기한 (§18의2⑨)</strong>: {amendment.amendmentDeadline}까지 (사유발생 월말 + 6개월)
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
                <ul className={`${amendOpen ? "" : "hidden print:block "}mt-2 space-y-1 text-[11px]`}>
                  <li className="flex justify-between"><span className="text-muted-foreground">추가 결정세액</span><span className="font-mono tabular-nums">{formatKRW(amendment.additionalDeterminedTax)}</span></li>
                  <li className="flex justify-between"><span className="text-muted-foreground">이자상당액 가산세</span><span className="font-mono tabular-nums">{formatKRW(amendment.interestPenalty)}</span></li>
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
