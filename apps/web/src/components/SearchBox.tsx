import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

export function SearchBox({
  initial = "",
  large = false,
}: {
  initial?: string;
  large?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const navigate = useNavigate();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim())
      navigate(`/ar/search?q=${encodeURIComponent(value.trim())}`);
  };
  return (
    <form
      className={large ? "search-box large" : "search-box"}
      role="search"
      onSubmit={submit}
    >
      <label
        className="sr-only"
        htmlFor={large ? "hero-search" : "page-search"}
      >
        ابحث في التشريعات والمواد
      </label>
      <input
        id={large ? "hero-search" : "page-search"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="ابحث بعنوان التشريع أو رقمه أو نص مادة…"
      />
      <button type="submit">بحث</button>
    </form>
  );
}
