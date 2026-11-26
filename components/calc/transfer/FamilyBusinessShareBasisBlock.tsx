"use client";

/**
 * 지분 모드 × 가업상속공제 §97의2④ — 안내 · «물건 전체 기준» 확인 토글 · 지분 환산 표 (transfer-fb-share UI 계획 §4.2).
 *
 * 금액 3칸(피상속인 원취득가액·상속개시일 평가액·피상속인 자본적 지출액)은 물건 전체(100%) 기준 입력이고 엔진 STEP 0.42가 지분율을 곱한다.
 * 환산 표는 엔진과 같은 leaf(`scaleFamilyBusinessInheritanceByShare`)를 **표시만** 한다 — 환산값을 store에 쓰거나 전송하면 엔진이 한 번 더 곱한다.
 * 확인 토글은 onChange에서 직접 쓴다(useEffect 미러링 금지).
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { getOwnershipRatio } from "@/lib/calc/transfer-tax-api-asset-basics";
import { familyBusinessSharePercentText } from "@/lib/calc/transfer-fb-share-basis";
import { scaleFamilyBusinessInheritanceByShare } from "@/lib/tax-engine/family-business-share";

interface Props {
  asset: AssetForm;
  fb: NonNullable<AssetForm["familyBusinessInheritance"]>;
  onChange: (patch: Partial<AssetForm>) => void;
}

export function FamilyBusinessShareBasisBlock({ asset, fb, onChange }: Props) {
  const pct = familyBusinessSharePercentText(asset);
  const scaled = scaleFamilyBusinessInheritanceByShare(fb, getOwnershipRatio(asset)).fb;
  const rows: { key: string; label: string; whole: number; share: number }[] = [
    { key: "decedent", label: "피상속인 원취득가액", whole: fb.decedentAcquisitionPrice, share: scaled.decedentAcquisitionPrice },
    { key: "capex", label: "피상속인 자본적 지출액", whole: fb.decedentCapitalExpenditure ?? 0, share: scaled.decedentCapitalExpenditure ?? 0 },
    { key: "market", label: "상속개시일 평가액", whole: fb.inheritanceMarketValue, share: scaled.inheritanceMarketValue },
  ].filter((r) => r.whole > 0);

  return (
    <div className="space-y-2" data-testid="fb-share-basis">
      <ToneCard tone="amber" title="지분 모드 — 가업상속공제 금액도 물건 전체(100%) 기준으로 입력하세요" bodyClassName="space-y-1">
        <p className="text-xs">
          피상속인 원취득가액·상속개시일 현재 자산가액·피상속인 자본적 지출액은 <strong>물건 전체 금액</strong>을 입력하면 시스템이
          지분율({pct})을 곱합니다. 가업상속공제적용률은 상속인 단위 비율이므로 지분율을 곱하지 않습니다.
        </p>
      </ToneCard>
      <ToggleCard
        tone="amber"
        checked={asset.fbShareBasisConfirmed === true}
        onCheckedChange={(v) => onChange({ fbShareBasisConfirmed: v })}
        title="아래 금액은 물건 전체(100%) 기준입니다"
        description="켜야 계산할 수 있습니다. 내 지분분으로 입력했다면 끄고 물건 전체 금액으로 고쳐 입력하세요 — 시스템이 지분율을 곱합니다."
        data-testid="fb-share-basis-confirm"
      />
      {rows.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs dark:border-amber-800/60 dark:bg-amber-950/40" data-testid="fb-share-scale">
          <p className="font-semibold text-amber-900 dark:text-amber-200">지분 {pct} 환산 (물건 전체 → 내 지분)</p>
          <table className="mt-1 w-full">
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} data-testid={`fb-share-scale-${r.key}`}>
                  <td className="py-0.5 pr-2 text-amber-800 dark:text-amber-300">{r.label}</td>
                  <td className="py-0.5 text-right font-mono tabular-nums">
                    {r.whole.toLocaleString()} × {pct} = <strong>{r.share.toLocaleString()}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-amber-800 dark:text-amber-300">가업상속공제적용률은 비율이라 지분율을 곱하지 않습니다.</p>
        </div>
      )}
    </div>
  );
}
