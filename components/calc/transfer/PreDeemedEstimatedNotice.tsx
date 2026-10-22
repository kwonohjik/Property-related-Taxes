/**
 * PreDeemedEstimatedNotice — 의제취득일 前 상속·증여인데 **①②를 비워 ③(환산)만 남는** 조합.
 *
 * 「소득세법 시행령」 §163⑨은 상속·증여받은 자산의 취득가액을 「상속개시일·증여일 현재 상증법
 * §60~66에 따라 평가한 가액」으로 **본다**(가목). 같은 조 1호·2호는 기준시가 고시 前 취득에 대해
 * 「그 평가액과 §164④~⑦ 가액 중 **많은 금액**」을 쓰도록 한다 ⇒ **② 단독도 가목**이다.
 *
 * ⚠️ **①·②를 모두 비우면 그 값들이 계산에 아예 등장하지 않는다** — payload에 `reportedValue`가
 *    실리지 않아 엔진의 `clauseA`가 0이 되고 ③(환산·나목)만 남는다.
 *
 * ## 안내에서 **선언**으로 (E-1 · U2-E · 2026-08-07)
 *
 * 종전에는 **차단하지 않고 안내만** 했다. 엔진은 ①②③ 3자 max(2026-10-22 — 종전 「가목 우선」)라
 * ①②를 비우면 그 값이 max 후보에서 조용히 빠진다 ⇒ 비워둔 것을 자동으로 「확인 불가」로 취급하지 않고
 * **명시 선언 토글**을 함께 제공하며, 선언이 없으면 `clauseADeclarationError`가 계산을 차단한다.
 *
 * ⚠️ **노출 조건은 ⑧ validate와 같은 술어**(`needsClauseADeclaration`)를 쓴다. 각자 파생하면
 *    「토글은 보이는데 차단은 안 되는」 침묵 실패가 된다(memory `feedback_shared_predicate_argument_parity`).
 *    그 술어는 취득원인별로 비대칭이다 — **증여는 추계 계열에서만**(실거래가는 「증여 신고가액을
 *    입력하세요」가 이미 막는다), **상속은 모드와 무관**하다(P2c 제외로 구멍이었다).
 *
 * 설계: docs/02-design/features/pre-deemed-clause-a-confirmation-criteria.engine.design.md §4.2·§4.4
 */
"use client";

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { needsClauseADeclaration } from "@/lib/calc/transfer-tax-validate-clause-a";
import { isRedev166_3PreDeemedAsset } from "@/lib/calc/transfer-tax-validate-clause-a";
import {
  sec163_9BaseDateLabel,
  sec163_9CauseLabel,
} from "@/lib/calc/transfer-163-9-base-date";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export function PreDeemedEstimatedNotice({
  asset,
  onChange,
}: {
  asset: AssetForm;
  onChange: (d: Partial<AssetForm>) => void;
}) {
  // ⑧ validate와 **같은 술어·같은 인자**. pre-deemed 판정·① 금액·② 충족을 모두 여기서 본다.
  if (!needsClauseADeclaration(asset)) return null;

  const dateLabel = sec163_9BaseDateLabel(asset);
  const causeLabel = sec163_9CauseLabel(asset);
  // 재개발·재건축 종전자산의 ③은 §166③이다(계획서 inheritance-pre-deemed-clause-b-revisit.plan.md §12) — ⑤ 「환산취득가액」 칸으로 계산.
  const isRedev = isRedev166_3PreDeemedAsset(asset);

  return (
    <ToneCard tone="amber" title="§163⑨ 평가액이 계산에 반영되지 않습니다">
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="소득세법 §97 ①" label="§97①1호" />
        <LawArticleModal legalBasis="소득세법 시행령 §163 ⑨" label="§163⑨" />
        {isRedev ? (
          <LawArticleModal legalBasis="소득세법 시행령 §166 ③" label="§166③" />
        ) : (
          <LawArticleModal legalBasis="소득세법 시행령 §176조의2" label="§176조의2④" />
        )}
      </div>
      <p className="text-xs text-amber-700 dark:text-amber-300">
        의제취득일(1985.1.1.) 이전에 {causeLabel}받은 자산입니다. 「{dateLabel} 상증법 평가액」이나
        §164④~⑦ 취득당시 기준시가를 입력하면 환산취득가액과 비교해 <b>셋 중 많은 금액</b>이 취득가액이 됩니다.{" "}
        <b>지금은 그 두 값이 계산에 등장하지 않습니다.</b>
      </p>
      <p className="text-xs text-amber-700 dark:text-amber-300">
        두 값을 모두 확인할 수 없다면 아래에서 선택하세요.{" "}
        {isRedev
          ? "§166③ 환산취득가액만으로 계산합니다 — 재개발 입력 ⑤ 「인가전 분 종전 부동산 취득가액」에서 「환산취득가액」을 고르고 §166③ 칸을 채우세요."
          : "환산취득가액 등 추계(§176조의2④)만으로 계산합니다."}
      </p>
      <div data-field="preDeemedClauseAUnconfirmed">
        <ToggleCard
          tone="amber"
          size="sm"
          checked={asset.preDeemedClauseAUnconfirmed === true}
          onCheckedChange={(v) => onChange({ preDeemedClauseAUnconfirmed: v })}
          title={`「${dateLabel} 상증법 평가액」을 확인할 수 없음`}
          description="선택하면 환산취득가액 등 추계만으로 계산합니다. 이후 평가액이나 §164④~⑦ 기준시가를 입력하면 이 선택과 무관하게 환산취득가액과 비교해 큰 금액이 적용됩니다."
        />
      </div>
    </ToneCard>
  );
}
