"use client";

/**
 * PostListingAmountInputSection — §165⑤ 간이 모드 «순액 입력» 한 축(상장일 또는 취득일).
 *
 * 결과값 4개를 직접 받는 대신 그 **원천값**을 받아 1주당 가치를 자동 산정한다:
 *   순손익액 + 주식수            → 1주당 순손익가치
 *   순자산가액(영업권 포함 전) + 영업권 → 1주당 순자산가치  (주식수 공용)
 *
 * 계획서: docs/00-pm/post-listing-simple-amount-input.plan.md
 *
 * 두 축(상장일·취득일)이 같은 구조라 **한 컴포넌트를 두 번 쓴다**. 두 벌로 복사하면
 * 아래 다중키 patch 로직도 두 벌이 되어 한쪽만 어긋나기 쉽다.
 *
 * 🔴 **다중키 배치 patch — stale spread 차단**
 *    주식수 하나가 바뀌면 순손익가치·순자산가치가 **함께** 바뀐다. 단일-키 onChange를
 *    연속 호출하면 먼저 세팅한 값이 stale 스냅샷에 덮여 되돌아간다
 *    (memory `feedback_multikey_patch_stale_spread_overwrite` — PR #804 §99의3 실사례).
 *    ⇒ 어떤 칸이 바뀌든 **한 번의 onChange로 3키를 함께** 보내고, 계산에는 form의 옛 값이
 *      아니라 **방금 들어온 값**을 쓴다.
 *
 * 🔑 파생값이 0이면 mirror하지 않고 **빈 문자열**로 둔다 — 「입력했는데 0원」이 되면
 *    validate 판정이 애매해진다(자동 fallback 금지 정책).
 *
 * ⚠️ `useEffect → store` 미러링 금지(정책 · 무한 루프). onChange 핸들러에서 직접 계산한다.
 *
 * 💡 순손익액·순자산가액은 `allowNegative`다 — **결손 법인이면 순손익액이 음수**이고
 *    자본잠식이면 순자산가액도 음수다. 엔진 `calcNetIncomePerShare`는 음수를 임의로 0으로
 *    바꾸지 않고 그대로 흘린다(anchor AD-7). 영업권은 상증령 §59② 상 음수가 될 수 없어
 *    허용하지 않고, 주식수도 마찬가지다.
 *    📌 완전재현 모드(`PostListingNetIncomeStatement`)는 `allowNegative`가 없어 결손을
 *       입력할 수 없다 — **기존 제약이고 이 작업의 범위 밖이라 손대지 않았다.**
 */

import { useMemo } from "react";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import {
  derivePerShareFromAmounts,
  SIMPLE_DISCOUNT_RATE,
} from "@/lib/calc/post-listing-amount-derive";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

/** 사용자가 직접 넣는 원천 4칸 — 파생값은 여기 없다(실수로 덮어쓰는 것을 타입으로 막는다). */
type RawKey = "netIncomeAmount" | "shareCount" | "netAssetAmount" | "goodwill";

/** 이 축이 쓰는 폼 키 묶음 — 상장일/취득일 축이 같은 구조를 공유한다. */
export interface AmountAxisKeys {
  netIncomeAmount: keyof StockTransferFormData;
  shareCount: keyof StockTransferFormData;
  netAssetAmount: keyof StockTransferFormData;
  goodwill: keyof StockTransferFormData;
  /** mirror 대상 — 기존 결과 필드 */
  netIncomePerShare: keyof StockTransferFormData;
  netAssetPerShare: keyof StockTransferFormData;
}

interface Props {
  /** 카드 제목 — 예: "상장연도 비상장 보충적 평가" */
  title: string;
  /** 축 이름 — 예: "상장일". 라벨 접두로 쓴다 */
  axisLabel: string;
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
  keys: AmountAxisKeys;
}

const str = (form: StockTransferFormData, key: keyof StockTransferFormData): string => {
  const v = form[key];
  return typeof v === "string" ? v : "";
};

export function PostListingAmountInputSection({ title, axisLabel, form, onChange, keys }: Props) {
  const raw = {
    netIncomeAmount: str(form, keys.netIncomeAmount),
    shareCount: str(form, keys.shareCount),
    netAssetAmount: str(form, keys.netAssetAmount),
    goodwill: str(form, keys.goodwill),
  };

  const derived = useMemo(
    () =>
      derivePerShareFromAmounts({
        netIncomeAmount: parseAmount(raw.netIncomeAmount),
        shareCount: parseAmount(raw.shareCount),
        netAssetAmount: parseAmount(raw.netAssetAmount),
        goodwill: parseAmount(raw.goodwill),
      }),
    [raw.netIncomeAmount, raw.shareCount, raw.netAssetAmount, raw.goodwill],
  );

  /**
   * 한 칸이 바뀌면 원천값 1개 + 파생값 2개를 **한 patch로** 보낸다.
   * `changed`는 «방금 들어온» 값이다 — form의 옛 값으로 계산하면 한 박자 늦는다.
   */
  const patchWithDerived = (changed: Partial<Record<RawKey, string>>) => {
    const next = { ...raw, ...changed };
    const d = derivePerShareFromAmounts({
      netIncomeAmount: parseAmount(next.netIncomeAmount ?? ""),
      shareCount: parseAmount(next.shareCount ?? ""),
      netAssetAmount: parseAmount(next.netAssetAmount ?? ""),
      goodwill: parseAmount(next.goodwill ?? ""),
    });
    // 🔑 **파생값 0은 «산정 실패»가 아니라 정상 결과다.**
    //    결손·자본잠식이면 상증령 §56①·§55① 후단 준용으로 1주당 가치가 0이 된다
    //    (소법 §99①4 전단 → 상증법 §63①1나목 → 상증령 §54 → §55·§56).
    //    `> 0`으로 걸러 빈 문자열을 쓰면 validate의 「자동 산정 실패」가 발동해
    //    **결손 법인이 계산 자체를 못 한다.** ⇒ 「원천값이 입력됐는가」로 가른다.
    //    anchor: post-listing-amount-input.anchor.test.tsx AM-8
    const shareCountNext = parseAmount(next.shareCount ?? "");
    const niEntered = shareCountNext > 0 && (next.netIncomeAmount ?? "") !== "";
    const naEntered = shareCountNext > 0 && (next.netAssetAmount ?? "") !== "";
    const patch: Partial<StockTransferFormData> = {
      [keys.netIncomePerShare]: niEntered ? String(d.netIncomePerShare) : "",
      [keys.netAssetPerShare]: naEntered ? String(d.netAssetPerShare) : "",
    } as Partial<StockTransferFormData>;
    for (const [k, v] of Object.entries(changed)) {
      (patch as Record<string, string>)[keys[k as RawKey] as string] = v ?? "";
    }
    onChange(patch);
  };

  const shares = parseAmount(raw.shareCount);
  const showIncome = shares > 0 && raw.netIncomeAmount !== "";
  const showAsset = shares > 0 && raw.netAssetAmount !== "";
  const won = (n: number) => n.toLocaleString();

  return (
    <ToneCard tone="amber" title={title} bodyClassName="space-y-3">
      <FieldCard label={`${axisLabel} 직전 사업연도 순손익액`} required>
        <CurrencyInput
          label=""
          hideUnit
          allowNegative
          value={raw.netIncomeAmount}
          onChange={(v) => patchWithDerived({ netIncomeAmount: v })}
          placeholder={`${axisLabel} 직전 사업연도 순손익액`}
        />
      </FieldCard>

      <FieldCard label={`${axisLabel} 직전 사업연도 종료일 현재 발행주식총수`} required unit="주">
        <CurrencyInput
          label=""
          hideUnit
          value={raw.shareCount}
          onChange={(v) => patchWithDerived({ shareCount: v })}
          placeholder="발행주식총수"
        />
      </FieldCard>

      {showIncome && (
        <div className="rounded border border-amber-300 bg-amber-100/60 px-3 py-2 text-xs text-amber-900 space-y-0.5">
          <div className="flex justify-between font-mono tabular-nums">
            <span>1주당 순손익액 = 순손익액 ÷ 발행주식총수</span>
            <span>{won(derived.perShareIncomeBeforeRate)}</span>
          </div>
          <div className="flex justify-between font-mono tabular-nums border-t border-amber-200 pt-0.5">
            <span className="font-semibold">
              1주당 순손익가치 = 1주당 순손익액 ÷ {SIMPLE_DISCOUNT_RATE * 100}%
            </span>
            <strong>{won(derived.netIncomePerShare)}</strong>
          </div>
          <p className="text-micro text-amber-700">
            환원율 {SIMPLE_DISCOUNT_RATE * 100}% — 소득세법 시행규칙 §81② → 상속세 및 증여세법
            시행규칙 §17
          </p>
        </div>
      )}

      <FieldCard label={`${axisLabel} 직전 사업연도 순자산가액 (영업권 포함 전)`} required>
        <CurrencyInput
          label=""
          hideUnit
          allowNegative
          value={raw.netAssetAmount}
          onChange={(v) => patchWithDerived({ netAssetAmount: v })}
          placeholder="영업권 포함 전 순자산가액"
        />
      </FieldCard>

      <FieldCard label="영업권 (해당 시)">
        <CurrencyInput
          label=""
          hideUnit
          value={raw.goodwill}
          onChange={(v) => patchWithDerived({ goodwill: v })}
          placeholder="없으면 비워두세요"
        />
      </FieldCard>

      {showAsset && (
        <div className="rounded border border-amber-300 bg-amber-100/60 px-3 py-2 text-xs text-amber-900 space-y-0.5">
          <div className="flex justify-between font-mono tabular-nums">
            <span>순자산가액 = 영업권 포함 전 순자산가액 + 영업권</span>
            <span>{won(derived.netAssetTotal)}</span>
          </div>
          <div className="flex justify-between font-mono tabular-nums border-t border-amber-200 pt-0.5">
            <span className="font-semibold">1주당 순자산가치 = 순자산가액 ÷ 발행주식총수</span>
            <strong>{won(derived.netAssetPerShare)}</strong>
          </div>
        </div>
      )}
    </ToneCard>
  );
}
