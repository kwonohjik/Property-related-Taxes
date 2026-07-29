"use client";

/**
 * InheritanceReviewSummary — 계산 직전 입력 요약 검토 카드 (상속세 Step 4 하단).
 *
 * 목적: "계산하기" 직전에 입력 누락을 사용자가 인지하도록 한눈에 점검.
 *  - 건수(재산·상속인·채무·사전증여·비과세)와 상속인 구성을 요약.
 *  - "적용 예정 공제·세액공제·납부 방법"을 칩으로 나열 — 사이드바·결과뷰에 없는 정보로,
 *    "공제를 빠뜨렸나?" 같은 누락 인지에 직접 도움.
 *
 * 설계: 순수 read-only(파생 표시). 금액 합계는 좌측 사이드바(computeInheritanceSummary)에
 *   위임하여 dual-truth 회피 — 본 카드는 금액을 재계산하지 않고 건수·적용 여부만 보여준다.
 *   적용 여부는 buildInput/autos와 동일한 fallback 규칙으로 판정(단일 진실).
 */

import type { FormState } from "./shared";
import type { Step4Autos } from "./steps";
import type { HeirRelation } from "@/lib/tax-engine/types/inheritance-gift.types";

const has = (s: string) => s.trim() !== "";

const RELATION_LABEL: Record<HeirRelation, string> = {
  spouse: "배우자",
  child: "자녀",
  lineal_ascendant: "직계존속",
  sibling: "형제자매",
  other: "기타",
  legatee: "수유자",
  corporate: "법인",
};

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-caption font-medium text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200">
      {children}
    </span>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="shrink-0 text-caption text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-right text-xs font-medium text-gray-800 dark:text-gray-200">
        {value}
      </span>
    </div>
  );
}

export function InheritanceReviewSummary({
  form,
  autos,
}: {
  form: FormState;
  autos: Step4Autos;
}) {
  const hasSpouse = form.heirs.some((h) => h.relation === "spouse");

  // 상속재산 건수 (본래 + 주식). 추정상속재산(§15)은 별도 표기.
  const estateCount = form.estateItems.length + form.stockItems.length;
  const presumedCount = form.presumedItems.length;
  const exemptionCount = form.exemptionItems.length;
  const priorGiftCount = form.priorGifts.length;
  // 채무·공과·장례비 — 협의분할 모드(debtItems)면 항목 수, 아니면 legacy 합산 입력 여부.
  const debtCount = form.debtItems?.length ?? 0;
  const hasLegacyDebt =
    form.debtItems === undefined &&
    (has(form.debts) || has(form.funeralExpense));

  // 상속인 구성 — relation별 인원 요약.
  const relationCounts = form.heirs.reduce<Partial<Record<HeirRelation, number>>>(
    (acc, h) => {
      acc[h.relation] = (acc[h.relation] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const heirBreakdown = (Object.keys(relationCounts) as HeirRelation[])
    .map((r) => `${RELATION_LABEL[r]} ${relationCounts[r]}`)
    .join(" · ");

  // 적용 예정 공제 — buildInput과 동일 fallback(입력값 또는 자동 도출값) 기준.
  const deductions: string[] = [];
  deductions.push(
    form.isUnfiled ? "일괄공제 5억(무신고 §21① 단서)" : "일괄공제 / 기초+인적(큰 금액)",
  );
  if (hasSpouse) deductions.push("배우자공제");
  if (has(form.netFinancialAssets) || autos.netFin.value > 0)
    deductions.push(`금융재산공제${!has(form.netFinancialAssets) ? "(자동)" : ""}`);
  if (has(form.cohabitHouseStdPrice) || has(form.cohabitDirectAmount) || autos.cohabit.value > 0)
    deductions.push("동거주택공제");
  if (has(form.farmingAssetValue) || autos.farming.value > 0 || form.farming != null)
    deductions.push("영농상속공제");
  if (
    has(form.familyBusinessValue) ||
    has(form.familyBusinessDirectAmount) ||
    form.familyBusiness != null
  )
    deductions.push("가업상속공제");
  if (form.casualtyLossEnabled) deductions.push("재해손실공제(§23)");

  // 세액공제·납부 방법
  const credits: string[] = [];
  if (form.isFiledOnTime) credits.push("신고세액공제 3%");
  if (has(form.foreignTaxPaid)) credits.push("외국납부세액공제");
  if (has(form.shortTermReinheritPriorDeathDate) || form.shortTermReinheritAssets.length > 0)
    credits.push("단기재상속공제");

  const payments: string[] = [];
  if (form.installmentEnabled) payments.push("연부연납");
  if (form.splitPaymentEnabled) payments.push("분납");
  if (form.paymentInKindEnabled) payments.push("물납");

  return (
    <div
      className="rounded-lg border border-indigo-200 bg-indigo-50/50 dark:border-indigo-800 dark:bg-indigo-950/20 p-3 space-y-3"
      data-testid="inheritance-review-summary"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-200 text-caption text-indigo-800 select-none dark:bg-indigo-800 dark:text-indigo-100">
          ✓
        </span>
        <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-200">
          계산 전 입력 요약
        </p>
      </div>

      {/* 건수 요약 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
        <Row
          label="상속재산"
          value={`${estateCount}건${presumedCount > 0 ? ` (+추정 ${presumedCount}건)` : ""}`}
        />
        <Row
          label="상속인·수유자"
          value={
            form.heirs.length > 0 ? (
              <span title={heirBreakdown}>
                {form.heirs.length}명{heirBreakdown ? ` (${heirBreakdown})` : ""}
              </span>
            ) : (
              "없음"
            )
          }
        />
        <Row
          label="채무·공과·장례비"
          value={debtCount > 0 ? `${debtCount}건` : hasLegacyDebt ? "입력됨" : "없음"}
        />
        <Row label="사전증여" value={priorGiftCount > 0 ? `${priorGiftCount}건` : "없음"} />
        <Row label="비과세·불산입" value={exemptionCount > 0 ? `${exemptionCount}건` : "없음"} />
        <Row
          label="신고 상태"
          value={form.isUnfiled ? "무신고" : form.isFiledOnTime ? "정기신고" : "기한후신고"}
        />
      </div>

      {/* 적용 예정 공제 */}
      <div className="space-y-1.5 border-t border-indigo-200/70 dark:border-indigo-800/70 pt-2">
        <p className="text-caption font-medium text-indigo-700 dark:text-indigo-300">
          적용 예정 상속공제
        </p>
        <div className="flex flex-wrap gap-1.5">
          {deductions.map((d) => (
            <Chip key={d}>{d}</Chip>
          ))}
        </div>
      </div>

      {(credits.length > 0 || payments.length > 0) && (
        <div className="space-y-1.5 border-t border-indigo-200/70 dark:border-indigo-800/70 pt-2">
          {credits.length > 0 && (
            <div className="space-y-1">
              <p className="text-caption font-medium text-indigo-700 dark:text-indigo-300">
                세액공제
              </p>
              <div className="flex flex-wrap gap-1.5">
                {credits.map((c) => (
                  <Chip key={c}>{c}</Chip>
                ))}
              </div>
            </div>
          )}
          {payments.length > 0 && (
            <div className="space-y-1">
              <p className="text-caption font-medium text-indigo-700 dark:text-indigo-300">
                납부 방법
              </p>
              <div className="flex flex-wrap gap-1.5">
                {payments.map((p) => (
                  <Chip key={p}>{p}</Chip>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-micro text-gray-500 dark:text-gray-400">
        ⓘ 입력 내용을 확인한 뒤 아래 ‘계산하기’를 누르세요. 금액 합계는 좌측 요약에서 확인할 수 있습니다.
      </p>
    </div>
  );
}
