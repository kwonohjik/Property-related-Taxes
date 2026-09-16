"use client";

/**
 * 다건 양도세 마법사의 **Step A(자산 목록)·Step B(자산 편집)** 프레젠테이션 컴포넌트.
 *
 * `MultiTransferTaxCalculator.tsx`가 767줄로 위험구간(≥750)에 들어가 분리했다
 * (루트 CLAUDE.md 「기회주의적 분리」 — 트리거 800·착지 ≤700). 두 컴포넌트 모두
 * **props만 받는 순수 렌더**라 상태·핸들러가 따라오지 않는다 — 이음매가 자연스럽다.
 *
 * ⚠️ 원본 변경 배너(`StaleSourceBanner`)는 **여기 있지 않다.** 단계마다 다른 자리에 놓이고
 *    핸들러가 오케스트레이터에 있어 호출부가 직접 렌더한다.
 */
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus } from "lucide-react";
import { NavButton } from "@/components/calc/shared/WizardNav";
import { AssetTabBar } from "@/components/calc/transfer/AssetTabBar";
import { ResetButton } from "@/components/calc/shared/ResetButton";
import { HomeButton } from "@/components/calc/shared/HomeButton";
import { ASSET_KIND_LABELS } from "@/components/calc/transfer/asset-labels";
import { areAllPropertiesReady } from "@/lib/calc/multi-transfer-tax-validate";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import TransferTaxCalculator from "../TransferTaxCalculator";

// ─── Step A: 자산 목록 ────────────────────────────────────────

interface StepListProps {
  properties: PropertyItem[];
  onAdd: () => void;
  onLoad: () => void;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
  onNext: () => void;
  onReset: () => void;
}

export function StepList({ properties, onAdd, onLoad, onEdit, onRemove, onNext, onReset }: StepListProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          동일 과세연도에 양도하는 모든 자산을 추가하세요. 최대 20건까지 입력 가능합니다.
        </p>
        <div className="flex items-center gap-2">
          <HomeButton confirmMessage="홈으로 이동하면 현재 입력 중인 값이 유지된 채 페이지를 떠납니다.&#10;계속하시겠습니까?" />
          <ResetButton onReset={onReset} />
        </div>
      </div>

      {properties.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-12 border-2 border-dashed border-border rounded-lg">
          <p className="text-muted-foreground text-sm">아직 추가된 자산이 없습니다.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={onAdd} className="gap-2">
              <Plus className="h-4 w-4" />
              첫 번째 양도 건 추가
            </Button>
            <Button type="button" variant="modalLauncher" onClick={onLoad} data-testid="multi-load-history-btn" className="gap-2">
              📂 이력에서 불러오기
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {properties.map((p, i) => (
            <Card key={p.propertyId} className="hover:border-primary/50 transition-colors">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{p.propertyLabel}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {(() => {
                        const kind = p.form.assets[0]?.assetKind;
                        return kind ? (ASSET_KIND_LABELS[kind] ?? kind) : "";
                      })()}
                    </Badge>
                    {p.form.transferDate && (
                      <span className="text-xs text-muted-foreground">
                        양도일: {p.form.transferDate}
                      </span>
                    )}
                    <Badge
                      variant={p.completionPercent >= 80 ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {p.completionPercent}%
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => onEdit(i)}>
                    편집
                  </Button>
                  {properties.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => onRemove(i)}
                    >
                      삭제
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {properties.length < 20 && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 gap-2 border-dashed"
                onClick={onAdd}
              >
                <Plus className="h-4 w-4" />
                양도 건 추가
              </Button>
              <Button
                type="button"
                variant="modalLauncher"
                className="gap-2"
                onClick={onLoad}
                data-testid="multi-load-history-btn"
              >
                📂 이력에서 불러오기
              </Button>
            </div>
          )}
        </div>
      )}

      {properties.length > 0 && !areAllPropertiesReady(properties) && (
        <Alert>
          <AlertDescription className="text-sm">
            일부 자산의 필수 정보가 입력되지 않았습니다. 모든 자산을 편집하여 필수 항목을 완성해 주세요.
          </AlertDescription>
        </Alert>
      )}

      {/* 자산 목록은 다건 마법사의 첫 단계 — 하단 좌측은 「이전」이 아니라 홈 pill이 정본
          (components/calc/CLAUDE.md 「홈으로 버튼 규칙」 — step 0 = HomeButton) */}
      <div className="flex items-center justify-between gap-2 pt-4">
        <HomeButton />
        <NavButton
          direction="next"
          label="공통 설정으로"
          disabled={properties.length === 0}
          onClick={onNext}
        />
      </div>
    </div>
  );
}

// ─── Step B: 자산 편집 (기존 단건 마법사 재사용) ─────────────
//
// ⚠️ **현재 어디서도 렌더되지 않는다.** 실제 편집 단계는 오케스트레이터가
//    `AssetTabBar` + `<TransferTaxCalculator>`를 직접 조립한다
//    (`MultiTransferTaxCalculator.tsx` — `form.activeStep === "edit"` 분기).
//    분리 작업에서 **발견만 하고 그대로 옮겼다**(관련 없는 dead code는 지우지 않는다 —
//    루트 CLAUDE.md 「Surgical Changes」). 제거는 별도 판단.

interface StepEditProps {
  properties: PropertyItem[];
  activeIndex: number;
  onSelectProperty: (i: number) => void;
  onRemove: (i: number) => void;
  onSaveAndBack: () => void;
  onAdd: () => void;
}

export function StepEdit({
  properties,
  activeIndex,
  onSelectProperty,
  onRemove,
  onSaveAndBack,
  onAdd,
}: StepEditProps) {
  return (
    <div className="space-y-4">
      {/* 자산 탭바 */}
      <AssetTabBar
        properties={properties}
        activeIndex={activeIndex}
        onSelect={onSelectProperty}
        onAdd={onAdd}
        onRemove={onRemove}
      />

      <div className="border rounded-lg p-1 bg-muted/20">
        {/* 기존 단건 마법사 재사용 */}
        <TransferTaxCalculator />
      </div>

      <div className="flex justify-between pt-2">
        <NavButton direction="prev" label="자산 목록으로" onClick={onSaveAndBack} />
      </div>
    </div>
  );
}
