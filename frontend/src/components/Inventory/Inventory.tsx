import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Boxes,
  AlertTriangle,
  PackageCheck,
  TrendingDown,
  Plus,
  Search,
  PlusCircle,
  MinusCircle,
  X,
  CheckCircle2,
  Download,
  RefreshCw,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Utility for merging Tailwind class names
function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

type InventoryItem = {
  id: string;
  name: string;
  category: string;
  stock: number;
  minStock: number;
  maxStock: number;
  unit: string;
  costPerUnit: number;
  supplier: string;
  lastRestocked: string;
  status: string;
};

type NewInventoryForm = {
  name: string;
  department: string | null;
  quantity: number;
  unit: string;
  purchases: number;
  sold: number;
  used: number;
  ending: number;
  remarks: string;
};

type StockAdjustment = {
  type: "add" | "subtract";
  amount: number;
  reason: string;
  note: string;
};

type InventoryEditForm = {
  name: string;
  category: string;
  unit: string;
  minStock: string;
  maxStock: string;
  costPerUnit: string;
  supplier: string;
};

type InventoryApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

type SyncResult = {
  date: string;
  synced: number;
  syncedAt?: string;
  menu?: number;
  ingredientsDeducted?: number;
  unitWarnings?: string[];
  skipped?: number;
  byDepartment?: Record<string, number>;
};

type SyncStatus = {
  date: string;
  synced: boolean;
  syncedAt: string | null;
};

const DEPARTMENTS = [
  "Kitchen Inventory",
  "Bar Inventory",
  "Promo Inventory",
] as const;

const EMPTY_NEW_ITEM: NewInventoryForm = {
  name: "",
  department: "",
  quantity: 0,
  unit: "",
  purchases: 0,
  sold: 0,
  used: 0,
  ending: 0,
  remarks: "",
};

// YYYY-MM-DD in Manila time (en-CA formats as an ISO date).
// toISOString() would use UTC and show yesterday between 12AM and 8AM.
const todayISO = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(
    new Date(),
  );

// Derive status from numbers so the badge is always right,
// even if the backend returns an empty or stale status.
function getStatus(
  item: InventoryItem,
): "In Stock" | "Low Stock" | "Out of Stock" {
  if (item.stock <= 0) return "Out of Stock";
  if (item.stock <= item.minStock) return "Low Stock";
  return "In Stock";
}

async function inventoryRequest<T>(
  method: "GET" | "POST" | "PATCH" = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch("../backend/inventory/inventory.php", {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const result = (await response.json()) as InventoryApiResponse<T>;

  if (!response.ok || !result.success || result.data === undefined) {
    throw new Error(
      result.message || "Unable to complete the inventory request.",
    );
  }

  return result.data;
}

// StoreHub credentials live in PHP only. The browser just triggers the sync.
async function storeHubSyncRequest(date: string): Promise<SyncResult> {
  const response = await fetch("../backend/inventory/storehub_sync.php", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date }),
  });
  const result = (await response.json()) as InventoryApiResponse<SyncResult>;

  if (!response.ok || !result.success || !result.data) {
    throw new Error(result.message || "StoreHub sync failed.");
  }
  return result.data;
}

async function storeHubSyncStatusRequest(date: string): Promise<SyncStatus> {
  const response = await fetch(
    `../backend/inventory/storehub_sync.php?date=${encodeURIComponent(date)}`,
    { credentials: "same-origin" },
  );
  const result = (await response.json()) as InventoryApiResponse<SyncStatus>;

  if (!response.ok || !result.success || !result.data) {
    throw new Error(result.message || "Unable to check sync status.");
  }
  return result.data;
}

/* -------------------------------------------------------------------------- */
/*                          MAIN INVENTORY COMPONENT                          */
/* -------------------------------------------------------------------------- */

export default function InventoryManagement() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncDate, setSyncDate] = useState(todayISO());
  const [syncStatus, setSyncStatus] = useState<
    | {
        date: string;
        state: "checking" | "synced" | "not-synced";
      }
    | { date: string; state: "error"; message: string }
  >({ date: todayISO(), state: "checking" });
  const [syncStatusReload, setSyncStatusReload] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Modals state
  const [isNewItemOpen, setIsNewItemOpen] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedItemForAdjust, setSelectedItemForAdjust] =
    useState<InventoryItem | null>(null);
  const [selectedItemForEdit, setSelectedItemForEdit] =
    useState<InventoryItem | null>(null);

  // New Item Form State
  const [newItem, setNewItem] = useState<NewInventoryForm>(EMPTY_NEW_ITEM);
  const [editData, setEditData] = useState<InventoryEditForm>({
    name: "",
    category: "",
    unit: "",
    minStock: "5",
    maxStock: "50",
    costPerUnit: "0",
    supplier: "",
  });

  // Adjust Stock Form State
  const [adjustData, setAdjustData] = useState<StockAdjustment>({
    type: "add",
    amount: 1,
    reason: "Delivery Receive",
    note: "",
  });

  // Notification Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  /* ------------------------------- DATA LOAD -------------------------------- */

  useEffect(() => {
    const controller = new AbortController();
    inventoryRequest<InventoryItem[]>("GET", undefined, controller.signal)
      .then((items) => {
        setInventory(items);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Unable to load inventory.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [reloadToken]);

  useEffect(() => {
    const controller = new AbortController();
    const requestedDate = syncDate;

    storeHubSyncStatusRequest(requestedDate)
      .then((status) => {
        if (!controller.signal.aborted) {
          setSyncStatus({
            date: status.date,
            state: status.synced ? "synced" : "not-synced",
          });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setSyncStatus({
            date: requestedDate,
            state: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to check sync status.",
          });
        }
      });

    return () => controller.abort();
  }, [syncDate, syncStatusReload]);

  // Clear any pending toast timer on unmount
  useEffect(() => {
    return () => window.clearTimeout(toastTimer.current);
  }, []);

  const showToast = (msg: string) => {
    window.clearTimeout(toastTimer.current);
    setToastMessage(msg);
    toastTimer.current = window.setTimeout(() => setToastMessage(null), 3500);
  };

  const reloadInventory = () => {
    setLoadError(null);
    setIsLoading(true);
    setReloadToken((token) => token + 1);
  };

  const categories = [
    "All",
    ...new Set([...DEPARTMENTS, ...inventory.map((item) => item.category)]),
  ].filter(Boolean);

  /* ------------------------------- METRICS ---------------------------------- */

  const totalStockValue = inventory.reduce(
    (sum, item) => sum + item.stock * item.costPerUnit,
    0,
  );
  const lowStockCount = inventory.filter(
    (item) => item.stock > 0 && item.stock <= item.minStock,
  ).length;
  const outOfStockCount = inventory.filter((item) => item.stock <= 0).length;
  const healthyStockCount = inventory.filter(
    (item) => item.stock > item.minStock,
  ).length;

  /* ------------------------------- FILTERING -------------------------------- */

  const query = searchQuery.trim().toLowerCase();
  const filteredInventory = inventory.filter((item) => {
    const matchesCategory =
      selectedCategory === "All" || item.category === selectedCategory;
    const matchesSearch =
      item.name.toLowerCase().includes(query) ||
      item.id.toLowerCase().includes(query) ||
      (item.supplier ?? "").toLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  });

  /* -------------------------------- HANDLERS -------------------------------- */

  const updateItem = (updatedItem: InventoryItem) => {
    setInventory((prev) =>
      prev.map((item) => (item.id === updatedItem.id ? updatedItem : item)),
    );
  };

  const handleQuickQuantityChange = async (id: string, delta: number) => {
    setIsSaving(true);
    try {
      const updatedItem = await inventoryRequest<InventoryItem>("PATCH", {
        id,
        type: delta > 0 ? "add" : "subtract",
        amount: Math.abs(delta),
        reason: "Quick stock adjustment",
      });
      updateItem(updatedItem);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Unable to adjust stock.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateItemSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newItem.name.trim() || !newItem.department || !newItem.unit.trim()) {
      return;
    }

    setIsSaving(true);
    try {
      const stock = newItem.ending || newItem.quantity;
      const createdRecord = await inventoryRequest<InventoryItem>("POST", {
        id: `INV-${Date.now()}`,
        name: newItem.name.trim(),
        category: newItem.department,
        stock,
        minStock: 5,
        maxStock: Math.max(50, stock),
        unit: newItem.unit.trim(),
        costPerUnit: 0,
        supplier: "",
        beginning: newItem.quantity,
        purchases: newItem.purchases,
        soldUsed: newItem.sold + newItem.used,
        remarks: newItem.remarks.trim(),
      });
      setInventory((prev) => [createdRecord, ...prev]);
      setIsNewItemOpen(false);
      setNewItem(EMPTY_NEW_ITEM);
      showToast(`Added ingredient: "${createdRecord.name}" to inventory.`);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Unable to add inventory item.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdjustSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedItemForAdjust) return;

    const amount = Number(adjustData.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("Enter a quantity greater than zero.");
      return;
    }

    setIsSaving(true);
    try {
      const updatedItem = await inventoryRequest<InventoryItem>("PATCH", {
        id: selectedItemForAdjust.id,
        ...adjustData,
        amount,
      });
      updateItem(updatedItem);
      showToast(
        `Adjusted ${selectedItemForAdjust.name}: ${
          adjustData.type === "add" ? "+" : "-"
        }${amount} ${selectedItemForAdjust.unit}`,
      );
      setIsAdjustOpen(false);
      setSelectedItemForAdjust(null);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Unable to adjust stock.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const openEditModal = (item: InventoryItem) => {
    setSelectedItemForEdit(item);
    setEditData({
      name: item.name,
      category: item.category,
      unit: item.unit,
      minStock: String(item.minStock),
      maxStock: String(item.maxStock),
      costPerUnit: String(item.costPerUnit),
      supplier: item.supplier,
    });
    setIsEditOpen(true);
  };

  const handleEditSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedItemForEdit) return;

    const minStock = Number(editData.minStock);
    const maxStock = Number(editData.maxStock);
    const costPerUnit = Number(editData.costPerUnit);
    if (
      !editData.name.trim() ||
      !editData.category.trim() ||
      !editData.unit.trim() ||
      !Number.isFinite(minStock) ||
      minStock < 0 ||
      !Number.isFinite(maxStock) ||
      maxStock <= 0 ||
      maxStock < minStock ||
      !Number.isFinite(costPerUnit) ||
      costPerUnit < 0
    ) {
      showToast("Enter valid item details and stock thresholds.");
      return;
    }

    setIsSaving(true);
    try {
      const updatedItem = await inventoryRequest<InventoryItem>("PATCH", {
        action: "edit",
        id: selectedItemForEdit.id,
        ...editData,
        name: editData.name.trim(),
        category: editData.category.trim(),
        unit: editData.unit.trim(),
        supplier: editData.supplier.trim(),
        minStock,
        maxStock,
        costPerUnit,
      });
      updateItem(updatedItem);
      setIsEditOpen(false);
      setSelectedItemForEdit(null);
      showToast(`Updated "${updatedItem.name}".`);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Unable to update item.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncStoreHub = async () => {
    if (isSyncing) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(syncDate)) {
      showToast("Pick a valid sync date.");
      return;
    }

    setIsSyncing(true);
    try {
      const result = await storeHubSyncRequest(syncDate);
      reloadInventory();
      setSyncStatusReload((value) => value + 1);
      const menuCount = result.menu ?? 0;
      const ingredientsDeducted = result.ingredientsDeducted ?? 0;
      const unitWarnings = result.unitWarnings ?? [];
      const skipped = result.skipped ?? 0;
      showToast(
        `Synced ${result.synced} bar item${result.synced === 1 ? "" : "s"}, ${menuCount} menu item${menuCount === 1 ? "" : "s"}, and deducted ingredients for ${ingredientsDeducted} item${ingredientsDeducted === 1 ? "" : "s"} on ${result.date}.` +
          (unitWarnings.length > 0
            ? ` Recipe unit mismatch: ${unitWarnings[0]}${unitWarnings.length > 1 ? ` (+${unitWarnings.length - 1} more)` : ""}`
            : "") +
          (skipped > 0
            ? ` ${skipped} transaction${skipped === 1 ? "" : "s"} on other dates skipped.`
            : ""),
      );
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "StoreHub sync failed.",
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportCsv = () => {
    const columns = [
      "SKU",
      "Name",
      "Category",
      "Stock",
      "Unit",
      "Minimum Stock",
      "Maximum Stock",
      "Unit Cost",
      "Supplier",
      "Last Restocked",
      "Status",
    ];
    const escapeCsv = (value: string | number | null | undefined) =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = inventory.map((item) =>
      [
        item.id,
        item.name,
        item.category,
        item.stock,
        item.unit,
        item.minStock,
        item.maxStock,
        item.costPerUnit,
        item.supplier,
        item.lastRestocked,
        getStatus(item),
      ]
        .map(escapeCsv)
        .join(","),
    );
    const file = new Blob(
      ["\uFEFF" + [columns.map(escapeCsv).join(","), ...rows].join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nooma-inventory-${todayISO()}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const openAdjustModal = (item: InventoryItem) => {
    setSelectedItemForAdjust(item);
    setAdjustData({
      type: "add",
      amount: 1,
      reason: "Delivery Receive",
      note: "",
    });
    setIsAdjustOpen(true);
  };

  const currentSyncStatus =
    syncStatus.date === syncDate ? syncStatus.state : "checking";

  /* --------------------------------- RENDER --------------------------------- */

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 font-sans antialiased selection:bg-amber-500/20 selection:text-amber-300">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          className="fixed top-6 right-6 z-50 flex items-center gap-3 rounded-2xl border border-amber-500/40 bg-[#0F172A] px-5 py-3.5 text-xs text-amber-300 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-4"
        >
          <CheckCircle2 className="size-4 text-amber-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Container */}
      <div className="mx-auto max-w-7xl p-6 md:p-8 space-y-8">
        {/* Top Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Boxes className="size-5" />
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-white font-serif">
                Stock & Inventory Management
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Real-time ingredient levels, cost tracking, supplier logs, and
              reorder management for NOOMA Kitchen + Bar.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            {/* <Button
              onClick={handleExportCsv}
              disabled={inventory.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-2.5 text-xs font-medium text-slate-300 transition-all hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="size-3.5 text-slate-400" /> Export CSV
            </Button> */}
            <Button
              onClick={() => setIsNewItemOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2.5 text-xs font-semibold text-slate-950 shadow-lg shadow-amber-500/20 transition-all hover:from-amber-400 hover:to-amber-500 active:scale-[0.98]"
            >
              <Plus className="size-4" /> Add New Item
            </Button>

            {/* StoreHub sync: date + button */}
            <div className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-1 pl-3">
              <label htmlFor="sync-date" className="sr-only">
                StoreHub sync date
              </label>
              <Input
                id="sync-date"
                type="date"
                value={syncDate}
                max={todayISO()}
                onChange={(e) => setSyncDate(e.target.value)}
                disabled={isSyncing}
                className="bg-transparent text-xs text-emerald-200 focus:outline-none [color-scheme:dark] disabled:opacity-50"
              />
              <span
                title={
                  currentSyncStatus === "error" && "message" in syncStatus
                    ? syncStatus.message
                    : undefined
                }
                className={cn(
                  "inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-[10px] font-semibold",
                  currentSyncStatus === "synced" &&
                    "bg-emerald-500/20 text-emerald-200",
                  currentSyncStatus === "not-synced" &&
                    "bg-slate-800/80 text-slate-400",
                  currentSyncStatus === "checking" &&
                    "bg-slate-800/80 text-slate-400",
                  isSyncing && "bg-blue-500/15 text-blue-200",
                  currentSyncStatus === "error" && "bg-red-500/15 text-red-300",
                )}
              >
                {isSyncing && "Syncing..."}
                {!isSyncing && currentSyncStatus === "synced" && (
                  <>
                    <CheckCircle2 className="size-3" />
                    Already synced
                  </>
                )}
                {!isSyncing &&
                  currentSyncStatus === "not-synced" &&
                  "Not synced"}
                {!isSyncing &&
                  currentSyncStatus === "checking" &&
                  "Checking..."}
                {!isSyncing &&
                  currentSyncStatus === "error" &&
                  "Status unavailable"}
              </span>
              <Button
                onClick={handleSyncStoreHub}
                disabled={isSyncing || !syncDate}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw
                  className={cn("size-3.5", isSyncing && "animate-spin")}
                />
                {isSyncing ? "Syncing..." : "Sync StoreHub"}
              </Button>
            </div>
          </div>
        </div>

        {/* Executive Metrics Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Stock Value */}
          <Card className="rounded-2xl border border-slate-800/80 bg-[#0F172A]/90 p-5 shadow-xl backdrop-blur-sm transition-all hover:border-slate-700/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Total Stock Valuation
              </span>
              <div className="p-2 rounded-xl bg-slate-800/80 text-amber-400 border border-slate-700/50">
                <Boxes className="size-4" />
              </div>
            </div>
            <div className="mt-3 text-2xl font-bold font-serif text-white tracking-tight">
              ₱{totalStockValue.toLocaleString("en-PH")}
            </div>
            <p className="mt-1 text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
              <span>{inventory.length} items total in cellar & pantry</span>
            </p>
          </Card>

          {/* Card 2: Low Stock Alerts */}
          <Card className="rounded-2xl border border-slate-800/80 bg-[#0F172A]/90 p-5 shadow-xl backdrop-blur-sm transition-all hover:border-amber-500/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Low Stock Warning
              </span>
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <AlertTriangle className="size-4" />
              </div>
            </div>
            <div className="mt-3 text-2xl font-bold font-serif text-amber-400 tracking-tight">
              {lowStockCount} Items
            </div>
            <p className="mt-1 text-[11px] text-slate-400 flex items-center gap-1 font-medium">
              <span>Below minimum reorder threshold</span>
            </p>
          </Card>

          {/* Card 3: Out of Stock */}
          <Card className="rounded-2xl border border-slate-800/80 bg-[#0F172A]/90 p-5 shadow-xl backdrop-blur-sm transition-all hover:border-red-500/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Out of Stock
              </span>
              <div className="p-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20">
                <TrendingDown className="size-4" />
              </div>
            </div>
            <div className="mt-3 text-2xl font-bold font-serif text-red-400 tracking-tight">
              {outOfStockCount} Items
            </div>
            <p className="mt-1 text-[11px] text-red-400/90 flex items-center gap-1 font-medium">
              <span>Requires immediate supplier PO</span>
            </p>
          </Card>

          {/* Card 4: Healthy Stock */}
          <Card className="rounded-2xl border border-slate-800/80 bg-[#0F172A]/90 p-5 shadow-xl backdrop-blur-sm transition-all hover:border-emerald-500/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Optimal Stock Levels
              </span>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <PackageCheck className="size-4" />
              </div>
            </div>
            <div className="mt-3 text-2xl font-bold font-serif text-emerald-400 tracking-tight">
              {healthyStockCount} Items
            </div>
            <p className="mt-1 text-[11px] text-emerald-400/90 flex items-center gap-1 font-medium">
              <span>Fully stocked for current service</span>
            </p>
          </Card>
        </div>

        {/* Filter Controls & Search Bar */}
        <div className="rounded-2xl border border-slate-800/80 bg-[#0F172A]/90 p-4 shadow-xl backdrop-blur-sm space-y-4">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by ingredient name, SKU, or supplier..."
                className="w-full rounded-xl border border-slate-800 bg-[#020617] pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-amber-500/80 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all"
              />
            </div>

            {/* Category Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 lg:pb-0 scrollbar-none">
              {categories.map((cat) => {
                const isActive = selectedCategory === cat;
                return (
                  <Button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      "px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all",
                      isActive
                        ? "bg-slate-800 text-amber-400 border border-slate-700 shadow-md font-semibold"
                        : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent",
                    )}
                  >
                    {cat}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Inventory Data Table */}
        <Card className="rounded-2xl border-slate-800 bg-[#0F172A]/90 shadow-xl overflow-hidden">
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-base font-serif font-semibold text-white">
                Live Inventory Ledger
              </h2>
              <p className="text-xs text-slate-400">
                Showing {filteredInventory.length} of {inventory.length} total
                items
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">
                Quick Adjust Legend:
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                +1 / -1 direct count
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table className="w-full text-left text-xs">
              <TableHeader className="border-b border-slate-800 bg-[#020617]/60 text-[10px] uppercase tracking-wider text-slate-400">
                <TableRow>
                  <TableHead className="py-3.5 px-4 font-semibold">
                    SKU & Item Details
                  </TableHead>
                  <TableHead className="py-3.5 px-4 font-semibold">
                    Category
                  </TableHead>
                  <TableHead className="py-3.5 px-4 font-semibold">
                    Current Stock
                  </TableHead>
                  <TableHead className="py-3.5 px-4 font-semibold">
                    Status
                  </TableHead>
                  <TableHead className="py-3.5 px-4 font-semibold">
                    Unit Price
                  </TableHead>
                  <TableHead className="py-3.5 px-4 font-semibold">
                    Total Value
                  </TableHead>
                  <TableHead className="py-3.5 px-4 font-semibold">
                    Supplier
                  </TableHead>
                  <TableHead className="py-3.5 px-4 font-semibold text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-800/60">
                {isLoading ? (
                  <TableRow>
                    <td
                      colSpan={8}
                      className="py-12 text-center text-slate-400"
                    >
                      Loading inventory...
                    </td>
                  </TableRow>
                ) : loadError ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-12 text-center text-red-300"
                    >
                      {loadError}{" "}
                      <Button
                        onClick={reloadInventory}
                        className="ml-2 text-amber-300 underline underline-offset-2"
                      >
                        Retry
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : filteredInventory.length === 0 ? (
                  <TableRow>
                    <td
                      colSpan={8}
                      className="py-12 text-center text-slate-500"
                    >
                      {inventory.length === 0
                        ? "No inventory items yet. Add an item or sync from StoreHub to get started."
                        : "No matching inventory items found."}
                    </td>
                  </TableRow>
                ) : (
                  filteredInventory.map((item) => {
                    const stockPercentage =
                      item.maxStock > 0
                        ? Math.min(
                            100,
                            Math.max(
                              0,
                              Math.round((item.stock / item.maxStock) * 100),
                            ),
                          )
                        : 0;
                    const status = getStatus(item);

                    return (
                      <TableRow
                        key={item.id}
                        className="hover:bg-slate-800/40 transition-colors group"
                      >
                        {/* Item Info */}
                        <TableCell className="py-4 px-4">
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-100 text-xs font-serif">
                              {item.name}
                            </span>
                            <span className="font-mono text-[10px] text-amber-500/80">
                              {item.id}
                            </span>
                          </div>
                        </TableCell>

                        {/* Category */}
                        <TableCell className="py-4 px-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 text-slate-300 text-[11px] border border-slate-700/50">
                            {item.category}
                          </span>
                        </TableCell>

                        {/* Stock Level Bar & Counter */}
                        <TableCell className="py-4 px-4 min-w-[170px]">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                              <span>
                                {item.stock} {item.unit}
                              </span>
                              <span className="text-[10px] text-slate-500 font-normal">
                                Min: {item.minStock} {item.unit}
                              </span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                              <div
                                style={{ width: `${stockPercentage}%` }}
                                className={cn(
                                  "h-full rounded-full transition-all duration-300",
                                  status === "Out of Stock"
                                    ? "bg-red-500"
                                    : status === "Low Stock"
                                      ? "bg-amber-500"
                                      : "bg-emerald-500",
                                )}
                              />
                            </div>
                          </div>
                        </TableCell>

                        {/* Status Badge */}
                        <TableCell className="py-4 px-4">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wider uppercase border",
                              status === "In Stock" &&
                                "bg-emerald-950/80 text-emerald-300 border-emerald-700/50",
                              status === "Low Stock" &&
                                "bg-amber-950/80 text-amber-300 border-amber-700/50 animate-pulse",
                              status === "Out of Stock" &&
                                "bg-red-950/80 text-red-300 border-red-700/50",
                            )}
                          >
                            <span
                              className={cn(
                                "size-1.5 rounded-full",
                                status === "In Stock" && "bg-emerald-400",
                                status === "Low Stock" && "bg-amber-400",
                                status === "Out of Stock" && "bg-red-400",
                              )}
                            />
                            {status}
                          </span>
                        </TableCell>

                        {/* Unit Price */}
                        <TableCell className="py-4 px-4 font-mono text-slate-300">
                          ₱{item.costPerUnit.toLocaleString("en-PH")} /{" "}
                          {item.unit}
                        </TableCell>

                        {/* Total Value */}
                        <TableCell className="py-4 px-4 font-mono font-semibold text-amber-400">
                          ₱
                          {(item.stock * item.costPerUnit).toLocaleString(
                            "en-PH",
                          )}
                        </TableCell>

                        {/* Supplier */}
                        <TableCell className="py-4 px-4 text-slate-400">
                          {item.supplier || "—"}
                        </TableCell>

                        {/* Quick Increment/Decrement Actions */}
                        <TableCell className="py-4 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              onClick={() => openEditModal(item)}
                              disabled={isSaving}
                              title="Edit item details"
                              aria-label={`Edit ${item.name}`}
                              className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-amber-300 hover:bg-slate-800 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              onClick={() =>
                                handleQuickQuantityChange(item.id, -1)
                              }
                              disabled={isSaving || item.stock <= 0}
                              title="Decrease Stock (-1)"
                              className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <MinusCircle className="size-3.5" />
                            </Button>
                            <Button
                              onClick={() =>
                                handleQuickQuantityChange(item.id, 1)
                              }
                              disabled={isSaving}
                              title="Increase Stock (+1)"
                              className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <PlusCircle className="size-3.5" />
                            </Button>
                            <Button
                              onClick={() => openAdjustModal(item)}
                              className="px-2.5 py-1 rounded-lg border border-slate-700/80 bg-slate-800 text-[11px] font-medium text-amber-300 hover:bg-slate-700 transition-colors"
                            >
                              Adjust
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      {/* Register New Inventory Modal */}
      {isNewItemOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/80 px-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-[#0F172A] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-500">
                  Inventory Management
                </p>
                <h3 className="mt-0.5 font-serif text-xl font-bold text-white">
                  Register New Inventory
                </h3>
              </div>

              <Button
                type="button"
                onClick={() => setIsNewItemOpen(false)}
                aria-label="Close"
                className="p-1.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-white"
              >
                <X className="size-4" />
              </Button>
            </div>

            <form
              onSubmit={handleCreateItemSubmit}
              className="mt-5 space-y-4 text-xs"
            >
              {/* Inventory Name */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                  Inventory Name *
                </label>
                <Input
                  type="text"
                  required
                  placeholder="e.g. Chicken Breast"
                  value={newItem.name}
                  onChange={(e) =>
                    setNewItem((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-800 bg-[#020617] px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>

              {/* Department */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                  Department *
                </label>
                <Select
                  value={newItem.department}
                  onValueChange={(value) =>
                    setNewItem((prev) => ({ ...prev, department: value }))
                  }
                >
                  <SelectTrigger className="w-full border-slate-800 bg-[#020617] text-slate-100">
                    <SelectValue placeholder="Select Department" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map((dept) => (
                      <SelectItem key={dept} value={dept}>
                        {dept}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Quantity and Unit */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                    Quantity *
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={newItem.quantity}
                    onChange={(e) =>
                      setNewItem((prev) => ({
                        ...prev,
                        quantity: Number(e.target.value),
                      }))
                    }
                    className="w-full rounded-xl border border-slate-800 bg-[#020617] px-3 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                    Unit *
                  </label>
                  <Input
                    type="text"
                    required
                    placeholder="kg / pcs / liters"
                    value={newItem.unit}
                    onChange={(e) =>
                      setNewItem((prev) => ({ ...prev, unit: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-800 bg-[#020617] px-3 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Purchases, Sold, Used, Ending */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(
                  [
                    { label: "Purchases", key: "purchases" },
                    { label: "Sold", key: "sold" },
                    { label: "Used", key: "used" },
                    { label: "Ending", key: "ending" },
                  ] as const
                ).map((field) => (
                  <div key={field.key}>
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                      {field.label}
                    </label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newItem[field.key]}
                      onChange={(e) =>
                        setNewItem((prev) => ({
                          ...prev,
                          [field.key]: Number(e.target.value),
                        }))
                      }
                      className="w-full rounded-xl border border-slate-800 bg-[#020617] px-3 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                ))}
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                  Remarks
                </label>
                <Textarea
                  rows={3}
                  placeholder="Additional inventory notes..."
                  value={newItem.remarks}
                  onChange={(e) =>
                    setNewItem((prev) => ({
                      ...prev,
                      remarks: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-800 bg-[#020617] px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none resize-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <Button
                  type="button"
                  onClick={() => setIsNewItemOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl bg-amber-500 font-semibold text-slate-950 hover:bg-amber-400 shadow-md shadow-amber-500/20 disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Save Inventory"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isEditOpen && selectedItemForEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/80 px-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-[#0F172A] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-500">
                  Inventory Management
                </p>
                <h3 className="mt-0.5 font-serif text-xl font-bold text-white">
                  Edit Inventory Item
                </h3>
              </div>
              <Button
                type="button"
                onClick={() => {
                  setIsEditOpen(false);
                  setSelectedItemForEdit(null);
                }}
                aria-label="Close"
                className="p-1.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-white"
              >
                <X className="size-4" />
              </Button>
            </div>

            <form
              onSubmit={handleEditSubmit}
              className="mt-5 space-y-4 text-xs"
            >
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-400">
                  Item Name *
                </label>
                <Input
                  type="text"
                  required
                  value={editData.name}
                  onChange={(e) =>
                    setEditData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-800 bg-[#020617] px-3 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-400">
                    Department *
                  </label>
                  <Select
                    value={editData.category}
                    onValueChange={(value) =>
                      setEditData((prev) => ({
                        ...prev,
                        category: value ?? "",
                      }))
                    }
                  >
                    <SelectTrigger className="w-full border-slate-800 bg-[#020617] text-slate-100">
                      <SelectValue placeholder="Select Department" />
                    </SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.map((department) => (
                        <SelectItem key={department} value={department}>
                          {department}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-400">
                    Unit *
                  </label>
                  <Input
                    type="text"
                    required
                    value={editData.unit}
                    onChange={(e) =>
                      setEditData((prev) => ({ ...prev, unit: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-800 bg-[#020617] px-3 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ["Minimum Stock", "minStock", "0"],
                    ["Maximum Stock", "maxStock", "0.01"],
                    ["Cost per Unit", "costPerUnit", "0"],
                  ] as const
                ).map(([label, field, min]) => (
                  <div key={field}>
                    <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-400">
                      {label} *
                    </label>
                    <Input
                      type="number"
                      min={min}
                      step="0.01"
                      required
                      value={editData[field]}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          [field]: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-slate-800 bg-[#020617] px-3 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                ))}
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-400">
                    Supplier
                  </label>
                  <Input
                    type="text"
                    value={editData.supplier}
                    onChange={(e) =>
                      setEditData((prev) => ({
                        ...prev,
                        supplier: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-800 bg-[#020617] px-3 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
                <Button
                  type="button"
                  onClick={() => {
                    setIsEditOpen(false);
                    setSelectedItemForEdit(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl bg-amber-500 font-semibold text-slate-950 hover:bg-amber-400 shadow-md shadow-amber-500/20 disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjust Stock Modal */}
      {isAdjustOpen && selectedItemForAdjust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/80 px-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#0F172A] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-500">
                  Stock Adjustment Audit Log
                </p>
                <h3 className="font-serif text-lg font-bold text-white mt-0.5">
                  {selectedItemForAdjust.name}
                </h3>
              </div>
              <Button
                type="button"
                onClick={() => setIsAdjustOpen(false)}
                aria-label="Close"
                className="p-1.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-white"
              >
                <X className="size-4" />
              </Button>
            </div>

            <form
              onSubmit={handleAdjustSubmit}
              className="mt-5 space-y-4 text-xs"
            >
              <div className="rounded-xl border border-slate-800 bg-[#020617] p-3 flex justify-between items-center text-slate-300">
                <span>Current On-Hand Stock:</span>
                <span className="font-bold text-amber-400 font-mono text-sm">
                  {selectedItemForAdjust.stock} {selectedItemForAdjust.unit}
                </span>
              </div>

              {/* Add vs Subtract Toggle */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">
                  Adjustment Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    onClick={() =>
                      setAdjustData((prev) => ({ ...prev, type: "add" }))
                    }
                    className={cn(
                      "py-2 rounded-xl font-semibold border transition-all text-xs",
                      adjustData.type === "add"
                        ? "bg-emerald-950/80 border-emerald-500 text-emerald-300"
                        : "border-slate-800 bg-slate-900 text-slate-400",
                    )}
                  >
                    + Add Stock (Inbound)
                  </Button>
                  <Button
                    type="button"
                    onClick={() =>
                      setAdjustData((prev) => ({ ...prev, type: "subtract" }))
                    }
                    className={cn(
                      "py-2 rounded-xl font-semibold border transition-all text-xs",
                      adjustData.type === "subtract"
                        ? "bg-red-950/80 border-red-500 text-red-300"
                        : "border-slate-800 bg-slate-900 text-slate-400",
                    )}
                  >
                    - Deduct Stock (Outbound)
                  </Button>
                </div>
              </div>

              {/* Quantity input */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                  Quantity ({selectedItemForAdjust.unit})
                </label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={adjustData.amount}
                  onChange={(e) =>
                    setAdjustData((prev) => ({
                      ...prev,
                      amount: Number(e.target.value),
                    }))
                  }
                  className="w-full rounded-xl border border-slate-800 bg-[#020617] px-3 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </div>

              {/* Reason */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                  Reason for Adjustment
                </label>
                <Select
                  value={adjustData.reason}
                  onValueChange={(value) =>
                    setAdjustData((prev) => ({ ...prev, reason: value ?? "" }))
                  }
                >
                  <SelectTrigger className="w-full border-slate-800 bg-[#020617] text-slate-100">
                    <SelectValue placeholder="Select reason" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Delivery Receive">
                      New Supplier Delivery
                    </SelectItem>
                    <SelectItem value="Kitchen Usage">
                      Kitchen Prep Usage
                    </SelectItem>
                    <SelectItem value="Spoilage / Waste">
                      Spoilage / Waste / Expired
                    </SelectItem>
                    <SelectItem value="Stock Correction">
                      Audited Physical Count Correction
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Note */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                  Note (optional)
                </label>
                <Input
                  type="text"
                  value={adjustData.note}
                  onChange={(e) =>
                    setAdjustData((prev) => ({ ...prev, note: e.target.value }))
                  }
                  placeholder="e.g. Delivery receipt #1234"
                  className="w-full rounded-xl border border-slate-800 bg-[#020617] px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <Button
                  type="button"
                  onClick={() => setIsAdjustOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-slate-400 hover:text-white"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl bg-amber-500 font-semibold text-slate-950 hover:bg-amber-400 shadow-md shadow-amber-500/20 disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Confirm Adjustment"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
