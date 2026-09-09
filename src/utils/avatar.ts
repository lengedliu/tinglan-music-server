import { User } from '../types';

// Curated high-resolution music-listener & clean modern profile avatars
export const DEFAULT_REGULAR_USER_AVATAR = 
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80';

export const DEFAULT_ADMIN_USER_AVATAR = 
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80';

// Diverse set of musical & creative profile avatars
export const USER_AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=300&q=80'
];

/**
 * Returns a consistent default avatar for a user based on their role and username
 */
export function getUserAvatar(user: Partial<User> | null | undefined): string {
  if (!user) return DEFAULT_REGULAR_USER_AVATAR;
  if (user.avatarUrl && user.avatarUrl.trim()) return user.avatarUrl;

  if (user.role === 'admin' || user.username === 'admin') {
    return DEFAULT_ADMIN_USER_AVATAR;
  }

  // Consistent hash for regular users to pick a deterministic preset
  const name = user.username || user.email || 'user';
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % USER_AVATAR_PRESETS.length;
  return USER_AVATAR_PRESETS[index];
}
