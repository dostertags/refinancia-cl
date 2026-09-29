// Primitivas estilo shadcn/ui (Button, Card, Input, Label) escritas a mano para no depender
// del CLI interactivo de shadcn; misma API y clases, se pueden reemplazar por las oficiales.
import * as React from "react";
import { cn } from "@/lib/utils";

export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "ghost" }>(
  ({ className, variant = "primary", ...p }, ref) => (
    <button ref={ref} className={cn(
      "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-50",
      variant === "primary" && "bg-brand text-white hover:bg-blue-900",
      variant === "outline" && "border border-slate-300 bg-white hover:bg-slate-50",
      variant === "ghost" && "hover:bg-slate-100", className)} {...p} />
  ),
);
Button.displayName = "Button";

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("rounded-xl border border-slate-200 bg-white p-5 shadow-sm", className)} {...p} />
);

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...p }, ref) => (
    <input ref={ref} className={cn("w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand", className)} {...p} />
  ),
);
Input.displayName = "Input";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...p }, ref) => (
    <select ref={ref} className={cn("w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm", className)} {...p} />
  ),
);
Select.displayName = "Select";

export const Label = ({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn("mb-1 block text-sm font-medium text-slate-700", className)} {...p} />
);

export const FieldError = ({ msg }: { msg?: string }) => (msg ? <p role="alert" className="mt-1 text-xs text-red-600">{msg}</p> : null);
