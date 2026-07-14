"use client";

/**
 * PHD 3시점 건물기준시가 "일괄 계산" 버튼 (양도 §164⑤) — Phase 2 겸용(Option B).
 *
 * 같은 건물의 부분(층/구역)별 구조·용도·연면적을 입력하면 취득·최초공시·양도 3시점의
 * ㎡당 공시지가(위젯 prefill)로 시점별 건물기준시가를 일괄 산출한다.
 *  - housing(주택분)은 3시점, commercial(상가분)은 **양도시에만** 산출(Option B).
 *  - 층별 구조·용도 상이는 compositeParts로 합산. "모두 적용" 시 산출된 값만 부모 필드에 주입.
 *
 * 산출 규칙: lib/calc/phd-building-std-batch.ts (≤2000·당시 주택 용도 상가는 미산출·수동 유지).
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
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { BuildingStructureSelect } from "./BuildingStructureSelect";
import { BuildingUsageSelect } from "./BuildingUsageSelect";
import {
  computePhdThreePointStdPrice,
  type PhdBatchResult,
  type PhdBatchPart,
  type PhdBatchInput,
  type PhdPartCategory,
} from "@/lib/calc/phd-building-std-batch";
import { phdBatchToSnapshots } from "@/lib/calc/phd-batch-snapshots";
import { useBuildingStdSnapshotStore } from "@/lib/stores/building-std-snapshot-store";

/** 시점별 적용 결과 — 산출된 카테고리만 채워짐(원 정수) */
export interface PhdThreePointApply {
  acquisition?: { housing?: number; commercial?: number };
  firstDisclosure?: { housing?: number; commercial?: number };
  transfer?: { housing?: number; commercial?: number };
  /**
   * 시점별 입력 공시지가(원/㎡, 문자열) — 외부 3시점 섹션 되돌려쓰기용.
   * 값 입력된 시점만 포함. 취득≤2000 2001값 게이팅은 소비 측(applyBatch)에서 처리.
   */
  landPrices?: { acquisition?: string; firstDisclosure?: string; transfer?: string };
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
  /** 겸용주택 — 부분별 주택/상가 카테고리 입력 노출. 미설정=주택 단일(단독). */
  enableCommercial?: boolean;
  /**
   * Case A(용도변경 house_to_commercial + 최초공시<용도변경) — 취득·최초공시 상가건물도
   * 당시 주택 용도로 자동 산출. 상가 부분에 주택 대표 usageNo(acqFirstUsageNo) 주입.
   * 미설정(Case B·단독)=취득·최초공시 상가 미산출(수동).
   */
  commercialAcqFirstMode?: boolean;
  /**
   * 건물 기준시가 스냅샷 저장 접두(예: `bsp-${assetId}-phd`). 주입 시 "모두 적용" 시점에
   * 각 시점·카테고리를 스냅샷으로 재구성 저장 → 결과탭 「건물 기준시가 계산서」 재유도.
   * 미주입 시 스냅샷 저장 생략(종전 동작).
   */
  snapshotPrefix?: string;
  /**
   * 지번 주소 — 취득시(≤2000, 2001.1.1 기준) 개별공시지가 Vworld 조회 활성화 조건.
   * 미주입 시 조회 버튼만 비활성, 수동 입력은 유지.
   */
  jibun?: string;
  /**
   * 첫 부분(주택) 연면적 자동채움(문자열) — 겸용주택 주택분 등에서 상위 화면의 주택 연면적을
   * 모달 열 때 첫 행에 시드. 미주입 시 빈 값(종전 동작). 사용자 수정 가능.
   */
  housingFloorAreaPrefill?: string;
}

/** 편집 중 부분 행 — 시점별 구조·용도(연도 체계 상이) + 공통 연면적 */
interface PartRow {
  floorArea: string;
  category: PhdPartCategory;
  acqStructureKey: string;
  acqUsageNo: string;
  firstStructureKey: string;
  firstUsageNo: string;
  transferStructureKey: string;
  transferUsageNo: string;
}

const fmt = (n: number) => n.toLocaleString("ko-KR");
const POINT_LABEL: Record<PointMeta["key"], string> = {
  acquisition: "취득시",
  firstDisclosure: "최초공시일",
  transfer: "양도시",
};
const emptyRow = (category: PhdPartCategory = "housing"): PartRow => ({
  floorArea: "",
  category,
  acqStructureKey: "",
  acqUsageNo: "",
  firstStructureKey: "",
  firstUsageNo: "",
  transferStructureKey: "",
  transferUsageNo: "",
});

export function PhdBuildingStdPriceModalButton({
  points,
  onApply,
  buttonLabel,
  enableCommercial = false,
  commercialAcqFirstMode = false,
  snapshotPrefix,
  jibun,
  housingFloorAreaPrefill,
}: Props) {
  const [open, setOpen] = useState(false);
  const [builtYear, setBuiltYear] = useState("");
  const [rows, setRows] = useState<PartRow[]>([emptyRow()]);
  // 시점별 공시지가(원/㎡)
  const [landPrices, setLandPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(points.map((p) => [p.key, p.landPricePerM2])),
  );
  const [result, setResult] = useState<PhdBatchResult | null>(null);
  // 마지막 계산에 쓴 입력 — "모두 적용" 시 스냅샷 재구성용
  const [computedInput, setComputedInput] = useState<PhdBatchInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const replaceSnapshotsByPrefix = useBuildingStdSnapshotStore((s) => s.replaceSnapshotsByPrefix);

  // 시점별 구조·용도 옵션 기준 연도 — 각 시점의 연도 체계. ≤2000은 2001 체계(엔진 acqBase가 2001표 사용).
  const yearOf = (k: PointMeta["key"]) => points.find((p) => p.key === k)?.year;
  const schemeYear = (y: number | undefined) => (y != null && y <= 2000 ? 2001 : y);
  const acqOptionYear = schemeYear(yearOf("acquisition"));
  const firstOptionYear = schemeYear(yearOf("firstDisclosure"));
  const transferOptionYear = schemeYear(yearOf("transfer"));

  const label =
    buttonLabel ??
    (enableCommercial ? "3시점 주택·상가 건물기준시가 일괄 계산" : "3시점 건물기준시가 일괄 계산");
  // 단독은 상가 구분이 없어 "주택건물"이 아닌 "건물"로 표기(겸용만 주택/상가 구분).
  const housingNoun = enableCommercial ? "주택건물" : "건물";

  function updateRow(idx: number, patch: Partial<PartRow>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function handleCalc() {
    setError(null);
    setResult(null);
    setComputedInput(null);
    const built = Math.floor(parseDecimal(builtYear));
    if (built <= 0) {
      setError("신축연도를 입력하세요.");
      return;
    }
    const at = (sk: string, uno: string) =>
      sk && uno ? { structureKey: sk, usageNo: Number(uno) } : undefined;
    const parts: PhdBatchPart[] = [];
    for (const r of rows) {
      const area = parseDecimal(r.floorArea);
      const transfer = at(r.transferStructureKey, r.transferUsageNo);
      if (!transfer || area <= 0) {
        setError("각 부분의 양도당시 구조·용도·연면적을 입력하세요.");
        return;
      }
      // 취득·최초공시 구조·용도는 주택 부분에서만(상가는 UI 숨김 → Case A 자동주입/Case B 미산출).
      // 카테고리 전환 시 잔존값 누수 방지.
      const isHousing = r.category === "housing";
      parts.push({
        floorArea: area,
        category: r.category,
        transfer,
        acquisition: isHousing ? at(r.acqStructureKey, r.acqUsageNo) : undefined,
        firstDisclosure: isHousing ? at(r.firstStructureKey, r.firstUsageNo) : undefined,
      });
    }
    // Case A: 취득·최초공시 상가 = 당시 주택 구조·용도(주된 주택 행) 주입 → 자동 산출 활성
    if (commercialAcqFirstMode) {
      const firstHousing = parts.find((p) => p.category === "housing");
      if (firstHousing) {
        for (const p of parts) {
          if (p.category === "commercial") {
            p.acquisition = firstHousing.acquisition;
            p.firstDisclosure = firstHousing.firstDisclosure;
          }
        }
      }
    }
    const pt = (key: PointMeta["key"]) => {
      const p = points.find((x) => x.key === key);
      if (!p || !p.year) return undefined;
      const land = parseAmount(landPrices[key] ?? "") ?? 0;
      if (land <= 0) return undefined;
      return { year: p.year, landPricePerM2: land };
    };
    try {
      const input: PhdBatchInput = {
        building: { builtYear: built, parts },
        acquisition: pt("acquisition"),
        firstDisclosure: pt("firstDisclosure"),
        transfer: pt("transfer"),
      };
      setComputedInput(input);
      setResult(computePhdThreePointStdPrice(input));
    } catch (e) {
      setError(e instanceof Error ? e.message : "계산 실패");
    }
  }

  function handleApplyAll() {
    if (!result) return;
    // 산출 근거 스냅샷 저장(재구성) — 결과탭 「건물 기준시가 계산서」 재유도용. prefix 미주입 시 생략.
    if (snapshotPrefix && computedInput) {
      replaceSnapshotsByPrefix(snapshotPrefix, phdBatchToSnapshots(computedInput, snapshotPrefix));
    }
    // 입력된 시점 공시지가만 외부 섹션으로 되돌려쓰기(빈값은 외부 미변경).
    const lp: NonNullable<PhdThreePointApply["landPrices"]> = {};
    if ((landPrices.acquisition ?? "").trim()) lp.acquisition = landPrices.acquisition;
    if ((landPrices.firstDisclosure ?? "").trim()) lp.firstDisclosure = landPrices.firstDisclosure;
    if ((landPrices.transfer ?? "").trim()) lp.transfer = landPrices.transfer;
    onApply({
      acquisition: result.acquisition,
      firstDisclosure: result.firstDisclosure,
      transfer: result.transfer,
      landPrices: lp,
    });
    setOpen(false);
    setResult(null);
  }

  const computedCount = result
    ? [
        result.acquisition?.housing,
        result.firstDisclosure?.housing,
        result.transfer?.housing,
        result.acquisition?.commercial,
        result.firstDisclosure?.commercial,
        result.transfer?.commercial,
      ].filter((v) => v != null).length
    : 0;

  // 모달 열 때 현재 위젯 공시지가로 재시드(지연 초기화는 최초 1회뿐 → 신규 입력 stale 방지).
  function handleOpen() {
    setLandPrices(Object.fromEntries(points.map((p) => [p.key, p.landPricePerM2])));
    // 첫 부분(주택)에 상위 화면 주택 연면적 자동채움(있으면). 사용자 수정 가능.
    setRows([{ ...emptyRow(), floorArea: housingFloorAreaPrefill ?? "" }]);
    setBuiltYear("");
    setResult(null);
    setComputedInput(null);
    setError(null);
    setOpen(true);
  }

  return (
    <>
      <Button type="button" variant="modalLauncher" size="xs" onClick={handleOpen}>
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[88vh] overflow-y-auto sm:max-w-[min(46rem,calc(100%-2rem))] w-full shadow-2xl"
          overlayClassName="bg-black/60"
          forceOverlay
        >
          <DialogHeader>
            <DialogTitle>3시점 건물 기준시가 일괄 계산</DialogTitle>
            <DialogDescription>
              {enableCommercial
                ? "층/구역별 구조·용도·연면적을 입력하면 취득·최초공시·양도 3시점 주택분 건물기준시가와 양도시 상가분을 함께 산출합니다."
                : "같은 건물의 층/구역별 구조·용도·연면적을 입력하면 취득·최초공시·양도 3시점 건물기준시가를 함께 산출합니다."}{" "}
              계산 후 “모두 적용”을 누르면 각 시점 필드에 채워집니다.
            </DialogDescription>
          </DialogHeader>

          {/* 신축연도(건물 공통) */}
          <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/40 p-3">
            <p className="text-xs font-semibold text-sky-700">건물 정보 (3시점 공통)</p>
            <FieldCard label="신축연도" hint="준공연도 4자리">
              <DecimalInput value={builtYear} onChange={setBuiltYear} placeholder="신축연도 (4자리)" />
            </FieldCard>
          </div>

          {/* 부분(층/구역) 목록 */}
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-amber-700">
                {enableCommercial ? "부분(층/구역) — 구조·용도·연면적·구분" : "부분(층/구역) — 구조·용도·연면적"}
              </p>
              <Button type="button" variant="outline" size="xs" onClick={() => setRows((rs) => [...rs, emptyRow(rs.length ? rs[rs.length - 1].category : "housing")])}>
                + 부분 추가
              </Button>
            </div>
            {rows.map((row, idx) => (
              <div key={idx} className="space-y-2 rounded-md border border-amber-200/60 bg-white/50 p-2">
                {(enableCommercial || rows.length > 1) && (
                  <div className="flex items-center justify-between gap-2">
                    {enableCommercial ? (
                      <div className="inline-flex overflow-hidden rounded-md border border-amber-300 text-xs">
                        {(["housing", "commercial"] as const).map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => updateRow(idx, { category: cat })}
                            className={`px-3 py-1 ${row.category === cat ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-800"}`}
                          >
                            {cat === "housing" ? "주택" : "상가"}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="text-caption font-medium text-amber-700">부분 {idx + 1}</span>
                    )}
                    {rows.length > 1 && (
                      <Button type="button" variant="ghost" size="xs" onClick={() => setRows((rs) => rs.filter((_, i) => i !== idx))}>
                        삭제
                      </Button>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  {/* 취득당시 (취득 연도 체계) — 주택만. 상가 취득·최초공시는 Case A 주택값 자동/Case B 미산출 → 숨김 */}
                  {row.category === "housing" && acqOptionYear != null && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-2 space-y-2">
                      <p className="text-caption font-semibold text-amber-700">취득당시 (구조·용도 — {acqOptionYear}년 체계)</p>
                      <div className="grid grid-cols-2 gap-2">
                        <FieldCard label="구조">
                          <BuildingStructureSelect year={acqOptionYear} value={row.acqStructureKey} onChange={(v) => updateRow(idx, { acqStructureKey: v })} />
                        </FieldCard>
                        <FieldCard label="용도">
                          <BuildingUsageSelect year={acqOptionYear} value={row.acqUsageNo} onChange={(v) => updateRow(idx, { acqUsageNo: v })} />
                        </FieldCard>
                      </div>
                    </div>
                  )}
                  {/* 최초공시 (최초공시 연도 체계) — 주택만(상가 사유 위와 동일) */}
                  {row.category === "housing" && firstOptionYear != null && (
                    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-2 space-y-2">
                      <p className="text-caption font-semibold text-violet-700">최초공시 (구조·용도 — {firstOptionYear}년 체계)</p>
                      <div className="grid grid-cols-2 gap-2">
                        <FieldCard label="구조">
                          <BuildingStructureSelect year={firstOptionYear} value={row.firstStructureKey} onChange={(v) => updateRow(idx, { firstStructureKey: v })} />
                        </FieldCard>
                        <FieldCard label="용도">
                          <BuildingUsageSelect year={firstOptionYear} value={row.firstUsageNo} onChange={(v) => updateRow(idx, { firstUsageNo: v })} />
                        </FieldCard>
                      </div>
                    </div>
                  )}
                  {/* 양도당시 (양도 연도 체계) — 항상 */}
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2 space-y-2">
                    <p className="text-caption font-semibold text-emerald-700">양도당시 (구조·용도 — {transferOptionYear}년 체계)</p>
                    <div className="grid grid-cols-2 gap-2">
                      <FieldCard label="구조">
                        <BuildingStructureSelect year={transferOptionYear} value={row.transferStructureKey} onChange={(v) => updateRow(idx, { transferStructureKey: v })} />
                      </FieldCard>
                      <FieldCard label="용도">
                        <BuildingUsageSelect year={transferOptionYear} value={row.transferUsageNo} onChange={(v) => updateRow(idx, { transferUsageNo: v })} />
                      </FieldCard>
                    </div>
                  </div>
                  <FieldCard label="연면적" unit="㎡">
                    <DecimalInput value={row.floorArea} onChange={(v) => updateRow(idx, { floorArea: v })} placeholder="연면적" />
                  </FieldCard>
                </div>
              </div>
            ))}
          </div>

          {/* 시점별 공시지가 */}
          <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
            <p className="text-xs font-semibold text-violet-700">시점별 개별공시지가 (위치지수)</p>
            {points.map((p) => {
              // 취득시 ≤2000 = 2001.1.1 기준(§164⑤ 산정기준율) → Vworld 2001 자동조회 행
              const isAcqPre2001 =
                p.key === "acquisition" && p.year != null && p.year <= 2000;
              if (isAcqPre2001) {
                return (
                  <div key={p.key} className="space-y-1">
                    {/* 시점 식별 라벨 — LandPriceLookupField가 제공하지 않으므로 별도 서브헤딩 */}
                    <p className="text-caption font-semibold text-violet-700">
                      취득시 (2001년 기준) 공시지가
                    </p>
                    <LandPriceLookupField
                      fixedYear={2001}
                      hideLandStdPrice
                      jibun={jibun}
                      pricePerSqm={landPrices[p.key] ?? ""}
                      onPricePerSqmChange={(v) =>
                        setLandPrices((s) => ({ ...s, [p.key]: v }))
                      }
                      placeholder="2001.1.1. 현재 공시지가"
                    />
                  </div>
                );
              }
              return (
                <FieldCard
                  key={p.key}
                  label={`${POINT_LABEL[p.key]}${
                    p.year ? ` (${p.year}년)` : " (연도 미상)"
                  } 공시지가`}
                  unit="원/㎡"
                  hint={!p.year ? "해당 시점 날짜 미입력 — 계산 제외" : undefined}
                >
                  <CurrencyInput
                    label=""
                    hideUnit
                    value={landPrices[p.key] ?? ""}
                    onChange={(v) => setLandPrices((s) => ({ ...s, [p.key]: v }))}
                    placeholder="원/㎡"
                  />
                </FieldCard>
              );
            })}
          </div>

          <Button type="button" size="sm" onClick={handleCalc}>
            3시점 계산하기
          </Button>

          {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          {result && (
            <div className="space-y-2 border-t pt-3">
              {(["acquisition", "firstDisclosure", "transfer"] as const).map((k) => {
                const pr = result[k];
                return (
                  <div key={k} className="space-y-0.5">
                    <div className="flex justify-between text-sm">
                      <span>{POINT_LABEL[k]} {housingNoun} 기준시가</span>
                      <span className="font-mono tabular-nums font-semibold">
                        {pr?.housing != null ? `${fmt(pr.housing)} 원` : "—"}
                      </span>
                    </div>
                    {enableCommercial && (k === "transfer" || commercialAcqFirstMode) && (
                      <div className="flex justify-between text-sm">
                        <span>{POINT_LABEL[k]} 상가건물 기준시가</span>
                        <span className="font-mono tabular-nums font-semibold">
                          {pr?.commercial != null ? `${fmt(pr.commercial)} 원` : "—"}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
              {result.unsupported.map((u, i) => (
                <p key={i} className="rounded bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs text-amber-800">
                  {POINT_LABEL[u.point]} {u.category === "commercial" ? "상가건물" : housingNoun} 미산출 — {u.reason}
                </p>
              ))}
              <Button type="button" size="sm" onClick={handleApplyAll} disabled={computedCount === 0}>
                모두 적용 ({computedCount}개)
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
