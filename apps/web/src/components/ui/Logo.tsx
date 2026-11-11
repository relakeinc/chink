import { Icon } from "./Icon";

/**
 * Wordmark de Chink: tinta en claro y lima en oscuro.
 * Las clases van en el envoltorio porque Icon fija `display:block`
 * en línea y taparía el intercambio por CSS.
 */
export function Logo({ className = "h-[28px] w-auto" }: { className?: string }) {
  return (
    <>
      <span className="logo-light inline-flex shrink-0 items-center" aria-hidden={false}>
        <Icon name="chink-mark" className={className} title="Chink" />
      </span>
      <span className="logo-dark items-center" aria-hidden={false}>
        <Icon name="chink-mark-lime" className={className} title="Chink" />
      </span>
    </>
  );
}
