"use client";

/**
 * 다종목 합산신고 — 확정된 종목 목록
 *
 * 계획서: docs/02-design/features/foreign-stock-118-6-limit-bc-apportionment.plan.md (Phase 5)
 *
 * ## 왜 목록과 편집기를 나누는가
 *
 * 주식 폼은 240개 넘는 필드가 **한 종목**을 서술한다. 종목 카드를 여러 개 펼쳐 두면 화면이
 * 감당하지 못하므로, 편집은 아래 입력 영역에서 **한 번에 한 종목**만 하고 확정한 종목은
 * 여기에 요약 카드로 쌓는다.
 *
 * ## 왜 다종목이 필요한가 (법령)
 *
 * · **§103①2호** — 기본공제 250만원이 주식 그룹 **연 1회**다. 종목별로 따로 계산하면 중복 공제된다.
 * · **§102②** — 양도차손이 종목 간에 통산된다.
 * · **§118의6①1호** — 국외 종목의 외국납부세액 공제한도 `A × B / C`는 그 과세기간 국외자산
 *   **전체**의 양도소득금액을 알아야 계산된다.
 *
 * 별지 제84호서식 작성요령 7번: 「주식은 … **국내ㆍ국외주식 양도소득금액 통산액**에서 연 250만원을 공제」
 */

import { Button } from "@/components/ui/button";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

const MARKET_LABEL: Record<string, string> = {
  kospi: "코스피",
  kosdaq: "코스닥",
  konex: "코넥스",
  unlisted: "비상장",
  other_asset: "기타자산",
  foreign_stock: "해외",
  exit_tax: "국외전출",
  "": "미선택",
};

/** 종목 1건 요약 — 목록 카드에 보일 최소 정보 */
function itemSummary(f: StockTransferFormData): string {
  const parts: string[] = [];
  if (f.shareCount) parts.push(`${Number(f.shareCount).toLocaleString()}주`);
  if (f.transferDate) parts.push(`${f.transferDate} 양도`);
  if (f.marketType === "foreign_stock" && f.fgCountryCode) parts.push(f.fgCountryCode);
  return parts.join(" · ");
}

export function StockItemListCard({
  savedItems,
  onAddCurrent,
  onEdit,
  onRemove,
  canAddCurrent,
  addDisabledReason,
  /**
   * 확정 버튼 노출 여부.
   *
   * 🔑 **기본은 false다.** 양도가액·취득가액은 2단계, 필요경비·신고는 3단계에서 입력하므로
   * 1단계에서 확정하면 **금액이 빈 종목**이 목록에 들어간다. 확정 버튼은 마지막 입력 단계에만 둔다.
   */
  showAddButton = false,
  incompleteIndexes = [],
}: {
  savedItems: StockTransferFormData[];
  onAddCurrent: () => void;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
  canAddCurrent: boolean;
  addDisabledReason?: string;
  showAddButton?: boolean;
  /**
   * 입력이 덜 끝난 확정 종목의 인덱스.
   *
   * 확정 게이트는 종목명·시장 2개뿐이라 **금액도 날짜도 빈 종목**이 목록에 남을 수 있다.
   * 그대로 계산하면 엔진이 터지므로(V-3 실측) 계산 전에 차단하는데, **어느 종목인지**는
   * 목록에서 바로 보여야 한다.
   */
  incompleteIndexes?: number[];
}) {
  const total = savedItems.length + 1; // 목록 + 편집 중 1건

  return (
    <ToneCard tone="sky" title={`양도 종목 (${total}건)`}>
      <p className="text-xs text-muted-foreground">
        같은 과세기간에 여러 종목을 양도했다면 종목을 추가하세요. 기본공제 250만원은{" "}
        <strong>국내·국외주식을 통산한 금액에서 연 1회</strong> 적용됩니다(소득세법 §103①2호).
      </p>

      {savedItems.length > 0 && (
        <ul className="space-y-2">
          {savedItems.map((f, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-2 rounded-md border border-sky-200 bg-white/70 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  <span className="mr-1.5 rounded bg-sky-100 px-1.5 py-0.5 text-micro font-semibold text-sky-700">
                    {MARKET_LABEL[f.marketType] ?? f.marketType}
                  </span>
                  {f.securityName || "(종목명 미입력)"}
                  {incompleteIndexes.includes(i) && (
                    <span className="ml-1.5 rounded bg-rose-100 px-1.5 py-0.5 text-micro font-semibold text-rose-700">
                      입력 미완료
                    </span>
                  )}
                </p>
                {itemSummary(f) && (
                  <p className="truncate text-caption text-muted-foreground">{itemSummary(f)}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => onEdit(i)}
                  data-testid={`stock-item-edit-${i}`}
                >
                  편집
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => onRemove(i)}
                  data-testid={`stock-item-remove-${i}`}
                >
                  삭제
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-md border border-dashed border-sky-300 bg-white/50 px-3 py-2">
        <p className="text-caption text-muted-foreground">
          아래 입력 영역이 <strong>{savedItems.length + 1}번째 종목</strong>입니다.
        </p>
      </div>

      {showAddButton && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onAddCurrent}
            disabled={!canAddCurrent}
            title={!canAddCurrent ? addDisabledReason : undefined}
            data-testid="stock-item-add"
          >
            + 이 종목을 확정하고 다음 종목 입력
          </Button>
          {!canAddCurrent && addDisabledReason && (
            <p className="text-caption text-amber-700">{addDisabledReason}</p>
          )}
        </>
      )}
    </ToneCard>
  );
}
