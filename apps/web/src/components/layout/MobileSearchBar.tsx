import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { SearchInput } from "@/components/ui/inputs";
import { Icon } from "@/components/ui/Icon";

/**
 * Barra de búsqueda móvil bajo el TopBar (solo `md:hidden`): el buscador se
 * sincroniza con el de la página visible y el icono abre su calendario.
 * Lleva fondo propio para no flotar sobre el contenido y se limpia al
 * cambiar de página para no arrastrar el filtro anterior.
 */
export default function MobileSearchBar() {
  const [value, setValue] = useState("");
  const { pathname } = useLocation();

  // Al cambiar de página se limpia: si no, el filtro viejo queda flotando
  // sobre el shell sin que la página nueva lo muestre.
  useEffect(() => {
    setValue("");
  }, [pathname]);

  return (
    <div className="fixed top-[52px] right-0 left-0 z-20 border-b border-edge/60 bg-canvas/95 px-[12px] pt-[6px] pb-[8px] backdrop-blur md:hidden">
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
