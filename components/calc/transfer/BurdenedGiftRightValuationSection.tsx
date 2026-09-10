"use client";

/**
 * ④′ 증여재산 평가 — **조합원입주권** (상증법 §61③ · 상증령 §51② · 상증칙 §16③).
 *
 * 기존 5종의 ④ 「증여일 현재 기준시가」 단일 칸을 대체한다. 입주권 평가는 세 항의 합이라
 * 단일 칸 모델로 접으면 무엇을 넣어야 하는지 알 수 없고, ⑦ 결과 명세도 만들 수 없다.
 *
 * ## 별도 파일인 이유
 *
 * `BurdenedGiftBlock.tsx`가 **775줄**이다(800줄 hard cap). 이 섹션을 인라인하면 초과한다 —
 * 루트 CLAUDE.md의 「기회주의적 분리: 이미 연 파일이 위험구간이면 그 김에 분리」에 해당한다.
 *
 * ## 🔴 박스 라벨은 「보충적 평가액」이지 「증여재산 평가액 C」가 아니다
 *
 * 엔진의 C는 `max(보충적, 담보(§66), 임대(§61⑤))`라 근저당이 크면 **이 박스값과 다르다**.
 * 여기서 max를 재구현하면 UI와 엔진에 진실이 둘이 된다(`feedback_ui_engine_dual_truth_avoidance`)
 * — 최종 C는 **결과 카드에서 엔진값으로** 보여준다.
 */
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import {
  deriveMemberRightsValue,
  deriveRightValuationTotal,
  isMemberRightsValueDerived,
} from "@/lib/calc/burdened-gift-right-valuation";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

export function BurdenedGiftRightValuationSection({ asset, onChange }: Props) {
  // 순수 계산 — `useEffect` → store 미러링 금지.
  const derived = isMemberRightsValueDerived(asset);
  const memberRights = deriveMemberRightsValue(asset);
  const paid = parseAmount(asset.bgRightPaidInstallments) || 0;
  const premium = parseAmount(asset.bgRightPremium) || 0;
  const total = deriveRightValuationTotal(asset);

  const fmt = (n: number) => n.toLocaleString("ko-KR");

  return (
    <ToneCard tone="emerald" title="증여재산 평가 — 조합원입주권" bodyClassName="space-y-2" noDark>
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="상속세및증여세법 §61" label="상증법 §61③" />
        <LawArticleModal legalBasis="상속세및증여세법 시행령 §51" label="시행령 §51②" />
      </div>
      <p className="text-caption text-emerald-800 leading-relaxed">
        부동산을 취득할 수 있는 권리는 <b>조합원권리가액 + 증여일까지 납입한 계약금·중도금 +
        증여일 현재 프리미엄</b>으로 평가합니다.
      </p>

      <FieldCard
        label="조합원권리가액"
        hint="관리처분계획 기준 — 종전 토지·건축물 가격에 비례율을 곱한 가액입니다 (상증법 시행규칙 §16③). 재개발 정보의 「권리가액」(소득세법 시행령 §166④1호 「정하여진 가격」)과 다를 수 있습니다."
      >
        <CurrencyInput
          label=""
          hideUnit
          data-testid="bg-right-member-rights-value"
          value={asset.bgRightMemberRightsValue}
          onChange={(v) => onChange({ bgRightMemberRightsValue: v })}
        />
      </FieldCard>
      {derived && (
        <p className="text-caption text-emerald-700">
          ※ 재개발 정보의 권리가액 <b>{fmt(memberRights)}</b>에서 파생된 값을 사용 중입니다. 관리처분계획상
          조합원권리가액이 다르면 위 칸에 직접 입력하세요.
        </p>
      )}

      <FieldCard label="증여일까지 납입한 금액" hint="계약금·중도금 등. 없으면 비워두세요.">
        <CurrencyInput
          label=""
          hideUnit
          data-testid="bg-right-paid-installments"
          value={asset.bgRightPaidInstallments}
          onChange={(v) => onChange({ bgRightPaidInstallments: v })}
        />
      </FieldCard>

      <FieldCard label="증여일 현재 프리미엄" hint="없으면 비워두세요.">
        <CurrencyInput
          label=""
          hideUnit
          data-testid="bg-right-premium"
          value={asset.bgRightPremium}
          onChange={(v) => onChange({ bgRightPremium: v })}
        />
      </FieldCard>

      {total > 0 && (
        <div
          className="rounded border border-emerald-300 bg-emerald-100/60 p-2 text-caption text-emerald-900 space-y-1"
          data-testid="bg-right-valuation-total"
        >
          <p>
            <b>보충적 평가액 (§61③)</b> = {fmt(memberRights)} + {fmt(paid)} + {fmt(premium)} ={" "}
            <b>{fmt(total)}</b>
          </p>
          <p className="text-emerald-700">
            담보(§66)·임대(§61⑤) 평가가 더 크면 그 값이 증여가액이 됩니다 — 최종 증여가액은 결과
            화면에서 확인하세요.
          </p>
        </div>
      )}
    </ToneCard>
  );
}
