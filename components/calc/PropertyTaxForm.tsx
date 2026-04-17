"use client";

/**
 * PropertyTaxForm — 재산세 계산 마법사 (P1-14)
 *
 * Step 0: 물건 유형 · 공시가격 · 기본 옵션
 * Step 1: 토지 분류 (objectType==="land" 일 때)
 * Step 2: 토지 상세 (landTaxType === "separate_aggregate" | "separated" 일 때)
 * Step 3: 전년도 세액 (세부담상한 계산용)
 * Step 4: 계산 결과
 *
 * 뒤로가기: Step 0에서 홈(/)으로 이동
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { StepIndicator } from "@/components/calc/StepIndicator";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import { PropertyTaxResultView } from "@/components/calc/results/PropertyTaxResultView";
import { useStandardPriceLookup } from "@/lib/hooks/useStandardPriceLookup";
import type { PropertyTaxResult } from "@/lib/tax-engine/types/property.types";

// ============================================================
// 상수
// ============================================================

const OBJECT_TYPE_LABELS: [string, string][] = [
  ["housing", "주택 (아파트·단독·연립·다세대)"],
  ["building", "건축물 (비주거용)"],
  ["land", "토지"],
  ["vessel", "선박"],
  ["aircraft", "항공기"],
];

const BUILDING_TYPE_LABELS: [string, string][] = [
  ["general", "일반 건축물 (0.25%)"],
  ["golf_course", "골프장 (4%)"],
  ["luxury", "고급오락장 (4%)"],
  ["factory", "공장 (0.5%)"],
];

const ZONING_DISTRICT_LABELS: [string, string][] = [
  ["residential", "주거지역"],
  ["commercial", "상업지역"],
  ["industrial", "공업지역"],
  ["green", "녹지지역"],
  ["management", "관리지역"],
  ["agricultural", "농림지역"],
  ["nature_preserve", "자연환경보전지역"],
];

const SEPARATED_TYPE_OPTIONS: { value: string; label: string; rate: string; hint?: string }[] = [
  { value: "farmland",     label: "자경 농지",                              rate: "0.07%" },
  { value: "livestock",    label: "축산용지",                               rate: "0.07%" },
  { value: "forest",       label: "공익용 보전산지·임업후계림",               rate: "0.07%" },
  { value: "factory",      label: "공장용지 (산업단지·지정 공업지역)",         rate: "0.2%", hint: "입지 유형 추가 선택 필요" },
  { value: "saltfield",    label: "염전",                                   rate: "0.2%" },
  { value: "terminal",     label: "여객·화물터미널 / 공영주차장",              rate: "0.2%" },
  { value: "golf_member",  label: "회원제 골프장",                           rate: "4%"   },
  { value: "golf_public",  label: "대중·간이 골프장",                        rate: "0.2%" },
  { value: "entertainment",label: "고급오락장 (카지노·유흥주점 등)",           rate: "4%"   },
  { value: "other",        label: "기타 분리과세 토지",                       rate: "0.2%" },
];

// ============================================================
// 폼 상태
// ============================================================

interface FormState {
  // ── 소재지 (공시가격 조회용) ──
  jibun: string;
  road: string;
  building: string;
  // ── 공통 ──
  objectType: string;
  publishedPrice: string;
  isOneHousehold: boolean;
  isUrbanArea: boolean;
  buildingType: string;
  previousYearTax: string;
  landTaxType: "comprehensive_aggregate" | "separate_aggregate" | "separated" | "";

  // ── 별도합산(separate_aggregate) 상세 ──
  saZoningDistrict: string;
  saLandArea: string;
  saBuildingFloorArea: string;
  saIsFactory: boolean;
  saFactoryStandardArea: string;
  saDemolished: boolean;
  saDemolishedDate: string;

  // ── 분리과세(separated) 상세 ──
  stSeparatedType: string;
  stFactoryLocation: string;
}

const INITIAL_FORM: FormState = {
  jibun: "",
  road: "",
  building: "",
  objectType: "housing",
  publishedPrice: "",
  isOneHousehold: false,
  isUrbanArea: false,
  buildingType: "general",
  previousYearTax: "",
  landTaxType: "",
  saZoningDistrict: "",
  saLandArea: "",
  saBuildingFloorArea: "",
  saIsFactory: false,
  saFactoryStandardArea: "",
  saDemolished: false,
  saDemolishedDate: "",
  stSeparatedType: "",
  stFactoryLocation: "",
};

// ============================================================
// 유효성 검사
// ============================================================

function validateStep(step: number, form: FormState): string | null {
  if (step === 0) {
    if (!form.objectType) return "물건 유형을 선택하세요.";
    if (!form.publishedPrice || parseAmount(form.publishedPrice) === null)
      return "공시가격을 입력하세요.";
  }
  if (step === 1 && form.objectType === "land") {
    if (!form.landTaxType) return "토지 과세 유형을 선택하세요.";
  }
  if (step === 2) {
    if (form.landTaxType === "separate_aggregate") {
      if (!form.saZoningDistrict) return "용도지역을 선택하세요.";
      const landArea = parseAmount(form.saLandArea);
      if (!landArea || landArea <= 0) return "토지 면적(㎡)을 입력하세요.";
      if (form.saIsFactory) {
        const fsa = parseAmount(form.saFactoryStandardArea);
        if (!fsa || fsa <= 0) return "공장입지기준면적(㎡)을 입력하세요.";
      } else {
        const bfa = parseAmount(form.saBuildingFloorArea);
        if (!bfa || bfa <= 0) return "건물 바닥면적(㎡)을 입력하세요.";
      }
      if (form.saDemolished && !form.saDemolishedDate) return "철거일을 입력하세요.";
    }
    if (form.landTaxType === "separated") {
      if (!form.stSeparatedType) return "분리과세 토지 유형을 선택하세요.";
      if (form.stSeparatedType === "factory" && !form.stFactoryLocation)
        return "공장 입지 유형을 선택하세요.";
    }
  }
  return null;
}

// ============================================================
// API 호출
// ============================================================

async function callPropertyTaxAPI(form: FormState): Promise<PropertyTaxResult> {
  const body: Record<string, unknown> = {
    objectType: form.objectType,
    publishedPrice: parseAmount(form.publishedPrice) ?? 0,
    isOneHousehold: form.isOneHousehold,
    isUrbanArea: form.isUrbanArea,
  };

  if (form.objectType === "building") {
    body.buildingType = form.buildingType;
  }

  if (form.objectType === "land" && form.landTaxType) {
    body.landTaxType = form.landTaxType;

    // ── 별도합산 상세 ──
    if (form.landTaxType === "separate_aggregate") {
      const landArea = parseAmount(form.saLandArea) ?? 0;
      const publishedTotal = parseAmount(form.publishedPrice) ?? 0;
      const officialLandPrice = landArea > 0 ? Math.floor(publishedTotal / landArea) : 0;

      body.separateAggregateItem = {
        id: "parcel-1",
        jurisdictionCode: "000000",
        landArea,
        officialLandPrice,
        zoningDistrict: form.saZoningDistrict,
        ...(form.saIsFactory
          ? {
              isFactory: true,
              factoryStandardArea: parseAmount(form.saFactoryStandardArea) ?? undefined,
            }
          : {
              buildingFloorArea: parseAmount(form.saBuildingFloorArea) ?? undefined,
            }),
        ...(form.saDemolished
          ? { demolished: true, demolishedDate: form.saDemolishedDate || undefined }
          : {}),
      };
    }

    // ── 분리과세 상세 ──
    if (form.landTaxType === "separated") {
      const st: Record<string, unknown> = {};
      switch (form.stSeparatedType) {
        case "farmland":      st.isFarmland = true; break;
        case "livestock":     st.isLivestockFarm = true; break;
        case "forest":        st.isProtectedForest = true; break;
        case "factory":
          st.isFactoryLand = true;
          if (form.stFactoryLocation) st.factoryLocation = form.stFactoryLocation;
          break;
        case "saltfield":     st.isSaltField = true; break;
        case "terminal":      st.isTerminalOrParking = true; break;
        case "golf_member":   st.isGolfCourse = true; st.golfCourseType = "member"; break;
        case "golf_public":   st.isGolfCourse = true; st.golfCourseType = "public"; break;
        case "entertainment": st.isHighClassEntertainment = true; break;
        // "other": 플래그 없음 → 엔진이 standard(0.2%)로 처리
      }
      body.separateTaxationItem = st;
    }
  }

  const prevTax = parseAmount(form.previousYearTax);
  if (prevTax !== null && prevTax > 0) {
    body.previousYearTax = prevTax;
  }

  const res = await fetch("/api/calc/property", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(json?.error?.message ?? `서버 오류 (${res.status})`);
  }

  return json.data as PropertyTaxResult;
}

// ============================================================
// 컴포넌트
// ============================================================

export function PropertyTaxForm() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PropertyTaxResult | null>(null);
  const priceLookup = useStandardPriceLookup(form.objectType === "land" ? "land" : "housing");

  // 소재지 또는 연도 변경 시 자동 조회
  useEffect(() => {
    if (!form.jibun || form.objectType === "building") return;
    if (form.publishedPrice && priceLookup.announcedLabel?.includes(priceLookup.year)) return;
    const apiType = form.objectType === "land" ? "land" : "housing";
    priceLookup.lookup({ jibun: form.jibun, propertyType: apiType })
      .then((price) => { if (price) update("publishedPrice", String(price)); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.jibun, form.objectType, priceLookup.year]);

  const needsLandDetail =
    form.objectType === "land" &&
    (form.landTaxType === "separate_aggregate" || form.landTaxType === "separated");

  // StepIndicator: 결과 제외, 실제 표시되는 단계만
  const visibleStepLabels: string[] = (() => {
    if (form.objectType === "land") {
      return needsLandDetail
        ? ["기본 정보", "토지 분류", "토지 상세", "전년도 세액"]
        : ["기본 정보", "토지 분류", "전년도 세액"];
    }
    return ["기본 정보", "전년도 세액"];
  })();

  // 현재 step → 표시 인덱스 매핑
  const displayStep = (() => {
    if (form.objectType === "land") {
      if (needsLandDetail) {
        // 실제 step: 0→0, 1→1, 2→2, 3→3
        return Math.min(step, 3);
      }
      // 실제 step: 0→0, 1→1, 3→2
      if (step === 0) return 0;
      if (step === 1) return 1;
      return 2;
    }
    // 비토지: 실제 step: 0→0, 3→1
    return step === 0 ? 0 : 1;
  })();

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }

  function handleBack() {
    setError(null);
    if (step === 0) { router.push("/"); return; }
    if (step === 3) {
      // 전년도 세액 단계 뒤로
      if (form.objectType !== "land") { setStep(0); return; }
      setStep(needsLandDetail ? 2 : 1);
      return;
    }
    setStep((s) => s - 1);
  }

  async function handleNext() {
    setError(null);

    // Step 0: 기본 정보 검증
    if (step === 0) {
      const err = validateStep(0, form);
      if (err) { setError(err); return; }
      setStep(form.objectType === "land" ? 1 : 3);
      return;
    }

    // Step 1: 토지 분류
    if (step === 1) {
      const err = validateStep(1, form);
      if (err) { setError(err); return; }
      setStep(needsLandDetail ? 2 : 3);
      return;
    }

    // Step 2: 토지 상세
    if (step === 2) {
      const err = validateStep(2, form);
      if (err) { setError(err); return; }
      setStep(3);
      return;
    }

    // Step 3: 전년도 세액 → 계산 실행
    if (step === 3) {
      await runCalculation();
      return;
    }
  }

  async function runCalculation() {
    setLoading(true);
    setError(null);
    try {
      const res = await callPropertyTaxAPI(form);
      setResult(res);
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : "계산 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setForm(INITIAL_FORM);
    setResult(null);
    setError(null);
    setStep(0);
  }

  // ── 결과 화면 ──
  if (step === 4 && result) {
    return (
      <div>
        <PropertyTaxResultView result={result} />
        <div className="mt-6 flex justify-center">
          <button
            onClick={handleReset}
            className="px-6 py-2 rounded-md border text-sm font-medium hover:bg-muted transition-colors"
          >
            다시 계산하기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StepIndicator current={displayStep} steps={visibleStepLabels} />

      {/* ─── Step 0: 기본 정보 ─── */}
      {step === 0 && (
        <div className="space-y-5">
          <h2 className="text-lg font-semibold">기본 정보</h2>

          {/* 물건 유형 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">물건 유형</label>
            <div className="grid gap-2">
              {OBJECT_TYPE_LABELS.map(([val, label]) => (
                <label key={val} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="objectType"
                    value={val}
                    checked={form.objectType === val}
                    onChange={() => update("objectType", val)}
                    className="accent-primary"
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 소재지 (공시가격 조회용) */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              물건 소재지 <span className="text-muted-foreground font-normal text-xs">(선택)</span>
            </label>
            <AddressSearch
              value={{ road: form.road, jibun: form.jibun, building: form.building, detail: "", lng: "", lat: "" } satisfies AddressValue}
              onChange={(v) => setForm((f) => ({ ...f, jibun: v.jibun, road: v.road, building: v.building }))}
            />
          </div>

          {/* 공시가격 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">공시가격</label>
            <p className="text-xs text-muted-foreground">
              주택: 주택공시가격 / 토지: 개별공시지가 합계 / 건축물: 기준시가
            </p>
            {form.objectType !== "building" ? (
              <>
                <div className="flex gap-2 items-center">
                  <select
                    value={priceLookup.year}
                    onChange={(e) => priceLookup.setYear(e.target.value)}
                    className="rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="공시가격 조회 연도"
                  >
                    {priceLookup.yearOptions.map((y) => (
                      <option key={y} value={y}>{y}년</option>
                    ))}
                  </select>
                  <div className="flex-1">
                    <CurrencyInput
                      label=""
                      value={form.publishedPrice}
                      onChange={(v) => update("publishedPrice", v)}
                      placeholder="예: 300,000,000"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const apiType = form.objectType === "land" ? "land" : "housing";
                      const price = await priceLookup.lookup({ jibun: form.jibun, propertyType: apiType });
                      if (price) update("publishedPrice", String(price));
                    }}
                    disabled={priceLookup.loading || !form.jibun}
                    className="px-3 py-2 rounded-md border border-primary text-primary text-sm font-medium hover:bg-primary/5 disabled:opacity-50 whitespace-nowrap transition-colors"
                  >
                    {priceLookup.loading ? "조회중" : "조회"}
                  </button>
                </div>
                {priceLookup.announcedLabel && (
                  <p className="text-xs text-muted-foreground">{priceLookup.announcedLabel}</p>
                )}
                {priceLookup.msg && (
                  <p className={`text-xs ${priceLookup.msg.kind === "ok" ? "text-emerald-700" : "text-destructive"}`}>
                    {priceLookup.msg.text}
                  </p>
                )}
              </>
            ) : (
              <>
                <CurrencyInput
                  label=""
                  value={form.publishedPrice}
                  onChange={(v) => update("publishedPrice", v)}
                  placeholder="예: 300,000,000"
                />
                <p className="text-xs text-amber-700">
                  ※ 건축물 기준시가는 국세청 홈택스에서 직접 확인 후 입력하세요.
                </p>
              </>
            )}
          </div>

          {/* 1세대1주택 (주택 전용) */}
          {form.objectType === "housing" && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isOneHousehold}
                onChange={(e) => update("isOneHousehold", e.target.checked)}
                className="accent-primary"
              />
              <span className="text-sm">
                1세대 1주택 특례 신청 (공시가격 9억 이하 시 적용)
              </span>
            </label>
          )}

          {/* 건축물 유형 (건축물 전용) */}
          {form.objectType === "building" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">건축물 유형</label>
              <div className="grid gap-2">
                {BUILDING_TYPE_LABELS.map(([val, label]) => (
                  <label key={val} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="buildingType"
                      value={val}
                      checked={form.buildingType === val}
                      onChange={() => update("buildingType", val)}
                      className="accent-primary"
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* 도시지역 여부 */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isUrbanArea}
              onChange={(e) => update("isUrbanArea", e.target.checked)}
              className="accent-primary"
            />
            <span className="text-sm">도시지역 내 소재 (도시지역분 0.14% 추가 과세)</span>
          </label>
        </div>
      )}

      {/* ─── Step 1: 토지 분류 (토지 전용) ─── */}
      {step === 1 && form.objectType === "land" && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">토지 과세 유형</h2>
          <p className="text-sm text-muted-foreground">
            보유 토지의 과세 유형을 선택하세요 (지방세법 §106).
          </p>
          <div className="space-y-2">
            {(
              [
                {
                  value: "comprehensive_aggregate",
                  label: "종합합산과세대상",
                  desc: "나대지·잡종지 등 (0.2~0.5% 누진)",
                },
                {
                  value: "separate_aggregate",
                  label: "별도합산과세대상",
                  desc: "영업용 건축물 부속토지 등 (0.2~0.4% 누진)",
                },
                {
                  value: "separated",
                  label: "분리과세대상",
                  desc: "농지·골프장 등 (0.07%~4% 단일)",
                },
              ] as const
            ).map(({ value, label, desc }) => (
              <label
                key={value}
                className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-accent/50"
              >
                <input
                  type="radio"
                  name="landTaxType"
                  value={value}
                  checked={form.landTaxType === value}
                  onChange={() => update("landTaxType", value)}
                  className="mt-0.5 accent-primary"
                />
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ─── Step 2: 토지 상세 ─── */}
      {step === 2 && form.landTaxType === "separate_aggregate" && (
        <div className="space-y-5">
          <h2 className="text-lg font-semibold">별도합산과세 상세 정보</h2>
          <p className="text-sm text-muted-foreground">
            기준면적(건물 바닥면적 × 용도지역 배율) 판정에 필요한 정보를 입력하세요
            (지방세법 시행령 §101).
          </p>

          {/* 용도지역 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">용도지역</label>
            <div className="grid grid-cols-2 gap-2">
              {ZONING_DISTRICT_LABELS.map(([val, label]) => (
                <label key={val} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="saZoningDistrict"
                    value={val}
                    checked={form.saZoningDistrict === val}
                    onChange={() => update("saZoningDistrict", val)}
                    className="accent-primary"
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 토지 면적 */}
          <div className="space-y-1">
            <label className="text-sm font-medium">토지 면적 (㎡)</label>
            <CurrencyInput
              label="토지 면적"
              value={form.saLandArea}
              onChange={(v) => update("saLandArea", v)}
              placeholder="예: 500"
            />
            <p className="text-xs text-muted-foreground">
              공시가격 ÷ 면적 = 개별공시지가(원/㎡)로 자동 환산됩니다.
            </p>
          </div>

          {/* 공장 여부 */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.saIsFactory}
              onChange={(e) => update("saIsFactory", e.target.checked)}
              className="accent-primary"
            />
            <span className="text-sm">공장용지 (공장입지기준면적 적용)</span>
          </label>

          {/* 건물 바닥면적 (비공장) */}
          {!form.saIsFactory && (
            <div className="space-y-1">
              <label className="text-sm font-medium">건물 바닥면적 (㎡)</label>
              <CurrencyInput
                label="건물 바닥면적"
                value={form.saBuildingFloorArea}
                onChange={(v) => update("saBuildingFloorArea", v)}
                placeholder="예: 200"
              />
              <p className="text-xs text-muted-foreground">
                기준면적 = 건물 바닥면적 × 용도지역 배율 (지방세법 시행령 §101②)
              </p>
            </div>
          )}

          {/* 공장입지기준면적 (공장) */}
          {form.saIsFactory && (
            <div className="space-y-1">
              <label className="text-sm font-medium">공장입지기준면적 (㎡)</label>
              <CurrencyInput
                label="공장입지기준면적"
                value={form.saFactoryStandardArea}
                onChange={(v) => update("saFactoryStandardArea", v)}
                placeholder="예: 1,000"
              />
              <p className="text-xs text-muted-foreground">
                산업집적활성화법상 공장입지기준면적 이내: 별도합산, 초과: 종합합산
              </p>
            </div>
          )}

          {/* 건축물 철거 여부 */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.saDemolished}
              onChange={(e) => update("saDemolished", e.target.checked)}
              className="accent-primary"
            />
            <span className="text-sm">건축물 철거 완료 (6개월 이내 특례 적용 가능)</span>
          </label>

          {form.saDemolished && (
            <div className="space-y-1">
              <label className="text-sm font-medium">철거일</label>
              <input
                type="text"
                value={form.saDemolishedDate}
                onChange={(e) => update("saDemolishedDate", e.target.value)}
                placeholder="YYYY-MM-DD"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-muted-foreground">
                철거일부터 과세기준일(6월 1일)까지 6개월 이내이면 별도합산 유지 특례 적용
                (지방세법 시행령 §101③)
              </p>
            </div>
          )}
        </div>
      )}

      {step === 2 && form.landTaxType === "separated" && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">분리과세 토지 유형</h2>
          <p className="text-sm text-muted-foreground">
            해당하는 분리과세 토지 유형을 선택하세요 (지방세법 시행령 §102).
          </p>

          <div className="space-y-2">
            {SEPARATED_TYPE_OPTIONS.map(({ value, label, rate, hint }) => (
              <label
                key={value}
                className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-accent/50"
              >
                <input
                  type="radio"
                  name="stSeparatedType"
                  value={value}
                  checked={form.stSeparatedType === value}
                  onChange={() => update("stSeparatedType", value)}
                  className="mt-0.5 accent-primary"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{label}</p>
                    <span className="text-xs font-medium text-muted-foreground">세율 {rate}</span>
                  </div>
                  {hint && <p className="text-xs text-amber-600">{hint}</p>}
                </div>
              </label>
            ))}
          </div>

          {/* 공장 입지 유형 (공장용지 선택 시) */}
          {form.stSeparatedType === "factory" && (
            <div className="space-y-2 rounded-lg border p-4 bg-muted/30">
              <label className="text-sm font-medium">공장 입지 유형</label>
              <div className="space-y-2">
                {(
                  [
                    ["industrial_zone", "산업단지·지정 공업지역 내"],
                    ["urban", "도시지역 내 (기타)"],
                    ["other", "도시지역 외"],
                  ] as const
                ).map(([val, label]) => (
                  <label key={val} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="stFactoryLocation"
                      value={val}
                      checked={form.stFactoryLocation === val}
                      onChange={() => update("stFactoryLocation", val)}
                      className="accent-primary"
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Step 3: 전년도 세액 ─── */}
      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">전년도 납부세액 (선택)</h2>
          <div className="space-y-1">
            <label className="text-sm font-medium">전년도 재산세 납부액 (원)</label>
            <CurrencyInput
              label="전년도 재산세 납부액"
              value={form.previousYearTax}
              onChange={(v) => update("previousYearTax", v)}
              placeholder="미입력 시 세부담상한 미적용"
            />
            <p className="text-xs text-muted-foreground">
              세부담상한(지방세법 §122) 적용을 위해 전년도 납부세액을 입력하세요.
              미입력 시 상한 없이 산출세액을 그대로 적용합니다.
            </p>
          </div>
        </div>
      )}

      {/* ─── 에러 ─── */}
      {error && (
        <p className="text-sm text-red-500 rounded-md bg-red-50 border border-red-200 px-3 py-2">
          {error}
        </p>
      )}

      {/* ─── 네비게이션 버튼 ─── */}
      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={handleBack}
          className="px-5 py-2 rounded-md border text-sm font-medium hover:bg-muted transition-colors"
        >
          {step === 0 ? "홈으로" : "뒤로"}
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={loading}
          className="px-5 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {loading
            ? "계산 중..."
            : step === 3
            ? "재산세 계산하기"
            : "다음"}
        </button>
      </div>
    </div>
  );
}
