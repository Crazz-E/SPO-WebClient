/**
 * useCommandPalette — Command registry and fuzzy search for the command palette.
 */

import { useMemo, useState, useCallback } from 'react';

export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  icon?: string;
  category: 'navigation' | 'search' | 'action';
  execute: () => void;
}

function fuzzyMatch(query: string, text: string): boolean {
  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < lowerText.length && qi < lowerQuery.length; ti++) {
    if (lowerText[ti] === lowerQuery[qi]) qi++;
  }
  return qi === lowerQuery.length;
}

export function useCommandPalette(commands: Command[]) {
  const [query, setQuery] = useState('');

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    return commands.filter((cmd) => fuzzyMatch(query, cmd.label));
  }, [commands, query]);

  const groupedCommands = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    for (const cmd of filteredCommands) {
      const cat = cmd.category;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(cmd);
    }
    return groups;
  }, [filteredCommands]);

  const resetQuery = useCallback(() => setQuery(''), []);

  return { query, setQuery, filteredCommands, groupedCommands, resetQuery };
}
