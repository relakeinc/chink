import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

/**
 * Shell de la aplicación.
 *
 * El panel de trabajo (fondo `subtle` y esquinas superiores redondeadas) queda
 * fijo y ocupa la altura disponible; únicamente el contenido interior hace
 * scroll, de modo que el marco nunca se desplaza.
 */
export default function AppLayout() {
  return (
    <div className="h-screen w-full overflow-hidden bg-canvas">
      <Sidebar />
      <TopBar />

      <main className="ml-[104px] mr-[25px] mt-[55px] h-[calc(100vh-55px)] overflow-hidden overscroll-none">
        <div className="flex h-full flex-col overflow-hidden rounded-tl-[10px] rounded-tr-[10px] bg-subtle">
          <div className="scroll-thin min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-[20px] pt-[10px] pb-[20px]">
            <div className="flex flex-col gap-[20px]">
              <Outlet />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}