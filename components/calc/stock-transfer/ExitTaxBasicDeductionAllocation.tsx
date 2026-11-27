"use client";

/**
 * ExitTaxBasicDeductionAllocation — §118의10④ 기본공제 250만원의 세율 구분별 배분 입력 (⑤)
 *
 * 계획서: `docs/02-design/features/stock-transfer-exit-tax-2027.plan.md` §2.1 C-1(사용자 배분 입력)
 *
 * **과세 구분이 둘 이상일 때만** 열린다(구분 1개는 법문 직접 적용이라 입력이 없다). 어느 구분이 «과세»인지는
 * 엔진 분류 helper(`previewExitTaxBuckets`)가 판정한다 — 화면이 5억 합계·외국인근로자 제외·세율 구분을 따로 구현하지 않는다.
 * ④가 배분을 싣는 게이트도 같은 helper라 칸이 보일 때만 값이 전송된다(숨은 값 금지).
 *
 * 법령에 구분별 배분 규정이 없어 **자동으로 나누지 않는다** — 빈 칸은 0으로 채우지 않고 ⑧이 차단한다(0이라도 직접 입력).
 * 합계(연 250만원 또는 합산 양도소득금액이 더 적으면 그 금액)·구분별 상한 검증은 엔진 판정이며 ⑧이 그 문구로 막는다.
 */

import { useMemo } from "react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { previewExitTaxBuckets } from "@/lib/calc/stock-transfer-tax-api-foreign-exit";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { ExitTaxRateBucket } from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";
import type { StockStepBlockProps } from "./stock-section-box";

const BUCKET_FIELD: Record<ExitTaxRateBucket, keyof StockTransferFormData> = {
  clause1: "etBasicDeductionAllocClause1",
  clause2a: "etBasicDeductionAllocClause2a",
  clause2b: "etBasicDeductionAllocClause2b",
};

const BUCKET_LABEL: Record<ExitTaxRateBucket, string> = {
  clause1: "§118의11 1호 — 국내 상장·비상장 주식 (3억 이하 20% · 초과 25%)",
  clause2a: "§118의11 2호 가목 — 국외주식 중 중소기업 (10%)",
  clause2b: "§118의11 2호 나목 — 국외주식 그 밖 (20%)",
};

const BUCKET_ORDER: ExitTaxRateBucket[] = ["clause1", "clause2a", "clause2b"];

export function ExitTaxBasicDeductionAllocation({ form, onChange }: StockStepBlockProps) {
  // 입력에서 곧바로 파생(useMemo) — store에 쓰지 않는다
  const buckets = useMemo(() => previewExitTaxBuckets(form), [form]);
  if (!buckets || buckets.length < 2) return null;

  return (
    <ToneCard tone="sky" title="기본공제 250만원 구분별 배분 (§118의10④)" bodyClassName="space-y-3">
      <p className="text-xs leading-relaxed text-sky-700 dark:text-sky-300" data-testid="exit-alloc-notice">
        과세 대상이 세율 구분 둘 이상(<strong>{buckets.length}개</strong>)입니다. 소득세법 §118의10④는 양도소득금액에서 연 250만원을 공제한다고만
        하고 <strong>구분별 배분 규정이 없어</strong> 자동으로 나누지 않습니다. 구분별 배분액을 직접 입력하세요 — 0이라도 입력해야 합니다.
        합계는 연 250만원(합산 양도소득금액이 250만원보다 적으면 그 금액)이어야 하고, 각 구분의 배분액은 그 구분의 양도소득금액을 넘을 수 없습니다.
        배분에 따라 산출세액이 달라지며 결과에 입력값 기준임이 표시됩니다.
      </p>
      {BUCKET_ORDER.filter((b) => buckets.includes(b)).map((b) => (
        <FieldCard key={b} label={BUCKET_LABEL[b]} required stacked field={BUCKET_FIELD[b]}>
          <CurrencyInput
            label=""
            value={String(form[BUCKET_FIELD[b]] ?? "")}
            onChange={(v) => onChange({ [BUCKET_FIELD[b]]: v } as Partial<StockTransferFormData>)}
            hideUnit
            placeholder="배분액 (0이라도 입력)"
          />
        </FieldCard>
      ))}
    </ToneCard>
  );
}

/**
 * 3단계 «기본공제» 안내 박스의 국외전출세 본문. 과세 구분이 하나(또는 판정 불가)이면 **종전 문구 그대로**이고
 * (2026 이전 출국 SSR 기준선과 바이트 동일), 둘 이상이면 «추가 입력이 없습니다» 대신 배분 입력을 안내한다.
 */
export function ExitTaxBasicDeductionNote({ form }: { form: StockTransferFormData }) {
  const buckets = useMemo(() => previewExitTaxBuckets(form), [form]);
  const needsAllocation = buckets !== null && buckets.length >= 2;
  return needsAllocation ? (
    <>
      {/* 🔴 §103① 그룹이 아니다 — 법 §118의10④가 따로 두고 ⑤가 구분하여 계산한다. 구분이 둘 이상이면 배분만 직접 입력한다 */}
      <p className="font-medium mb-1">국외전출세 기본공제 250만원 (§118의10④)</p>
      <p className="text-xs">
        출국일 간주양도 소득금액에서 연 250만원을 공제합니다. 이 과세표준은 §92②의 양도소득과세표준과{" "}
        <strong>구분하여 계산</strong>하므로(§118의10⑤), 같은 해 주식 양도분과 250만원을 나눠 쓰지 않습니다. 과세 구분이 둘 이상이라
        아래에서 구분별 배분을 직접 입력합니다.
      </p>
    </>
  ) : (
    <>
      {/*
        🔴 국외전출세는 §103① 그룹이 **아니다** — 법 §118의10④가 「양도소득과세표준은
        제3항에 따른 양도소득금액에서 **연 250만원을 공제**한 금액으로 한다」고 따로 두고,
        같은 조 ⑤가 「…제92조제2항에 따른 양도소득과세표준과 **구분하여 계산**한다」고 못박는다.
        종전 문구(§103①2호 그룹)는 국내주식 양도분과 250만원을 나눠 쓴다는 **반대 사실**을 말했다.
      */}
      <p className="font-medium mb-1">국외전출세 기본공제 250만원 (§118의10④)</p>
      <p className="text-xs">
        출국일 간주양도 소득금액에서 연 250만원을 공제합니다. 이 과세표준은 §92②의
        양도소득과세표준과 <strong>구분하여 계산</strong>하므로(§118의10⑤), 같은 해 주식
        양도분과 250만원을 나눠 쓰지 않습니다. 추가 입력이 없습니다.
      </p>
    </>
  );
}
