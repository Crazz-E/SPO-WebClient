/**
 * useRotatingQuote — cycles through funny loading quotes at a configurable interval.
 * Returns the current quote string.
 */

import { useState, useEffect, useRef } from 'react';

const STARTUP_QUOTES = [
  'Bribing the city council...',
  'Reticulating supply chains...',
  'Convincing investors this is fine...',
  'Inflating real estate prices...',
  'Hiding environmental reports...',
  'Printing money (legally, we promise)...',
  'Training unpaid interns...',
  'Lobbying for tax breaks...',
  'Cooking the books... tastefully...',
  'Outsourcing the outsourcing...',
  'Filing permits in triplicate...',
  'Negotiating with unions...',
  'Calibrating golden parachutes...',
  'Polishing the executive washroom...',
  'Synergizing the synergies...',
  'Optimizing spreadsheet aesthetics...',
  'Warming up the corner office...',
  'Scheduling meetings about meetings...',
  'Aligning corporate chakras...',
  'Loading questionable business decisions...',
  'Generating plausible excuses...',
  'Deploying middle management...',
  'Adjusting the profit margin (upward)...',
  'Refilling the executive coffee machine...',
  'Counting someone else\'s money...',
  'Rehearsing the earnings call...',
  'Installing revolving doors...',
  'Shredding last quarter\'s projections...',
  'Applying creative accounting...',
  'Building bridges (then charging tolls)...',
];

const MAP_QUOTES = [
  'Terraforming questionable real estate...',
  'Placing buildings on hopes and dreams...',
  'Surveying land nobody wanted...',
  'Drawing roads to nowhere...',
  'Zoning violations loading...',
  'Rendering someone else\'s bad decisions...',
  'Convincing trees to move over...',
  'Laying asphalt with optimism...',
  'Calculating property taxes (sorry)...',
  'Asking mountains to step aside...',
  'Painting the town (literally)...',
  'Evicting wildlife (humanely)...',
  'Assembling prefab dreams...',
  'Connecting pipes nobody will see...',
  'Planting trees for future generations to cut down...',
  'Loading scenic views (extra charge)...',
  'Mapping escape routes from board meetings...',
  'Placing "Coming Soon" signs everywhere...',
  'Generating traffic jams...',
  'Discovering ancient ruins (ignoring them)...',
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function useRotatingQuote(
  variant: 'startup' | 'map' = 'startup',
  intervalMs = 2500,
): string {
  const pool = variant === 'map' ? MAP_QUOTES : STARTUP_QUOTES;
  const shuffled = useRef(shuffle(pool));
  const idx = useRef(0);
  const [quote, setQuote] = useState(() => shuffled.current[0]);

  useEffect(() => {
    const timer = setInterval(() => {
      idx.current = (idx.current + 1) % shuffled.current.length;
      // Re-shuffle when we loop back to start
      if (idx.current === 0) {
        shuffled.current = shuffle(pool);
      }
      setQuote(shuffled.current[idx.current]);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [pool, intervalMs]);

  return quote;
}
