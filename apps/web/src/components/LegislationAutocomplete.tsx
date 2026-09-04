import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../api";

interface Suggestion {
  id: string;
  titleAr: string;
  officialNumber: string;
  year: number;
}

export function LegislationAutocomplete({
  name = "q",
  initialValue = "",
  placeholder,
}: {
  name?: string;
  initialValue?: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    if (value.trim().length < 2) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiGet<Suggestion[]>(
        `/legislations/suggestions?q=${encodeURIComponent(value)}`,
        controller.signal,
      )
        .then((result) => {
          setItems(result);
          setOpen(true);
        })
        .catch(() => undefined);
    }, 220);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);
  return (
    <div className="autocomplete">
      <input
        aria-label="عبارة البحث"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && items.length > 0}
        aria-controls="legislation-suggestions"
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder={placeholder}
      />
      {open && items.length > 0 && (
        <ul id="legislation-suggestions" role="listbox">
          {items.map((item) => (
            <li role="option" aria-selected="false" key={item.id}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => navigate(`/ar/legislations/${item.id}`)}
              >
                <strong>{item.titleAr}</strong>
                <span>
                  رقم {item.officialNumber} لسنة {item.year}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
