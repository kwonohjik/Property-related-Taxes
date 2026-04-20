"use client";

import { Plus, Trash2, Copy, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";

interface AssetTabBarProps {
  properties: PropertyItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onDuplicate: (index: number) => void;
  onRemove: (index: number) => void;
  maxCount?: number;
}

export function AssetTabBar({
  properties,
  activeIndex,
  onSelect,
  onAdd,
  onDuplicate,
  onRemove,
  maxCount = 20,
}: AssetTabBarProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2 items-center">
        {properties.map((p, i) => (
          <AssetTab
            key={p.propertyId}
            item={p}
            index={i}
            isActive={i === activeIndex}
            onSelect={() => onSelect(i)}
            onDuplicate={() => onDuplicate(i)}
            onRemove={() => onRemove(i)}
            canRemove={properties.length > 1}
          />
        ))}
        {properties.length < maxCount && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1 text-muted-foreground border-dashed"
            onClick={onAdd}
          >
            <Plus className="h-3.5 w-3.5" />
            양도 건 추가
          </Button>
        )}
      </div>
      {properties.length >= maxCount && (
        <p className="text-xs text-muted-foreground">최대 {maxCount}건까지 입력 가능합니다.</p>
      )}
    </div>
  );
}

interface AssetTabProps {
  item: PropertyItem;
  index: number;
  isActive: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  canRemove: boolean;
}

function AssetTab({
  item,
  isActive,
  onSelect,
  onDuplicate,
  onRemove,
  canRemove,
}: AssetTabProps) {
  const pct = item.completionPercent;
  const isReady = pct >= 80;

  return (
    <div
      className={`group relative flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
        isActive
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/50 hover:bg-muted/50"
      }`}
      onClick={onSelect}
    >
      {/* 완성도 인디케이터 */}
      <div className="flex flex-col items-center gap-0.5">
        <div
          className={`w-1.5 h-6 rounded-full ${isReady ? "bg-green-500" : "bg-amber-400"}`}
          style={{ opacity: pct / 100 + 0.3 }}
        />
      </div>

      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium truncate max-w-[120px]">{item.propertyLabel}</span>
        <div className="flex items-center gap-1">
          <Badge
            variant={isReady ? "default" : "secondary"}
            className="text-[10px] px-1 py-0 h-4"
          >
            {pct}%
          </Badge>
        </div>
      </div>

      {/* 액션 버튼 (hover 시 표시) */}
      <div
        className="hidden group-hover:flex items-center gap-0.5 ml-1"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          title="복제"
          onClick={onDuplicate}
        >
          <Copy className="h-3 w-3" />
        </Button>
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-destructive hover:text-destructive"
            title="삭제"
            onClick={onRemove}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>

      {isActive && <ChevronRight className="h-3.5 w-3.5 text-primary ml-auto" />}
    </div>
  );
}
