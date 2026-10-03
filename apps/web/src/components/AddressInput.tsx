import type { LonLat } from "@routefuel/shared";
import { useId, useState, type ReactNode } from "react";
import { AUTOCOMPLETE_MIN_CHARS, useAddressAutocomplete } from "../hooks/useAddressAutocomplete";
import { isOffline, OFFLINE_SUGGESTIONS_MESSAGE } from "../lib/connectivity";
import { SpinnerIcon } from "./icons";

export interface Place {
  lon: number;
  lat: number;
  label: string;
}

interface AddressInputProps {
  label: string;
  placeholder: string;
  text: string;
  onTextChange: (text: string) => void;
  /** Luogo scelto dall'elenco (null finché l'utente non ne seleziona uno). */
  place: Place | null;
  onPlaceSelect: (place: Place) => void;
  /** Bias di prossimità per i suggerimenti (es. posizione dell'utente). */
  proximity?: LonLat;
  /** Elemento a sinistra del campo (marcatore origine/destinazione). */
  leading: ReactNode;
  /** Azione a destra del campo (es. "Posizione attuale"). */
  trailing?: ReactNode;
}

export function AddressInput({
  label,
  placeholder,
  text,
  onTextChange,
  place,
  onPlaceSelect,
  proximity,
  leading,
  trailing,
}: AddressInputProps) {
  const id = useId();
  const listId = `${id}-list`;
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const { suggestions, loading, error } = useAddressAutocomplete(text, focused && place === null, proximity);
  const open = focused && place === null && text.trim().length >= AUTOCOMPLETE_MIN_CHARS && (suggestions.length > 0 || error);

  const select = (index: number) => {
    const suggestion = suggestions[index];
    if (!suggestion) return;
    onPlaceSelect({ lon: suggestion.lon, lat: suggestion.lat, label: suggestion.label });
    setActiveIndex(-1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      select(activeIndex);
    } else if (event.key === "Escape") {
      setFocused(false);
    }
  };

  return (
    <div className="relative flex items-center gap-space-md">
      <span className="w-4 flex justify-center">{leading}</span>

      <div className="relative flex-1 min-w-0">
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <div className="flex items-center h-11 rounded bg-surface-container-low pl-space-lg pr-space-sm gap-space-sm focus-within:ring-2 focus-within:ring-primary/40 transition-shadow">
          <input
            id={id}
            type="text"
            role="combobox"
            aria-expanded={Boolean(open)}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
            autoComplete="off"
            spellCheck={false}
            placeholder={placeholder}
            value={text}
            onChange={(event) => {
              setActiveIndex(-1);
              onTextChange(event.target.value);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={onKeyDown}
            className="flex-1 min-w-0 bg-transparent text-body-md font-body-md text-on-surface placeholder:text-outline outline-none"
          />
          {loading && <SpinnerIcon className="w-4 h-4 text-outline" />}
          {trailing}
        </div>

        {open && (
          <ul
            id={listId}
            role="listbox"
            aria-label={`Suggerimenti per ${label}`}
            className="absolute left-0 right-0 top-full mt-space-xs z-20 max-h-72 overflow-y-auto rounded bg-surface-container-lowest border border-outline-variant/40 shadow-lg py-space-xs"
          >
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion.id}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                // mousedown (non click) e preventDefault: la selezione avviene prima che l'input perda il focus.
                onMouseDown={(event) => {
                  event.preventDefault();
                  select(index);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`px-space-lg py-space-sm cursor-pointer ${index === activeIndex ? "bg-surface-container-low" : ""}`}
              >
                <div className="text-label-lg font-label-lg text-on-surface truncate">{suggestion.name}</div>
                <div className="text-body-sm font-body-sm text-on-surface-variant truncate">{suggestion.label}</div>
              </li>
            ))}
            {error && suggestions.length === 0 && (
              <li role="presentation" className="px-space-lg py-space-sm text-body-sm font-body-sm text-on-surface-variant">
                {isOffline() ? OFFLINE_SUGGESTIONS_MESSAGE : "Suggerimenti non disponibili al momento. Riprova tra poco."}
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
