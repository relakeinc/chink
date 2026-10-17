import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import MobileNav from "./MobileNav";

/**
 * Shell de la aplicación.
 *
 * El panel de trabajo (fondo `subtle` y esquinas superiores redondeadas) queda
 * fijo y ocupa la altura disponible; únicamente el contenido interior hace
 * scroll, de modo que el marco nunca se desplaza. En móvil el panel va a
 * sangre (sin márgenes laterales) y el dock flotante lleva la navegación.
 */
export default function AppLayout() {
  return (
    <div className="h-screen w-full overflow-hidden bg-canvas">
      <Sidebar />
      <TopBar />
      <MobileNav />

      <main className="mr-0 mt-[55px] ml-0 h-[calc(100vh-55px)] overflow-hidden overscroll-none md:mr-[25px] md:ml-[104px]">
        <div className="flex h-full flex-col overflow-hidden rounded-tl-[10px] rounded-tr-[10px] bg-subtle">
          <div className="scroll-thin min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-[16px] pt-[10px] pb-[96px] md:px-[20px] md:pb-[20px]">
            <div className="flex flex-col gap-[20px]">
              <Outlet />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
