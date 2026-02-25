/**
 * Creativity levels and configuration for chat interactions
 */

import { CreativityLevel } from '../types/chat'

/**
 * Predefined creativity levels with user-friendly labels
 */
export const CREATIVITY_LEVELS: CreativityLevel[] = [
  { value: 0.1, label: 'Logical', desc: 'Precise, factual responses' },
  { value: 0.3, label: 'Conservative', desc: 'Structured with slight creativity' },
  { value: 0.5, label: 'Balanced', desc: 'Mix of logic and creativity' },
  { value: 0.7, label: 'Creative', desc: 'Imaginative and varied responses' },
  { value: 0.9, label: 'Wild', desc: 'Maximum creativity, unique outputs' },
]

/**
 * Find the closest creativity level for a given value
 * @param currentValue The current creativity value (0-1)
 * @returns The closest predefined creativity level
 */
export const findClosestCreativityLevel = (currentValue: number): CreativityLevel => {
  return CREATIVITY_LEVELS.reduce((prev, curr) =>
    Math.abs(curr.value - currentValue) < Math.abs(prev.value - currentValue) ? curr : prev
  )
}