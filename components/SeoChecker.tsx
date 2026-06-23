"use client";

import { useState } from "react";

interface CheckItem {
  label: string;
  passed: boolean;
  detail: string;
  weight: number;
  problem: string;
  recommendation: string;
  howToFix: string[];
  examples: string[];
}

interface SeoResult {
  url: string;
  score: number;
  grade: string;
  checks: CheckItem[];
  topIssues: string[];
}

function ScoreRing({ score }: { score: number }) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 85 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <div className="score-ring">
      <svg width="110" height="110" viewBox="0 0 110 110" aria-hidden="true">
        <circle cx="55" cy="55" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle
          cx="55"
          cy="55"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="score-ring__label">
        <strong>{score}</strong>
        <span>점</span>
      </div>
    </div>
  );
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export default function SeoChecker() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<SeoResult | null>(null);
  const [selectedCheck, setSelectedCheck] = useState<CheckItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeUrl(url);

    if (!normalized) {
      setError("검사할 홈페이지 주소를 입력해주세요.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    setSelectedCheck(null);

    try {
      const res = await fetch("/api/seo-checker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalized }),
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "검사에 실패했습니다.");
      }

      setResult(data.data);
      setSelectedCheck(data.data.checks.find((check: CheckItem) => !check.passed) ?? data.data.checks[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "검사에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>무료 SEO 검사기</h1>
          <p>홈페이지 주소를 입력하면 검색 노출에 필요한 기본 항목을 빠르게 점검합니다.</p>
          <form className="search-form" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              inputMode="url"
              autoComplete="url"
            />
            <button type="submit" disabled={loading}>
              {loading ? "검사 중..." : "SEO 검사"}
            </button>
          </form>
          <p className="hint">
            title · description · H1 · robots · sitemap · canonical · OG · 이미지 ALT · 문의 경로를 확인합니다.
          </p>
          {error && <p className="error-msg">{error}</p>}
        </div>
      </section>

      {result && (
        <section className="results">
          <div className="container">
            <div className="score-summary">
              <ScoreRing score={result.score} />
              <div className="score-info">
                <p className="url">{result.url}</p>
                <h2>{result.grade}</h2>
                <p>
                  점검 필요 카드를 클릭하면 어느 부분이 문제인지, 무엇을 고쳐야 하는지 확인할 수 있습니다.
                </p>
              </div>
            </div>

            {selectedCheck && (
              <div className={`issue-panel ${selectedCheck.passed ? "issue-panel--pass" : "issue-panel--fail"}`}>
                <div className="issue-panel__eyebrow">선택한 항목</div>
                <div className="issue-panel__header">
                  <div>
                    <h2>{selectedCheck.label}</h2>
                    <p>{selectedCheck.detail}</p>
                  </div>
                  <span className={selectedCheck.passed ? "badge badge--pass" : "badge badge--fail"}>
                    {selectedCheck.passed ? "통과" : "점검 필요"}
                  </span>
                </div>

                <div className="issue-panel__grid">
                  <div>
                    <h3>어느 부분이 문제인가요?</h3>
                    <p>{selectedCheck.problem}</p>
                  </div>
                  <div>
                    <h3>무엇을 고쳐야 하나요?</h3>
                    <p>{selectedCheck.recommendation}</p>
                  </div>
                </div>

                <div className="fix-list">
                  <h3>수정 방법</h3>
                  <ol>
                    {selectedCheck.howToFix.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </div>

                <div className="example-list">
                  <h3>발견된 항목 / 예시</h3>
                  <ul>
                    {selectedCheck.examples.map((example) => (
                      <li key={example}>{example}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <div className="check-grid">
              {result.checks.map((check) => {
                const isSelected = selectedCheck?.label === check.label;
                return (
                  <button
                    key={check.label}
                    type="button"
                    onClick={() => setSelectedCheck(check)}
                    className={`check-card ${check.passed ? "check-card--pass" : "check-card--fail"} ${
                      isSelected ? "check-card--selected" : ""
                    }`}
                  >
                    <div className="check-card__status">{check.passed ? "● 통과" : "● 점검 필요"}</div>
                    <h3>{check.label}</h3>
                    <p>{check.detail}</p>
                    <span className="check-card__more">클릭해서 상세 보기</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
