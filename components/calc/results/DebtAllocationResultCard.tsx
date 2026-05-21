"use client";

/**
 * DebtAllocationResultCard — 채무·공과·장례비 협의분할 결과 카드 (디자인 §5)
 *
 * 표시:
 *  ① 카테고리별 입력 합계 (financial·tax·personal·funeral) — §5.2
 *  ② 장례비 한도 적용 결과 (§14①3호) — §5.3
 *  ③ 상속인별 채무·공과·장례비 분담 표 — §5.4
 *
 * 진입 조건: `result.heirAllocationResult !== undefined` AND `debtItems !== undefined`.
 * 상속인별 산출세액 배부는 기존 HeirAllocationTable이 담당 — 본 카드는 채무 정보에 집중.
 *
 * 정책:
 *  - feedback_no_won_suffix — "원" 단위 미표기 (formatKRW 콤마만)
 *  - feedback_ui_engine_dual_truth_avoidance — 사이드바 컴퓨팅 함수가 아닌 자체 합산 OK (UI display용, 엔진 매트릭스 무관)
 */

import type {
  DebtItem,
  Heir,
  HeirAllocationResult,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";

interface Props {
  debtItems: DebtItem[];
  heirAllocationResult: HeirAllocationResult;
  heirs: Heir[];
}

const FUNERAL_MEAL_LIMIT = 10_000_000;
const FUNERAL_BONGAN_LIMIT = 5_000_000;

export function DebtAllocationResultCard({ debtItems, heirs }: Props) {
  // ── 카테고리별 합계 ──
  const totals = {
    financial: 0,
    tax: 0,
    personal: 0,
    funeral: 0,
  };
  let funeralMeal = 0;
  let funeralBongan = 0;
  for (const di of debtItems) {
    totals[di.category] += di.amount;
    if (di.category === "funeral") {
      if (di.isBongan) funeralBongan += di.amount;
      else funeralMeal += di.amount;
    }
  }
  const funeralMealApplied = Math.min(funeralMeal, FUNERAL_MEAL_LIMIT);
  const funeralBonganApplied = Math.min(funeralBongan, FUNERAL_BONGAN_LIMIT);
  const funeralApplied = funeralMealApplied + funeralBonganApplied;
  const funeralExcess =
    (funeralMeal - funeralMealApplied) + (funeralBongan - funeralBonganApplied);

  const totalInput = totals.financial + totals.tax + totals.personal + totals.funeral;
  const totalAfterLimit =
    totals.financial + totals.tax + totals.personal + funeralApplied;

  // ── 상속인별 채무 분담 (UI display — 카테고리별 sum) ──
  // 엔진 진실: 상속인별 산출세액은 HeirAllocationTable (heirAllocationResult)에 노출.
  // 여기서는 사용자 입력 debtItems.heirAllocations 자체를 카테고리별 합산.
  const heirSums = new Map<
    string,
    { financial: number; tax: number; personal: number; funeral: number }
  >();
  for (const h of heirs) {
    heirSums.set(h.id, { financial: 0, tax: 0, personal: 0, funeral: 0 });
  }
  for (const di of debtItems) {
    if (!di.heirAllocations || di.heirAllocations.length === 0) continue;
    for (const a of di.heirAllocations) {
      const s = heirSums.get(a.heirId);
      if (!s) continue;
      s[di.category] += a.amount;
    }
  }

  return (
    <section className="rounded-lg border border-violet-200 bg-violet-50/30 dark:bg-violet-950/20 dark:border-violet-900 p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-violet-900 dark:text-violet-200">
          채무·공과·장례비 협의분할 결과 (§14①1·2·3호)
        </h3>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
          협의분할 모드
        </span>
      </header>

      {/* ① 카테고리별 합계 — rose */}
      <div className="rounded-md border border-rose-200 dark:border-rose-900 bg-white dark:bg-rose-950/10 p-3 space-y-1.5">
        <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">
          ① 카테고리별 입력 합계
        </p>
        <dl className="text-xs space-y-1 text-gray-800 dark:text-gray-200">
          <div className="flex justify-between">
            <dt>금융채무</dt>
            <dd className="font-mono">{formatKRW(totals.financial)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>공과금</dt>
            <dd className="font-mono">{formatKRW(totals.tax)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>사적채무</dt>
            <dd className="font-mono">{formatKRW(totals.personal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>장례비 (한도 적용 전)</dt>
            <dd className="font-mono">{formatKRW(totals.funeral)}</dd>
          </div>
          <div className="flex justify-between border-t border-rose-200 dark:border-rose-900 pt-1.5 font-semibold">
            <dt>입력 합계 (한도 적용 전)</dt>
            <dd className="font-mono">{formatKRW(totalInput)}</dd>
          </div>
          <div className="flex justify-between font-semibold text-rose-700 dark:text-rose-300">
            <dt>한도 적용 후 합계</dt>
            <dd className="font-mono">{formatKRW(totalAfterLimit)}</dd>
          </div>
        </dl>
      </div>

      {/* ② 장례비 한도 — emerald */}
      {totals.funeral > 0 && (
        <div className="rounded-md border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-emerald-950/10 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            ② 장례비 한도 적용 (§14①3호)
          </p>
          <dl className="text-xs space-y-1 text-gray-800 dark:text-gray-200">
            <div className="flex justify-between">
              <dt>식대 입력</dt>
              <dd className="font-mono">{formatKRW(funeralMeal)}</dd>
            </div>
            <div className="flex justify-between text-emerald-700 dark:text-emerald-300">
              <dt className="pl-3">→ 한도 적용 (최대 10,000,000)</dt>
              <dd className="font-mono">{formatKRW(funeralMealApplied)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>봉안 입력</dt>
              <dd className="font-mono">{formatKRW(funeralBongan)}</dd>
            </div>
            <div className="flex justify-between text-emerald-700 dark:text-emerald-300">
              <dt className="pl-3">→ 한도 적용 (최대 5,000,000)</dt>
              <dd className="font-mono">{formatKRW(funeralBonganApplied)}</dd>
            </div>
            <div className="flex justify-between border-t border-emerald-200 dark:border-emerald-900 pt-1.5 font-semibold">
              <dt>장례비 한도 적용 합계</dt>
              <dd className="font-mono">{formatKRW(funeralApplied)}</dd>
            </div>
            {funeralExcess > 0 && (
              <div className="flex justify-between text-amber-700 dark:text-amber-400">
                <dt>미적용분 (한도 초과)</dt>
                <dd className="font-mono">{formatKRW(funeralExcess)}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* ③ 상속인별 채무 분담 표 — sky (모바일 가로 스크롤) */}
      {heirs.length > 0 && (
        <div className="rounded-md border border-sky-200 dark:border-sky-900 bg-white dark:bg-sky-950/10 p-3 space-y-2">
          <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">
            ③ 상속인별 채무·공과·장례비 분담
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-gray-800 dark:text-gray-200">
              <thead>
                <tr className="border-b border-sky-200 dark:border-sky-900">
                  <th className="text-left py-1.5 pr-2 font-semibold">상속인</th>
                  <th className="text-right py-1.5 px-2 font-semibold">금융채무</th>
                  <th className="text-right py-1.5 px-2 font-semibold">공과금</th>
                  <th className="text-right py-1.5 px-2 font-semibold">사적채무</th>
                  <th className="text-right py-1.5 px-2 font-semibold">장례비</th>
                  <th className="text-right py-1.5 pl-2 font-semibold">합계</th>
                </tr>
              </thead>
              <tbody>
                {heirs.map((h) => {
                  const s = heirSums.get(h.id) ?? {
                    financial: 0,
                    tax: 0,
                    personal: 0,
                    funeral: 0,
                  };
                  const sum = s.financial + s.tax + s.personal + s.funeral;
                  return (
                    <tr
                      key={h.id}
                      className="border-b border-sky-100 dark:border-sky-950"
                    >
                      <td className="py-1.5 pr-2">{h.name}</td>
                      <td className="text-right py-1.5 px-2 font-mono">
                        {s.financial > 0 ? formatKRW(s.financial) : "-"}
                      </td>
                      <td className="text-right py-1.5 px-2 font-mono">
                        {s.tax > 0 ? formatKRW(s.tax) : "-"}
                      </td>
                      <td className="text-right py-1.5 px-2 font-mono">
                        {s.personal > 0 ? formatKRW(s.personal) : "-"}
                      </td>
                      <td className="text-right py-1.5 px-2 font-mono">
                        {s.funeral > 0 ? formatKRW(s.funeral) : "-"}
                      </td>
                      <td className="text-right py-1.5 pl-2 font-mono font-semibold">
                        {sum > 0 ? formatKRW(sum) : "-"}
                      </td>
                    </tr>
                  );
                })}
                <tr className="font-semibold bg-sky-50 dark:bg-sky-950/30">
                  <td className="py-1.5 pr-2">합계</td>
                  <td className="text-right py-1.5 px-2 font-mono">
                    {formatKRW(totals.financial)}
                  </td>
                  <td className="text-right py-1.5 px-2 font-mono">
                    {formatKRW(totals.tax)}
                  </td>
                  <td className="text-right py-1.5 px-2 font-mono">
                    {formatKRW(totals.personal)}
                  </td>
                  <td className="text-right py-1.5 px-2 font-mono">
                    {formatKRW(totals.funeral)}
                  </td>
                  <td className="text-right py-1.5 pl-2 font-mono">
                    {formatKRW(totalInput)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 italic">
            장례비는 한도 적용 전 입력값 기준. 상속인별 산출세액 배부는 아래 상속인별 배부 표 참조.
          </p>
        </div>
      )}
    </section>
  );
}
