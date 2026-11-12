import { X, Save, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ComponentProps, FormEvent } from "react";
import { Button } from "@/components/ui/button";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  calculateKitchenSales,
  calculateTotalSale,
} from "./salesCalculations";

export type PaymentFields = {
  cashRemitted: string;
  gcashQrph: string;
  paymaya: string;
  amex: string;
  visa: string;
  mastercard: string;
  bancnet: string;
  jcb: string;
  bpiNooma: string;
  eastwestNooma: string;
  giftCheck: string;
  chequePayment: string;
};

export type OwnerAccount = {
  account_holder_id: number;
  account_name: string;
};

export type UnpaidAccount = {
  accountName: string;
  amount: string;
  notes: string;
};
export type OtherPaymentFields = {
  otherCash: string;
  otherCardMayaTerminal: string;
  otherDirectBpiNooma: string;
  otherDirectEastwestNooma: string;
  otherGiftCheck: string;
  otherCheque: string;
};
export type SaleDeductionFields = {
  pwdDiscount: string;
  seniorCitizenDiscount: string;
  specialCustomerDiscount: string;
};
export type GrabsaleFields = {
  grabSaleGross: string;
  grabSaleLess27: string;
};

const PAYMENT_FIELDS: (keyof PaymentFields)[] = [
  "cashRemitted",
  "gcashQrph",
  "paymaya",
  "amex",
  "visa",
  "mastercard",
  "bancnet",
  "jcb",
  "bpiNooma",
  "eastwestNooma",
  "giftCheck",
  "chequePayment",
];

const OTHER_PAYMENT_FIELDS: (keyof OtherPaymentFields)[] = [
  "otherCash",
  "otherCardMayaTerminal",
  "otherDirectBpiNooma",
  "otherDirectEastwestNooma",
  "otherGiftCheck",
  "otherCheque",
];

export type SaleFormData = PaymentFields &
  OtherPaymentFields &
  SaleDeductionFields &
  GrabsaleFields & {
    reportNumber: string;
    reportDate: string;
    shiftName: string;
    cashierName: string;
    paymentTotal: string;
    serviceChargeTotal: string;
    totalTables: string;
    totalPax: string;
    corkage: string;
    totalSaleKsBsCorkage: string;
    kitchenSales: string;
    barSales: string;
    telegramDeclaredTotal: string;
    status: string;
    saleChannel: "POS" | "NON POS";
    ownerAccounts: Record<string, string>;
    unpaidAccounts: UnpaidAccount[];
  };

type Props = {
  isOpen: boolean;
  isSaving: boolean;
  isEditing: boolean;
  formData: SaleFormData;
  ownerAccounts: OwnerAccount[];
  onChange: (data: SaleFormData) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function SectionHeading({ children }: { children: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="h-5 w-1 rounded-full bg-blue-600" />
      <h3 className="text-sm font-bold text-gray-900">{children}</h3>
      <span className="h-px flex-1 bg-gray-200" />
    </div>
  );
}

type MoneyInputProps = Omit<
  ComponentProps<typeof Input>,
  "type" | "value" | "onChange"
> & {
  value: string;
  onValueChange?: (value: string) => void;
};

function formatMoneyInput(value: string): string {
  const amount = Number(value.replace(/,/g, ""));
  if (value.trim() === "" || !Number.isFinite(amount) || amount === 0) {
    return "";
  }
  const formattedAmount = Math.abs(amount).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return amount < 0 ? `-₱${formattedAmount}` : `₱${formattedAmount}`;
}

function sanitizeMoneyInput(value: string): string {
  const cleaned = value.replace(/,/g, "").replace(/[^\d.]/g, "");
  const decimalIndex = cleaned.indexOf(".");
  if (decimalIndex === -1) return cleaned;
  return `${cleaned.slice(0, decimalIndex)}.${cleaned
    .slice(decimalIndex + 1)
    .replace(/\./g, "")
    .slice(0, 2)}`;
}

function MoneyInput({ value, onValueChange, readOnly, ...props }: MoneyInputProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      value={isFocused ? value : formatMoneyInput(value)}
      readOnly={readOnly}
      onFocus={() => setIsFocused(true)}
      onBlur={() => {
        setIsFocused(false);
        if (!readOnly && onValueChange) {
          const amount = Number(value);
          onValueChange(
            Number.isFinite(amount) && amount > 0 ? String(amount) : "",
          );
        }
      }}
      onChange={(event) =>
        onValueChange?.(sanitizeMoneyInput(event.target.value))
      }
    />
  );
}

export default function SalesReportModal({
  isOpen,
  isSaving,
  isEditing,
  formData,
  ownerAccounts,
  onChange,
  onClose,
  onSubmit,
}: Props) {
  const updateField = (field: keyof SaleFormData, value: string) => {
    const updatedFormData = { ...formData, [field]: value };
    if (
      field === "telegramDeclaredTotal" ||
      field === "barSales" ||
      field === "corkage" ||
      field === "serviceChargeTotal"
    ) {
      updatedFormData.kitchenSales = calculateKitchenSales(
        updatedFormData.telegramDeclaredTotal,
        updatedFormData.barSales,
        updatedFormData.corkage,
        updatedFormData.serviceChargeTotal,
      );
      updatedFormData.totalSaleKsBsCorkage = calculateTotalSale(
        updatedFormData.kitchenSales,
        updatedFormData.barSales,
        updatedFormData.corkage,
      );
    }
    onChange(updatedFormData);
  };

  const updatePaymentField = (field: keyof PaymentFields, value: string) => {
    const updatedPayments = { ...formData, [field]: value };
    const total = PAYMENT_FIELDS.reduce((sum, paymentField) => {
      const amount = Number(updatedPayments[paymentField]);
      return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
    }, 0);

    onChange({ ...updatedPayments, paymentTotal: total.toFixed(2) });
  };

  const updateOtherPaymentField = (
    field: keyof OtherPaymentFields,
    value: string,
  ) => {
    onChange({ ...formData, [field]: value });
  };

  const updateDeductionField = (
    field: keyof SaleDeductionFields,
    value: string,
  ) => {
    onChange({ ...formData, [field]: value });
  };

  const totalModeOfPayment = PAYMENT_FIELDS.reduce((sum, field) => {
    const amount = Number(formData[field]);
    return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);

  const totalOtherPayments = OTHER_PAYMENT_FIELDS.reduce((sum, field) => {
    const amount = Number(formData[field]);
    return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);

  const totalOwnerAccounts = ownerAccounts.reduce((sum, owner) => {
    const amount = Number(
      formData.ownerAccounts[String(owner.account_holder_id)] || 0,
    );
    return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);
  const totalUnpaidAccounts = formData.unpaidAccounts.reduce((sum, account) => {
    const amount = Number(account.amount);
    return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);

  const totalDeductions = [
    formData.pwdDiscount,
    formData.seniorCitizenDiscount,
    formData.specialCustomerDiscount,
  ].reduce((sum, value) => {
    const amount = Number(value);
    return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);
  const parsedGrandTotal = Number(formData.telegramDeclaredTotal);
  const grandTotal =
    Number.isFinite(parsedGrandTotal) && parsedGrandTotal > 0
      ? parsedGrandTotal
      : 0;
  const totalPayments =
    totalModeOfPayment +
    totalOtherPayments +
    totalOwnerAccounts +
    totalUnpaidAccounts;
  const shortOver = totalPayments - grandTotal;

  const inputClass =
    "h-12 w-full rounded-xl border-gray-300 bg-white px-4 text-sm text-gray-900 shadow-none placeholder:text-gray-400 focus-visible:border-blue-500 focus-visible:ring-4 focus-visible:ring-blue-500/10";
  const labelClass = "mb-2 block text-sm font-medium text-gray-700";
  const selectTriggerClass =
    "h-12 w-full rounded-xl border-gray-300 bg-white px-4 text-sm text-gray-900 shadow-none focus-visible:border-blue-500 focus-visible:ring-4 focus-visible:ring-blue-500/10";

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="grid h-[calc(100dvh_-_1rem)] max-h-[calc(100dvh_-_1rem)] max-w-[calc(100%_-_1rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-2xl border-0 bg-white p-0 text-gray-900 shadow-2xl ring-1 ring-black/10 sm:h-[calc(100dvh_-_2rem)] sm:max-h-[calc(100dvh_-_2rem)] sm:max-w-[calc(100%_-_2rem)] md:h-[calc(100dvh_-_3rem)] md:max-h-[calc(100dvh_-_3rem)] md:max-w-[calc(100%_-_3rem)] xl:max-w-7xl"
      >
        <div className="sticky top-0 z-20 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-gray-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6 md:px-8">
          <DialogHeader className="gap-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">
              Sales Management
            </p>
            <DialogTitle className="text-xl font-bold text-gray-900">
              {isEditing ? "Edit Sales Report" : "Create New Sale"}
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500 sm:text-sm">
              Enter the sale, payment, and reconciliation details.
            </DialogDescription>
          </DialogHeader>

          {/* Live Summary: Grand Total vs Mode of Payment & Short/Over */}
          <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 px-4 py-2 rounded-xl text-xs overflow-x-auto">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
                Grand Total
              </p>
              <p className="font-bold text-gray-900">
                ₱
                {grandTotal.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
            <div className="h-6 w-px bg-gray-200 shrink-0" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
                Total Payments
              </p>
              <p className="font-bold text-emerald-600">
                ₱
                {totalPayments.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
            <div className="h-6 w-px bg-gray-200 shrink-0" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
                Short / Over
              </p>
              <p
                className={`font-bold ${shortOver < 0 ? "text-red-600" : shortOver > 0 ? "text-amber-600" : "text-gray-900"}`}
              >
                {shortOver < 0
                  ? `-₱${Math.abs(shortOver).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Short)`
                  : shortOver > 0
                    ? `+₱${shortOver.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Over)`
                    : "₱0.00 (Balanced)"}
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close sale form"
            className="absolute top-4 right-4 lg:relative lg:top-auto lg:right-auto shrink-0 text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:ring-blue-500/20"
          >
            <X className="size-5" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
          <form onSubmit={onSubmit} className="space-y-7">
            <section>
              <SectionHeading>Transaction Details</SectionHeading>
              <div className="mb-2 grid gap-4 md:grid-cols-3">
                <div>
                  <label htmlFor="sale-report-date" className={labelClass}>
                    Sale Date
                  </label>
                  <Input
                    id="sale-report-date"
                    type="date"
                    required
                    value={formData.reportDate}
                    onChange={(e) => updateField("reportDate", e.target.value)}
                    className={`${inputClass} [color-scheme:light]`}
                  />
                </div>

                <div>
                  <label htmlFor="sale-cashier-name" className={labelClass}>
                    Cashier Name
                  </label>
                  <Input
                    id="sale-cashier-name"
                    required
                    maxLength={100}
                    value={formData.cashierName}
                    onChange={(e) => updateField("cashierName", e.target.value)}
                    placeholder="Enter cashier name"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="sale-total-tables" className={labelClass}>
                    Total Tables
                  </label>
                  <Input
                    id="sale-total-tables"
                    type="number"
                    value={formData.totalTables}
                    onChange={(e) => updateField("totalTables", e.target.value)}
                    placeholder="Enter table count"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="sale-total-pax" className={labelClass}>
                    Number of Pax
                  </label>
                  <Input
                    id="sale-total-pax"
                    type="number"
                    min="0"
                    step="1"
                    value={formData.totalPax}
                    onChange={(e) => updateField("totalPax", e.target.value)}
                    placeholder="Enter guest count"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="sale-shift" className={labelClass}>
                    Sale Type
                  </label>
                  <Select
                    value={formData.shiftName}
                    onValueChange={(value) => {
                      if (value) updateField("shiftName", value);
                    }}
                  >
                    <SelectTrigger
                      id="sale-shift"
                      aria-label="Sale Type"
                      className={selectTriggerClass}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Lunch">Lunch Sale</SelectItem>
                      <SelectItem value="Closing">Closing Sale</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label htmlFor="sale-channel" className={labelClass}>
                    Sales Channel
                  </label>
                  <Select
                    value={formData.saleChannel}
                    onValueChange={(value) => {
                      if (value === "POS" || value === "NON POS") {
                        updateField("saleChannel", value);
                      }
                    }}
                  >
                    <SelectTrigger
                      id="sale-channel"
                      aria-label="Sales Channel"
                      className={selectTriggerClass}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="POS">POS</SelectItem>
                      <SelectItem value="NON POS">Non POS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label htmlFor="kitchen-sales" className={labelClass}>
                    Kitchen Sales
                  </label>
                  <MoneyInput
                    id="kitchen-sales"
                    value={formData.kitchenSales}
                    readOnly
                    placeholder="Calculated automatically"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="sale-total-pax" className={labelClass}>
                    Bar Sales
                  </label>
                  <MoneyInput
                    id="bar-sales"
                    value={formData.barSales}
                    onValueChange={(value) => updateField("barSales", value)}
                    placeholder="Enter guest count"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="corkage" className={labelClass}>
                    Corkage
                  </label>
                  <MoneyInput
                    id="corkage"
                    value={formData.corkage}
                    onValueChange={(value) => updateField("corkage", value)}
                    placeholder="Enter corkage amount"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label
                    htmlFor="total-sale-ks-bs-corkage"
                    className={labelClass}
                  >
                    Total Sale (Ks + Bs + Corkage)
                  </label>
                  <MoneyInput
                    id="total-sale-ks-bs-corkage"
                    value={formData.totalSaleKsBsCorkage}
                    readOnly
                    placeholder="Calculated automatically"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="service-charge" className={labelClass}>
                    Service Charge
                  </label>
                  <MoneyInput
                    id="service-charge"
                    value={formData.serviceChargeTotal}
                    onValueChange={(value) =>
                      updateField("serviceChargeTotal", value)
                    }
                    placeholder="Enter service charge amount"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="declare-grand-total" className={labelClass}>
                    Declare Grand Total
                  </label>
                  <MoneyInput
                    id="declare-grand-total"
                    value={formData.telegramDeclaredTotal}
                    onValueChange={(value) =>
                      updateField("telegramDeclaredTotal", value)
                    }
                    placeholder="Enter declare grand total"
                    className={inputClass}
                  />
                </div>
              </div>
            </section>

            <section>
              <SectionHeading>Mode of Payment</SectionHeading>
              <div className="mb-4 grid gap-4 md:grid-cols-4">
                <div>
                  <label htmlFor="sale-cash-remitted" className={labelClass}>
                    Cash Remitted (₱)
                  </label>
                  <MoneyInput
                    id="sale-cash-remitted"
                    placeholder="0.00"
                    value={formData.cashRemitted || ""}
                    onValueChange={(value) =>
                      updatePaymentField("cashRemitted", value)
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="gcash-qrph" className={labelClass}>
                    Gcash + QRPH (₱)
                  </label>
                  <MoneyInput
                    id="gcash-qrph"
                    placeholder="0.00"
                    value={formData.gcashQrph || ""}
                    onValueChange={(value) =>
                      updatePaymentField("gcashQrph", value)
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="paymaya" className={labelClass}>
                    Paymaya (₱)
                  </label>
                  <MoneyInput
                    id="paymaya"
                    placeholder="0.00"
                    value={formData.paymaya || ""}
                    onValueChange={(value) => updatePaymentField("paymaya", value)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="amex" className={labelClass}>
                    Amex (₱)
                  </label>
                  <MoneyInput
                    id="amex"
                    placeholder="0.00"
                    value={formData.amex || ""}
                    onValueChange={(value) => updatePaymentField("amex", value)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="visa" className={labelClass}>
                    Visa (₱)
                  </label>
                  <MoneyInput
                    id="visa"
                    placeholder="0.00"
                    value={formData.visa || ""}
                    onValueChange={(value) => updatePaymentField("visa", value)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="mastercard" className={labelClass}>
                    Mastercard (₱)
                  </label>
                  <MoneyInput
                    id="mastercard"
                    placeholder="0.00"
                    value={formData.mastercard || ""}
                    onValueChange={(value) =>
                      updatePaymentField("mastercard", value)
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="bancnet" className={labelClass}>
                    Bancnet (₱)
                  </label>
                  <MoneyInput
                    id="bancnet"
                    placeholder="0.00"
                    value={formData.bancnet || ""}
                    onValueChange={(value) =>
                      updatePaymentField("bancnet", value)
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="jcb" className={labelClass}>
                    JCB (₱)
                  </label>
                  <MoneyInput
                    id="jcb"
                    placeholder="0.00"
                    value={formData.jcb || ""}
                    onValueChange={(value) => updatePaymentField("jcb", value)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="direct-bt-bpi-nooma" className={labelClass}>
                    Direct BT BPI Nooma (₱)
                  </label>
                  <MoneyInput
                    id="direct-bt-bpi-nooma"
                    placeholder="0.00"
                    value={formData.bpiNooma || ""}
                    onValueChange={(value) =>
                      updatePaymentField("bpiNooma", value)
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label
                    htmlFor="direct-bt-eastwest-nooma"
                    className={labelClass}
                  >
                    Direct BT Eastwest Nooma (₱)
                  </label>
                  <MoneyInput
                    id="direct-bt-eastwest-nooma"
                    placeholder="0.00"
                    value={formData.eastwestNooma || ""}
                    onValueChange={(value) =>
                      updatePaymentField("eastwestNooma", value)
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="nooma-gift-check" className={labelClass}>
                    Nooma Gift Check (₱)
                  </label>
                  <MoneyInput
                    id="nooma-gift-check"
                    placeholder="0.00"
                    value={formData.giftCheck || ""}
                    onValueChange={(value) =>
                      updatePaymentField("giftCheck", value)
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="cheque-payment" className={labelClass}>
                    Cheque Payment (₱)
                  </label>
                  <MoneyInput
                    id="cheque-payment"
                    placeholder="0.00"
                    value={formData.chequePayment || ""}
                    onValueChange={(value) =>
                      updatePaymentField("chequePayment", value)
                    }
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Live Total Calculation Banner */}
              <div className="mt-4 flex items-center justify-between p-4 rounded-xl bg-neutral-900 border border-neutral-800">
                <div>
                  <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Total Mode of Payment
                  </p>
                  <p className="text-sm text-neutral-500">
                    Sum across all payment channels
                  </p>
                </div>
                <div className="text-xl font-bold text-emerald-400">
                  ₱
                  {totalModeOfPayment.toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>

              <p className="mt-3 text-xs text-gray-500">
                Enter the total amount received per payment channel. Amounts
                must be zero or greater.
              </p>
            </section>

            <section>
              <SectionHeading>Owner Accounts</SectionHeading>
              <div className="mb-4 grid gap-4 md:grid-cols-4">
                {ownerAccounts.map((owner) => {
                  const accountId = String(owner.account_holder_id);
                  return (
                    <div key={accountId}>
                      <label
                        htmlFor={`owner-account-${accountId}`}
                        className={labelClass}
                      >
                        {owner.account_name} (₱)
                      </label>
                      <MoneyInput
                        id={`owner-account-${accountId}`}
                        placeholder="0.00"
                        value={formData.ownerAccounts[accountId] || ""}
                        onValueChange={(value) => {
                          onChange({
                            ...formData,
                            ownerAccounts: {
                              ...formData.ownerAccounts,
                              [accountId]: value,
                            },
                          });
                        }}
                        className={inputClass}
                      />
                    </div>
                  );
                })}
                {ownerAccounts.length === 0 && (
                  <p className="text-sm text-gray-500 md:col-span-4">
                    No active owner accounts found.
                  </p>
                )}
              </div>

              {/* Live Total Calculation Banner */}
              <div className="mt-4 flex items-center justify-between p-4 rounded-xl bg-neutral-900 border border-neutral-800">
                <div>
                  <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Total Owners Account Payouts
                  </p>
                  <p className="text-sm text-neutral-500">
                    Sum across all active owner accounts
                  </p>
                </div>
                <div className="text-xl font-bold text-emerald-400">
                  ₱
                  {totalOwnerAccounts.toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>

              <p className="mt-3 text-xs text-gray-500">
                Enter the total amount allocated or distributed per owner
                account. Amounts must be zero or greater.
              </p>
            </section>
            <section>
              <div className="mb-4 flex items-center justify-between gap-3">
                <SectionHeading>Unpaid Accounts</SectionHeading>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    onChange({
                      ...formData,
                      unpaidAccounts: [
                        ...formData.unpaidAccounts,
                        { accountName: "", amount: "", notes: "" },
                      ],
                    })
                  }
                  className="shrink-0 rounded-xl border-gray-300 text-sm"
                >
                  <Plus className="size-4" />
                  Add account
                </Button>
              </div>
              {formData.unpaidAccounts.map((account, index) => (
                <div
                  key={index}
                  className="mb-4 grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto]"
                >
                  <div>
                    <label
                      htmlFor={`unpaid-account-name-${index}`}
                      className={labelClass}
                    >
                      Unpaid Account Name
                    </label>
                    <Input
                      id={`unpaid-account-name-${index}`}
                      type="text"
                      maxLength={100}
                      placeholder="Enter account name"
                      value={account.accountName}
                      onChange={(e) => {
                        const unpaidAccounts = [...formData.unpaidAccounts];
                        unpaidAccounts[index] = {
                          ...account,
                          accountName: e.target.value,
                        };
                        onChange({ ...formData, unpaidAccounts });
                      }}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`unpaid-account-amount-${index}`}
                      className={labelClass}
                    >
                      Amount (₱)
                    </label>
                    <MoneyInput
                      id={`unpaid-account-amount-${index}`}
                      placeholder="Enter amount"
                      value={account.amount}
                      onValueChange={(value) => {
                        const unpaidAccounts = [...formData.unpaidAccounts];
                        unpaidAccounts[index] = {
                          ...account,
                          amount: value,
                        };
                        onChange({ ...formData, unpaidAccounts });
                      }}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`unpaid-account-notes-${index}`}
                      className={labelClass}
                    >
                      Notes
                    </label>
                    <Input
                      id={`unpaid-account-notes-${index}`}
                      type="text"
                      maxLength={255}
                      placeholder="Enter notes"
                      value={account.notes}
                      onChange={(e) => {
                        const unpaidAccounts = [...formData.unpaidAccounts];
                        unpaidAccounts[index] = {
                          ...account,
                          notes: e.target.value,
                        };
                        onChange({ ...formData, unpaidAccounts });
                      }}
                      className={inputClass}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        onChange({
                          ...formData,
                          unpaidAccounts: formData.unpaidAccounts.filter(
                            (_, accountIndex) => accountIndex !== index,
                          ),
                        })
                      }
                      aria-label={`Remove unpaid account ${index + 1}`}
                      className="mb-0 h-12 rounded-xl border-gray-300 px-3 text-gray-600"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {/* Live Total Calculation Banner */}
              <div className="mt-4 flex items-center justify-between p-4 rounded-xl bg-neutral-900 border border-neutral-800">
                <div>
                  <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Total Unpaid Accounts
                  </p>
                  <p className="text-sm text-neutral-500">
                    Sum across all unpaid account amounts
                  </p>
                </div>
                <div className="text-xl font-bold text-emerald-400">
                  ₱
                  {totalUnpaidAccounts.toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>
            </section>
            <section>
              <SectionHeading>Other Payments</SectionHeading>
              <div className="mb-4 grid gap-4 md:grid-cols-3">
                <div>
                  <label htmlFor="other-cash" className={labelClass}>
                    Cash
                  </label>
                  <MoneyInput
                    id="other-cash"
                    placeholder="0.00"
                    value={formData.otherCash || ""}
                    onValueChange={(value) =>
                      updateOtherPaymentField("otherCash", value)
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label
                    htmlFor="other-card-maya-terminal"
                    className={labelClass}
                  >
                    Card (Maya Terminal)
                  </label>
                  <MoneyInput
                    id="other-card-maya-terminal"
                    placeholder="0.00"
                    value={formData.otherCardMayaTerminal || ""}
                    onValueChange={(value) =>
                      updateOtherPaymentField("otherCardMayaTerminal", value)
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="other-bpi-nooma" className={labelClass}>
                    Direct BT BPI Nooma
                  </label>
                  <MoneyInput
                    id="other-bpi-nooma"
                    placeholder="0.00"
                    value={formData.otherDirectBpiNooma || ""}
                    onValueChange={(value) =>
                      updateOtherPaymentField("otherDirectBpiNooma", value)
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="other-eastwest-nooma" className={labelClass}>
                    Direct BT Eastwest Nooma
                  </label>
                  <MoneyInput
                    id="other-eastwest-nooma"
                    placeholder="0.00"
                    value={formData.otherDirectEastwestNooma || ""}
                    onValueChange={(value) =>
                      updateOtherPaymentField("otherDirectEastwestNooma", value)
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="other-gift-check" className={labelClass}>
                    Gift Check
                  </label>
                  <MoneyInput
                    id="other-gift-check"
                    placeholder="0.00"
                    value={formData.otherGiftCheck || ""}
                    onValueChange={(value) =>
                      updateOtherPaymentField("otherGiftCheck", value)
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="other-cheque" className={labelClass}>
                    Cheque
                  </label>
                  <MoneyInput
                    id="other-cheque"
                    placeholder="0.00"
                    value={formData.otherCheque || ""}
                    onValueChange={(value) =>
                      updateOtherPaymentField("otherCheque", value)
                    }
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Live Total Calculation Banner */}
              <div className="mt-4 flex items-center justify-between p-4 rounded-xl bg-neutral-900 border border-neutral-800">
                <div>
                  <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Total Other Payments
                  </p>
                  <p className="text-sm text-neutral-500">
                    Sum across the other payment methods above
                  </p>
                </div>
                <div className="text-xl font-bold text-emerald-400">
                  ₱
                  {totalOtherPayments.toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>

              <p className="mt-3 text-xs text-gray-500">
                Enter the total amount received per payment channel. Amounts
                must be zero or greater.
              </p>
            </section>
            <section>
              <SectionHeading>Sale Deductions</SectionHeading>
              <div className="mb-4 grid gap-4 md:grid-cols-3">
                <div>
                  <label htmlFor="pwd-discount" className={labelClass}>
                    PWD Discount
                  </label>
                  <MoneyInput
                    id="pwd-discount"
                    placeholder="0.00"
                    value={formData.pwdDiscount || ""}
                    onValueChange={(value) =>
                      updateDeductionField("pwdDiscount", value)
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label
                    htmlFor="other-card-maya-terminal"
                    className={labelClass}
                  >
                    Senior Citizen Discount
                  </label>
                  <MoneyInput
                    id="senior-citizen-discount"
                    placeholder="0.00"
                    value={formData.seniorCitizenDiscount || ""}
                    onValueChange={(value) =>
                      updateDeductionField(
                        "seniorCitizenDiscount",
                        value,
                      )
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="other-bpi-nooma" className={labelClass}>
                    Special Customer Discount
                  </label>
                  <MoneyInput
                    id="special-customer-discount"
                    placeholder="0.00"
                    value={formData.specialCustomerDiscount || ""}
                    onValueChange={(value) =>
                      updateDeductionField(
                        "specialCustomerDiscount",
                        value,
                      )
                    }
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Live Total Calculation Banner */}
              <div className="mt-4 flex items-center justify-between p-4 rounded-xl bg-neutral-900 border border-neutral-800">
                <div>
                  <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                    Total Deductions
                  </p>
                  <p className="text-sm text-neutral-500">
                    Sum across the deduction fields above
                  </p>
                </div>
                <div className="text-xl font-bold text-emerald-400">
                  ₱
                  {totalDeductions.toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>

              <p className="mt-3 text-xs text-gray-500">
                Enter the total amount received per payment channel. Amounts
                must be zero or greater.
              </p>
            </section>
            <section>
              <SectionHeading>Grab Sale</SectionHeading>
              <div className="mb-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="grab-sale-gross" className={labelClass}>
                    Grab Sale Gross
                  </label>
                  <MoneyInput
                    id="grab-sale-gross"
                    placeholder="0.00"
                    value={formData.grabSaleGross || ""}
                    onValueChange={(grossValue) => {
                      const numericGross = Number(grossValue);
                      const netSale =
                        grossValue.trim() !== "" &&
                        Number.isFinite(numericGross) &&
                        numericGross > 0
                          ? (numericGross * 0.73).toFixed(2)
                          : "";
                      onChange({
                        ...formData,
                        grabSaleGross: grossValue,
                        grabSaleLess27: netSale,
                      });
                    }}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="grab-sale-less-27" className={labelClass}>
                    Grab Sale Less 27%
                  </label>
                  <MoneyInput
                    id="grab-sale-less-27"
                    placeholder="0.00"
                    value={formData.grabSaleLess27 || ""}
                    readOnly
                    className={inputClass}
                  />
                </div>
              </div>
              <p className="mt-3 text-xs text-gray-500">
                Displays the Grab Sale Gross after subtracting the 27%
                commission.
              </p>
            </section>

            <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-5 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="rounded-xl border-gray-300 px-5 py-3 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSaving}
                className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700"
              >
                {isSaving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                {isSaving
                  ? "Saving..."
                  : isEditing
                    ? "Update Report"
                    : "Save Report"}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
