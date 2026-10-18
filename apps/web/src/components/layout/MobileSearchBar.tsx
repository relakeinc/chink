import { useState } from "react";
import { SearchInput } from "@/components/ui/inputs";
import { Icon } from "@/components/ui/Icon";

/**
 * Barra de búsqueda móvil bajo el TopBar (solo `md:hidden`): el buscador se
 * sincroniza con el de la página visible y el icono abre su calendario.
 */
export default function MobileSearchBar() {
  const [value, setValue] = useState("");

  return (
    <div className="fixed top-[52px] right-[12px] left-[12px] z-20 md:hidden">
      <div className="flex items-center gap-[8px]">
        <div className="min-w-0 flex-1">
          <SearchInput value={value} onChange={setValue} placeholder="Buscar" fluid />
        </div>
        <button
          type="button"
          aria-label="Rango de fechas"
          onClick={() => window.dispatchEvent(new Event("chink:open-range"))}
          className="pressable flex size-[36px] shrink-0 items-center justify-center rounded-[6px] border border-line-strong bg-coal text-cream transition-colors active:bg-shell"
        >
          <Icon name="calendar-days" size={15} />
        </button>
      </div>
    </div>
  );
}
