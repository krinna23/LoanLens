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

export async function getRiskSummary(sessionId: string) {
  const res = await fetch(`${API_BASE_URL}/risk_summary/${sessionId}`);
  if (!res.ok) throw new Error("Failed to fetch risk summary");
  return res.json();
}

