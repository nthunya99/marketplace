"use client";

import { useState } from "react";

type Proof = {
  id: string;
  status: "PENDING" | "CONFIRMED" | "REJECTED";
  note: string | null;
  fileName: string | null;
  submittedAt: string;
  rejectionReason: string | null;
};

type VendorPaymentInfo = {
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  mpesaMerchantNumber: string | null;
  ecocashMerchantNumber: string | null;
  mobileMoneyAccountType?: string;
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export default function ManualPaymentPanel({
  vendorOrderId,
  vendorName,
  vendorPayment,
  amount,
  initialProofs,
}: {
  vendorOrderId: string;
  vendorName: string;
  vendorPayment: VendorPaymentInfo;
  amount: string;
  initialProofs: Proof[];
}) {
  const [proofs, setProofs] = useState<Proof[]>(initialProofs);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPendingProof = proofs.some((p) => p.status === "PENDING");
  const latestRejected = proofs.find((p) => p.status === "REJECTED");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError("Please choose a file first.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("File is too large. Please upload an image or PDF under 5MB.");
      return;
    }

    setUploading(true);
    try {
      const imageData = await fileToDataUrl(file);
      const res = await fetch(`/api/vendor-orders/${vendorOrderId}/proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData, fileName: file.name, note: note || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not upload proof of payment.");
        return;
      }
      setProofs([{ ...data }, ...proofs]);
      setFile(null);
      setNote("");
    } catch {
      setError("Could not read that file. Please try a different image.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mt-3 border-t border-ink/10 pt-3">
      <p className="text-sm font-medium mb-2">Pay {vendorName} directly</p>
      <div className="text-sm text-ink-muted space-y-1 mb-3">
        <p>
          Amount due: <span className="font-semibold text-ink">{amount}</span>
        </p>
        {vendorPayment.bankAccountNumber && (
          <div className="rounded bg-ink/[0.03] px-3 py-2">
            <p className="text-xs font-medium text-ink">Bank transfer</p>
            {vendorPayment.bankName && <p>Bank: {vendorPayment.bankName}</p>}
            {vendorPayment.bankAccountName && <p>Account holder: {vendorPayment.bankAccountName}</p>}
            <p>
              Account number: <span className="font-medium text-ink">{vendorPayment.bankAccountNumber}</span>
            </p>
          </div>
        )}
        {(vendorPayment.mpesaMerchantNumber || vendorPayment.ecocashMerchantNumber) && (
          <div className="rounded bg-ink/[0.03] px-3 py-2">
            <p className="text-xs font-medium text-ink">
              {vendorPayment.mobileMoneyAccountType === "MERCHANT" ? "Mobile money — pay to merchant" : "Mobile money — send money"}
            </p>
            {vendorPayment.mpesaMerchantNumber && (
              <p>
                {vendorPayment.mobileMoneyAccountType === "MERCHANT" ? "M-Pesa merchant number" : "M-Pesa"}:{" "}
                <span className="font-medium text-ink">{vendorPayment.mpesaMerchantNumber}</span>
              </p>
            )}
            {vendorPayment.ecocashMerchantNumber && (
              <p>
                {vendorPayment.mobileMoneyAccountType === "MERCHANT" ? "EcoCash merchant number" : "EcoCash"}:{" "}
                <span className="font-medium text-ink">{vendorPayment.ecocashMerchantNumber}</span>
              </p>
            )}
            <p className="text-xs mt-1">
              {vendorPayment.mobileMoneyAccountType === "MERCHANT"
                ? "Use the pay-merchant option in your M-Pesa or EcoCash menu, not send money."
                : "Use send money in your M-Pesa or EcoCash menu."}{" "}
              Send exactly the amount due and use your order number as the reference where your app allows it.
            </p>
          </div>
        )}
      </div>

      {proofs.length > 0 && (
        <div className="space-y-2 mb-3">
          {proofs.map((p) => (
            <div key={p.id} className="text-xs bg-ink/[0.03] rounded px-3 py-2">
              <div className="flex justify-between gap-2">
                <span>{p.fileName ?? "Proof of payment"}</span>
                <span
                  className={
                    p.status === "CONFIRMED"
                      ? "text-brand-dark font-medium"
                      : p.status === "REJECTED"
                      ? "text-red-600 font-medium"
                      : "text-ink-faint font-medium"
                  }
                >
                  {p.status === "PENDING" ? "Awaiting review" : p.status}
                </span>
              </div>
              <p className="text-ink-faint mt-0.5">{new Date(p.submittedAt).toLocaleString()}</p>
              {p.status === "REJECTED" && p.rejectionReason && (
                <p className="text-red-600 mt-1">Reason: {p.rejectionReason}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {hasPendingProof ? (
        <p className="text-xs text-ink-faint">
          Your proof of payment is awaiting review by {vendorName}.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-2">
          {latestRejected && (
            <p className="text-xs text-red-600">Your last submission was rejected — please upload a new one.</p>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          <input
            className="input"
            placeholder="Note (optional) — e.g. transaction reference"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button className="btn-primary text-sm py-1.5" disabled={uploading}>
            {uploading ? "Uploading…" : "Upload proof of payment"}
          </button>
        </form>
      )}
    </div>
  );
}
