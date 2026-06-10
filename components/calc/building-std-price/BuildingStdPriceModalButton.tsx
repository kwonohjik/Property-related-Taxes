"use client";

/**
 * 마법사 통합용 "건물 기준시가 계산" 버튼 (Phase G — U-06·U-07).
 * Dialog에 BuildingStdPriceForm + 결과를 띄우고, 시점별 standardPrice를 onApply로 주입.
 * 독립 페이지와 동일 폼 재사용(DRY). 주입 후 사용자 수정 가능(기존 단일 필드 동기화 경로 사용).
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BuildingStdPriceForm } from "./BuildingStdPriceForm";
import { BuildingStdPriceResultCard } from "./BuildingStdPriceResultCard";
import type { BuildingStandardPriceResult } from "@/lib/tax-engine/building-standard-price";

interface Props {
  /** 선택한 시점의 건물 기준시가(원, 정수)를 받아 대상 필드에 주입 */
  onApply: (standardPrice: number) => void;
  buttonLabel?: string;
}

const fmt = (n: number) => n.toLocaleString("ko-KR");

export function BuildingStdPriceModalButton({ onApply, buttonLabel = "건물 기준시가 계산" }: Props) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<BuildingStandardPriceResult | null>(null);
  const [floorArea, setFloorArea] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const apply = (v: number) => {
    onApply(v);
    setOpen(false);
    setResult(null);
    setError(null);
  };

  return (
    <>
      <Button type="button" variant="outline" size="xs" onClick={() => setOpen(true)}>
        {buttonLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>건물 기준시가 계산</DialogTitle>
            <DialogDescription>
              계산 후 적용할 시점의 금액을 선택하면 입력 필드에 채워집니다.
            </DialogDescription>
          </DialogHeader>

          <BuildingStdPriceForm
            onResult={(r, fa, err) => {
              setResult(r);
              setFloorArea(fa);
              setError(err);
            }}
          />

          {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          {result && (
            <div className="space-y-3 border-t pt-3">
              <BuildingStdPriceResultCard result={result} floorArea={floorArea} />
              <div className="flex flex-wrap gap-2">
                {result.valuation && (
                  <Button type="button" size="sm" onClick={() => apply(result.valuation!.standardPrice)}>
                    이 금액 적용 ({fmt(result.valuation.standardPrice)})
                  </Button>
                )}
                {result.acquisition && (
                  <Button type="button" size="sm" variant="secondary" onClick={() => apply(result.acquisition!.standardPrice)}>
                    취득시 적용 ({fmt(result.acquisition.standardPrice)})
                  </Button>
                )}
                {result.transfer && (
                  <Button type="button" size="sm" onClick={() => apply(result.transfer!.standardPrice)}>
                    양도시 적용 ({fmt(result.transfer.standardPrice)})
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
