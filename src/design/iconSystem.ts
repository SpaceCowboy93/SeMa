/**
 * SeMa C2 Icon System
 *
 * Single source of truth for all icons in the application.
 * Every component imports from here — never directly from 'lucide-react'.
 *
 * Icon family : Lucide React
 * Style       : Outline (neutral) · slightly heavier stroke (active/selected)
 * Stroke      : 1.75–2 px
 * Sizes       : Nav 24px · FAB 22px · Actions 20px · Inputs 18px · Small 16px
 *
 * Reference   : SeMa C2 Icon Guide (botanical · calm · meaningful · consistent)
 */

// ── Type ──────────────────────────────────────────────────────────────────────
export type { LucideIcon } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — NAVIGATION  (bottom bar & room headers)
// ─────────────────────────────────────────────────────────────────────────────
export { Home        as IconNavHome     } from 'lucide-react' // Together / Home room
export { CalendarDays as IconNavPlanner } from 'lucide-react' // Planner room
export { Wallet      as IconNavFinances } from 'lucide-react' // Finances room
export { ShoppingBag as IconNavShopping } from 'lucide-react' // Shopping room
export { Handshake   as IconNavUs       } from 'lucide-react' // Us / relationship room

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — ACTIONS
// ─────────────────────────────────────────────────────────────────────────────
export { Plus          as IconAdd     } from 'lucide-react'
export { Check         as IconSave    } from 'lucide-react'
export { Pencil        as IconEdit    } from 'lucide-react'
export { Trash2        as IconDelete  } from 'lucide-react'
export { X             as IconClose   } from 'lucide-react'
export { Send          as IconSend    } from 'lucide-react'
export { Search        as IconSearch  } from 'lucide-react'
export { LogOut        as IconLogout  } from 'lucide-react'
export { RefreshCw     as IconRefresh } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — INPUTS & FIELDS
// ─────────────────────────────────────────────────────────────────────────────
export { CalendarDays  as IconCalendar      } from 'lucide-react'
export { CalendarClock as IconCalendarClock } from 'lucide-react'
export { Clock         as IconTime          } from 'lucide-react'
export { Camera        as IconCamera        } from 'lucide-react'
export { FileText      as IconNotes         } from 'lucide-react'
export { CheckSquare   as IconChecklist     } from 'lucide-react'
export { ScanLine      as IconScan          } from 'lucide-react'
export { Pin           as IconPin           } from 'lucide-react'
export { Image         as IconPhoto         } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — DIRECTIONAL / CHEVRONS
// ─────────────────────────────────────────────────────────────────────────────
export { ChevronLeft  as IconLeft  } from 'lucide-react'
export { ChevronRight as IconRight } from 'lucide-react'
export { ChevronUp    as IconUp    } from 'lucide-react'
export { ChevronDown  as IconDown  } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — RELATIONSHIP & MEMORIES
// ─────────────────────────────────────────────────────────────────────────────
export { Heart    as IconHeart    } from 'lucide-react'
export { Sparkles as IconDream    } from 'lucide-react'
export { Flag     as IconMilestone} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — FINANCE
// ─────────────────────────────────────────────────────────────────────────────
export { TrendingUp   as IconTrendingUp   } from 'lucide-react'
export { TrendingDown as IconTrendingDown } from 'lucide-react'
export { Wallet       as IconWallet       } from 'lucide-react'
// Finance category icons
export { Car          as IconCar          } from 'lucide-react' // Transport
export { Zap          as IconZap          } from 'lucide-react' // Utilities / lightning
export { Play         as IconPlay         } from 'lucide-react' // Subscriptions
export { Gift         as IconGift         } from 'lucide-react' // Gifts
export { Plane        as IconPlane        } from 'lucide-react' // Travel
export { ShoppingCart as IconGroceries    } from 'lucide-react' // Groceries

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — STATE & FEEDBACK
// ─────────────────────────────────────────────────────────────────────────────
export { Loader2       as IconLoading } from 'lucide-react'
export { AlertTriangle as IconWarning } from 'lucide-react'
export { AlertCircle   as IconInfo    } from 'lucide-react'
export { CheckCircle2  as IconSuccess } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8 — NOTIFICATIONS & COMMUNICATION
// ─────────────────────────────────────────────────────────────────────────────
export { Bell     as IconBell     } from 'lucide-react'
export { BellOff  as IconBellOff  } from 'lucide-react'
export { BellRing as IconBellRing } from 'lucide-react'
export { Wifi     as IconWifi     } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9 — SETTINGS & ACCOUNT
// ─────────────────────────────────────────────────────────────────────────────
export { User    as IconProfile } from 'lucide-react'
export { History as IconHistory } from 'lucide-react'
export { Target  as IconTarget  } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10 — MEDIA
// ─────────────────────────────────────────────────────────────────────────────
export { ZoomIn  as IconZoomIn  } from 'lucide-react'
export { ZoomOut as IconZoomOut } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 11 — BRAND & BOTANICAL
// ─────────────────────────────────────────────────────────────────────────────
export { Leaf as IconLeaf } from 'lucide-react' // SeMa brand element

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 12 — MISC UI
// ─────────────────────────────────────────────────────────────────────────────
export { Sun          as IconSun         } from 'lucide-react'
export { AlignJustify as IconListView    } from 'lucide-react'
export { ShoppingBag  as IconShoppingBag } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 13 — SHOPPING CATEGORY ICONS
// Semantic food/grocery icons used on category chips in the Shopping room.
// ─────────────────────────────────────────────────────────────────────────────
export {
  Coffee, Milk, Beef, Croissant, Egg, Banana, Apple,
  Wine, Beer, Fish, Citrus, Droplets, Carrot, Cherry,
  Grape, Salad,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 14 — MOOD ICONS
// ─────────────────────────────────────────────────────────────────────────────
export { Smile      as IconMoodHappy   } from 'lucide-react'
export { Leaf       as IconMoodRelaxed } from 'lucide-react' // calm / botanical
export { Moon       as IconMoodTired   } from 'lucide-react'
export { CloudRain  as IconMoodSad     } from 'lucide-react'
export { Flame      as IconMoodStressed} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 15 — MILESTONE ICONS
// ─────────────────────────────────────────────────────────────────────────────
export { Gem         as IconGem         } from 'lucide-react' // engagement / ring
export { CakeSlice   as IconCake        } from 'lucide-react' // birthday
export { PartyPopper as IconParty       } from 'lucide-react' // celebration
export { Waves       as IconWaves       } from 'lucide-react' // beach / waves
export { TreePine    as IconTree        } from 'lucide-react' // christmas / nature
export { Drama       as IconDrama       } from 'lucide-react' // theatre
export { Flower2     as IconFlower      } from 'lucide-react' // flower / romance
export { Star        as IconStar        } from 'lucide-react' // generic milestone
export { CalendarCheck2 as IconCalendarCheck } from 'lucide-react' // plan confirmed

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 16 — GOAL CATEGORY ICONS
// ─────────────────────────────────────────────────────────────────────────────
export { Coins    as IconCoins    } from 'lucide-react' // money / savings
export { Dumbbell as IconDumbbell } from 'lucide-react' // fitness
export { Globe    as IconGlobe    } from 'lucide-react' // travel / world
export { BookOpen as IconBookOpen } from 'lucide-react' // learning
export { Palette  as IconPalette  } from 'lucide-react' // hobbies / art
export { Trophy   as IconTrophy   } from 'lucide-react' // challenges / achievements

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 17 — UTILITY ICONS
// ─────────────────────────────────────────────────────────────────────────────
export { UserRound    as IconUserRound   } from 'lucide-react' // profile / person
export { Smartphone   as IconSmartphone  } from 'lucide-react' // mobile / push notif
export { BarChart2    as IconBarChart    } from 'lucide-react' // stats / analytics
export { MapPin       as IconMapPin      } from 'lucide-react' // location
export { Banknote     as IconBanknote    } from 'lucide-react' // income / money
export { BookHeart    as IconBookHeart   } from 'lucide-react' // memory / journal
export { Utensils     as IconUtensils    } from 'lucide-react' // dinner / restaurant
export { Mail         as IconMail        } from 'lucide-react' // letter / message

// ─────────────────────────────────────────────────────────────────────────────
// RAW RE-EXPORTS  (backward-compat — existing files change only the import path)
// ─────────────────────────────────────────────────────────────────────────────
export {
  // Navigation
  Home, CalendarDays, CalendarClock, Wallet, Handshake,
  // Actions
  Plus, X, Check, Pencil, Trash2, Send, Search, LogOut, RefreshCw,
  // Directional
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  // Inputs
  Camera, FileText, CheckSquare, ScanLine, Pin, Clock,
  // Relationship
  Heart, Sparkles, Flag,
  // Finance
  TrendingUp, TrendingDown,
  Car, Zap, Play, Gift, Plane, ShoppingCart,
  // State
  Loader2, AlertTriangle, AlertCircle, CheckCircle2,
  // Notifications
  Bell, BellOff, BellRing, Wifi,
  // Account / goals
  User, History, Target,
  // Media
  ZoomIn, ZoomOut,
  // Brand
  Leaf,
  // Misc
  Sun, AlignJustify, ShoppingBag,
  // Mood
  Smile, Moon, CloudRain, Flame,
  // Milestones
  Gem, CakeSlice, PartyPopper, Waves, TreePine, Drama, Flower2, Star, CalendarCheck2,
  // Goals
  Coins, Dumbbell, Globe, BookOpen, Palette, Trophy,
  // Utility
  UserRound, Smartphone, BarChart2, MapPin, Banknote, BookHeart, Utensils, Mail,
} from 'lucide-react'

// Image re-exported as ImageIcon to avoid conflict with Next.js <Image> component
export { Image as ImageIcon } from 'lucide-react'
