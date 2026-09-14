export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export async function submitProfile(data: { session_id: string; monthly_income: number; loan_amount_needed: number; preferred_tenure_months: number }) {
  const res = await fetch(`${API_BASE_URL}/profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to submit profile");
  return res.json();
}

export async function uploadAgreement(file: File, sessionId: string, label: "A" | "B") {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("session_id", sessionId);
  formData.append("agreement_label", label);

  const res = await fetch(`${API_BASE_URL}/upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("Failed to upload document");
  return res.json();
}

export async function summarizeAgreement(sessionId: string, label: "A" | "B") {
  const res = await fetch(`${API_BASE_URL}/summarize/${sessionId}?agreement_label=${label}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to generate summary");
  return res.json();
}

export async function generateComparison(sessionId: string) {
  const res = await fetch(`${API_BASE_URL}/comparison/${sessionId}/generate`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to generate comparison");
  return res.json();
}

export async function getRiskSummary(sessionId: string, documentId?: string) {
  const url = documentId
    ? `${API_BASE_URL}/risk_summary/${sessionId}?document_id=${documentId}`
    : `${API_BASE_URL}/risk_summary/${sessionId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch risk summary");
  return res.json();
}

export async function extractLoanFields(sessionId: string, label: "A" | "B") {
  const res = await fetch(`${API_BASE_URL}/extract_fields/${sessionId}?agreement_label=${label}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to extract loan fields");
  return res.json();
}

export async function getTrueCost(data: {
  principal?: number;
  annual_rate_pct?: number;
  tenure_months?: number;
  processing_fee?: number;
  insurance?: number;
  other_charges?: number;
}) {
  const res = await fetch(`${API_BASE_URL}/true_cost/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to calculate true cost");
  return res.json();
}

export async function getPrepaymentScenario(data: {
  principal: number;
  annual_rate_pct: number;
  tenure_months: number;
  months_paid: number;
  prepayment_amount: number;
  prepayment_charge_pct: number;
}) {
  const res = await fetch(`${API_BASE_URL}/prepayment_scenario`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to calculate prepayment scenario");
  return res.json();
}

export async function getRegulatoryStatus(sessionId: string) {
  const res = await fetch(`${API_BASE_URL}/regulatory_status/${sessionId}`);
  if (!res.ok) throw new Error("Failed to fetch regulatory status");
  return res.json();
}

export async function getClauseExplanations(sessionId: string, label: "A" | "B" = "A") {
  const res = await fetch(`${API_BASE_URL}/clause_explanations/${sessionId}?agreement_label=${label}`);
  if (!res.ok) throw new Error("Failed to fetch clause explanations");
  return res.json();
}
