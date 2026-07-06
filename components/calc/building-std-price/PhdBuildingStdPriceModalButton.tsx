"use client";

/**
 * PHD 3시점 건물기준시가 "일괄 계산" 버튼 (양도 §164⑤).
 *
 * 같은 건물이므로 구조·용도·연면적·신축연도를 1회 입력하고, 취득·최초공시·양도 3시점의
 * ㎡당 공시지가(위젯에서 prefill)로 시점별 건물기준시가를 일괄 산출한다.
 * "모두 적용" 시 산출된 시점만 부모 3필드에 주입(미산출 시점은 미변경 → 수동값 보존).
 *
 * 산출 규칙: lib/calc/phd-building-std-batch.ts (≤2000 최초공시는 고시표 부재로 미지원).
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { BuildingStructureSelect } from "./BuildingStructureSelect";
import { BuildingUsageSelect } from "./BuildingUsageSelect";
import {
  computePhdThreePointStdPrice,
  type PhdBatchResult,
} from "@/lib/calc/phd-building-std-batch";

/** 시점별 적용 결과 — 산출된 시점만 채워짐(원 정수) */
export interface PhdThreePointApply {
  acquisition?: number;
  firstDisclosure?: number;
  transfer?: number;
}

interface PointMeta {
  key: "acquisition" | "firstDisclosure" | "transfer";
  label: string;
  year: number | undefined;
  /** ㎡당 공시지가 prefill(문자열) */
  landPricePerM2: string;
}

interface Props {
  /** 시점 3종 메타(연도·공시지가 prefill). 연도 미상 시점은 계산 제외. */
  points: PointMeta[];
  onApply: (v: PhdThreePointApply) => void;
  buttonLabel?: string;
}

const fmt = (n: number) => n.toLocaleString("ko-KR");
const POINT_LABEL: Record<PointMeta["key"], string> = {
  acquisition: "취득시",
  firstDisclosure: "최초공시일",
  transfer: "양도시",
};

export function PhdBuildingStdPriceModalButton({
  points,
  onApply,
  buttonLabel = "3시점 건물기준시가 일괄 계산",
}: Props) {
  const [open, setOpen] = useState(false);
  // 건물 정보(3시점 공통)
  const [structureKey, setStructureKey] = useState("");
  const [usageNo, setUsageNo] = useState("");
  const [floorArea, setFloorArea] = useState("");
  const [builtYear, setBuiltYear] = useState("");
  // 시점별 공시지가(원/㎡) — prefill 초기값
  const [landPrices, setLandPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(points.map((p) => [p.key, p.landPricePerM2])),
  );
  const [result, setResult] = useState<PhdBatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 구조·용도 옵션 기준 연도 — 최근(양도) 우선(옵션 커버리지 안전)
  const optionYear =
    points.find((p) => p.key === "transfer")?.year ??
    points.find((p) => p.key === "firstDisclosure")?.year ??
    points.find((p) => p.key === "acquisition")?.year;

  function handleCalc() {
    setError(null);
    setResult(null);
    const area = parseDecimal(floorArea);
    const built = Math.floor(parseDecimal(builtYear));
    if (!structureKey || !usageNo || area <= 0 || built <= 0) {
      setError("구조·용도·연면적·신축연도를 모두 입력하세요.");
      return;
    }
    const building = { structureKey, usageNo: Number(usageNo), floorArea: area, builtYear: built };
    const pt = (key: PointMeta["key"]) => {
      const p = points.find((x) => x.key === key);
      if (!p || !p.year) return undefined;
      const land = parseAmount(landPrices[key] ?? "") ?? 0;
      if (land <= 0) return undefined;
      return { year: p.year, landPricePerM2: land };
    };
    try {
      setResult(
        computePhdThreePointStdPrice({
          building,
          acquisition: pt("acquisition"),
          firstDisclosure: pt("firstDisclosure"),
          transfer: pt("transfer"),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "계산 실패");
    }
  }

  function handleApplyAll() {
    if (!result) return;
    onApply({
      acquisition: result.acquisition,
      firstDisclosure: result.firstDisclosure,
      transfer: result.transfer,
    });
    setOpen(false);
    setResult(null);
  }

  const computedCount = result
    ? [result.acquisition, result.firstDisclosure, result.transfer].filter((v) => v != null).length
    : 0;

  // 모달 열 때 현재 위젯 공시지가로 재시드(지연 초기화는 최초 1회뿐 → 신규 입력 stale 방지).
  function handleOpen() {
    setLandPrices(Object.fromEntries(points.map((p) => [p.key, p.landPricePerM2])));
    setResult(null);
    setError(null);
    setOpen(true);
  }

  return (
    <>
      <Button type="button" variant="outline" size="xs" onClick={handleOpen}>
        {buttonLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[88vh] overflow-y-auto sm:max-w-[min(44rem,calc(100%-2rem))] w-full shadow-2xl"
          overlayClassName="bg-black/60"
          forceOverlay
        >
          <DialogHeader>
            <DialogTitle>3시점 건물 기준시가 일괄 계산</DialogTitle>
            <DialogDescription>
              같은 건물의 구조·용도·연면적을 한 번 입력하면 취득·최초공시·양도 3시점 건물기준시가를
              함께 산출합니다. 계산 후 “모두 적용”을 누르면 각 시점 필드에 채워집니다.
            </DialogDescription>
          </DialogHeader>

          {/* 건물 정보(공통) */}
          <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/40 p-3">
            <p className="text-xs font-semibold text-sky-700">건물 정보 (3시점 공통)</p>
            <div className="grid grid-cols-2 gap-2">
              <FieldCard label="구조" hint="국세청 구조지수표">
                <BuildingStructureSelect year={optionYear} value={structureKey} onChange={setStructureKey} />
              </FieldCard>
              <FieldCard label="용도" hint="국세청 용도지수표">
                <BuildingUsageSelect year={optionYear} value={usageNo} onChange={setUsageNo} />
              </FieldCard>
              <FieldCard label="연면적" unit="㎡">
                <DecimalInput value={floorArea} onChange={setFloorArea} placeholder="건물 연면적" />
              </FieldCard>
              <FieldCard label="신축연도" hint="준공연도 4자리">
                <DecimalInput value={builtYear} onChange={setBuiltYear} placeholder="신축연도 (4자리)" />
              </FieldCard>
            </div>
          </div>

          {/* 시점별 공시지가 */}
          <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
            <p className="text-xs font-semibold text-violet-700">시점별 개별공시지가 (위치지수)</p>
            {points.map((p) => (
              <FieldCard
                key={p.key}
                label={`${POINT_LABEL[p.key]}${p.year ? ` (${p.year}년)` : " (연도 미상)"} 공시지가`}
                unit="원/㎡"
                hint={p.year ? undefined : "해당 시점 날짜 미입력 — 계산 제외"}
              >
                <CurrencyInput
                  label=""
                  hideUnit
                  value={landPrices[p.key] ?? ""}
                  onChange={(v) => setLandPrices((s) => ({ ...s, [p.key]: v }))}
                  placeholder="원/㎡"
                />
              </FieldCard>
            ))}
          </div>

          <Button type="button" size="sm" onClick={handleCalc}>
            3시점 계산하기
          </Button>

          {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          {result && (
            <div className="space-y-2 border-t pt-3">
              {(["acquisition", "firstDisclosure", "transfer"] as const).map((k) => {
                const v = result[k];
                return (
                  <div key={k} className="flex justify-between text-sm">
                    <span>{POINT_LABEL[k]} 건물기준시가</span>
                    <span className="font-mono tabular-nums font-semibold">
                      {v != null ? `${fmt(v)} 원` : "—"}
                    </span>
                  </div>
                );
              })}
              {result.unsupported.map((u, i) => (
                <p key={i} className="rounded bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs text-amber-800">
                  {POINT_LABEL[u.point]} 미산출 — {u.reason}
                </p>
              ))}
              <Button type="button" size="sm" onClick={handleApplyAll} disabled={computedCount === 0}>
                모두 적용 ({computedCount}개 시점)
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
