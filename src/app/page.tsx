// Landing Page — Prowl hero section, features, and call-to-action
'use client';

import { useState, useEffect, useRef, type ReactNode, type CSSProperties } from 'react';
import Link from 'next/link';

/* ── Unsplash images ── */
const IMG = {
  hero: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?auto=format&fit=crop&w=1920&q=80',
};

/* ── Data ── */
const SWARM = [
  { num: '01', name: 'Coordinator', desc: 'Opens the file, scopes the assignments, and writes the report the claimant reads.', tags: 'dispatch · synthesis' },
  { num: '02', name: 'Tracer', desc: 'Maps transaction flow hop by hop and names the mixers, bridges and layering in the path.', tags: 'basescan · graph walk' },
  { num: '03', name: 'Analyst', desc: 'Clusters related wallets and matches the shape of the theft against known exploit signatures.', tags: 'clustering · signatures' },
  { num: '04', name: 'Monitor', desc: 'Stands watch on flagged addresses and raises the alert the moment stolen funds move again.', tags: 'watchlists · alerts' },
];

const FOOTER_NAV = [
  { heading: 'Product', links: [{ label: 'Investigate', href: '/bounty/new' }, { label: 'Case', href: '/case/001' }, { label: 'Dashboard', href: '/dashboard' }] },
  { heading: 'Intelligence', links: [{ label: 'Patterns', href: '/patterns' }, { label: 'Memory', href: '/memory' }] },
];

/* ── Scroll-triggered reveal ── */
type RevealVariant = 'fade-up' | 'fade' | 'rise' | 'pop' | 'slide-left' | 'slide-right' | 'scale';

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold, rootMargin: '0px 0px -40px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

const VARIANT_ANIM: Record<RevealVariant, string> = {
  'fade-up': 'pw-fade-up',
  fade: 'pw-fade',
  rise: 'pw-rise',
  pop: 'pw-pop',
  'slide-left': 'pw-slide-left',
  'slide-right': 'pw-slide-right',
  scale: 'pw-scale-in',
};

function Reveal({ children, variant = 'fade-up', delay = 0, duration = 0.85, style, as: Tag = 'div' }: {
  children: ReactNode; variant?: RevealVariant; delay?: number; duration?: number;
  style?: CSSProperties; as?: 'div' | 'section' | 'li' | 'figure' | 'article' | 'span';
}) {
  const { ref, visible } = useInView();
  const animName = VARIANT_ANIM[variant];
  return (
    <Tag ref={ref as never} style={{
      ...style,
      ...(visible
        ? { animation: `${animName} ${duration}s cubic-bezier(0.16,1,0.3,1) ${delay}s both` }
        : { opacity: 0 }
      ),
    }}>
      {children}
    </Tag>
  );
}

/* ── Scroll-triggered text reveal (clip from below) ── */
function ScrollClipReveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const { ref, visible } = useInView(0.3);
  return (
    <span ref={ref} style={{ display: 'block', overflow: 'hidden', paddingBottom: '0.14em' }}>
      <span style={{
        display: 'block',
        ...(visible
          ? { animation: `pw-rise 0.95s cubic-bezier(0.16,1,0.3,1) ${delay}s both` }
          : { opacity: 0, transform: 'translateY(115%)' }
        ),
      }}>
        {children}
      </span>
    </span>
  );
}

/* ── Stagger children on scroll ── */
function StaggerReveal({ children, stagger = 0.08, style }: { children: ReactNode[]; stagger?: number; style?: CSSProperties }) {
  const { ref, visible } = useInView(0.1);
  return (
    <div ref={ref} style={style}>
      {children.map((child, i) => (
        <div key={i} style={
          visible
            ? { animation: `pw-fade-up 0.7s cubic-bezier(0.16,1,0.3,1) ${i * stagger}s both` }
            : { opacity: 0 }
        }>
          {child}
        </div>
      ))}
    </div>
  );
}

/* ── Shared components ── */
function Eyebrow({ children, light }: { children: ReactNode; light?: boolean }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 9,
      fontFamily: 'var(--font-mono)', fontSize: '10.5px',
      letterSpacing: '0.22em', textTransform: 'uppercase',
      color: light ? 'rgba(243,242,242,0.7)' : 'var(--color-neutral-700)',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: 999,
        background: light ? 'var(--color-accent-300)' : 'var(--color-accent)',
      }} />
      {children}
    </div>
  );
}

function ArrowIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function SearchIcon({ size = 20, stroke = 'var(--color-accent)' }: { size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.4" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5 21 21" />
    </svg>
  );
}

/* ── Count-up number on scroll ── */
function CountUp({ value, suffix = '', duration = 1.6 }: { value: string; suffix?: string; duration?: number }) {
  const { ref, visible } = useInView(0.4);
  const [display, setDisplay] = useState(value);
  const isNumeric = /^\d+$/.test(value);

  useEffect(() => { // eslint-disable-line react-hooks/set-state-in-effect -- setState in interval callback is correct
    if (!visible || !isNumeric) { setDisplay(value); return; } // eslint-disable-line react-hooks/set-state-in-effect
    const target = parseInt(value);
    const steps = 30;
    const stepDuration = (duration * 1000) / steps;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      const progress = step / steps;
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(target * eased).toString());
      if (step >= steps) clearInterval(timer);
    }, stepDuration);
    return () => clearInterval(timer);
  }, [visible, value, isNumeric, duration]);

  return <span ref={ref}>{display}{suffix}</span>;
}

/* ── Page ── */
export default function Home() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1800);
    return () => clearTimeout(t);
  }, []);

  /* ── Loader ── */
  if (!ready) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'var(--color-bg)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        color: 'var(--color-text)', zIndex: 9999,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SearchIcon stroke="var(--color-accent)" />
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: 16, letterSpacing: '0.22em', textTransform: 'uppercase' }}>
            Prowl
          </span>
        </div>
        <div style={{
          width: 120, height: 1, background: 'var(--color-divider)',
          margin: '24px 0 16px', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'var(--color-accent)',
            animation: 'pw-line 1.6s ease-in-out forwards',
            transformOrigin: 'left',
          }} />
        </div>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10.5,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--color-neutral-600)',
        }}>
          Waking Coordinator
        </span>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', overflowX: 'clip', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-body)', padding: 8 }}>

      {/* ════════ HERO ════════ */}
      <section style={{
        position: 'relative', isolation: 'isolate', overflow: 'hidden',
        borderRadius: 'var(--radius-lg)', background: '#14120f', color: '#f3f2f2',
        height: 'calc(100svh - 24px)', minHeight: 620,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Background image + overlay */}
        <div style={{ position: 'absolute', inset: 0, zIndex: -10, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: '-16%', height: '132%' }}>
            <img src={IMG.hero} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="eager" />
          </div>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(rgba(20,18,15,0.78), rgba(20,18,15,0.55), rgba(20,18,15,0.92))',
          }} />
        </div>

        {/* Header */}
        <header style={{
          display: 'flex', alignItems: 'center',
          padding: '26px clamp(20px,3vw,44px) 0', fontSize: 12,
          animation: '0.8s cubic-bezier(0.16,1,0.3,1) 2s 1 normal both running pw-fade',
        }}>
          <div className="pw-hero-nav" style={{ flex: 1, display: 'flex', gap: 30 }}>
            <a href="#swarm" style={{ color: 'rgba(243,242,242,0.9)', textDecoration: 'none' }}>The Swarm</a>
            <a href="#how" style={{ color: 'rgba(243,242,242,0.9)', textDecoration: 'none' }}>How it works</a>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <SearchIcon />
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 16, letterSpacing: '0.22em', textTransform: 'uppercase' }}>
              Prowl
            </span>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 18 }}>
            <Link href="/bounty/new" className="pw-hero-cta" style={{
              background: 'none', border: 0, color: '#f3f2f2',
              fontFamily: 'var(--font-heading)', fontSize: '11.5px',
              letterSpacing: '0.16em', textTransform: 'uppercase',
              cursor: 'pointer', textDecoration: 'none',
            }}>
              Start investigation
            </Link>
            <button aria-label="Menu" style={{
              width: 38, height: 38, display: 'grid', placeContent: 'center', gap: 5,
              borderRadius: 999, border: '1px solid rgba(243,242,242,0.2)',
              background: 'rgba(243,242,242,0.12)', backdropFilter: 'blur(6px)', cursor: 'pointer',
            }}>
              <span style={{ display: 'block', width: 15, height: 1, background: '#f3f2f2' }} />
              <span style={{ display: 'block', width: 15, height: 1, background: '#f3f2f2' }} />
            </button>
          </div>
        </header>

        {/* Title */}
        <div style={{ padding: '18px clamp(20px,3vw,44px) 0' }}>
          <h1 style={{
            fontSize: 'clamp(42px, 11.2vw, 160px)', fontWeight: 400, lineHeight: 0.86,
            letterSpacing: '-0.03em', margin: 0,
            fontFamily: 'var(--font-heading)',
          }}>
            <span style={{ display: 'inline-block', overflow: 'hidden', paddingBottom: '0.14em', verticalAlign: 'bottom' }}>
              <span style={{ display: 'inline-block', animation: '1.1s cubic-bezier(0.16,1,0.3,1) 2.1s 1 normal both running pw-rise' }}>Follow</span>
            </span>{' '}
            <span style={{ display: 'inline-block', overflow: 'hidden', paddingBottom: '0.14em', verticalAlign: 'bottom' }}>
              <span style={{ display: 'inline-block', animation: '1.1s cubic-bezier(0.16,1,0.3,1) 2.24s 1 normal both running pw-rise' }}>the</span>
            </span>{' '}
            <span style={{ display: 'inline-block', overflow: 'hidden', paddingBottom: '0.14em', verticalAlign: 'bottom' }}>
              <span style={{ display: 'inline-block', fontStyle: 'italic', color: 'var(--color-accent-300)', animation: '1.1s cubic-bezier(0.16,1,0.3,1) 2.38s 1 normal both running pw-rise' }}>money</span>
            </span>
          </h1>
        </div>

        {/* Bottom bar */}
        <div style={{
          marginTop: 'auto', padding: '0 clamp(20px,3vw,44px) 40px',
          display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end',
          justifyContent: 'space-between', gap: 26,
        }}>
          <p style={{
            margin: 0, fontFamily: 'var(--font-heading)', fontSize: '2.3rem',
            lineHeight: 0.98, letterSpacing: '-0.02em', color: 'rgba(243,242,242,0.86)',
          }}>
            <span style={{ display: 'block', overflow: 'hidden', paddingBottom: '0.14em' }}>
              <span style={{ display: 'block', animation: '0.9s cubic-bezier(0.16,1,0.3,1) 2.45s 1 normal both running pw-rise' }}>Submit a case,</span>
            </span>
            <span style={{ display: 'block', overflow: 'hidden', paddingBottom: '0.14em' }}>
              <span style={{ display: 'block', animation: '0.9s cubic-bezier(0.16,1,0.3,1) 2.56s 1 normal both running pw-rise' }}>wake the swarm.</span>
            </span>
          </p>

          {/* CTA button */}
          <Link href="/bounty/new" style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            borderRadius: 999, padding: '14px 28px',
            border: '1px solid rgba(243,242,242,0.2)', background: 'rgba(243,242,242,0.09)',
            backdropFilter: 'blur(8px)', color: '#f3f2f2',
            fontFamily: 'var(--font-mono)', fontSize: '10.5px',
            letterSpacing: '0.16em', textTransform: 'uppercase',
            textDecoration: 'none',
            animation: '1s cubic-bezier(0.16,1,0.3,1) 2.75s 1 normal both running pw-fade',
          }}>
            Start an investigation <ArrowIcon size={14} />
          </Link>
        </div>
      </section>

      {/* ════════ TRUST / AGENT CAROUSEL ════════ */}
      <section style={{
        position: 'relative', isolation: 'isolate',
        padding: 'clamp(48px,5vw,84px) clamp(20px,3vw,44px)',
      }}>
        {/* Top row: badge + info card */}
        <div style={{ position: 'relative', zIndex: 20, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 26 }}>
          <Reveal variant="pop" delay={0.1}>
            <div style={{
              width: 128, height: 128, borderRadius: 999,
              background: 'var(--color-neutral-100)', border: '1px solid var(--color-divider)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              textAlign: 'center', padding: 14,
            }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 26, fontVariantNumeric: 'tabular-nums' }}>100%</span>
              <span style={{ fontSize: '9.5px', color: 'var(--color-neutral-700)', maxWidth: '9em', lineHeight: 1.35, marginTop: 4 }}>On-chain evidence, cited hop by hop</span>
            </div>
          </Reveal>
          <Reveal variant="slide-left" delay={0.2} as="article" style={{
            maxWidth: 460, display: 'flex', gap: 20, padding: 'var(--space-4)',
            borderRadius: 'var(--radius-md)', background: 'var(--color-neutral-100)',
            border: '1px solid var(--color-divider)',
          }}>
            <div style={{
              alignSelf: 'flex-start', borderRadius: 'var(--radius-sm)',
              background: 'var(--color-card)', border: '1px solid var(--color-divider)',
              padding: '8px 14px', fontFamily: 'var(--font-mono)', fontSize: 15,
            }}>#01</div>
            <div>
              <h3 style={{ fontSize: 19, fontWeight: 400, margin: '0 0 6px', fontFamily: 'var(--font-heading)' }}>Read by people who have to be right</h3>
              <p style={{ margin: 0, fontSize: '12.5px', lineHeight: 1.7, color: 'var(--color-neutral-700)', textAlign: 'justify', hyphens: 'auto' }}>
                Protocol teams, exchange compliance desks and DAO treasuries open cases here because the report cites every transaction it stands on — no black-box verdicts.
              </p>
            </div>
          </Reveal>
        </div>

        {/* Ghost words */}
        <Reveal variant="fade" duration={1.2}>
          <h2 style={{
            position: 'relative', zIndex: 0, pointerEvents: 'none', userSelect: 'none',
            maxWidth: 1400, margin: 'clamp(30px,4vw,56px) auto 0',
            fontSize: 'clamp(42px, 7vw, 100px)', fontWeight: 400, lineHeight: 1.04, letterSpacing: '-0.03em',
            textTransform: 'uppercase', fontFamily: 'var(--font-heading)',
          }}>
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: '4vw' }}>
              <ScrollClipReveal>
                <span style={{ color: 'var(--color-neutral-300)' }}>Autonomous</span>
              </ScrollClipReveal>
              <ScrollClipReveal delay={0.15}>
                <span style={{ color: 'var(--color-neutral-300)' }}>Evidence</span>
              </ScrollClipReveal>
            </span>
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: '4vw' }}>
              <ScrollClipReveal delay={0.25}>
                <span style={{ color: 'var(--color-text)' }}>Driven</span>
              </ScrollClipReveal>
              <ScrollClipReveal delay={0.35}>
                <span style={{ color: 'var(--color-neutral-300)' }}>Investigation</span>
              </ScrollClipReveal>
            </span>
          </h2>
        </Reveal>

      </section>

      {/* ════════ THE SWARM ════════ */}
      <section id="swarm" style={{
        background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)',
        padding: 'clamp(56px,6vw,100px) clamp(20px,3vw,44px)',
      }}>
        <Reveal variant="fade-up">
          <Eyebrow>The swarm</Eyebrow>
          <h2 style={{
            fontSize: 'clamp(38px,4.4vw,62px)', fontWeight: 400, lineHeight: 0.98,
            letterSpacing: '-0.025em', margin: 'var(--space-3) 0 0',
            fontFamily: 'var(--font-heading)',
          }}>
            <ScrollClipReveal>Four agents,</ScrollClipReveal>
            <ScrollClipReveal delay={0.12}>one investigation</ScrollClipReveal>
          </h2>
        </Reveal>

        <ul style={{ listStyle: 'none', margin: 'clamp(34px,4vw,58px) 0 0', padding: 0 }}>
          {SWARM.map((a, idx) => (
            <Reveal key={a.num} variant="fade-up" delay={idx * 0.1} as="li" style={{ borderTop: '1px solid var(--color-divider)' }}>
              <Link href="/agents" style={{
                display: 'flex', alignItems: 'center', gap: 26, padding: '30px 0',
                textDecoration: 'none', color: 'inherit',
              }}>
                <span style={{ width: 44, flex: '0 0 auto', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-neutral-600)' }}>{a.num}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontFamily: 'var(--font-heading)', fontSize: 'clamp(24px,2.4vw,32px)', letterSpacing: '-0.015em' }}>{a.name}</span>
                  <span style={{ display: 'block', fontSize: '13.5px', color: 'var(--color-neutral-700)', marginTop: 4 }}>{a.desc}</span>
                </span>
                <span className="pw-swarm-tags" style={{ flex: '0 0 auto', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-accent-700)' }}>{a.tags}</span>
                <span style={{
                  width: 46, height: 46, flex: '0 0 auto', borderRadius: 999,
                  border: '1px solid var(--color-divider)', display: 'grid', placeContent: 'center',
                  transition: 'transform 0.35s cubic-bezier(0.16,1,0.3,1), border-color 0.35s',
                }}>
                  <ArrowIcon />
                </span>
              </Link>
            </Reveal>
          ))}
          <li style={{ borderTop: '1px solid var(--color-divider)' }} />
        </ul>
      </section>

      {/* ════════ HOW IT WORKS ════════ */}
      <section id="how" style={{
        background: 'var(--color-bg)', borderRadius: 'var(--radius-lg)', marginTop: -40,
        padding: 'clamp(52px,5vw,88px) clamp(20px,3vw,44px) clamp(56px,6vw,96px)',
      }}>
        <Reveal variant="fade-up">
          <Reveal variant="pop">
            <div style={{
              width: 66, height: 66, borderRadius: 'var(--radius-md)', overflow: 'hidden',
            }}>
              <span style={{
                display: 'grid', placeContent: 'center', width: '100%', height: '100%',
                background: 'var(--color-neutral-200)', color: 'var(--color-accent-700)',
              }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                  <path d="M4 6h6l2 2h8v10H4z" />
                  <path d="M9 13h6" />
                </svg>
              </span>
            </div>
          </Reveal>
          <h2 style={{
            fontSize: 'clamp(36px,4.2vw,58px)', fontWeight: 400, lineHeight: 0.98,
            letterSpacing: '-0.025em', margin: 'var(--space-4) 0 0',
            fontFamily: 'var(--font-heading)',
          }}>
            <ScrollClipReveal>Watch a case</ScrollClipReveal>
            <ScrollClipReveal delay={0.12}>build itself</ScrollClipReveal>
          </h2>
          <p style={{
            fontSize: 14, color: 'var(--color-neutral-700)', maxWidth: '48ch',
            marginTop: 'var(--space-4)', textAlign: 'justify', hyphens: 'auto',
          }}>
            Every case opens a live dossier at <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12.5px' }}>/case/[id]</span> — the traced path, the flagged wallets, the pattern matches and each agent&apos;s reasoning as it lands.
          </p>
        </Reveal>
      </section>

      {/* ════════ STATS ════════ */}
      <section style={{
        background: 'var(--color-surface)', color: 'var(--color-text)', borderRadius: 'var(--radius-lg)',
        marginTop: 12, padding: 'clamp(56px,6vw,92px) clamp(20px,3vw,44px)',
      }}>
        <Reveal variant="fade-up">
          <Eyebrow>How it works</Eyebrow>
          <h2 style={{
            fontSize: 'clamp(38px,4.4vw,62px)', fontWeight: 400, lineHeight: 0.98,
            letterSpacing: '-0.025em', margin: 'var(--space-3) 0 0',
            fontFamily: 'var(--font-heading)',
          }}>
            <ScrollClipReveal>A swarm that</ScrollClipReveal>
            <ScrollClipReveal delay={0.12}>keeps receipts</ScrollClipReveal>
          </h2>
        </Reveal>
        <StaggerReveal stagger={0.12} style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '44px 32px', margin: 'clamp(38px,4vw,64px) 0 0',
        }}>
          {[
            { value: '4', label: 'Agents per case' },
            { value: 'Base', label: 'Chain supported' },
            { value: 'Sibyl', label: 'Memory layer' },
            { value: '24/7', label: 'Monitor uptime' },
          ].map((s) => (
            <div key={s.label} style={{
              borderTop: '1px solid var(--color-divider)', paddingTop: 20,
            }}>
              <dt style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>{s.label}</dt>
              <dd style={{ margin: 0 }}>
                <div style={{
                  fontFamily: 'var(--font-heading)', fontSize: 'clamp(52px,5.4vw,74px)',
                  lineHeight: 1, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums',
                }}>
                  <CountUp value={s.value} />
                </div>
                <div style={{ fontSize: 13, color: 'var(--color-neutral-600)', marginTop: 12 }}>{s.label}</div>
              </dd>
            </div>
          ))}
        </StaggerReveal>
      </section>

      {/* ════════ ECONOMICS ════════ */}
      <section style={{
        background: 'var(--color-bg)', borderRadius: 'var(--radius-lg)', marginTop: 12,
        padding: 'clamp(52px,5vw,88px) clamp(20px,3vw,44px)',
      }}>
        <Reveal variant="fade-up">
          <Eyebrow>Protocol economics</Eyebrow>
          <h2 style={{
            fontSize: 'clamp(36px,4.2vw,58px)', fontWeight: 400, lineHeight: 0.98,
            letterSpacing: '-0.025em', margin: 'var(--space-3) 0 0',
            fontFamily: 'var(--font-heading)',
          }}>
            <ScrollClipReveal>Sustainable by</ScrollClipReveal>
            <ScrollClipReveal delay={0.12}>design</ScrollClipReveal>
          </h2>
          <p style={{
            fontSize: 14, color: 'var(--color-neutral-700)', maxWidth: '52ch',
            marginTop: 'var(--space-4)', textAlign: 'justify', hyphens: 'auto',
          }}>
            Every solved bounty generates protocol revenue. The 5% fee funds ongoing development, agent infrastructure, and the pattern database that makes every future investigation faster.
          </p>
        </Reveal>

        <StaggerReveal stagger={0.1} style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 20, margin: 'clamp(32px,3vw,52px) 0 0',
        }}>
          {[
            { head: '5%', body: 'Protocol fee on solved bounties — deducted at payout, enforced onchain by the escrow contract' },
            { head: '95%', body: 'Goes to the investigating agent — aligned incentives mean better investigations' },
            { head: '0%', body: 'Fee on unsolved cases — victims pay nothing if the trail goes cold' },
          ].map((item) => (
            <Reveal key={item.head} variant="fade-up" style={{
              borderRadius: 'var(--radius-md)', border: '1px solid var(--color-divider)',
              background: 'var(--color-card)', padding: 'var(--space-4)',
            }}>
              <div style={{
                fontFamily: 'var(--font-heading)', fontSize: 'clamp(36px,3.6vw,48px)',
                letterSpacing: '-0.02em', lineHeight: 1,
              }}>
                {item.head}
              </div>
              <p style={{ fontSize: 13, color: 'var(--color-neutral-700)', marginTop: 10, lineHeight: 1.6 }}>
                {item.body}
              </p>
            </Reveal>
          ))}
        </StaggerReveal>

        <Reveal variant="fade-up" style={{ marginTop: 'clamp(28px,3vw,44px)' }}>
          <div style={{
            borderRadius: 'var(--radius-md)', border: '1px solid var(--color-divider)',
            background: 'var(--color-neutral-100)', padding: 'var(--space-4)',
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-neutral-600)', marginBottom: 8 }}>
              Revenue model
            </div>
            <p style={{ fontSize: 13, color: 'var(--color-neutral-700)', margin: 0, lineHeight: 1.7 }}>
              Prowl captures value at the resolution layer: victims lock bounties, agents investigate, and the protocol takes a 5% cut only when the case is solved and the poster approves the report. No subscription, no upfront cost — the protocol earns when its agents deliver. At scale, cross-case pattern memory creates a compounding advantage: each solved case trains the swarm, improving solve rates and reducing investigation time — a flywheel that increases throughput without increasing cost per case.
            </p>
          </div>
        </Reveal>
      </section>

      {/* ════════ FOOTER ════════ */}
      <footer id="contact" style={{
        background: 'var(--color-surface)', color: 'var(--color-neutral-700)',
        borderRadius: 'var(--radius-lg)', marginTop: 12,
        padding: 'clamp(48px,5vw,76px) clamp(20px,3vw,44px)',
      }}>
        {/* CTA */}
        <Reveal variant="fade-up" style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end',
          justifyContent: 'space-between', gap: 26,
          borderBottom: '1px solid var(--color-divider)',
          paddingBottom: 'clamp(38px,4vw,58px)',
        }}>
          <div>
            <Eyebrow>Get started</Eyebrow>
            <p style={{
              fontFamily: 'var(--font-heading)', fontSize: 'clamp(44px,5.4vw,74px)',
              lineHeight: 0.92, letterSpacing: '-0.03em', margin: 'var(--space-3) 0 0',
              color: 'var(--color-text)',
            }}>
              <ScrollClipReveal>Got a stolen</ScrollClipReveal>
              <ScrollClipReveal delay={0.12}><span style={{ fontStyle: 'italic', color: 'var(--color-accent)' }}>wallet?</span></ScrollClipReveal>
            </p>
          </div>
          <Link href="/bounty/new" style={{
            display: 'inline-flex', alignItems: 'center', borderRadius: 999,
            background: 'var(--color-text)', color: 'var(--color-bg)', padding: '14px 28px',
            fontSize: 13, letterSpacing: '0.14em', textTransform: 'uppercase',
            fontFamily: 'var(--font-mono)', textDecoration: 'none',
            transition: 'transform 0.3s, background 0.3s',
          }}>
            Start investigation →
          </Link>
        </Reveal>

        {/* Nav grid */}
        <Reveal variant="fade-up" delay={0.15} style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 'clamp(28px,3vw,48px)', padding: 'clamp(38px,4vw,56px) 0',
        }}>
          <div style={{ maxWidth: 320 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <SearchIcon />
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 18, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-text)' }}>Prowl</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--color-neutral-600)', marginTop: 'var(--space-3)' }}>
              An autonomous investigation swarm for crypto theft on Base, with Sibyl Memory as its case archive.
            </p>
            <div style={{ marginTop: 'var(--space-4)', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: 'var(--color-neutral-600)' }}>Base Sepolia · testnet</span>
            </div>
          </div>

          {FOOTER_NAV.map((col) => (
            <nav key={col.heading}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--color-neutral-600)' }}>{col.heading}</div>
              <ul style={{ listStyle: 'none', margin: 'var(--space-3) 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                {col.links.map((l) => (
                  <li key={l.label}><Link href={l.href} style={{ color: 'var(--color-text)', textDecoration: 'none' }}>{l.label}</Link></li>
                ))}
              </ul>
            </nav>
          ))}
        </Reveal>

        {/* Bottom bar */}
        <Reveal variant="fade" delay={0.2} style={{
          borderTop: '1px solid var(--color-divider)', paddingTop: 'var(--space-6)',
          display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 'var(--space-3)',
          fontFamily: 'var(--font-mono)', fontSize: '10.5px', letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--color-neutral-600)',
        }}>
          <span>© 2026 Prowl · Sibyl Labs Hackathon</span>
        </Reveal>
      </footer>
    </div>
  );
}
