"use client";

import type { NonBusinessLandJudgment, JudgmentStep, StepStatus, DeemedTransferReason } from "@/lib/tax-engine/non-business-land";

interface Props {
  judgment: NonBusinessLandJudgment;
  /** 부칙 §9270호 §14① — 2009.3.16~2012.12.31 취득 토지 +10%p 배제 시 문구 조정(세율만 배제, 판정은 비사업용 유지). */
  nblSurchargeExcluded?: boolean;
}

const DEEMED_REASON_LABEL: Record<DeemedTransferReason, string> = {
  none: "해당 없음",
  auction: "민사집행법 경매 (최초 경매기일)",
  public_sale: "국세징수법 공매 (최초 공매일)",
  kamco_consignment: "캠코 매각위임 (위임일)",
  newspaper_public_offering: "신문 매각공고 (최초 공고일)",
  republication: "매각 재공고 (최초 공고일)",
};

// JSON 직렬화 경유 시 Date → ISO string 이 되므로 양쪽 모두 안전 처리.
function formatDeemedDate(d: Date | string): string {
  return typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
}

/**
 * 재촌 인정 방법 라벨 — **근거 조문이 지목마다 다르다** (U3-02, 2026-09-02 코드리뷰).
 *
 * 농지는 「소득세법 시행령」 §153③(동일 시·군·구 / 연접 / 직선거리 30km)이 재촌을 정의하고,
 * 임야는 같은 영 §168조의9②이 **별도로** 정의한다(주민등록 + 사실상 거주 요건 포함).
 * 종전에는 임야 판정에도 농지 조문과 「농지」라는 낱말을 그대로 표시했다.
 */
function residenceMatchLabel(m: {
  matchType: "same" | "adjacent" | "within_30km";
  distanceKm?: number;
  landCategory?: "farmland" | "forest";
}): string {
  const isForest = m.landCategory === "forest";
  const subject = isForest ? "임야" : "농지";
  const article = isForest ? "「소득세법 시행령」 §168조의9②" : "「소득세법 시행령」 §153③";
  switch (m.matchType) {
    case "same":
      return `${subject} 소재 시·군·구 내 거주 (${article}${isForest ? "" : "1호"})`;
    case "adjacent":
      return `${subject}와 연접한 시·군·구 거주 (${article}${isForest ? "" : "2호"})`;
    case "within_30km":
      return `직선거리 30km 이내 거주 (${article}${isForest ? "" : "3호"}${
        m.distanceKm !== undefined ? ` — 실측 ${m.distanceKm.toFixed(1)}km` : ""
      })`;
  }
}

export function NonBusinessLandResultCard({ judgment, nblSurchargeExcluded }: Props) {
  const isNonBusiness = judgment.isNonBusinessLand;
  const exemption = judgment.unconditionalExemption;
  const area = judgment.areaProportioning;

  return (
    <div className="rounded-xl border border-border overflow-hidden">

      {/* ① 자연어 요약 배너 */}
      <div className={isNonBusiness
        ? "bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-900 px-4 py-3"
        : "bg-emerald-50 dark:bg-emerald-950/30 border-b border-emerald-200 dark:border-emerald-900 px-4 py-3"
      }>
        <div className="flex items-start gap-2">
          <span className="text-lg mt-0.5">{isNonBusiness ? "⚠️" : "✅"}</span>
          <div>
            <p className={`text-sm font-bold ${isNonBusiness ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
              {isNonBusiness
                ? nblSurchargeExcluded
                  ? "비사업용 토지 — 부칙 §9270호 §14① 취득기간(2009.3.16~2012.12.31) 세율 배제로 기본세율 적용(+10%p 미적용). 장기보유특별공제 표1 적용."
                  : "비사업용 토지 — 기본세율 +10%p 중과 (장기보유특별공제 표1 적용)."
                : "사업용 토지 — 일반세율이 적용됩니다."}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{judgment.judgmentReason}</p>
          </div>
        </div>
      </div>

      {/* ② 무조건 면제 강조 (해당 시) */}
      {exemption?.isApplied && (
        <div className="px-4 py-3 bg-blue-50 dark:bg-blue-950/20 border-b border-blue-200 dark:border-blue-800">
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">
            무조건 사업용 — 소득세법 시행령 §168-14③
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-500 mt-0.5">{exemption.detail}</p>
        </div>
      )}

      {/* 양도일 의제 (§168의14②) — 해당 시 */}
      {judgment.deemedTransfer && (
        <div className="px-4 py-3 bg-rose-50/40 dark:bg-rose-950/20 border-b border-rose-200 dark:border-rose-800">
          <p className="text-xs font-semibold text-rose-700 dark:text-rose-400 mb-0.5">양도일 의제 (§168의14②)</p>
          <p className="text-xs text-muted-foreground">
            {DEEMED_REASON_LABEL[judgment.deemedTransfer.reason]} — {formatDeemedDate(judgment.deemedTransfer.date)}을 양도일로 보아 기간기준(§168의6)을 판정했습니다. (양도차익·세율·도시지역·편입유예는 실제 양도일 기준)
          </p>
        </div>
      )}

      {/* §168의11② 수입금액비율 (해당 시) */}
      {judgment.revenueTestDetail && (
        <div className={`px-4 py-3 border-b ${judgment.revenueTestDetail.pass
          ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800"
          : "bg-muted/20 border-border"}`}>
          <p className="text-xs font-semibold text-foreground mb-1">§168의11② 수입금액비율</p>
          <p className="text-xs text-muted-foreground">{judgment.revenueTestDetail.detail}</p>
          {judgment.revenueTestDetail.annualizationApplied && (
            <div className="mt-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-2.5 py-1.5 text-caption text-amber-800 dark:text-amber-200 space-y-0.5">
              <p className="font-medium">§168의11③3호 연환산 적용</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
                {judgment.revenueTestDetail.currentBusinessDays !== undefined && (
                  <>
                    <span>당해 영위일수</span>
                    <span className="font-mono text-right">{judgment.revenueTestDetail.currentBusinessDays}일</span>
                  </>
                )}
                <span>당해 연간환산 수입 (원)</span>
                <span className="font-mono text-right">{judgment.revenueTestDetail.annualizedCurrentRevenue.toLocaleString()}</span>
                {judgment.revenueTestDetail.priorBusinessDays !== undefined && (
                  <>
                    <span>직전 영위일수</span>
                    <span className="font-mono text-right">{judgment.revenueTestDetail.priorBusinessDays}일</span>
                  </>
                )}
                {judgment.revenueTestDetail.annualizedPriorRevenue !== undefined && (
                  <>
                    <span>직전 연간환산 수입 (원)</span>
                    <span className="font-mono text-right">{judgment.revenueTestDetail.annualizedPriorRevenue.toLocaleString()}</span>
                  </>
                )}
              </div>
            </div>
          )}
          {(judgment.revenueTestDetail.deemedRentCurrent > 0 || judgment.revenueTestDetail.deemedRentPrior > 0) && (
            <div className="mt-1.5 rounded-md bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 px-2.5 py-1.5 text-caption text-violet-800 dark:text-violet-200 space-y-0.5">
              <p className="font-medium">§168의11③1호 간주임대료 합산</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
                <span>당해 간주임대료 (원)</span>
                <span className="font-mono text-right">{judgment.revenueTestDetail.deemedRentCurrent.toLocaleString()}</span>
                {judgment.revenueTestDetail.deemedRentPrior > 0 && (
                  <>
                    <span>직전 간주임대료 (원)</span>
                    <span className="font-mono text-right">{judgment.revenueTestDetail.deemedRentPrior.toLocaleString()}</span>
                  </>
                )}
              </div>
            </div>
          )}
          {(judgment.revenueTestDetail.commonApportionedCurrent > 0 || judgment.revenueTestDetail.commonApportionedPrior > 0) && (
            <div className="mt-1.5 rounded-md bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 px-2.5 py-1.5 text-caption text-violet-800 dark:text-violet-200 space-y-0.5">
              <p className="font-medium">§168의11③2호 공통수입 안분</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
                <span>당해 안분액 (원)</span>
                <span className="font-mono text-right">{judgment.revenueTestDetail.commonApportionedCurrent.toLocaleString()}</span>
                {judgment.revenueTestDetail.commonApportionedPrior > 0 && (
                  <>
                    <span>직전 안분액 (원)</span>
                    <span className="font-mono text-right">{judgment.revenueTestDetail.commonApportionedPrior.toLocaleString()}</span>
                  </>
                )}
              </div>
            </div>
          )}
          {judgment.revenueTestDetail.deemedRateUnavailable && (
            <p className="mt-1.5 text-caption text-rose-600 dark:text-rose-400">
              ⚠️ 전세금·보증금이 입력되었으나 해당 과세연도의 정기예금이자율(부가세칙 §47)이 미등재되어 간주임대료를 적용하지 못했습니다. 해당 연도 율 확인이 필요합니다.
            </p>
          )}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs mt-1.5">
            <span className="text-muted-foreground">당해 비율</span>
            <span className="font-mono text-right">{(judgment.revenueTestDetail.ratioCurrent * 100).toFixed(2)}%</span>
            {judgment.revenueTestDetail.ratioCombined !== undefined && (
              <>
                <span className="text-muted-foreground">합산 비율(당해+직전)</span>
                <span className="font-mono text-right">{(judgment.revenueTestDetail.ratioCombined * 100).toFixed(2)}%</span>
              </>
            )}
            <span className="text-muted-foreground">적용 비율(큰 값)</span>
            <span className="font-mono text-right">{(judgment.revenueTestDetail.actualRatio * 100).toFixed(2)}%</span>
            <span className="text-muted-foreground">기준 비율</span>
            <span className="font-mono text-right">{(judgment.revenueTestDetail.threshold * 100).toFixed(0)}%</span>
          </div>
        </div>
      )}

      {/* ③ 기간 분석 */}
      {judgment.totalOwnershipDays > 0 && (
        <div className="px-4 py-3 bg-muted/20 border-b border-border">
          <p className="text-xs font-medium text-muted-foreground mb-2">기간 분석</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <span className="text-muted-foreground">전체 보유일수</span>
            <span className="font-mono text-right">{judgment.totalOwnershipDays.toLocaleString()}일</span>
            <span className="text-muted-foreground">사업용 사용일수</span>
            <span className="font-mono text-right">{judgment.effectiveBusinessDays.toLocaleString()}일</span>
            <span className="text-muted-foreground">사업용 비율</span>
            <span className="font-mono text-right">{(judgment.businessUseRatio * 100).toFixed(1)}%</span>
            {judgment.gracePeriodDays > 0 && (
              <>
                <span className="text-muted-foreground">유예기간 가산</span>
                <span className="font-mono text-right">{judgment.gracePeriodDays.toLocaleString()}일</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* ④ 면적 안분 시각화 (주택·목장 해당 시) */}
      {area && (
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-medium text-muted-foreground mb-2">면적 안분</p>
          <AreaBar businessArea={area.businessArea} nonBusinessArea={area.nonBusinessArea} />
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs mt-2">
            <span className="text-muted-foreground">사업용 면적</span>
            <span className="font-mono text-right text-emerald-600">{area.businessArea.toFixed(1)} ㎡</span>
            <span className="text-muted-foreground">비사업용 면적</span>
            <span className="font-mono text-right text-red-600">{area.nonBusinessArea.toFixed(1)} ㎡</span>
            {area.mixedUseBuildingRatio !== undefined && (
              <>
                <span className="text-muted-foreground">특정용도분 비율 (§168의11⑥)</span>
                <span className="font-mono text-right">{(area.mixedUseBuildingRatio * 100).toFixed(1)}%</span>
              </>
            )}
          </div>
          {area.contiguousNblDetail && area.contiguousNblDetail.length > 0 && (
            <div className="mt-3 rounded-md border border-border/60 overflow-hidden">
              <p className="text-caption font-medium text-muted-foreground px-2 py-1 bg-muted/30">§168의11⑤ 연접 다필지 — 취득시기순 비사업용 귀속</p>
              <table className="w-full text-caption">
                <thead>
                  <tr className="text-muted-foreground border-b border-border/60">
                    <th className="text-left font-medium px-2 py-1">필지</th>
                    <th className="text-right font-medium px-2 py-1">취득일</th>
                    <th className="text-right font-medium px-2 py-1">면적</th>
                    <th className="text-right font-medium px-2 py-1">비사업용 귀속</th>
                  </tr>
                </thead>
                <tbody>
                  {area.contiguousNblDetail.map((p, i) => (
                    <tr key={p.id} className="border-b border-border/40 last:border-0">
                      <td className="px-2 py-1">{i + 1}</td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums">{formatDeemedDate(p.acquisitionDate)}</td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums">{p.landArea.toFixed(1)} ㎡</td>
                      <td className={`px-2 py-1 text-right font-mono tabular-nums ${p.nonBusinessArea > 0 ? "text-red-600" : "text-muted-foreground"}`}>{p.nonBusinessArea.toFixed(1)} ㎡</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!nblSurchargeExcluded && (
            <p className="text-caption text-muted-foreground mt-2 leading-snug">
              비사업용 면적분(전체의 {(area.nonBusinessRatio * 100).toFixed(1)}%)에만 중과세(+10%p)가 적용됩니다 — 중과분은 비사업용 면적비율로 안분 계산됩니다. (기준면적 초과분 — 목장 §168의10③·기타토지 §168의11①, 건축물 바닥면적 외 부속토지 §101①2호나목, 복합용도 건축물 §168의11⑥, 연접 다필지 §168의11⑤, 공장 부수토지 「지방세법 시행령」 §102①1호[별표6]·§101①1호.)
            </p>
          )}
        </div>
      )}

      {/* 재촌 인정 근거 (동일/연접/직선거리 30km — §153③) */}
      {judgment.residenceMatch && (
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-medium text-muted-foreground mb-1">재촌 인정 근거</p>
          <p className="text-xs text-foreground">{residenceMatchLabel(judgment.residenceMatch)}</p>
        </div>
      )}

      {/* ⑤ 판정 단계 타임라인 */}
      {judgment.judgmentSteps.length > 0 && (
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-medium text-muted-foreground mb-3">판정 과정</p>
          <ol className="space-y-2">
            {judgment.judgmentSteps.map((step) => (
              <StepItem key={step.id} step={step} />
            ))}
          </ol>
        </div>
      )}

      {/* ⑥ 경고 */}
      {judgment.warnings.length > 0 && (
        <div className="px-4 py-3 border-b border-border bg-amber-50/50 dark:bg-amber-950/20">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">주의사항</p>
          <ul className="space-y-1">
            {judgment.warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-700 dark:text-amber-400 flex gap-1.5">
                <span>•</span><span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ⑦ 적용 법령 */}
      {judgment.appliedLawArticles.length > 0 && (
        <div className="px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">적용 법령</p>
          <div className="flex flex-wrap gap-1.5">
            {judgment.appliedLawArticles.map((law, i) => (
              <span key={i} className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {law}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 면적 안분 Bar ──
function AreaBar({ businessArea, nonBusinessArea }: { businessArea: number; nonBusinessArea: number }) {
  const total = businessArea + nonBusinessArea;
  if (total <= 0) return null;
  const businessPct = Math.round((businessArea / total) * 100);
  return (
    <div className="flex rounded-full overflow-hidden h-3">
      <div className="bg-emerald-400 dark:bg-emerald-600" style={{ width: `${businessPct}%` }} title={`사업용 ${businessPct}%`} />
      <div className="bg-red-400 dark:bg-red-600 flex-1" title={`비사업용 ${100 - businessPct}%`} />
    </div>
  );
}

// ── 단계별 타임라인 ──
function StepItem({ step }: { step: JudgmentStep }) {
  const { icon, iconBg, textColor } = getStepStyle(step.status);
  return (
    <li className="flex gap-3 items-start">
      <span className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs ${iconBg}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={`text-xs font-medium ${textColor}`}>{step.label}</span>
          <span className={`text-xs ${getStatusLabel(step.status).color}`}>{getStatusLabel(step.status).text}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{step.detail}</p>
        {step.legalBasis && (
          <span className="inline-block mt-1 text-micro text-muted-foreground/70 border border-border/60 rounded px-1.5 py-0.5">{step.legalBasis}</span>
        )}
      </div>
    </li>
  );
}

function getStepStyle(status: StepStatus) {
  switch (status) {
    case "PASS":         return { icon: "✓", iconBg: "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600", textColor: "text-foreground" };
    case "FAIL":         return { icon: "✗", iconBg: "bg-red-100 dark:bg-red-900/50 text-red-600",             textColor: "text-foreground" };
    case "SKIP":         return { icon: "→", iconBg: "bg-muted text-muted-foreground",                         textColor: "text-muted-foreground" };
    case "NOT_APPLICABLE": return { icon: "–", iconBg: "bg-muted text-muted-foreground",                       textColor: "text-muted-foreground" };
  }
}

function getStatusLabel(status: StepStatus): { text: string; color: string } {
  switch (status) {
    case "PASS":            return { text: "충족",   color: "text-emerald-600 dark:text-emerald-400" };
    case "FAIL":            return { text: "미충족", color: "text-red-600 dark:text-red-400" };
    case "SKIP":            return { text: "건너뜀", color: "text-muted-foreground" };
    case "NOT_APPLICABLE":  return { text: "해당없음", color: "text-muted-foreground" };
  }
}
