// LandingNav — responsive navigation for the landing page
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import ProwlLogo from './ProwlLogo';
import SquashHamburger from './SquashHamburger';
import ScrambleText from './ScrambleText';

interface LandingNavProps {
  visible: boolean;
}

export default function LandingNav({ visible }: LandingNavProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);
  const [hoveredBtn, setHoveredBtn] = useState(false);

  return (
    <motion.nav
      className="fixed top-0 left-0 right-0 z-50 h-20 flex items-center px-4 sm:px-6 md:px-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.8 }}
    >
      {/* ─── Desktop ─── */}
      <div className="hidden sm:flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          {/* Logo pill */}
          <motion.div
            className={`h-12 px-5 bg-white/15 backdrop-blur-md rounded-[14px] flex items-center gap-2.5 cursor-pointer ${menuOpen ? 'hidden md:flex' : 'flex'}`}
            whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.22)' }}
            whileTap={{ scale: 0.98 }}
          >
            <Link href="/" className="flex items-center gap-2.5">
              <ProwlLogo size={18} />
              <span className="text-[16px] font-medium tracking-tight text-white">Prowl</span>
            </Link>
          </motion.div>

          {/* Expanding menu pill */}
          <motion.div
            className="h-12 rounded-[14px] bg-white/15 backdrop-blur-md flex items-center overflow-hidden"
            animate={{ width: menuOpen ? 320 : 48 }}
            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
          >
            <motion.button
              className={`flex items-center justify-center shrink-0 ${
                menuOpen
                  ? 'w-9 h-9 rounded-[11px] bg-white/10 hover:bg-white/20 ml-1.5'
                  : 'w-12 h-12 rounded-[14px]'
              }`}
              onClick={() => setMenuOpen(!menuOpen)}
              whileTap={{ scale: 0.95 }}
            >
              <SquashHamburger isOpen={menuOpen} />
            </motion.button>

            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  className="flex items-center gap-5 ml-3 whitespace-nowrap"
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 15 }}
                  transition={{ duration: 0.2 }}
                >
                  {[
                    { label: 'Dashboard', href: '/dashboard' },
                    { label: 'Patterns', href: '/patterns' },
                    { label: 'Memory', href: '/memory' },
                  ].map((link) => (
                    <Link
                      key={link.label}
                      href={link.href}
                      className="text-[16px] font-normal text-white/85 hover:text-white transition-colors"
                      onMouseEnter={() => setHoveredLink(link.label)}
                      onMouseLeave={() => setHoveredLink(null)}
                    >
                      <ScrambleText text={link.label} isHovered={hoveredLink === link.label} />
                    </Link>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* CTA + Wallet */}
        <div className="flex items-center gap-3">
          <ConnectButton.Custom>
            {({ account, chain, openConnectModal, mounted }) => {
              if (!mounted || !account) {
                return (
                  <motion.button
                    className="h-12 px-5 bg-white/15 backdrop-blur-md rounded-[14px] text-[14px] text-white/90 cursor-pointer border-0"
                    whileHover={{ scale: 1.03, backgroundColor: 'rgba(255,255,255,0.22)' }}
                    whileTap={{ scale: 0.97 }}
                    onClick={openConnectModal}
                  >
                    Connect
                  </motion.button>
                );
              }
              return (
                <motion.div
                  className="h-12 px-5 bg-white/15 backdrop-blur-md rounded-[14px] flex items-center gap-2 text-[14px] text-white/90"
                  whileHover={{ scale: 1.02 }}
                >
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                  {account.displayName}
                </motion.div>
              );
            }}
          </ConnectButton.Custom>
          <Link href="/bounty/new">
            <motion.div
              className="h-12 px-6 bg-white rounded-full flex items-center gap-2 text-black cursor-pointer"
              whileHover={{ scale: 1.03, backgroundColor: '#e2e2e6' }}
              whileTap={{ scale: 0.97 }}
              onMouseEnter={() => setHoveredBtn(true)}
              onMouseLeave={() => setHoveredBtn(false)}
            >
              <span className="text-[15px]">🔍</span>
              <ScrambleText
                text="Post Bounty"
                isHovered={hoveredBtn}
                className="text-[15px] font-medium"
              />
            </motion.div>
          </Link>
        </div>
      </div>

      {/* ─── Mobile ─── */}
      <div className="flex sm:hidden items-center justify-between w-full">
        <div className="flex items-center gap-1.5">
          {/* Logo pill — collapses when menu open */}
          <motion.div
            className="h-9 bg-white/15 backdrop-blur-md rounded-[10px] flex items-center overflow-hidden"
            animate={{ width: menuOpen ? 0 : 'auto', opacity: menuOpen ? 0 : 1, paddingLeft: menuOpen ? 0 : 12, paddingRight: menuOpen ? 0 : 12 }}
            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
          >
            <Link href="/" className="flex items-center gap-2">
              <ProwlLogo size={14} />
              <span className="text-[13px] font-medium tracking-tight text-white">Prowl</span>
            </Link>
          </motion.div>

          {/* Menu capsule */}
          <motion.div
            className="h-9 rounded-[10px] bg-white/15 backdrop-blur-md flex items-center overflow-hidden"
            animate={{ width: menuOpen ? '100%' : 36 }}
            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
          >
            <motion.button
              className={`flex items-center justify-center shrink-0 ${
                menuOpen ? 'w-7 h-7 rounded-[8px] bg-white/10 ml-1' : 'w-9 h-9 rounded-[10px]'
              }`}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <SquashHamburger isOpen={menuOpen} mobile />
            </motion.button>

            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  className="flex items-center gap-3 ml-2 whitespace-nowrap"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                >
                  {[
                    { label: 'Dashboard', href: '/dashboard' },
                    { label: 'Patterns', href: '/patterns' },
                  ].map((link) => (
                    <Link
                      key={link.label}
                      href={link.href}
                      className="text-[13px] text-white/85"
                    >
                      {link.label}
                    </Link>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        <div className="flex items-center gap-2">
          <ConnectButton.Custom>
            {({ account, openConnectModal, mounted }) => {
              if (!mounted || !account) {
                return (
                  <button
                    className="h-9 px-3 bg-white/15 backdrop-blur-md rounded-[10px] text-[12px] text-white/90 border-0 cursor-pointer"
                    onClick={openConnectModal}
                  >
                    Connect
                  </button>
                );
              }
              return (
                <div className="h-9 px-3 bg-white/15 backdrop-blur-md rounded-[10px] flex items-center gap-1.5 text-[12px] text-white/90">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  {account.displayName}
                </div>
              );
            }}
          </ConnectButton.Custom>
          <Link href="/bounty/new">
            <div className="h-9 px-3.5 bg-white rounded-full flex items-center gap-1.5 text-black">
              <span className="text-[12px]">🔍</span>
              <span className="text-[13px] font-medium">Bounty</span>
            </div>
          </Link>
        </div>
      </div>
    </motion.nav>
  );
}
