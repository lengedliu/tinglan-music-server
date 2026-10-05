import fs from 'fs';
import path from 'path';
import { appEventBus } from './eventBus.js';

export interface FamilyUser {
  id: string;
  name: string;
  avatar: string; // Emoji or preset avatar key
  role: 'admin' | 'member' | 'kid';
  pin?: string; // Optional 4-digit PIN lock
  assignedSpeakerDid?: string; // Xiaomi Speaker DID bound to this user
  createdAt: number;
}

export interface UserFavoriteRecord {
  userId: string;
  songIds: string[];
}

export interface UserHistoryRecord {
  userId: string;
  songId: string;
  playedAt: number;
}

export class FamilyUserService {
  private usersPath: string = path.join(process.cwd(), 'data', 'family_users.json');
  private favoritesPath: string = path.join(process.cwd(), 'data', 'user_favorites.json');
  private historyPath: string = path.join(process.cwd(), 'data', 'user_history.json');

  private users: FamilyUser[] = [];
  private favoritesMap: Record<string, string[]> = {}; // userId -> songIds
  private activeUserId: string = 'user-admin';

  constructor() {
    this.initData();
  }

  private initData(): void {
    const dataDir = path.dirname(this.usersPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Load users
    try {
      if (fs.existsSync(this.usersPath)) {
        const raw = fs.readFileSync(this.usersPath, 'utf-8');
        this.users = JSON.parse(raw);
      }
    } catch {
      this.users = [];
    }

    // Ensure default initial family members if empty
    if (!this.users || this.users.length === 0) {
      this.users = [
        {
          id: 'user-admin',
          name: '爸爸 (全家主主控)',
          avatar: '👨‍💼',
          role: 'admin',
          createdAt: Date.now()
        },
        {
          id: 'user-mom',
          name: '妈妈',
          avatar: '👩‍💼',
          role: 'member',
          createdAt: Date.now()
        },
        {
          id: 'user-kid',
          name: '宝贝',
          avatar: '👧',
          role: 'kid',
          createdAt: Date.now()
        }
      ];
      this.saveUsers();
    }

    // Load favorites per user
    try {
      if (fs.existsSync(this.favoritesPath)) {
        const raw = fs.readFileSync(this.favoritesPath, 'utf-8');
        this.favoritesMap = JSON.parse(raw);
      }
    } catch {
      this.favoritesMap = {};
    }
  }

  private saveUsers(): void {
    try {
      fs.writeFileSync(this.usersPath, JSON.stringify(this.users, null, 2), 'utf-8');
    } catch (err) {
      console.error('[FamilyUserService] Failed to save family_users.json:', err);
    }
  }

  private saveFavorites(): void {
    try {
      fs.writeFileSync(this.favoritesPath, JSON.stringify(this.favoritesMap, null, 2), 'utf-8');
    } catch (err) {
      console.error('[FamilyUserService] Failed to save user_favorites.json:', err);
    }
  }

  public getUsers(): FamilyUser[] {
    return this.users.map(u => {
      const { pin, ...safeUser } = u;
      return { ...safeUser, hasPin: Boolean(pin) } as any;
    });
  }

  public getActiveUserId(): string {
    return this.activeUserId;
  }

  public getActiveUser(): FamilyUser | undefined {
    return this.users.find(u => u.id === this.activeUserId) || this.users[0];
  }

  public setActiveUser(userId: string, pinInput?: string): FamilyUser {
    const target = this.users.find(u => u.id === userId);
    if (!target) {
      throw new Error(`找不到 ID 为 ${userId} 的家庭成员`);
    }

    if (target.pin) {
      if (!pinInput || pinInput !== target.pin) {
        throw new Error('成员密码/PIN 码验证失败，无法切换');
      }
    }

    this.activeUserId = userId;
    appEventBus.broadcast('family:user_changed', { activeUserId: this.activeUserId, user: target });
    return target;
  }

  public addUser(user: Omit<FamilyUser, 'id' | 'createdAt'>): FamilyUser {
    const newUser: FamilyUser = {
      ...user,
      id: `user-${Date.now().toString(36)}`,
      createdAt: Date.now()
    };
    this.users.push(newUser);
    this.saveUsers();
    appEventBus.broadcast('family:users_updated', { users: this.getUsers() });
    return newUser;
  }

  public updateUser(id: string, updates: Partial<Omit<FamilyUser, 'id' | 'createdAt'>>): FamilyUser {
    const idx = this.users.findIndex(u => u.id === id);
    if (idx === -1) {
      throw new Error(`找不到家庭成员 ${id}`);
    }
    this.users[idx] = { ...this.users[idx], ...updates };
    this.saveUsers();
    appEventBus.broadcast('family:users_updated', { users: this.getUsers() });
    return this.users[idx];
  }

  public deleteUser(id: string): void {
    if (this.users.length <= 1) {
      throw new Error('无法删除唯一的家庭主账号');
    }
    this.users = this.users.filter(u => u.id !== id);
    if (this.activeUserId === id) {
      this.activeUserId = this.users[0].id;
    }
    this.saveUsers();
    delete this.favoritesMap[id];
    this.saveFavorites();
    appEventBus.broadcast('family:users_updated', { users: this.getUsers() });
  }

  /**
   * Favorites Management per User
   */
  public getUserFavorites(userId: string): string[] {
    return this.favoritesMap[userId] || [];
  }

  public toggleFavorite(userId: string, songId: string): { isFavorite: boolean; favoritesCount: number } {
    if (!this.favoritesMap[userId]) {
      this.favoritesMap[userId] = [];
    }

    const list = this.favoritesMap[userId];
    const index = list.indexOf(songId);
    let isFavorite = false;

    if (index > -1) {
      list.splice(index, 1);
      isFavorite = false;
    } else {
      list.push(songId);
      isFavorite = true;
    }

    this.saveFavorites();
    appEventBus.broadcast('family:favorites_updated', { userId, favoritesCount: list.length });
    return { isFavorite, favoritesCount: list.length };
  }

  /**
   * Speaker DID to Family User binding helper
   */
  public getUserBySpeakerDid(speakerDid: string): FamilyUser | undefined {
    return this.users.find(u => u.assignedSpeakerDid === speakerDid);
  }
}

export const familyUserService = new FamilyUserService();
