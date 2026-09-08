"use client";

/**
 * TradingVenueBlock — 거래 구분(장내/장외) · 증권거래세 (Step 1 별도 섹션)
 *
 * 2026-09-08 분리 (docs/00-pm/stock-major-shareholder-ui-restructure.plan.md C-9):
 *   종전에는 「대주주 판정」 섹션 안에 있었다. 그런데 이 토글은 **판정 입력이 아니다** —
 *   판정 **결과를 쓰는** 쪽이고, 축도 다르다:
 *
 *     ① 소득세법 §94①3 가목1) 단서 — 상장 **비대주주**의 장내 양도는 과세대상 밖.
 *     ② 증권거래세법 §8②·시행령 §5 — 탄력세율은 「**증권시장에서 거래되는 주권에 한정**」.
 *        농특세도 「**증권시장에서 거래된** 증권의 양도가액」이 과세표준이다(농특세법 §5①5호).
 *
 *   ⇒ 별도 섹션으로 빼되 **대주주 판정 바로 뒤**에 둔다. 설명문이 대주주 여부로 4갈래
 *     갈리므로 판정보다 앞에 두면 문맥이 무너진다.
 *
 * 🔑 판정을 **재구성하지 않는다**. 화면이 술어를 다시 쓰면 같은 값을 두 곳에서 계산하게 되어
 *    갈린다([[feedback_ui_engine_dual_truth_avoidance]]) — `computeAutoIsMajor`를 그대로 부른다.
 *
 * 🔑 게이트가 `!isMajor`가 아니다. 종전에 그렇게 걸었더니 **대주주의 상장 장외 양도**(가장
 *    흔한 장외 케이스)에 입력 경로가 없어 값이 default `true`로 고정됐다. ①은 대주주에게
 *    의미가 없지만 ②는 대주주에게도 그대로 걸린다 — 그래서 상장 3종 + 非K-OTC면 대주주
 *    여부와 무관하게 연다.
 */

import { useMemo } from "react";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { computeAutoIsMajor } from "@/components/calc/stock-transfer/major-sync";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

type TradingVenueFormSlice = Parameters<typeof computeAutoIsMajor>[0] &
  Pick<StockTransferFormData, "isOnMarketTransaction" | "isKOTCTrading">;

interface TradingVenueBlockProps {
  form: TradingVenueFormSlice;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

/** 이 섹션을 화면에 띄울지 — 상장 3시장이고 K-OTC 거래가 아닐 때만 의미가 있다. */
export function isTradingVenueApplicable(
  form: Pick<StockTransferFormData, "marketType" | "isKOTCTrading">,
): boolean {
  return (
    (form.marketType === "kospi" ||
      form.marketType === "kosdaq" ||
      form.marketType === "konex") &&
    !form.isKOTCTrading
  );
}

export function TradingVenueBlock({ form, onChange }: TradingVenueBlockProps) {
  // 판정 기준일·양도일이 없으면 `undefined` — 대주주 판정 섹션의 미리보기와 같은 조건에서
  // 같은 값으로 떨어진다(그쪽 useMemo도 threshold null이면 isMajor:false).
  const isMajor = useMemo(() => computeAutoIsMajor(form, {}) ?? false, [form]);

  return (
    <ToggleCard
      checked={form.isOnMarketTransaction}
      onCheckedChange={(v) => onChange({ isOnMarketTransaction: v })}
      title="거래소 장내 거래 (§94①3 가목1) 단서 · 증권거래세법 §8②)"
      description={
        form.isOnMarketTransaction
          ? isMajor
            ? "✓ 장내 거래 — 증권거래세 탄력세율(시행령 §5) + 농어촌특별세 적용. 대주주는 장내여도 양도소득세 과세대상입니다."
            : "✓ 장내 거래 — 비대주주 비과세 적용. 산출세액까지 정보용으로 표시되며 최종 납부세액은 0."
          : isMajor
            ? "증권시장 밖 양도(블록딜·개인 간 양도 등) — 증권거래세는 법 §8① 본칙 1만분의 35, 농어촌특별세 없음."
            : "증권시장 밖 양도(블록딜·개인 간 양도 등) — 비대주주여도 양도소득세 과세(§104①11 가목 일반세율)이고, 증권거래세도 법 §8① 본칙입니다."
      }
      tone="emerald"
    />
  );
}
