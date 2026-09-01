'use client';

import { motion } from 'framer-motion';

interface SquashHamburgerProps {
  isOpen: boolean;
  mobile?: boolean;
}

const spring = { type: 'spring' as const, stiffness: 300, damping: 20 };

export default function SquashHamburger({ isOpen, mobile = false }: SquashHamburgerProps) {
  const w = mobile ? 15 : 18;
  const h = mobile ? 10 : 12;
  const barH = mobile ? 1.2 : 1.5;

  return (
    <div className="relative" style={{ width: w, height: h }}>
      <motion.span
        className="absolute left-0 right-0 bg-white rounded-full"
        style={{ height: barH, top: 0 }}
        animate={isOpen ? { rotate: 45, y: h / 2 - barH / 2 } : { rotate: 0, y: 0 }}
        transition={spring}
      />
      <motion.span
        className="absolute left-0 right-0 bg-white rounded-full"
        style={{ height: barH, top: h / 2 - barH / 2 }}
        animate={isOpen ? { opacity: 0, scaleX: 0 } : { opacity: 1, scaleX: 1 }}
        transition={spring}
      />
      <motion.span
        className="absolute left-0 right-0 bg-white rounded-full"
        style={{ height: barH, bottom: 0 }}
        animate={isOpen ? { rotate: -45, y: -(h / 2 - barH / 2) } : { rotate: 0, y: 0 }}
        transition={spring}
      />
    </div>
  );
}
