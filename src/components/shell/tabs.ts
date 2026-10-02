import {
  AudioLines,
  CircleUserRound,
  FileText,
  House,
  MessageCircle,
  type LucideIcon,
} from 'lucide-react';
import type { Tab } from '@/lib/nav/routes';

export const TAB_ITEMS: { tab: Tab; label: string; icon: LucideIcon }[] = [
  { tab: 'home', label: 'Home', icon: House },
  { tab: 'docs', label: 'Docs', icon: FileText },
  { tab: 'ask', label: 'Ask', icon: MessageCircle },
  { tab: 'meetings', label: 'Meetings', icon: AudioLines },
  { tab: 'profile', label: 'Profile', icon: CircleUserRound },
];
