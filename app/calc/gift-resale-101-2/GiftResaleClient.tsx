"use client";

/**
 * §101② 증여 후 우회양도 판정 화면 — 오케스트레이터
 *
 * 계획서: `docs/00-pm/transfer-101-2-gift-resale.plan.md` §5.3·§5.4
 * - 양도세를 계산하지 않는다. 양도세 계산기가 낸 결정세액 두 개와 증여세를 받아 1호·2호를 비교한다.
 * - 상태는 화면 로컬 `useState`(store·persist 없음) · 이력 저장 없음(Q-0) · 저장된 양도세 이력은 읽기만 한다(P4).
 * - ⑧ `validateGiftResale`이 빈 배열일 때만 ⑬ `callGiftResaleAPI`를 부른다. 입력을 고치면 이전 결과를 지운다(핸들러에서 — 효과 아님).
 */
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { HomeButton } from "@/components/calc/shared/HomeButton";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { RequirementCard } from "@/components/calc/gift-resale/RequirementCard";
import { Clause1Card } from "@/components/calc/gift-resale/Clause1Card";
import { Clause2Card } from "@/components/calc/gift-resale/Clause2Card";
import { GiftResaleResultCard, type GiftResaleAmounts } from "@/components/calc/gift-resale/GiftResaleResultCard";
import type { GiftResaleHistoryField, GiftResaleHistorySource } from "@/components/calc/gift-resale/shared";
import { GIFT_RESALE_INITIAL, type GiftResaleFormState } from "@/lib/calc/gift-resale-101-2-form";
import { validateGiftResale, type GiftResaleIssue } from "@/lib/calc/gift-resale-101-2-validate";
import { callGiftResaleAPI, type GiftResaleResponse } from "@/lib/calc/gift-resale-101-2-api";

/** ⑧을 통과했다면 네 칸은 모두 숫자다. 하나라도 비었으면 null — 0으로 보정하지 않는다. */
function toAmounts(f: GiftResaleFormState): GiftResaleAmounts | null {
  const { giftTaxCalculated, giftTaxCreditsAndReductions, doneeTransferDeterminedTax, donorTransferDeterminedTax } = f;
  if (
    giftTaxCalculated === null ||
    giftTaxCreditsAndReductions === null ||
    doneeTransferDeterminedTax === null ||
    donorTransferDeterminedTax === null
  ) {
    return null;
  }
  return { giftTaxCalculated, giftTaxCreditsAndReductions, doneeTransferDeterminedTax, donorTransferDeterminedTax };
}

const HISTORY_FIELDS: GiftResaleHistoryField[] = ["doneeTransferDeterminedTax", "donorTransferDeterminedTax"];

interface Outcome {
  response: GiftResaleResponse;
  amounts: GiftResaleAmounts;
}

export default function GiftResaleClient() {
  const [form, setForm] = useState<GiftResaleFormState>(GIFT_RESALE_INITIAL);
  const [issues, setIssues] = useState<GiftResaleIssue[]>([]);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [historySources, setHistorySources] = useState<Partial<Record<GiftResaleHistoryField, GiftResaleHistorySource>>>({});

  /** 입력이 바뀌면 이전 결과·오류를 지운다 — 화면의 값과 결과가 어긋나지 않게 */
  const patch = (p: Partial<GiftResaleFormState>) => {
    // 이력에서 불러온 칸을 사용자가 직접 고치면 출처 배지를 지운다(값이 달라졌을 때만 — 핸들러에서, 효과 아님)
    for (const field of HISTORY_FIELDS) {
      if (field in p && p[field] !== form[field]) {
        setHistorySources((prev) => ({ ...prev, [field]: undefined }));
      }
    }
    setForm((prev) => ({ ...prev, ...p }));
    setOutcome(null);
    setIssues([]);
    setApiError(null);
  };

  /** 이력 모달에서 고른 결정세액을 칸에 채운다 — 출처는 화면 로컬 state에만 둔다(API body에 싣지 않는다) */
  const pickHistory = (field: GiftResaleHistoryField, source: GiftResaleHistorySource, determinedTax: number) => {
    setForm((prev) => ({ ...prev, [field]: determinedTax }));
    setHistorySources((prev) => ({ ...prev, [field]: source }));
    setOutcome(null);
    setIssues([]);
    setApiError(null);
  };

  const handleJudge = async () => {
    const found = validateGiftResale(form);
    setIssues(found);
    setApiError(null);
    const amounts = toAmounts(form);
    if (found.length > 0 || amounts === null) {
      setOutcome(null);
      return;
    }
    setLoading(true);
    try {
      const response = await callGiftResaleAPI(form);
      setOutcome({ response, amounts });
    } catch (e) {
      setOutcome(null);
      setApiError(e instanceof Error ? e.message : "판정 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const cardProps = { form, onPatch: patch, issues };
  const historyProps = { historySources, onPickHistory: pickHistory };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <HomeButton />
        <Link
          href="/calc/transfer-tax?new=1"
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          양도세 계산기로
        </Link>
      </div>
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">증여 후 우회양도 판정</h1>
        <p className="text-sm text-muted-foreground">
          특수관계인에게 증여한 자산을 수증자가 10년 이내(2022.12.31. 이전 증여는 5년) 양도한 경우, 증여자가 직접 양도한 것으로 보는지
          판정합니다(소득세법 §101②).
        </p>
      </header>

      <ToneCard tone="slate" title="이 화면이 하는 일" bodyClassName="space-y-1">
        <ul className="list-disc space-y-0.5 pl-4 text-xs">
          <li>양도소득세를 계산하지 않습니다 — 양도세 계산기에서 구한 결정세액 두 개와 증여세를 받아 1호·2호를 비교합니다.</li>
          <li>결과는 저장하지 않고, 입력은 이 화면에만 남습니다.</li>
        </ul>
      </ToneCard>

      <RequirementCard {...cardProps} />
      <Clause1Card {...cardProps} {...historyProps} />
      <Clause2Card {...cardProps} {...historyProps} />

      {issues.length > 0 && (
        <ToneCard tone="rose" title="입력을 확인하세요">
          <ul className="list-disc space-y-0.5 pl-4 text-xs" data-testid="gr-errors">
            {issues.map((i) => (
              <li key={`${i.field}-${i.code}`} data-field={i.field}>
                {i.message}
              </li>
            ))}
          </ul>
        </ToneCard>
      )}
      {apiError && (
        <ToneCard tone="rose" title="판정하지 못했습니다">
          <p className="text-xs" data-testid="gr-api-error">
            {apiError}
          </p>
        </ToneCard>
      )}

      <Button type="button" className="w-full" disabled={loading} onClick={handleJudge} data-testid="gr-judge">
        {loading ? "판정 중…" : "판정하기"}
      </Button>

      {outcome && <GiftResaleResultCard result={outcome.response} amounts={outcome.amounts} />}
    </div>
  );
}
