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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
            <Button
              type="button"
              variant="outline"
              onClick={handleExportCsv}
              disabled={visibleItems.length === 0}
              className="rounded-xl border-slate-800 bg-slate-900/80 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <Download className="size-3.5 text-slate-400" /> Export CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={reload}
              disabled={isLoading}
              className="rounded-xl border-emerald-500/30 bg-emerald-500/10 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300"
            >
              <RefreshCw
                className={cn("size-3.5", isLoading && "animate-spin")}
              />
              {isLoading ? "Loading..." : "Refresh menu"}
            </Button>
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
            <Card
              key={stat.label}
              className="rounded-2xl border-slate-800/80 bg-[#0F172A]/90 py-0 text-slate-100 shadow-xl"
            >
              <CardContent className="gap-0 p-5">
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
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card className="gap-0 rounded-2xl border-slate-800/80 bg-[#0F172A]/90 py-0 text-slate-100 shadow-xl">
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by menu name..."
                  className="h-10 rounded-xl border-slate-800 bg-[#020617] pl-10 text-xs text-slate-200 placeholder:text-slate-500 focus-visible:border-amber-500/80 focus-visible:ring-amber-500/20"
                />
              </div>

              <Select
                value={sortBy}
                onValueChange={(value) => {
                  if (
                    value === "name" ||
                    value === "price-asc" ||
                    value === "price-desc"
                  ) {
                    setSortBy(value);
                  }
                }}
              >
                <SelectTrigger
                  aria-label="Sort menu"
                  className="w-full rounded-xl border-slate-800 bg-[#020617] text-xs text-slate-200 lg:w-56"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Sort: Name</SelectItem>
                  <SelectItem value="price-asc">
                    Sort: Price, low to high
                  </SelectItem>
                  <SelectItem value="price-desc">
                    Sort: Price, high to low
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {["All", ...CATEGORIES].map((cat) => {
                const isActive = category === cat;
                return (
                  <Button
                    type="button"
                    key={cat}
                    onClick={() => setCategory(cat)}
                    variant={isActive ? "secondary" : "ghost"}
                    aria-pressed={isActive}
                    className={cn(
                      "h-9 rounded-xl border px-3.5 text-xs font-medium whitespace-nowrap",
                      isActive
                        ? "border-slate-700 bg-slate-800 font-semibold text-amber-400 hover:bg-slate-700"
                        : "border-transparent text-slate-400 hover:bg-slate-800/50 hover:text-slate-200",
                    )}
                  >
                    {cat}
                  </Button>
                );
              })}
              <Button
                type="button"
                onClick={() => setMissingOnly((v) => !v)}
                variant={missingOnly ? "secondary" : "outline"}
                aria-pressed={missingOnly}
                className={cn(
                  "ml-auto h-9 rounded-xl px-3.5 text-xs font-medium whitespace-nowrap",
                  missingOnly
                    ? "border-amber-500/40 bg-amber-500/10 font-semibold text-amber-300 hover:bg-amber-500/20"
                    : "border-slate-800 text-slate-400 hover:bg-slate-800/50 hover:text-slate-200",
                )}
              >
                Missing ingredients only
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Menu table */}
        <Card className="gap-0 rounded-2xl border-slate-800/80 bg-[#0F172A]/90 py-0 text-slate-100 shadow-xl">
          <CardHeader className="border-b border-slate-800 p-5">
            <CardTitle className="font-serif text-base font-semibold text-white">
              Menu items
            </CardTitle>
            <p className="text-xs text-slate-400">
              Showing {visibleItems.length} of {items.length} items
            </p>
          </CardHeader>

          <CardContent className="p-0">
            <Table className="text-left text-xs">
              <TableHeader className="border-b border-slate-800 bg-[#020617]/60 text-[10px] uppercase tracking-wider text-slate-400 [&_tr]:border-slate-800">
                <TableRow>
                  <TableHead className="h-auto px-4 py-3.5 font-semibold text-slate-400">
                    Menu name
                  </TableHead>
                  <TableHead className="h-auto px-4 py-3.5 font-semibold text-slate-400">
                    Category
                  </TableHead>
                  <TableHead className="h-auto px-4 py-3.5 text-right font-semibold text-slate-400">
                    Selling price
                  </TableHead>
                  <TableHead className="h-auto px-4 py-3.5 font-semibold text-slate-400">
                    Ingredients
                  </TableHead>
                  <TableHead className="h-auto px-4 py-3.5 text-right font-semibold text-slate-400">
                    Recipe cost
                  </TableHead>
                  <TableHead className="h-auto px-4 py-3.5 text-right font-semibold text-slate-400">
                    Margin
                  </TableHead>
                  <TableHead className="h-auto px-4 py-3.5 text-right font-semibold text-slate-400">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-800/60 [&_tr]:border-slate-800/60">
                {isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-12 text-center text-slate-400"
                    >
                      Loading menu...
                    </TableCell>
                  </TableRow>
                ) : loadError ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-red-300">
                      {loadError}{" "}
                      <Button
                        type="button"
                        variant="link"
                        onClick={reload}
                        className="ml-2 h-auto p-0 text-amber-300"
                      >
                        Retry
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : visibleItems.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-12 text-center text-slate-500"
                    >
                      {items.length === 0
                        ? "No menu items yet. Sync StoreHub on the inventory page to add them."
                        : "No menu items match your filters."}
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleItems.map((item) => {
                    const margin =
                      item.price > 0 && item.recipeCost > 0
                        ? Math.round(
                            ((item.price - item.recipeCost) / item.price) * 100,
                          )
                        : null;

                    return (
                      <TableRow
                        key={item.id}
                        className="border-slate-800/60 transition-colors hover:bg-slate-800/40"
                      >
                        <TableCell className="px-4 py-4 font-serif font-semibold text-slate-100">
                          {item.name}
                        </TableCell>
                        <TableCell className="px-4 py-4">
                          <Badge variant="outline" className="h-auto gap-1.5 rounded-lg border-slate-700/50 bg-slate-800/80 px-2.5 py-1 text-[11px] text-slate-300">
                            {item.category === "Promo" ? (
                              <Sparkles className="size-3.5" />
                            ) : (
                              <ChefHat className="size-3.5" />
                            )}
                            {item.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-4 py-4 text-right font-mono font-semibold text-amber-400">
                          {peso(item.price)}
                        </TableCell>
                        <TableCell className="px-4 py-4">
                          {item.ingredientCount === 0 ? (
                          <Badge variant="outline" className="h-auto rounded-full border-amber-700/50 bg-amber-950/80 px-2.5 py-1 text-[10px] font-semibold text-amber-300">
                              No ingredients
                          </Badge>
                          ) : (
                            <span className="text-slate-300">
                              {item.ingredientCount} ingredient
                              {item.ingredientCount === 1 ? "" : "s"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-4 text-right font-mono text-slate-300">
                          {item.recipeCost > 0 ? peso(item.recipeCost) : "—"}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "px-4 py-4 text-right font-mono",
                            margin === null
                              ? "text-slate-500"
                              : margin < 0
                                ? "text-red-400"
                                : "text-emerald-400",
                          )}
                        >
                          {margin === null ? "—" : `${margin}%`}
                        </TableCell>
                        <TableCell className="px-4 py-4 text-right">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => openIngredients(item)}
                            className="h-8 rounded-lg border-slate-700/80 bg-slate-800 px-2.5 text-[11px] font-medium text-amber-300 hover:bg-slate-700 hover:text-amber-200"
                          >
                            {item.ingredientCount === 0
                              ? "Add ingredients"
                              : "Ingredients"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Ingredients modal */}
      <Dialog
        open={activeItem !== null}
        onOpenChange={(open) => {
          if (!open) closeIngredients();
        }}
      >
        {activeItem && (
          <DialogContent
            showCloseButton={false}
            className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-2xl border-slate-800 bg-[#0F172A] p-6 text-slate-100 shadow-2xl sm:max-w-2xl"
          >
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <DialogHeader className="gap-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-500">
                  Ingredients
                </p>
                <DialogTitle className="font-serif text-xl font-bold text-white">
                  {activeItem.name}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400">
                  {activeItem.category} · Selling price {peso(activeItem.price)}
                </DialogDescription>
              </DialogHeader>
              <Button
                type="button"
                onClick={closeIngredients}
                aria-label="Close"
                variant="outline"
                size="icon-sm"
                className="rounded-xl border-slate-800 bg-slate-900 text-slate-400 hover:text-white"
              >
                <X className="size-4" />
              </Button>
            </div>

            {/* Current ingredients */}
            <div className="mt-5 rounded-xl border border-slate-800">
              <Table className="text-left text-xs">
                <TableHeader className="bg-[#020617]/60 text-[10px] uppercase tracking-wider text-slate-400 [&_tr]:border-slate-800">
                  <TableRow>
                    <TableHead className="h-auto px-3 py-3 font-semibold text-slate-400">
                      Inventory item
                    </TableHead>
                    <TableHead className="h-auto px-3 py-3 font-semibold text-slate-400">
                      Quantity used
                    </TableHead>
                    <TableHead className="h-auto px-3 py-3 font-semibold text-slate-400">
                      Unit
                    </TableHead>
                    <TableHead className="h-auto px-3 py-3 text-right font-semibold text-slate-400">
                      Cost
                    </TableHead>
                    <TableHead className="h-auto px-3 py-3" />
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-800/60 [&_tr]:border-slate-800/60">
                  {isIngredientsLoading ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-8 text-center text-slate-400"
                      >
                        Loading ingredients...
                      </TableCell>
                    </TableRow>
                  ) : ingredients.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-8 text-center text-slate-500"
                      >
                        No ingredients yet. Add the first one below.
                      </TableCell>
                    </TableRow>
                  ) : (
                    ingredients.map((ingredient) => (
                      <TableRow key={ingredient.id}>
                        <TableCell className="px-3 py-3">
                          <span className="font-semibold text-slate-100">
                            {ingredient.name}
                          </span>
                          <span className="block text-[10px] text-slate-500">
                            {ingredient.department}
                          </span>
                        </TableCell>
                        <TableCell className="px-3 py-3">
                          <Input
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
                            className="h-9 w-24 rounded-lg border-slate-800 bg-[#020617] px-2 text-slate-100 focus-visible:border-amber-500"
                          />
                        </TableCell>
                        <TableCell className="px-3 py-3 text-slate-300">
                          {ingredient.unit}
                        </TableCell>
                        <TableCell className="px-3 py-3 text-right font-mono text-slate-300">
                          {ingredient.costPerUnit > 0
                            ? peso(
                                ingredient.quantityUsed *
                                  ingredient.costPerUnit,
                              )
                            : "—"}
                        </TableCell>
                        <TableCell className="px-3 py-3 text-right">
                          <Button
                            type="button"
                            onClick={() => handleRemoveIngredient(ingredient)}
                            disabled={isSaving}
                            aria-label={`Remove ${ingredient.name}`}
                            variant="outline"
                            size="icon-sm"
                            className="rounded-lg border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-red-400"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
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
                <Select
                  value={addForm.inventoryId}
                  onValueChange={(value) => handleSelectInventory(value ?? "")}
                >
                  <SelectTrigger
                    aria-label="Inventory item"
                    className="w-full rounded-xl border-slate-800 bg-[#020617] text-slate-100"
                  >
                    <SelectValue placeholder="Select inventory item" />
                  </SelectTrigger>
                  <SelectContent>
                  {optionsByDepartment.map(([department, list]) => (
                    <SelectGroup key={department}>
                      <SelectLabel>{department}</SelectLabel>
                      {list.map((option) => (
                        <SelectItem
                          key={option.inventoryId}
                          value={option.inventoryId}
                        >
                          {option.name} ({option.unit})
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                  </SelectContent>
                </Select>
                <Input
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
                  className="h-10 w-full rounded-xl border-slate-800 bg-[#020617] text-slate-100 placeholder:text-slate-600 focus-visible:border-amber-500"
                />
                <Input
                  type="text"
                  required
                  placeholder="Unit"
                  value={addForm.unit}
                  onChange={(e) =>
                    setAddForm((prev) => ({ ...prev, unit: e.target.value }))
                  }
                  aria-label="Unit"
                  className="h-10 w-full rounded-xl border-slate-800 bg-[#020617] text-slate-100 placeholder:text-slate-600 focus-visible:border-amber-500"
                />
              </div>

              {options !== null && options.length === 0 && (
                <p className="text-amber-300">
                  No inventory items found. Add items on the inventory page
                  first.
                </p>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <Button
                  type="button"
                  onClick={closeIngredients}
                  variant="outline"
                  className="rounded-xl border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white"
                >
                  Done
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving || isIngredientsLoading}
                  className="rounded-xl bg-amber-500 font-semibold text-slate-950 shadow-md shadow-amber-500/20 hover:bg-amber-400"
                >
                  <Plus className="size-4" />
                  {isSaving ? "Saving..." : "Add ingredient"}
                </Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
