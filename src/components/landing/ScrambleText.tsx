// ScrambleText — character-by-character text scramble animation
'use client';

import { useState, useEffect, useRef } from 'react';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+~|}{[]:;?><';

interface ScrambleTextProps {
  text: string;
  isHovered: boolean;
  className?: string;
}

export default function ScrambleText({ text, isHovered, className }: ScrambleTextProps) {
  const [display, setDisplay] = useState(text);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { // eslint-disable-line react-hooks/set-state-in-effect -- setState in interval/else is correct
    if (isHovered) {
      let frame = 0;
      intervalRef.current = setInterval(() => {
        frame++;
        const revealed = Math.floor(frame / 4);

        if (revealed >= text.length) {
          setDisplay(text);
          if (intervalRef.current) clearInterval(intervalRef.current);
          return;
        }

        let result = '';
        for (let i = 0; i < text.length; i++) {
          if (text[i] === ' ') {
            result += ' ';
          } else if (i < revealed) {
            result += text[i];
          } else {
            result += CHARS[Math.floor(Math.random() * CHARS.length)];
          }
        }
        setDisplay(result);
      }, 25);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setDisplay(text);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isHovered, text]);

  return <span className={className}>{display}</span>;
}
