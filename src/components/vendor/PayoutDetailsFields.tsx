"use client";

import type { PayoutDetails } from "@/lib/validators";

type AccountType = "PERSONAL" | "MERCHANT";

/**
 * The "where customers send payment" fields, shared by vendor registration
 * and Store settings → Payment details. A vendor can fill in a bank
 * account, an M-Pesa number, an EcoCash number, or any mix of them.
 *
 * value.mobileMoneyAccountType says whether the mobile money numbers are
 * personal numbers or merchant (till) numbers; it changes the labels here
 * and the instructions customers see. Registration sets it from the
 * "Do you have a merchant account?" question; Store settings shows the
 * choice inline (showAccountTypeChoice).
 */
export default function PayoutDetailsFields({
  value,
  onChange,
  idPrefix = "payout",
  showAccountTypeChoice = false,
}: {
  value: PayoutDetails;
  onChange: (next: PayoutDetails) => void;
  idPrefix?: string;
  showAccountTypeChoice?: boolean;
}) {
  const set = (field: keyof PayoutDetails) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [field]: e.target.value });

  const id = (field: string) => `${idPrefix}-${field}`;
  const accountType: AccountType = value.mobileMoneyAccountType === "MERCHANT" ? "MERCHANT" : "PERSONAL";
  const merchant = accountType === "MERCHANT";

  return (
    <div className="space-y-5">
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-ink">Mobile money</legend>

        {showAccountTypeChoice && (
          <div className="flex flex-col sm:flex-row gap-2" role="radiogroup" aria-label="Type of mobile money numbers">
            {(
              [
                ["PERSONAL", "Personal numbers", "The phone numbers you use for M-Pesa / EcoCash"],
                ["MERCHANT", "Merchant numbers", "Business (till) numbers from Vodacom or EcoCash"],
              ] as const
            ).map(([val, title, hint]) => (
              <label
                key={val}
                className={`flex-1 flex items-start gap-2 rounded-lg border p-2.5 cursor-pointer text-sm ${
                  accountType === val ? "border-brand bg-brand-light/60" : "border-ink/15 hover:border-brand/40"
                }`}
              >
                <input
                  type="radio"
                  name={id("accountType")}
                  className="mt-0.5"
                  checked={accountType === val}
                  onChange={() => onChange({ ...value, mobileMoneyAccountType: val })}
                />
                <span>
                  <span className="block font-medium text-ink">{title}</span>
                  <span className="block text-xs text-ink-muted">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        )}

        <p className="text-xs text-ink-muted">
          {merchant
            ? "Enter your M-Pesa and/or EcoCash merchant number. Customers pay to it and upload proof of payment."
            : "Enter the M-Pesa and/or EcoCash number customers should send money to."}
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={id("mpesa")} className="block text-xs font-medium text-ink-muted mb-1">
              {merchant ? "M-Pesa merchant number" : "M-Pesa number"}
            </label>
            <input
              id={id("mpesa")}
              className="input"
              inputMode="tel"
              placeholder={merchant ? "Merchant number" : "5XXXXXXX"}
              value={value.mpesaMerchantNumber ?? ""}
              onChange={set("mpesaMerchantNumber")}
            />
          </div>
          <div>
            <label htmlFor={id("ecocash")} className="block text-xs font-medium text-ink-muted mb-1">
              {merchant ? "EcoCash merchant number" : "EcoCash number"}
            </label>
            <input
              id={id("ecocash")}
              className="input"
              inputMode="tel"
              placeholder={merchant ? "Merchant number" : "6XXXXXXX"}
              value={value.ecocashMerchantNumber ?? ""}
              onChange={set("ecocashMerchantNumber")}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-ink">Bank account (optional)</legend>
        <p className="text-xs text-ink-muted -mt-1">Add this if customers can also pay you by bank transfer.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={id("bankName")} className="block text-xs font-medium text-ink-muted mb-1">
              Bank name
            </label>
            <input
              id={id("bankName")}
              className="input"
              placeholder="e.g. Standard Lesotho Bank"
              value={value.bankName ?? ""}
              onChange={set("bankName")}
            />
          </div>
          <div>
            <label htmlFor={id("bankAccountName")} className="block text-xs font-medium text-ink-muted mb-1">
              Account holder name
            </label>
            <input
              id={id("bankAccountName")}
              className="input"
              value={value.bankAccountName ?? ""}
              onChange={set("bankAccountName")}
            />
          </div>
        </div>
        <div>
          <label htmlFor={id("bankAccountNumber")} className="block text-xs font-medium text-ink-muted mb-1">
            Account number
          </label>
          <input
            id={id("bankAccountNumber")}
            className="input"
            inputMode="numeric"
            value={value.bankAccountNumber ?? ""}
            onChange={set("bankAccountNumber")}
          />
        </div>
      </fieldset>
    </div>
  );
}
