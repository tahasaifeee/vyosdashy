import { useState, useEffect, useRef } from 'react';

export function useCountUp(end: number, duration: number = 1000) {
  const [count, setCount] = useState(end);
  const prevEndRef = useRef(end);
  const startValRef = useRef(end);

  useEffect(() => {
    let startTime: number | null = null;
    let animationFrame: number;
    
    const startValue = startValRef.current;
    const endValue = end;
    const diff = endValue - startValue;
    
    if (diff === 0) return;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = timestamp - startTime;
      const percentage = Math.min(progress / duration, 1);
      
      // Easing function: easeOutQuart
      const easeOut = 1 - Math.pow(1 - percentage, 4);
      
      const currentCount = startValue + (diff * easeOut);
      setCount(currentCount);

      if (progress < duration) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        setCount(endValue);
        startValRef.current = endValue;
      }
    };

    animationFrame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrame);
      startValRef.current = count; // Save current progress if interrupted
    };
  }, [end, duration]);

  // Handle immediate initialization/reset if needed
  useEffect(() => {
    prevEndRef.current = end;
  }, [end]);

  return count;
}
