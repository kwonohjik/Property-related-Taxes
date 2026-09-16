"use client";

/**
 * StaleSourceBanner — **합산에 편입된 자산이 원본 이력과 어긋났음**을 알린다.
 *
 * ## 왜 필요한가
 *
 * 이력에서 편입한 자산은 `record.inputData`의 **동결 사본**을 들고
 * (`transfer-multi-load-entry.ts` `buildPropertyFromSingleRecord`), 그 사본이 sessionStorage에
 * persist된다. 단건 화면에서 입력을 고쳐도 합산은 **옛 값으로 계속 계산하고**, 종전에는
 * 그 사실이 화면 어디에도 표시되지 않았다.
 *   실측(제보 4자산): 미등기 플래그가 반영되지 않아 **9,902,200원 과대**.
 *
 * ## ⛔ 자동 갱신하지 않는다
 *
 * 원본이 바뀌었다고 `property.form`을 조용히 덮으면 **합산 화면에서 사용자가 직접 고친 값이
 * 사라진다**(그 편집 경로는 정상 동작한다 — 실측). 반드시 **명시적 재편입**만 제공한다.
 *
 * ## 판정 결과는 store에 넣지 않는다
 *
 * 파생값이라 `MultiTransferFormData`에 넣으면 `partialize`가 세션에 persist하고 다건
 * 자동저장 `inputData`를 타고 **이력 record에까지 저장**된다. ⇒ 이 컴포넌트의 지역 state.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import {
  detectStaleSources,
  type StaleSourceInfo,
} from "@/lib/calc/transfer-multi-load-entry";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";

interface Props {
  properties: PropertyItem[];
  taxYear: number;
  /** 원본의 현재 입력으로 되불러온다 — 합산 화면의 로컬 편집을 덮는다 */
  onReload: (propertyId: string) => void;
  /** 폼은 그대로 두고 기준선만 확정한다 — 배너를 닫는 수단 */
  onAdopt: (propertyId: string) => void;
}

export function StaleSourceBanner({ properties, taxYear, onReload, onAdopt }: Props) {
  const [infos, setInfos] = useState<StaleSourceInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    void detectStaleSources(properties, taxYear).then((found) => {
      if (!cancelled) setInfos(found);
    });
    return () => {
      cancelled = true;
    };
  }, [properties, taxYear]);

  if (infos.length === 0) return null;

  const changed = infos.filter((i) => i.reason === "source_changed");
  const unknown = infos.filter((i) => i.reason === "unknown");

  return (
    <ToneCard tone="amber" title="원본 이력과 동기화 확인이 필요합니다" bodyClassName="space-y-3">
      {changed.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm">
            아래 자산은 <strong>합산에 넣은 뒤 원본 계산이 변경</strong>되었습니다. 지금 합산은{" "}
            <strong>편입 시점의 값</strong>으로 계산됩니다.
          </p>
          {changed.map((i) => (
            <Row key={i.propertyId} info={i} onReload={onReload} onAdopt={onAdopt} />
          ))}
        </div>
      )}

      {unknown.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm">
            아래 자산은 이력에서 불러온 <strong>사본</strong>입니다. 원본과 같은지{" "}
            <strong>확인할 수 없습니다</strong>.
          </p>
          {unknown.map((i) => (
            <Row key={i.propertyId} info={i} onReload={onReload} onAdopt={onAdopt} />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        「다시 불러오기」는 <strong>합산 화면에서 고친 내용을 덮어씁니다</strong>. 단건 화면에서
        고쳤다면 그 화면에서 <strong>계산까지</strong> 해야 이력이 갱신됩니다.
      </p>
    </ToneCard>
  );
}

function Row({
  info,
  onReload,
  onAdopt,
}: {
  info: StaleSourceInfo;
  onReload: (propertyId: string) => void;
  onAdopt: (propertyId: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-white/60 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/20">
      <span className="text-sm font-medium">{info.propertyLabel}</span>
      <div className="flex items-center gap-2">
        {info.blockedByTaxYear !== undefined ? (
          // 재편입하면 엔진 validateInput이 「양도일 연도가 과세기간과 다릅니다」로 예외를 던진다.
          <span className="text-xs text-amber-700 dark:text-amber-300">
            원본이 {info.blockedByTaxYear}년으로 바뀌어 불러올 수 없습니다
          </span>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={() => onReload(info.propertyId)}>
            다시 불러오기
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={() => onAdopt(info.propertyId)}>
          그대로 두기
        </Button>
      </div>
    </div>
  );
}
