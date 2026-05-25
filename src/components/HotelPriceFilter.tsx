import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, SVGProps } from "react";
import { CheckIcon, ChevronDownIcon } from "./icons";
import type { HotelPriceBand } from "../types";

type HotelPriceFilterProps = {
  customMax: string;
  customMin: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: HotelPriceBand;
  onCustomChange: (range: { min: string; max: string }) => void;
  onValueChange: (value: HotelPriceBand) => void;
};

const priceOptions: { value: HotelPriceBand; label: string }[] = [
  { value: "0-500", label: "0-500" },
  { value: "500-1000", label: "500-1000" },
  { value: "1000-1500", label: "1000-1500" },
  { value: "1500-plus", label: "1500+" },
];

export function HotelPriceFilter({
  customMax,
  customMin,
  icon: Icon,
  label,
  value,
  onCustomChange,
  onValueChange,
}: HotelPriceFilterProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const displayValue = useMemo(() => {
    if (value !== "custom") {
      return priceOptions.find((option) => option.value === value)?.label ?? "不限";
    }

    const min = customMin.trim();
    const max = customMax.trim();
    if (!min && !max) return "输入区间";
    return `${min || "0"}-${max || "∞"}`;
  }, [customMax, customMin, value]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  return (
    <div className={`filter-control ${isOpen ? "filter-control--open" : ""}`} ref={rootRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className="filter-control__button"
        type="button"
        onClick={() => setIsOpen((current) => !current)}
      >
        <Icon aria-hidden="true" className="filter-control__icon" />
        <span className="filter-control__copy">
          <span className="filter-control__label">{label}</span>
          <span className="filter-control__value">{displayValue}</span>
        </span>
        <ChevronDownIcon className="filter-control__chevron" />
      </button>

      {isOpen && (
        <div className="filter-control__popover hotel-price-popover">
          <button
            aria-selected={value === "all"}
            className={`filter-control__option ${value === "all" ? "filter-control__option--selected" : ""}`}
            role="option"
            type="button"
            onClick={() => onValueChange("all")}
          >
            <span className="filter-control__option-copy">
              <span className="filter-control__option-label">不限</span>
            </span>
            {value === "all" && <CheckIcon className="filter-control__check" />}
          </button>
          <div className={value === "custom" ? "hotel-price-range hotel-price-range--active" : "hotel-price-range"}>
            <input
              aria-label="最低价"
              className="filter-control__search hotel-price-range__input"
              inputMode="numeric"
              min="0"
              placeholder="最低"
              type="number"
              value={customMin}
              onChange={(event) => onCustomChange({ min: event.target.value, max: customMax })}
              onFocus={() => onValueChange("custom")}
            />
            <input
              aria-label="最高价"
              className="filter-control__search hotel-price-range__input"
              inputMode="numeric"
              min="0"
              placeholder="最高"
              type="number"
              value={customMax}
              onChange={(event) => onCustomChange({ min: customMin, max: event.target.value })}
              onFocus={() => onValueChange("custom")}
            />
          </div>
          <div className="filter-control__options" role="listbox" aria-label={label}>
            {priceOptions.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  aria-selected={isSelected}
                  className={`filter-control__option ${
                    isSelected ? "filter-control__option--selected" : ""
                  }`}
                  role="option"
                  type="button"
                  onClick={() => onValueChange(option.value)}
                >
                  <span className="filter-control__option-copy">
                    <span className="filter-control__option-label">{option.label}</span>
                  </span>
                  {isSelected && <CheckIcon className="filter-control__check" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
