// ScrambleIn — entrance animation with scramble reveal effect
'use client';

import { useState, useEffect, useRef } from 'react';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+~|}{[]:;?><';

interface ScrambleInProps {
  text: string;
  delay?: number;
  triggered?: boolean;
  className?: string;
}

export default function ScrambleIn({ text, delay = 0, triggered = false, className }: ScrambleInProps) {
  const [display, setDisplay] = useState('');
  const started = useRef(false);

  useEffect(() => { // eslint-disable-line react-hooks/set-state-in-effect -- setState in interval callback is correct
    if (!triggered || started.current) return;
    started.current = true;

    const timer = setTimeout(() => {
      let cursor = 0;
      const interval = setInterval(() => {
        cursor += 0.5;
        const revealed = Math.floor(cursor);

        if (revealed >= text.length) {
          setDisplay(text);
          clearInterval(interval);
          return;
        }

        let result = '';
        for (let i = 0; i < text.length; i++) {
          if (text[i] === ' ') {
            result += ' ';
          } else if (i < revealed) {
            result += text[i];
          } else if (i < revealed + 3) {
            result += CHARS[Math.floor(Math.random() * CHARS.length)];
          } else {
            result += ' ';
          }
        }
        setDisplay(result);
      }, 25);

      return () => clearInterval(interval);
    }, delay);

    return () => clearTimeout(timer);
  }, [triggered, text, delay]);

  return (
    <span className={className}>
      {display || ' '.repeat(text.length)}
    </span>
  );
}
