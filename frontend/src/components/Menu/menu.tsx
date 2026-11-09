import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  UtensilsCrossed,
  Search,
  RefreshCw,
  Download,
  X,
  Trash2,
  Plus,
  ChefHat,
  Sparkles,
  CheckCircle2,
} from "lucide-react";

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

type MenuItem = {
  id: string;
  name: string;
  category: string; // Kitchen | Promo
  price: number;
  ingredientCount: number;
  recipeCost: number;
};

type Ingredient = {
  id: string;
  menuId: string;
  inventoryId: string;
  name: string;
  department: string;
  quantityUsed: number;
  unit: string;
  costPerUnit: number;
};

type InventoryOption = {
  inventoryId: string;
  name: string;
  department: string;
  unit: string;
  costPerUnit: number;
};

type ApiResponse<T> = { success: boolean; data?: T; message?: string };

const MENU_API = "../backend/menu/menu.php";
const INGREDIENT_API = "../backend/menu/menu_ingredients.php";
const CATEGORIES = ["Kitchen", "Promo"] as const;

const peso = (value: number) =>
  `₱${value.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

async function api<T>(
  url: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const result = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !result.success || result.data === undefined) {
    throw new Error(result.message || "Unable to complete the request.");
  }
  return result.data;
}

const ingredientCost = (list: Ingredient[]) =>
  list.reduce((sum, i) => sum + i.quantityUsed * i.costPerUnit, 0);

export default function MenuPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [missingOnly, setMissingOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "price-asc" | "price-desc">(
    "name",
  );

  // Ingredient modal
  const [activeItem, setActiveItem] = useState<MenuItem | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [isIngredientsLoading, setIsIngredientsLoading] = useState(false);
  const [options, setOptions] = useState<InventoryOption[] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [addForm, setAddForm] = useState({
    inventoryId: "",
    quantity: "",
    unit: "",
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => setToastMessage(null), 3500);
  };

  /* ------------------------------- DATA LOAD -------------------------------- */

  useEffect(() => {
    const controller = new AbortController();
    api<MenuItem[]>(MENU_API, "GET", undefined, controller.signal)
      .then((data) => {
        setItems(data);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(
            error instanceof Error ? error.message : "Unable to load the menu.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [reloadToken]);

  const reload = () => {
    setLoadError(null);
    setIsLoading(true);
    setReloadToken((t) => t + 1);
  };

  /* ------------------------------ DERIVED DATA ------------------------------ */

  const missingCount = items.filter((i) => i.ingredientCount === 0).length;

  const visibleItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = items.filter((item) => {
      const matchesCategory = category === "All" || item.category === category;
      const matchesMissing = !missingOnly || item.ingredientCount === 0;
      const matchesSearch = q === "" || item.name.toLowerCase().includes(q);
      return matchesCategory && matchesMissing && matchesSearch;
    });
    return [...filtered].sort((a, b) => {
      if (sortBy === "price-asc") return a.price - b.price;
      if (sortBy === "price-desc") return b.price - a.price;
      return a.name.localeCompare(b.name);
    });
  }, [items, searchQuery, category, missingOnly, sortBy]);

  /* ------------------------------ INGREDIENTS ------------------------------- */

  // Keep the table row in step with the ingredient list shown in the modal.
  const applyIngredients = (menuId: string, list: Ingredient[]) => {
    setIngredients(list);
    const cost = ingredientCost(list);
    setItems((prev) =>
      prev.map((item) =>
        item.id === menuId
          ? { ...item, ingredientCount: list.length, recipeCost: cost }
          : item,
      ),
    );
    setActiveItem((prev) =>
      prev && prev.id === menuId
        ? { ...prev, ingredientCount: list.length, recipeCost: cost }
        : prev,
    );
  };

  const openIngredients = async (item: MenuItem) => {
    setActiveItem(item);
    setIngredients([]);
    setAddForm({ inventoryId: "", quantity: "", unit: "" });
    setIsIngredientsLoading(true);
    try {
      const [list, opts] = await Promise.all([
        api<Ingredient[]>(
          `${INGREDIENT_API}?menu_id=${encodeURIComponent(item.id)}`,
        ),
        options
          ? Promise.resolve(options)
          : api<InventoryOption[]>(`${INGREDIENT_API}?options=1`),
      ]);
      setIngredients(list);
      setOptions(opts);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Unable to load ingredients.",
      );
    } finally {
      setIsIngredientsLoading(false);
    }
  };

  const closeIngredients = () => {
    setActiveItem(null);
    setIngredients([]);
  };

  const handleSelectInventory = (inventoryId: string) => {
    const option = options?.find((o) => o.inventoryId === inventoryId);
    setAddForm((prev) => ({
      ...prev,
      inventoryId,
      unit: option ? option.unit : prev.unit,
    }));
  };

  const handleAddIngredient = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeItem) return;

    const quantity = Number(addForm.quantity);
    if (!addForm.inventoryId || !Number.isFinite(quantity) || quantity <= 0) {
      showToast("Choose an item and enter a quantity above zero.");
      return;
    }
    if (!addForm.unit.trim()) {
      showToast("Enter a unit.");
      return;
    }

    setIsSaving(true);
    try {
      const created = await api<Ingredient>(INGREDIENT_API, "POST", {
        menuId: activeItem.id,
        inventoryId: addForm.inventoryId,
        quantityUsed: quantity,
        unit: addForm.unit.trim(),
      });
      applyIngredients(activeItem.id, [...ingredients, created]);
      setAddForm({ inventoryId: "", quantity: "", unit: "" });
      showToast(`Added ${created.name} to ${activeItem.name}.`);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Unable to add ingredient.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuantityCommit = async (ingredient: Ingredient, raw: string) => {
    if (!activeItem) return;
    const quantity = Number(raw);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      showToast("Quantity must be above zero.");
      setIngredients((prev) => [...prev]); // reset the input
      return;
    }
    if (quantity === ingredient.quantityUsed) return;

    setIsSaving(true);
    try {
      const updated = await api<Ingredient>(INGREDIENT_API, "PATCH", {
        id: ingredient.id,
        quantityUsed: quantity,
      });
      applyIngredients(
        activeItem.id,
        ingredients.map((i) => (i.id === updated.id ? updated : i)),
      );
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Unable to update quantity.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveIngredient = async (ingredient: Ingredient) => {
    if (!activeItem) return;
    setIsSaving(true);
    try {
      await api<{ id: string }>(
        `${INGREDIENT_API}?id=${encodeURIComponent(ingredient.id)}`,
        "DELETE",
      );
      applyIngredients(
        activeItem.id,
        ingredients.filter((i) => i.id !== ingredient.id),
      );
      showToast(`Removed ${ingredient.name}.`);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Unable to remove ingredient.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  /* --------------------------------- EXPORT --------------------------------- */

  const handleExportCsv = () => {
    const columns = [
      "Menu Name",
      "Category",
      "Selling Price",
      "Ingredients",
      "Recipe Cost",
    ];
    const esc = (v: string | number) => `"${String(v).replaceAll('"', '""')}"`;
    const rows = visibleItems.map((i) =>
      [i.name, i.category, i.price, i.ingredientCount, i.recipeCost.toFixed(2)]
        .map(esc)
        .join(","),
    );
    const file = new Blob(
      ["\uFEFF" + [columns.map(esc).join(","), ...rows].join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "nooma-menu.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  /* --------------------------------- RENDER --------------------------------- */

  const modalCost = ingredientCost(ingredients);
  const modalMargin =
    activeItem && activeItem.price > 0 && modalCost > 0
      ? Math.round(((activeItem.price - modalCost) / activeItem.price) * 100)
      : null;

  const optionsByDepartment = useMemo(() => {
    const map = new Map<string, InventoryOption[]>();
    for (const option of options ?? []) {
      const key = option.department || "Other";
      map.set(key, [...(map.get(key) ?? []), option]);
    }
    return [...map.entries()];
  }, [options]);

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 font-sans antialiased selection:bg-amber-500/20 selection:text-amber-300">
      {toastMessage && (
        <div
          role="status"
          className="fixed top-6 right-6 z-[60] flex items-center gap-3 rounded-2xl border border-amber-500/40 bg-[#0F172A] px-5 py-3.5 text-xs text-amber-300 shadow-2xl backdrop-blur-xl"
        >
          <CheckCircle2 className="size-4 text-amber-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="mx-auto max-w-7xl p-6 md:p-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <UtensilsCrossed className="size-5" />
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-white font-serif">
                Menu
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Kitchen and promo items for NOOMA Kitchen + Bar, with the
              ingredients each one uses.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleExportCsv}
              disabled={visibleItems.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-2.5 text-xs font-medium text-slate-300 transition-all hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="size-3.5 text-slate-400" /> Export CSV
            </button>
            <button
              onClick={reload}
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              <RefreshCw
                className={cn("size-3.5", isLoading && "animate-spin")}
              />
              {isLoading ? "Loading..." : "Refresh menu"}
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Menu items", value: items.length, tone: "text-white" },
            {
              label: "Kitchen",
              value: items.filter((i) => i.category === "Kitchen").length,
              tone: "text-white",
            },
            {
              label: "Promo",
              value: items.filter((i) => i.category === "Promo").length,
              tone: "text-white",
            },
            {
              label: "Missing ingredients",
              value: missingCount,
              tone: missingCount > 0 ? "text-amber-400" : "text-emerald-400",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-slate-800/80 bg-[#0F172A]/90 p-5 shadow-xl"
            >
              <p className="text-xs font-semibold text-slate-400">
                {stat.label}
              </p>
              <p
                className={cn(
                  "mt-2 text-2xl font-bold font-serif tracking-tight",
                  stat.tone,
                )}
              >
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="rounded-2xl border border-slate-800/80 bg-[#0F172A]/90 p-4 shadow-xl space-y-4">
          <div className="flex flex-col lg:flex-row gap-4 lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by menu name..."
                className="w-full rounded-xl border border-slate-800 bg-[#020617] pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-amber-500/80 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              aria-label="Sort menu"
              className="rounded-xl border border-slate-800 bg-[#020617] px-3 py-2.5 text-xs text-slate-200 focus:border-amber-500/80 focus:outline-none"
            >
              <option value="name">Sort: Name</option>
              <option value="price-asc">Sort: Price, low to high</option>
              <option value="price-desc">Sort: Price, high to low</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {["All", ...CATEGORIES].map((cat) => {
              const isActive = category === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={cn(
                    "px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all border",
                    isActive
                      ? "bg-slate-800 text-amber-400 border-slate-700 shadow-md font-semibold"
                      : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border-transparent",
                  )}
                >
                  {cat}
                </button>
              );
            })}
            <button
              onClick={() => setMissingOnly((v) => !v)}
              className={cn(
                "ml-auto px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all border",
                missingOnly
                  ? "bg-amber-500/10 text-amber-300 border-amber-500/40 font-semibold"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border-slate-800",
              )}
            >
              Missing ingredients only
            </button>
          </div>
        </div>

        {/* Menu table */}
        <div className="rounded-2xl border border-slate-800/80 bg-[#0F172A]/90 shadow-xl overflow-hidden">
          <div className="p-5 border-b border-slate-800">
            <h2 className="text-base font-serif font-semibold text-white">
              Menu items
            </h2>
            <p className="text-xs text-slate-400">
              Showing {visibleItems.length} of {items.length} items
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-[#020617]/60 text-[10px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-3.5 px-4 font-semibold">Menu name</th>
                  <th className="py-3.5 px-4 font-semibold">Category</th>
                  <th className="py-3.5 px-4 font-semibold text-right">
                    Selling price
                  </th>
                  <th className="py-3.5 px-4 font-semibold">Ingredients</th>
                  <th className="py-3.5 px-4 font-semibold text-right">
                    Recipe cost
                  </th>
                  <th className="py-3.5 px-4 font-semibold text-right">
                    Margin
                  </th>
                  <th className="py-3.5 px-4 font-semibold text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-12 text-center text-slate-400"
                    >
                      Loading menu...
                    </td>
                  </tr>
                ) : loadError ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-red-300">
                      {loadError}{" "}
                      <button
                        onClick={reload}
                        className="ml-2 text-amber-300 underline underline-offset-2"
                      >
                        Retry
                      </button>
                    </td>
                  </tr>
                ) : visibleItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-12 text-center text-slate-500"
                    >
                      {items.length === 0
                        ? "No menu items yet. Sync StoreHub on the inventory page to add them."
                        : "No menu items match your filters."}
                    </td>
                  </tr>
                ) : (
                  visibleItems.map((item) => {
                    const margin =
                      item.price > 0 && item.recipeCost > 0
                        ? Math.round(
                            ((item.price - item.recipeCost) / item.price) * 100,
                          )
                        : null;

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-4 px-4 font-serif font-semibold text-slate-100">
                          {item.name}
                        </td>
                        <td className="py-4 px-4">
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800/80 border border-slate-700/50 px-2.5 py-1 text-[11px] text-slate-300">
                            {item.category === "Promo" ? (
                              <Sparkles className="size-3.5" />
                            ) : (
                              <ChefHat className="size-3.5" />
                            )}
                            {item.category}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-right font-mono font-semibold text-amber-400">
                          {peso(item.price)}
                        </td>
                        <td className="py-4 px-4">
                          {item.ingredientCount === 0 ? (
                            <span className="rounded-full border border-amber-700/50 bg-amber-950/80 px-2.5 py-1 text-[10px] font-semibold text-amber-300">
                              No ingredients
                            </span>
                          ) : (
                            <span className="text-slate-300">
                              {item.ingredientCount} ingredient
                              {item.ingredientCount === 1 ? "" : "s"}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-right font-mono text-slate-300">
                          {item.recipeCost > 0 ? peso(item.recipeCost) : "—"}
                        </td>
                        <td
                          className={cn(
                            "py-4 px-4 text-right font-mono",
                            margin === null
                              ? "text-slate-500"
                              : margin < 0
                                ? "text-red-400"
                                : "text-emerald-400",
                          )}
                        >
                          {margin === null ? "—" : `${margin}%`}
                        </td>
                        <td className="py-4 px-4 text-right">
                          <button
                            onClick={() => openIngredients(item)}
                            className="px-2.5 py-1 rounded-lg border border-slate-700/80 bg-slate-800 text-[11px] font-medium text-amber-300 hover:bg-slate-700 transition-colors"
                          >
                            {item.ingredientCount === 0
                              ? "Add ingredients"
                              : "Ingredients"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Ingredients modal */}
      {activeItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-[#0F172A] p-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-500">
                  Ingredients
                </p>
                <h3 className="mt-0.5 font-serif text-xl font-bold text-white">
                  {activeItem.name}
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  {activeItem.category} · Selling price {peso(activeItem.price)}
                </p>
              </div>
              <button
                type="button"
                onClick={closeIngredients}
                aria-label="Close"
                className="p-1.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Current ingredients */}
            <div className="mt-5 overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#020617]/60 text-[10px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="py-3 px-3 font-semibold">Inventory item</th>
                    <th className="py-3 px-3 font-semibold">Quantity used</th>
                    <th className="py-3 px-3 font-semibold">Unit</th>
                    <th className="py-3 px-3 font-semibold text-right">Cost</th>
                    <th className="py-3 px-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {isIngredientsLoading ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-8 text-center text-slate-400"
                      >
                        Loading ingredients...
                      </td>
                    </tr>
                  ) : ingredients.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-8 text-center text-slate-500"
                      >
                        No ingredients yet. Add the first one below.
                      </td>
                    </tr>
                  ) : (
                    ingredients.map((ingredient) => (
                      <tr key={ingredient.id}>
                        <td className="py-3 px-3">
                          <span className="font-semibold text-slate-100">
                            {ingredient.name}
                          </span>
                          <span className="block text-[10px] text-slate-500">
                            {ingredient.department}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <input
                            key={`${ingredient.id}-${ingredient.quantityUsed}`}
                            type="number"
                            min="0"
                            step="0.01"
                            defaultValue={ingredient.quantityUsed}
                            disabled={isSaving}
                            onBlur={(e) =>
                              handleQuantityCommit(ingredient, e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                            }}
                            aria-label={`Quantity of ${ingredient.name}`}
                            className="w-24 rounded-lg border border-slate-800 bg-[#020617] px-2 py-1.5 text-slate-100 focus:border-amber-500 focus:outline-none"
                          />
                        </td>
                        <td className="py-3 px-3 text-slate-300">
                          {ingredient.unit}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-300">
                          {ingredient.costPerUnit > 0
                            ? peso(
                                ingredient.quantityUsed *
                                  ingredient.costPerUnit,
                              )
                            : "—"}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveIngredient(ingredient)}
                            disabled={isSaving}
                            aria-label={`Remove ${ingredient.name}`}
                            className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-red-400 hover:bg-slate-800 disabled:opacity-40"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-[#020617] px-4 py-3 text-xs text-slate-300">
              <span>
                Recipe cost{" "}
                <span className="font-mono font-semibold text-amber-400">
                  {modalCost > 0 ? peso(modalCost) : "—"}
                </span>
              </span>
              <span>
                Margin{" "}
                <span
                  className={cn(
                    "font-mono font-semibold",
                    modalMargin === null
                      ? "text-slate-500"
                      : modalMargin < 0
                        ? "text-red-400"
                        : "text-emerald-400",
                  )}
                >
                  {modalMargin === null ? "—" : `${modalMargin}%`}
                </span>
              </span>
            </div>

            {/* Add ingredient */}
            <form
              onSubmit={handleAddIngredient}
              className="mt-5 space-y-3 text-xs"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Add ingredient
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_7rem_6rem] gap-3">
                <select
                  value={addForm.inventoryId}
                  onChange={(e) => handleSelectInventory(e.target.value)}
                  required
                  aria-label="Inventory item"
                  className="w-full rounded-xl border border-slate-800 bg-[#020617] px-3 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                >
                  <option value="">Select inventory item</option>
                  {optionsByDepartment.map(([department, list]) => (
                    <optgroup key={department} label={department}>
                      {list.map((option) => (
                        <option
                          key={option.inventoryId}
                          value={option.inventoryId}
                        >
                          {option.name} ({option.unit})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  placeholder="Quantity"
                  value={addForm.quantity}
                  onChange={(e) =>
                    setAddForm((prev) => ({
                      ...prev,
                      quantity: e.target.value,
                    }))
                  }
                  aria-label="Quantity used"
                  className="w-full rounded-xl border border-slate-800 bg-[#020617] px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
                />
                <input
                  type="text"
                  required
                  placeholder="Unit"
                  value={addForm.unit}
                  onChange={(e) =>
                    setAddForm((prev) => ({ ...prev, unit: e.target.value }))
                  }
                  aria-label="Unit"
                  className="w-full rounded-xl border border-slate-800 bg-[#020617] px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>

              {options !== null && options.length === 0 && (
                <p className="text-amber-300">
                  No inventory items found. Add items on the inventory page
                  first.
                </p>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={closeIngredients}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  Done
                </button>
                <button
                  type="submit"
                  disabled={isSaving || isIngredientsLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 font-semibold text-slate-950 hover:bg-amber-400 shadow-md shadow-amber-500/20 disabled:opacity-50"
                >
                  <Plus className="size-4" />
                  {isSaving ? "Saving..." : "Add ingredient"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
