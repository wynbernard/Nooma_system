import SalesReportModal, {
  type OwnerAccount,
  type OtherPaymentFields,
  type PaymentFields,
  type SaleDeductionFields,
  type SaleFormData,
  type UnpaidAccount,
} from "./saleModal";
import {
  calculateKitchenSales,
  calculateTotalSale,
} from "./salesCalculations";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  Banknote,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  Search,
  TrendingUp,
  Plus,
  Pencil,
  Trash2,
  Eye,
} from "lucide-react";

type Sale = {
  reportId: number;
  reportNumber: string;
  reportDate: string;
  shiftName: string;
  barSalesTotal: number;
  kitchenSalesTotal: number;
  serviceChargeTotal: number;
  totalTables: number;
  totalPax: number;
  telegramDeclaredTotal: number;
  posSalesTotal: number;
  status: string;
  cashierName: string;
  paymentTotal: number;
  saleChannel: "POS" | "NON POS";
  ownerAccounts: Record<string, string>;
  unpaidAccounts: UnpaidAccount[];
  otherPayments: OtherPaymentFields;
  deductions: SaleDeductionFields;
  paymentFields: PaymentFields;
  kitchenSales: string;
  barSales: string;
  corkage: string;
  totalSaleKsBsCorkage: string;
  grabSaleGross: string;
  grabSaleLess27: string;
  corkageTotal: number;
};

type SalesData = {
  sales: Sale[];
  ownerAccounts: OwnerAccount[];
  stats: {
    totalSales: number;
    totalTransactions: number;
    nonPosSales: number;
    nonPosTransactions: number;
  };
  nextSale: {
    date: string;
    type: "Lunch" | "Closing";
  };
};

type ApiResponse = {
  success: boolean;
  data?: SalesData;
  message?: string;
};

const formatPeso = (value: number) =>
  `₱${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const numberInputValue = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") return "";
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue === 0 ? "" : String(value);
};

const formatDate = (date: string) =>
  new Intl.DateTimeFormat("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(`${date}T00:00:00`));

function statusClass(status: string): string {
  const normalized = status.toLowerCase();
  if (/paid|approved|complete|closed/.test(normalized)) {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  }
  if (/pending|review|submitted/.test(normalized)) {
    return "border-amber-500/20 bg-amber-500/10 text-amber-300";
  }
  if (/void|cancel|reject|failed/.test(normalized)) {
    return "border-red-500/20 bg-red-500/10 text-red-300";
  }
  return "border-slate-700 bg-slate-800/70 text-slate-300";
}

function exportCsv(sales: Sale[]) {
  const columns = [
    "Date",
    "Shift",
    "Cashier Name",
    "Cash Remitted",
    "Service Charge",
    "Tables / Pax",
    "Sales",
    "Unpaid Accounts",
  ];
  const escapeCsv = (value: string | number) =>
    `"${String(value).replaceAll('"', '""')}"`;
  const rows = sales.map((sale) =>
    [
      sale.reportDate,
      sale.shiftName,
      sale.cashierName,
      sale.paymentTotal,
      sale.serviceChargeTotal,
      `${sale.totalTables} / ${sale.totalPax}`,
      sale.telegramDeclaredTotal,
      sale.unpaidAccounts.reduce((sum, account) => {
        const amount = Number(account.amount);
        return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
      }, 0),
    ]
      .map(escapeCsv)
      .join(","),
  );
  const blob = new Blob(
    ["\uFEFF" + [columns.map(escapeCsv).join(","), ...rows].join("\r\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `nooma-sales-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function SalesPage() {
  const [data, setData] = useState<SalesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [shiftFilter, setShiftFilter] = useState("All shifts");
  const [channelFilter, setChannelFilter] = useState("All channels");
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [formData, setFormData] = useState<SaleFormData>({
    reportNumber: "",
    reportDate: new Date().toISOString().slice(0, 10),
    shiftName: "Lunch",
    cashierName: "",
    paymentTotal: "0",
    cashRemitted: "",
    gcashQrph: "",
    paymaya: "",
    amex: "",
    visa: "",
    mastercard: "",
    bancnet: "",
    jcb: "",
    bpiNooma: "",
    eastwestNooma: "",
    giftCheck: "",
    chequePayment: "",
    pwdDiscount: "",
    seniorCitizenDiscount: "",
    specialCustomerDiscount: "",
    otherCash: "",
    otherCardMayaTerminal: "",
    otherDirectBpiNooma: "",
    otherDirectEastwestNooma: "",
    otherGiftCheck: "",
    otherCheque: "",
    serviceChargeTotal: "",
    totalTables: "",
    totalPax: "",
    corkage: "",
    totalSaleKsBsCorkage: "",
    telegramDeclaredTotal: "",
    grabSaleGross: "",
    grabSaleLess27: "",
    kitchenSales: "",
    barSales: "",
    status: "draft",
    saleChannel: "NON POS",
    ownerAccounts: {},
    unpaidAccounts: [{ accountName: "", amount: "", notes: "" }],
  });

  useEffect(() => {
    const controller = new AbortController();
    fetch("../backend/sales/sales.php", {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = (await response.json()) as ApiResponse;
        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.message || "Unable to load sales reports.");
        }
        return result.data;
      })
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setLoadError(null);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Unable to load sales reports.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, []);

  const filteredSales = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();
    return data.sales.filter((sale) => {
      const matchesSearch =
        sale.reportNumber.toLowerCase().includes(query) ||
        sale.cashierName.toLowerCase().includes(query) ||
        sale.shiftName.toLowerCase().includes(query);
      const matchesDate = !dateFilter || sale.reportDate === dateFilter;
      const matchesShift =
        shiftFilter === "All shifts" ||
        sale.shiftName.toLowerCase().includes(shiftFilter.toLowerCase());
      const matchesChannel =
        channelFilter === "All channels" || sale.saleChannel === channelFilter;
      return matchesSearch && matchesDate && matchesShift && matchesChannel;
    });
  }, [channelFilter, data, dateFilter, search, shiftFilter]);

  const stats = data?.stats;
  const statCards = [
    {
      label: "Total POS Sales",
      value: formatPeso(stats?.totalSales ?? 0),
      detail: "All recorded reports",
      icon: CircleDollarSign,
      accent: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    },
    {
      label: "Transactions",
      value: (stats?.totalTransactions ?? 0).toLocaleString("en-PH"),
      detail: "Daily sales reports",
      icon: ClipboardList,
      accent: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    },
    {
      label: "Non-POS Sales",
      value: formatPeso(stats?.nonPosSales ?? 0),
      detail: `${stats?.nonPosTransactions ?? 0} non-POS reports`,
      icon: Banknote,
      accent: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    },
    {
      label: "Next Report",
      value: data?.nextSale.type ?? "—",
      detail: data ? formatDate(data.nextSale.date) : "Next shift",
      icon: CalendarDays,
      accent: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    },
  ];

  const refreshSales = async () => {
    const response = await fetch("../backend/sales/sales.php", {
      credentials: "same-origin",
    });

    const result = await response.json();

    if (!response.ok || !result.success || !result.data) {
      throw new Error(result.message || "Unable to refresh sales.");
    }

    setData(result.data);
  };

  const openAddForm = () => {
    setEditingSale(null);

    setFormData({
      reportNumber: "",
      reportDate: new Date().toISOString().slice(0, 10),
      shiftName: "Lunch",
      cashierName: "",
      paymentTotal: "0",
      cashRemitted: "",
      gcashQrph: "",
      paymaya: "",
      amex: "",
      visa: "",
      mastercard: "",
      bancnet: "",
      jcb: "",
      bpiNooma: "",
      eastwestNooma: "",
      giftCheck: "",
      chequePayment: "",
      pwdDiscount: "",
      seniorCitizenDiscount: "",
      specialCustomerDiscount: "",
      otherCash: "",
      otherCardMayaTerminal: "",
      otherDirectBpiNooma: "",
      otherDirectEastwestNooma: "",
      otherGiftCheck: "",
      otherCheque: "",
      serviceChargeTotal: "",
      totalTables: "",
      totalPax: "",
      corkage: "",
      totalSaleKsBsCorkage: "",
      telegramDeclaredTotal: "",
      grabSaleGross: "",
      grabSaleLess27: "",
      kitchenSales: "",
      barSales: "",
      status: "draft",
      saleChannel: "NON POS",
      ownerAccounts: {},
      unpaidAccounts: [{ accountName: "", amount: "", notes: "" }],
    });

    setShowForm(true);
  };

  const openEditForm = (sale: Sale) => {
    setEditingSale(sale);
    const barSales = numberInputValue(sale.barSales ?? sale.barSalesTotal);
    const corkage = numberInputValue(sale.corkage ?? sale.corkageTotal);
    const kitchenSales = calculateKitchenSales(
      sale.telegramDeclaredTotal,
      barSales,
      corkage,
      sale.serviceChargeTotal,
    );

    setFormData({
      reportNumber: sale.reportNumber,
      reportDate: sale.reportDate,
      shiftName: sale.shiftName,
      cashierName: sale.cashierName,
      paymentTotal: String(sale.paymentTotal),
      cashRemitted: numberInputValue(
        sale.paymentFields?.cashRemitted ?? sale.paymentTotal,
      ),
      gcashQrph: numberInputValue(sale.paymentFields?.gcashQrph),
      paymaya: numberInputValue(sale.paymentFields?.paymaya),
      amex: numberInputValue(sale.paymentFields?.amex),
      visa: numberInputValue(sale.paymentFields?.visa),
      mastercard: numberInputValue(sale.paymentFields?.mastercard),
      bancnet: numberInputValue(sale.paymentFields?.bancnet),
      jcb: numberInputValue(sale.paymentFields?.jcb),
      bpiNooma: numberInputValue(sale.paymentFields?.bpiNooma),
      eastwestNooma: numberInputValue(sale.paymentFields?.eastwestNooma),
      giftCheck: numberInputValue(sale.paymentFields?.giftCheck),
      chequePayment: numberInputValue(sale.paymentFields?.chequePayment),
      pwdDiscount: numberInputValue(sale.deductions?.pwdDiscount),
      seniorCitizenDiscount: numberInputValue(
        sale.deductions?.seniorCitizenDiscount,
      ),
      specialCustomerDiscount: numberInputValue(
        sale.deductions?.specialCustomerDiscount,
      ),
      otherCash: numberInputValue(sale.otherPayments?.otherCash),
      otherCardMayaTerminal: numberInputValue(
        sale.otherPayments?.otherCardMayaTerminal,
      ),
      otherDirectBpiNooma: numberInputValue(
        sale.otherPayments?.otherDirectBpiNooma,
      ),
      otherDirectEastwestNooma: numberInputValue(
        sale.otherPayments?.otherDirectEastwestNooma,
      ),
      otherGiftCheck: numberInputValue(sale.otherPayments?.otherGiftCheck),
      otherCheque: numberInputValue(sale.otherPayments?.otherCheque),
      serviceChargeTotal: numberInputValue(sale.serviceChargeTotal),
      totalTables: numberInputValue(sale.totalTables),
      totalPax: numberInputValue(sale.totalPax),
      corkage,
      totalSaleKsBsCorkage: calculateTotalSale(kitchenSales, barSales, corkage),
      telegramDeclaredTotal: numberInputValue(sale.telegramDeclaredTotal),
      grabSaleGross: numberInputValue(sale.grabSaleGross),
      grabSaleLess27: numberInputValue(
        Number(sale.grabSaleGross) > 0
          ? (Number(sale.grabSaleGross) * 0.73).toFixed(2)
          : "",
      ),
      kitchenSales,
      barSales,
      status: sale.status,
      saleChannel: sale.saleChannel,
      ownerAccounts: sale.ownerAccounts ?? {},
      unpaidAccounts: sale.unpaidAccounts ?? [
        { accountName: "", amount: "", notes: "" },
      ],
    });

    setShowForm(true);
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setIsSaving(true);

    try {
      const response = await fetch("../backend/sales/sales.php", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: editingSale ? "update" : "add",
          reportId: editingSale?.reportId ?? null,
          ...formData,
          paymentTotal: Number(formData.paymentTotal),
          serviceChargeTotal: Number(formData.serviceChargeTotal),
          totalTables: Number(formData.totalTables),
          totalPax: Number(formData.totalPax),
          telegramDeclaredTotal: Number(formData.telegramDeclaredTotal),
          otherPayments: {
            otherCash: formData.otherCash,
            otherCardMayaTerminal: formData.otherCardMayaTerminal,
            otherDirectBpiNooma: formData.otherDirectBpiNooma,
            otherDirectEastwestNooma: formData.otherDirectEastwestNooma,
            otherGiftCheck: formData.otherGiftCheck,
            otherCheque: formData.otherCheque,
          },
          deductions: {
            pwdDiscount: formData.pwdDiscount,
            seniorCitizenDiscount: formData.seniorCitizenDiscount,
            specialCustomerDiscount: formData.specialCustomerDiscount,
          },
          unpaidAccounts: formData.unpaidAccounts.map((account) => ({
            ...account,
            amount: account.amount === "" ? 0 : Number(account.amount),
          })),
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to save report.");
      }

      await refreshSales();
      setShowForm(false);
      setEditingSale(null);

      alert(result.message || "Sales report saved successfully!");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (sale: Sale) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete report ${sale.reportNumber}?`,
    );

    if (!confirmed) return;

    try {
      const response = await fetch("../backend/sales/sales.php", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "delete",
          reportId: sale.reportId,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to delete report.");
      }

      if (selectedSale?.reportId === sale.reportId) {
        setSelectedSale(null);
      }

      await refreshSales();

      alert(result.message || "Sales report deleted successfully!");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Delete failed.");
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-6 md:p-8 space-y-8">
      <header className="flex flex-col gap-4 border-b border-slate-800/80 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-2 text-amber-400">
              <TrendingUp className="size-5" />
            </span>
            <h1 className="font-serif text-2xl font-bold tracking-tight text-white">
              Sales Management
            </h1>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Review shift reports, sales channels, declared totals, and payments.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openAddForm}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-amber-400"
          >
            <Plus className="size-4" />
            Add Sales Report
          </button>

          <button
            type="button"
            onClick={() => exportCsv(filteredSales)}
            disabled={isLoading || filteredSales.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            <ArrowDownToLine className="size-4" />
            Export CSV
          </button>
        </div>
      </header>

      {loadError && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300"
        >
          {loadError}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <article
              key={card.label}
              className="rounded-2xl border border-slate-800/80 bg-[#0F172A]/90 p-5 shadow-xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {card.label}
                  </p>
                  <p className="mt-3 text-2xl font-bold tracking-tight text-white">
                    {isLoading ? "—" : card.value}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {card.detail}
                  </p>
                </div>
                <span className={`rounded-xl border p-2 ${card.accent}`}>
                  <Icon className="size-4" />
                </span>
              </div>
            </article>
          );
        })}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-800/80 bg-[#0F172A]/90 shadow-xl">
        <div className="flex flex-col gap-4 border-b border-slate-800 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-serif text-lg font-semibold text-white">
              Sales Reports
            </h2>
            <p className="mt-1 text-[11px] text-slate-500">
              {isLoading
                ? "Loading reports..."
                : `${filteredSales.length} of ${data?.sales.length ?? 0} reports`}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:flex">
            <label className="relative">
              <span className="sr-only">Search reports</span>
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search report or cashier"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-9 pr-3 text-xs text-slate-200 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none lg:w-56"
              />
            </label>
            <label>
              <span className="sr-only">Filter by date</span>
              <input
                type="date"
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-slate-300 [color-scheme:dark]"
              />
            </label>
            <label>
              <span className="sr-only">Filter by shift</span>
              <select
                value={shiftFilter}
                onChange={(event) => setShiftFilter(event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-slate-300"
              >
                <option>All shifts</option>
                <option>Lunch</option>
                <option>Closing</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Filter by channel</span>
              <select
                value={channelFilter}
                onChange={(event) => setChannelFilter(event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-slate-300"
              >
                <option>All channels</option>
                <option value="POS">POS</option>
                <option value="NON POS">Non-POS</option>
              </select>
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-xs">
            <thead className="bg-slate-950/70 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Shift</th>
                <th className="px-4 py-3 font-semibold">Cashier Name</th>
                <th className="px-4 py-3 text-right font-semibold">
                  Cash Remitted
                </th>
                <th className="px-4 py-3 text-right font-semibold">
                  Service Charge
                </th>
                <th className="px-4 py-3 text-right font-semibold">
                  Tables / Pax
                </th>
                <th className="px-4 py-3 text-right font-semibold">Sales</th>
                <th className="px-4 py-3 text-right font-semibold">
                  Unpaid Accounts
                </th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-12 text-center text-slate-500"
                  >
                    Loading sales reports...
                  </td>
                </tr>
              ) : filteredSales.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-12 text-center text-slate-500"
                  >
                    {loadError
                      ? "Sales reports are unavailable."
                      : "No reports match your filters."}
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale) => (
                  <tr
                    key={sale.reportId}
                    className="text-slate-300 transition-colors hover:bg-slate-800/30"
                  >
                    <td className="px-4 py-3.5">
                      {formatDate(sale.reportDate)}
                    </td>
                    <td className="px-4 py-3.5">{sale.shiftName}</td>
                    <td className="px-4 py-3.5">{sale.cashierName}</td>
                    <td className="px-4 py-3.5 text-right font-mono font-semibold text-emerald-300">
                      {formatPeso(sale.paymentTotal)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono">
                      {formatPeso(sale.serviceChargeTotal)}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {sale.totalTables} / {sale.totalPax}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-semibold text-amber-300">
                      {formatPeso(sale.telegramDeclaredTotal)}
                    </td>
                    <td
                      className="px-4 py-3.5 text-right text-slate-500"
                      title="Unpaid-account data is not available from the current sales API."
                    >
                      —
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedSale(sale)}
                          title="View"
                          className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-2 text-blue-400 hover:bg-blue-500/20"
                        >
                          <Eye className="size-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => openEditForm(sale)}
                          title="Edit"
                          className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-amber-400 hover:bg-amber-500/20"
                        >
                          <Pencil className="size-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(sale)}
                          title="Delete"
                          className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-red-400 hover:bg-red-500/20"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedSale && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedSale(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="sale-details-title"
            className="w-full max-w-lg rounded-2xl border border-slate-800 bg-[#0F172A] p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-400">
                  Sales Report
                </p>
                <h2
                  id="sale-details-title"
                  className="mt-1 font-serif text-xl font-bold text-white"
                >
                  {selectedSale.reportNumber}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSale(null)}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-4 text-xs">
              <div>
                <dt className="text-slate-500">Date</dt>
                <dd className="mt-1 text-slate-200">
                  {formatDate(selectedSale.reportDate)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Shift</dt>
                <dd className="mt-1 text-slate-200">
                  {selectedSale.shiftName}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Cashier</dt>
                <dd className="mt-1 text-slate-200">
                  {selectedSale.cashierName}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Status</dt>
                <dd className="mt-1">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium ${statusClass(selectedSale.status)}`}
                  >
                    {selectedSale.status}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Cash Remitted</dt>
                <dd className="mt-1 text-slate-200">
                  {formatPeso(selectedSale.paymentTotal)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Service Charge</dt>
                <dd className="mt-1 text-slate-200">
                  {formatPeso(selectedSale.serviceChargeTotal)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Sales</dt>
                <dd className="mt-1 text-slate-200">
                  {formatPeso(selectedSale.telegramDeclaredTotal)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Unpaid Accounts</dt>
                <dd className="mt-1 text-slate-200">
                  {formatPeso(
                    selectedSale.unpaidAccounts.reduce((sum, account) => {
                      const amount = Number(account.amount);
                      return (
                        sum +
                        (Number.isFinite(amount) && amount > 0 ? amount : 0)
                      );
                    }, 0),
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Tables</dt>
                <dd className="mt-1 text-slate-200">
                  {selectedSale.totalTables}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Pax</dt>
                <dd className="mt-1 text-slate-200">{selectedSale.totalPax}</dd>
              </div>
            </dl>
          </section>
        </div>
      )}
      <SalesReportModal
        isOpen={showForm}
        isSaving={isSaving}
        isEditing={!!editingSale}
        formData={formData}
        ownerAccounts={data?.ownerAccounts ?? []}
        onChange={setFormData}
        onClose={() => setShowForm(false)}
        onSubmit={handleSave}
      />
    </div>
  );
}
