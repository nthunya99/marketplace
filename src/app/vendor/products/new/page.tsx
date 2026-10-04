"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProductImageUploader, { type UploadedImage } from "@/components/vendor/ProductImageUploader";

type Category = { id: string; name: string; children?: Category[] };
type FieldErrors = Partial<Record<string, string>>;

export default function NewProductPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<UploadedImage[]>([]);

  const [form, setForm] = useState({
    name: "",
    sku: "",
    categoryId: "",
    price: "",
    discountPrice: "",
    stockQuantity: "1",
    brand: "",
    shortDescription: "",
    description: "",
    status: "DRAFT",
  });

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then(setCategories);
  }, []);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((fe) => ({ ...fe, [key]: undefined }));
  }

  function updateImages(updater: (prev: UploadedImage[]) => UploadedImage[]) {
    setImages(updater);
    setFieldErrors((fe) => ({ ...fe, images: undefined }));
  }

  function generateSku() {
    const base =
      form.name
        .toUpperCase()
        .replace(/[^A-Z0-9 ]/g, "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .map((w) => w.slice(0, 3))
        .join("-") || "ITEM";
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    set("sku", `${base}-${suffix}`);
  }

  const price = Number(form.price);
  const sale = Number(form.discountPrice);
  const pctOff = form.discountPrice && price > 0 && sale > 0 && sale < price ? Math.round((1 - sale / price) * 100) : 0;
  const uploading = images.some((i) => i.status === "uploading");
  const failed = images.some((i) => i.status === "error");

  function validate(): FieldErrors {
    const fe: FieldErrors = {};
    if (form.name.trim().length < 2) fe.name = "Enter a product name (at least 2 characters).";
    if (!form.categoryId) fe.categoryId = "Choose a category.";
    if (!form.sku.trim()) fe.sku = "Enter a SKU, or click Generate.";
    if (!(price > 0)) fe.price = "Enter a price greater than 0.";
    if (form.discountPrice && !(sale > 0 && sale < price)) fe.discountPrice = "Sale price must be above 0 and lower than the regular price.";
    if (!Number.isInteger(Number(form.stockQuantity)) || Number(form.stockQuantity) < 0) fe.stockQuantity = "Enter a whole number, 0 or more.";
    if (!form.description.trim()) fe.description = "Describe the product for shoppers.";
    if (images.filter((i) => i.status === "done").length === 0) fe.images = "Add at least one product photo.";
    else if (failed) fe.images = "Remove the photos that failed to upload (marked in red), or try them again.";
    return fe;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fe = validate();
    setFieldErrors(fe);
    if (Object.keys(fe).length) {
      setError("Please fix the highlighted fields.");
      document.querySelector("[data-invalid='true']")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setLoading(true);
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        sku: form.sku.trim(),
        categoryId: form.categoryId,
        price,
        discountPrice: form.discountPrice ? sale : undefined,
        stockQuantity: Number(form.stockQuantity),
        brand: form.brand.trim() || undefined,
        shortDescription: form.shortDescription.trim() || undefined,
        description: form.description.trim(),
        status: form.status,
        images: images.filter((i) => i.status === "done").map((i) => ({ url: i.url! })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      const serverFieldErrors: Record<string, string[]> | undefined = data.details?.fieldErrors;
      if (serverFieldErrors) {
        setFieldErrors(
          Object.fromEntries(Object.entries(serverFieldErrors).map(([k, v]) => [k, v?.[0]]))
        );
      }
      setError(data.error ?? "Could not create product.");
      return;
    }
    router.push("/vendor/products");
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold">Add product</h1>
        <p className="text-sm text-ink-muted">
          Fields marked <span className="text-sale">*</span> are required. Helpful tips sit under each field.
        </p>
      </div>

      <form onSubmit={submit} noValidate className="space-y-5">
        {/* ---- Basics ---- */}
        <Section title="Basic details" intro="How shoppers find and recognise your product.">
          <Field
            label="Product name"
            required
            htmlFor="name"
            error={fieldErrors.name}
            help="Shown in search results and at the top of the product page. Include the brand, model and key detail, e.g. “Samsung Galaxy A15 128GB – Black”."
            counter={`${form.name.length}/200`}
          >
            <input id="name" className="input" maxLength={200} value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>

          <Field
            label="Category"
            required
            htmlFor="categoryId"
            error={fieldErrors.categoryId}
            help="Pick the most specific category that fits. This decides which section of Mmarakeng your product appears in."
          >
            <select id="categoryId" className="input" value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
              <option value="">Select a category</option>
              {categories.map((c) =>
                !c.children?.length ? (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ) : (
                <optgroup key={c.id} label={c.name}>
                  <option value={c.id}>{c.name} (general)</option>
                  {(c.children ?? []).map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.name}
                    </option>
                  ))}
                </optgroup>
                )
              )}
            </select>
          </Field>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field
              label="Brand"
              htmlFor="brand"
              error={fieldErrors.brand}
              help="The manufacturer or label. Shoppers can filter by brand. Leave blank for unbranded or handmade items."
            >
              <input id="brand" className="input" maxLength={120} value={form.brand} onChange={(e) => set("brand", e.target.value)} />
            </Field>

            <Field
              label="SKU (stock code)"
              required
              htmlFor="sku"
              error={fieldErrors.sku}
              help="Your own unique code for this item, used on orders and for stock counts. It can't match any other product on Mmarakeng. No code yet? Click Generate."
            >
              <div className="flex gap-2">
                <input id="sku" className="input" maxLength={80} value={form.sku} onChange={(e) => set("sku", e.target.value)} />
                <button type="button" className="btn-secondary whitespace-nowrap" onClick={generateSku}>
                  Generate
                </button>
              </div>
            </Field>
          </div>
        </Section>

        {/* ---- Photos ---- */}
        <Section
          title={
            <>
              Photos <span className="text-sale">*</span>
            </>
          }
          intro="Upload between 1 and 8 photos from your phone or computer. The first photo is the cover shown in search results and on product cards — use a clear, well-lit shot on a plain background. Add extra photos for other angles, close-ups, labels and sizing."
        >
          <div data-invalid={!!fieldErrors.images}>
            <ProductImageUploader images={images} onChange={updateImages} invalid={!!fieldErrors.images} />
            {fieldErrors.images && <p className="text-sm text-sale mt-2">{fieldErrors.images}</p>}
          </div>
        </Section>

        {/* ---- Pricing & stock ---- */}
        <Section title="Pricing & stock" intro="All prices are in Maloti (M).">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field
              label="Regular price"
              required
              htmlFor="price"
              error={fieldErrors.price}
              help="The normal selling price for one unit. Enter numbers only, e.g. 249.99."
            >
              <MoneyInput id="price" value={form.price} onChange={(v) => set("price", v)} />
            </Field>

            <Field
              label="Sale price"
              htmlFor="discountPrice"
              error={fieldErrors.discountPrice}
              help={
                pctOff
                  ? `Shoppers will see ${pctOff}% off, with the regular price crossed out.`
                  : "Only fill this in if the item is on special. It must be lower than the regular price; shoppers see the original price crossed out and a discount badge."
              }
            >
              <MoneyInput id="discountPrice" value={form.discountPrice} onChange={(v) => set("discountPrice", v)} />
            </Field>
          </div>

          <Field
            label="Stock quantity"
            required
            htmlFor="stockQuantity"
            error={fieldErrors.stockQuantity}
            help="How many units you have ready to sell right now. It goes down automatically as orders come in. At 0, shoppers can't order it until you restock."
          >
            <input
              id="stockQuantity"
              className="input sm:max-w-[200px]"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={form.stockQuantity}
              onChange={(e) => set("stockQuantity", e.target.value)}
            />
          </Field>
        </Section>

        {/* ---- Description ---- */}
        <Section title="Description" intro="Good descriptions answer questions before they're asked, and lead to fewer returns.">
          <Field
            label="Short summary"
            htmlFor="shortDescription"
            error={fieldErrors.shortDescription}
            help="One or two sentences on the main selling point, e.g. “Soft 100% cotton tee that keeps its shape after washing.”"
            counter={`${form.shortDescription.length}/500`}
          >
            <input
              id="shortDescription"
              className="input"
              maxLength={500}
              value={form.shortDescription}
              onChange={(e) => set("shortDescription", e.target.value)}
            />
          </Field>

          <Field
            label="Full description"
            required
            htmlFor="description"
            error={fieldErrors.description}
            help="Cover what it is, size or dimensions, colour, materials, what's in the box, care instructions and any warranty."
          >
            <textarea id="description" className="input" rows={7} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
        </Section>

        {/* ---- Visibility ---- */}
        <Section title="Visibility" intro="You can change this at any time from My Products.">
          <div className="grid sm:grid-cols-2 gap-3">
            <StatusOption
              checked={form.status === "DRAFT"}
              onSelect={() => set("status", "DRAFT")}
              title="Save as draft"
              body="Only you can see it. Useful if you still need to check details or photos before going live."
            />
            <StatusOption
              checked={form.status === "PUBLISHED"}
              onSelect={() => set("status", "PUBLISHED")}
              title="Publish now"
              body="Goes live on Mmarakeng straight away and shoppers can buy it."
            />
          </div>
        </Section>

        {error && (
          <div className="rounded-lg border border-sale/30 bg-sale-light px-4 py-3 text-sm text-sale-dark">{error}</div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
          <Link href="/vendor/products" className="btn-secondary">
            Cancel
          </Link>
          <button className="btn-primary sm:min-w-[180px]" disabled={loading || uploading}>
            {loading
              ? "Saving…"
              : uploading
              ? "Waiting for photos…"
              : form.status === "PUBLISHED"
              ? "Publish product"
              : "Save draft"}
          </button>
        </div>
      </form>

      <p className="text-xs text-ink-faint mt-4">
        Product variants (size/colour etc.) can be added via the API for now — a variant builder is a planned addition.
      </p>
    </div>
  );
}

function Section({ title, intro, children }: { title: React.ReactNode; intro?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="font-display text-lg text-ink">{title}</h2>
      {intro && <p className="text-sm text-ink-muted mt-0.5 mb-4 max-w-prose">{intro}</p>}
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  help,
  required,
  error,
  counter,
  children,
}: {
  label: string;
  htmlFor: string;
  help: string;
  required?: boolean;
  error?: string;
  counter?: string;
  children: React.ReactNode;
}) {
  return (
    <div data-invalid={!!error} className={error ? "[&_.input]:border-sale [&_.input]:ring-sale/20" : undefined}>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
          {label} {required ? <span className="text-sale">*</span> : <span className="text-ink-faint font-normal">(optional)</span>}
        </label>
        {counter && <span className="text-xs text-ink-faint">{counter}</span>}
      </div>
      {children}
      {error ? (
        <p className="text-sm text-sale mt-1">{error}</p>
      ) : (
        <p className="text-xs text-ink-muted mt-1 leading-relaxed">{help}</p>
      )}
    </div>
  );
}

function MoneyInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted font-medium pointer-events-none">M</span>
      <input
        id={id}
        className="input pl-8"
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        placeholder="0.00"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function StatusOption({ checked, onSelect, title, body }: { checked: boolean; onSelect: () => void; title: string; body: string }) {
  return (
    <label
      className={`flex gap-3 rounded-lg border p-3.5 cursor-pointer transition-colors ${
        checked ? "border-brand bg-brand-light/60" : "border-ink/15 hover:border-ink/30"
      }`}
    >
      <input type="radio" name="status" checked={checked} onChange={onSelect} className="mt-1 accent-[#0F5C42]" />
      <span>
        <span className="block font-medium text-ink">{title}</span>
        <span className="block text-xs text-ink-muted mt-0.5 leading-relaxed">{body}</span>
      </span>
    </label>
  );
}
