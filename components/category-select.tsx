"use client";

import { useId, useState } from "react";

export type CategoryOption = {
  id: string;
  name: string;
};

const NEW_CATEGORY_VALUE = "__new__";

type CategorySelectProps = {
  categories: CategoryOption[];
  defaultCategoryId?: string | null;
  required?: boolean;
  /** name del campo con el id de categoría existente. */
  name?: string;
  /** name del campo con el nombre de la categoría a crear al vuelo. */
  newCategoryName?: string;
  /** Permite crear categorías al vuelo (solo admin). El foro lo desactiva. */
  allowCreate?: boolean;
};

export default function CategorySelect({
  categories,
  defaultCategoryId = null,
  required = false,
  name = "category_id",
  newCategoryName = "new_category",
  allowCreate = true,
}: CategorySelectProps) {
  const selectId = useId();
  const [value, setValue] = useState<string>(defaultCategoryId ?? "");
  const isCreating = allowCreate && value === NEW_CATEGORY_VALUE;

  return (
    <div className="space-y-3">
      <label
        htmlFor={selectId}
        className="block text-xs font-bold uppercase tracking-widest text-[#bacbb6]"
      >
        Categoría
      </label>

      <select
        id={selectId}
        // Al crear una categoría nueva no enviamos category_id: solo viaja
        // new_category, así el servidor nunca recibe el valor centinela.
        name={isCreating ? undefined : name}
        value={value}
        required={required}
        onChange={(event) => setValue(event.target.value)}
        className="w-full rounded-xl border border-[#3c4b3a]/40 bg-[#181d22] px-4 py-3 text-base text-white outline-none transition-colors focus:border-[#43fe6d]"
      >
        <option value="" disabled={required}>
          Sin categoría
        </option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
        {allowCreate ? <option value={NEW_CATEGORY_VALUE}>+ Nueva categoría</option> : null}
      </select>

      {isCreating ? (
        <input
          name={newCategoryName}
          required={required}
          autoFocus
          placeholder="Nombre de la nueva categoría"
          maxLength={60}
          className="w-full rounded-xl border border-[#3c4b3a]/40 bg-[#181d22] px-4 py-3 text-base text-white placeholder:text-white/30 outline-none transition-colors focus:border-[#43fe6d]"
        />
      ) : null}
    </div>
  );
}
