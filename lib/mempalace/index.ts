/**
 * MemPalace integration barrel.
 *
 * Usage:
 *   import { mempalace } from '../../../lib/mempalace'
 *   const ctx = await mempalace.wakeUp('superbrain')
 *
 * Singleton — do NOT instantiate MempalaceService directly. The cached
 * wakeup state lives on this instance.
 */

export { MempalaceService, mempalace } from './mempalaceService'
export type {
  PalaceResult,
  PalaceStatus,
  PalaceWing,
  PalaceRoom,
} from './mempalaceService'
