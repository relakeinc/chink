import { useCountUp } from "@/lib/motion";

interface AnimatedNumberProps {
  value: number;
  format: (value: number) => string;
  duration?: number;
  className?: string;
}

/**
 * Número que cuenta de 0 a su valor. El formateador se aplica en cada frame
 * para que el separador de miles no "salte" durante la transición.
 */
export default function AnimatedNumber({ value, format, duration = 400, className }: AnimatedNumberProps) {
  const current = useCountUp(value, duration);
  return <span className={className}>{format(current)}</span>;
}