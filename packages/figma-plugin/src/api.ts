/**
 * Click-Ship API Client for Figma Plugin
 */

// ============================================
// Types
// ============================================

export interface AuthState {
  token: string;
  user: {
    id: string;
    login: string;
    name: string;
    email: string;
    avatarUrl: string;
  };
  expiresAt: string;
}

export interface Repository {
  id: string;
  name: string;
  owner: string;
  orgName: string;
  orgSlug: string;
  defaultBranch: string;
}

export interface ExtractedStyles {
  fills: any[];
  strokes: any[];
  strokeWeight: number;
  cornerRadius: number | 'mixed';
  effects: any[];
  opacity: number;
  padding: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  } | null;
  gap: number | null;
  width: number;
  height: number;
  name: string;
  type: string;
}

export interface CreateEditParams {
  repoId: string;
  selector: string;
  figmaStyles: ExtractedStyles;
  description?: string;
  pageUrl?: string;
}

export interface CreateEditResult {
  ok: boolean;
  editId: string;
  file: string;
  branch: string;
  prNumber: number;
  prUrl: string;
  confidence: number;
}

export interface PreviewResult {
  ok: boolean;
  file: string;
  original: string;
  modified: string;
  explanation: string;
  confidence: number;
  tokensMatched: boolean;
}

// ============================================
// API Client
// ============================================

export class ClickShipAPI {
  private baseUrl: string;
  private token: string | null = null;

  constructor() {
    // Use production URL by default, can be overridden
    this.baseUrl = this.getApiUrl();
  }

  private getApiUrl(): string {
    // Check for development mode
    const isDev = typeof window !== 'undefined' &&
      window.location.hostname === 'localhost';

    return isDev
      ? 'http://localhost:8080'
      : 'https://api.click-ship.dev';
  }

  /**
   * Set authentication token
   */
  setToken(token: string | null) {
    this.token = token;
  }

  /**
   * Get OAuth authorization URL
   */
  getAuthUrl(): string {
    const redirectUri = encodeURIComponent(`${this.baseUrl}/auth/figma/callback`);
    return `${this.baseUrl}/auth/figma?redirect_uri=${redirectUri}`;
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `API error: ${response.status}`);
    }

    return data;
  }

  // ============================================
  // Authentication
  // ============================================

  /**
   * Exchange OAuth code for token
   */
  async exchangeCode(code: string): Promise<AuthState> {
    return this.request('/auth/exchange', {
      method: 'POST',
      body: JSON.stringify({ code, source: 'figma' })
    });
  }

  /**
   * Validate current token
   */
  async validateToken(): Promise<{ valid: boolean; user?: AuthState['user'] }> {
    try {
      const result = await this.request<{ user: AuthState['user'] }>('/auth/me');
      return { valid: true, user: result.user };
    } catch {
      return { valid: false };
    }
  }

  // ============================================
  // Repositories
  // ============================================

  /**
   * Get available repositories
   */
  async getRepositories(): Promise<Repository[]> {
    const result = await this.request<{ repos: Repository[] }>('/figma/repos');
    return result.repos;
  }

  // ============================================
  // Edits
  // ============================================

  /**
   * Create an edit from Figma styles
   */
  async createEdit(params: CreateEditParams): Promise<CreateEditResult> {
    return this.request('/figma/edit', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }

  /**
   * Preview code change without creating PR
   */
  async previewEdit(params: Omit<CreateEditParams, 'description'>): Promise<PreviewResult> {
    return this.request('/figma/preview', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }
}

export default ClickShipAPI;
